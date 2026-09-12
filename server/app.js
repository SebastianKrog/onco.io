import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { Game } from "./game.js";
import { createDelta } from "../client/state-sync.js";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const MAX_SOCKET_BUFFER_BYTES = 1024 * 1024;
const DELTA_HISTORY_LIMIT = 32;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

export function createApp({
  game = new Game(),
  tickRate = 50,
  broadcastRate = 250,
} = {}) {
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const relative =
      pathname === "/"
        ? "index.html"
        : normalize(pathname)
            .replace(/^(\.\.[/\\])+/, "")
            .replace(/^[/\\]/, "");
    const file = join(publicDir, relative);
    if (!file.startsWith(publicDir)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    try {
      const info = await stat(file);
      if (!info.isFile()) throw new Error("Not a file");
      response.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
      });
      createReadStream(file).pipe(response);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  const sockets = new Set();
  const clientState = new WeakMap();
  const matchId = randomUUID();
  let version = 0;
  let baseline = null;
  const history = [];
  const companySockets = new Map();
  const frame = (message) => {
    const payload = Buffer.from(message);
    if (payload.length < 126)
      return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
    if (payload.length <= 0xffff) {
      const header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(payload.length, 2);
      return Buffer.concat([header, payload]);
    }
    const header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
    return Buffer.concat([header, payload]);
  };
  const writeFrame = (socket, payload) => {
    if (socket.destroyed || socket.writableEnded) return;
    // Bound all output, including replies to commands from a stalled client.
    if (socket.writableLength + payload.length > MAX_SOCKET_BUFFER_BYTES) {
      socket.destroy();
      return;
    }
    socket.write(payload);
  };
  const send = (socket, data) => writeFrame(socket, frame(data));
  server.on("upgrade", (request, socket) => {
    const key = request.headers["sec-websocket-key"];
    if (!key) {
      socket.destroy();
      return;
    }
    const accept = createHash("sha1")
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    sockets.add(socket);
    clientState.set(socket, { matchId, version: 0, needsFull: true });
    const credential = new URL(
      request.url,
      "http://localhost",
    ).searchParams.get("credential");
    const reconnected = credential ? game.reconnect(credential) : null;
    const connection = reconnected
      ? {
          player: reconnected,
          credential: reconnected.credential,
          spectator: false,
        }
      : game.connect();
    const player = connection.player;
    if (player) companySockets.set(player.id, socket);
    send(
      socket,
      JSON.stringify({
        type: "welcome",
        id: player?.id ?? null,
        credential: connection.credential,
        spectator: connection.spectator,
        reconnected: Boolean(reconnected),
      }),
    );
    let pending = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 2) {
        const masked = Boolean(pending[1] & 128);
        let length = pending[1] & 127;
        let offset = 2;
        if (length === 126) {
          if (pending.length < 4) return;
          length = pending.readUInt16BE(2);
          offset = 4;
        }
        if (length === 127) {
          socket.destroy();
          return;
        }
        const required = offset + (masked ? 4 : 0) + length;
        if (pending.length < required) return;
        const opcode = pending[0] & 15;
        if (opcode === 8) {
          socket.end(Buffer.from([0x88, 0]));
          return;
        }
        const mask = masked ? pending.subarray(offset, offset + 4) : null;
        if (masked) offset += 4;
        const body = Buffer.from(pending.subarray(offset, offset + length));
        if (mask)
          for (let i = 0; i < body.length; i += 1) body[i] ^= mask[i % 4];
        pending = pending.subarray(required);
        if (opcode === 1) {
          try {
            const message = JSON.parse(body.toString());
            if (message.type === "sync") {
              clientState.set(socket, { matchId, version: 0, needsFull: true });
              continue;
            }
            if (!player || !game.handle(player.id, message))
              send(
                socket,
                JSON.stringify({
                  type: "rejected",
                  commandId: message.commandId ?? null,
                  reason: player ? game.lastRejection : "spectator",
                }),
              );
          } catch {
            send(
              socket,
              JSON.stringify({ type: "error", message: "Invalid message" }),
            );
          }
        }
      }
    });
    socket.on("error", () => socket.destroy());
    socket.on("close", () => {
      sockets.delete(socket);
      if (player && companySockets.get(player.id) === socket) {
        companySockets.delete(player.id);
        game.removePlayer(player.id);
      }
    });
  });
  const broadcast = () => {
    // Never queue dependent deltas. A skipped publication invalidates that
    // client's base and its next writable publication is a full snapshot.
    for (const socket of sockets)
      if (
        !socket.destroyed &&
        !socket.writableEnded &&
        (socket.writableNeedDrain || socket.writableLength !== 0)
      ) {
        const status = clientState.get(socket);
        if (status) status.needsFull = true;
      }
    const ready = [...sockets].filter(
      (socket) =>
        !socket.destroyed &&
        !socket.writableEnded &&
        !socket.writableNeedDrain &&
        socket.writableLength === 0,
    );
    if (!ready.length) return;
    const current = structuredClone(
      game.snapshot({ includeTelemetryEvents: false }),
    );
    const nextVersion = version + 1;
    const delta = baseline ? createDelta(baseline, current) : null;
    const deltaPayload = delta
      ? frame(
          JSON.stringify({
            type: "delta",
            matchId,
            baseVersion: version,
            version: nextVersion,
            ...delta,
          }),
        )
      : null;
    const fullPayload = frame(
      JSON.stringify({
        type: "state",
        matchId,
        baseVersion: 0,
        version: nextVersion,
        state: current,
      }),
    );
    for (const client of ready) {
      const status = clientState.get(client) ?? { needsFull: true };
      const canDelta =
        deltaPayload &&
        !status.needsFull &&
        status.matchId === matchId &&
        status.version === version;
      writeFrame(client, canDelta ? deltaPayload : fullPayload);
      clientState.set(client, {
        matchId,
        version: nextVersion,
        needsFull: false,
      });
    }
    baseline = deepFreeze(current);
    version = nextVersion;
    history.push(delta);
    if (history.length > DELTA_HISTORY_LIMIT) history.shift();
  };
  let broadcastElapsed = 0;
  const timer = setInterval(() => {
    game.tick(tickRate / 1000);
    broadcastElapsed += tickRate;
    if (broadcastElapsed >= broadcastRate) {
      broadcastElapsed %= broadcastRate;
      broadcast();
    }
  }, tickRate);
  timer.unref();
  server.on("close", () => {
    clearInterval(timer);
    for (const socket of sockets) socket.destroy();
  });
  return { server, game, sockets, broadcast, clientState, history, matchId };
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
