import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from './game.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

export function createApp({ game = new Game(), tickRate = 50 } = {}) {
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const relative = pathname === '/' ? 'index.html' : normalize(pathname).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]/, '');
    const file = join(publicDir, relative);
    if (!file.startsWith(publicDir)) { response.writeHead(403).end('Forbidden'); return; }
    try {
      const info = await stat(file);
      if (!info.isFile()) throw new Error('Not a file');
      response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
      createReadStream(file).pipe(response);
    } catch { response.writeHead(404).end('Not found'); }
  });
  const sockets = new Set();
  const frame = message => {
    const payload = Buffer.from(message);
    if (payload.length < 126) return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
    if (payload.length <= 0xffff) {
      const header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(payload.length, 2);
      return Buffer.concat([header, payload]);
    }
    const header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(payload.length), 2);
    return Buffer.concat([header, payload]);
  };
  const send = (socket, data) => { if (!socket.destroyed) socket.write(frame(data)); };
  server.on('upgrade', (request, socket) => {
    const key = request.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    sockets.add(socket);
    const credential = new URL(request.url, 'http://localhost').searchParams.get('credential');
    const reconnected = credential ? game.reconnect(credential) : null;
    const connection = reconnected ? { player: reconnected, credential: reconnected.credential, spectator: false } : game.connect();
    const player = connection.player;
    send(socket, JSON.stringify({ type: 'welcome', id: player?.id ?? null, credential: connection.credential, spectator: connection.spectator, reconnected: Boolean(reconnected) }));
    let pending = Buffer.alloc(0);
    socket.on('data', chunk => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 2) {
        const masked = Boolean(pending[1] & 128); let length = pending[1] & 127; let offset = 2;
        if (length === 126) { if (pending.length < 4) return; length = pending.readUInt16BE(2); offset = 4; }
        if (length === 127) { socket.destroy(); return; }
        const required = offset + (masked ? 4 : 0) + length;
        if (pending.length < required) return;
        const opcode = pending[0] & 15;
        if (opcode === 8) { socket.end(Buffer.from([0x88, 0])); return; }
        const mask = masked ? pending.subarray(offset, offset + 4) : null;
        if (masked) offset += 4;
        const body = Buffer.from(pending.subarray(offset, offset + length));
        if (mask) for (let i = 0; i < body.length; i += 1) body[i] ^= mask[i % 4];
        pending = pending.subarray(required);
        if (opcode === 1) {
          try {
            const message = JSON.parse(body.toString());
            if (!player || !game.handle(player.id, message)) send(socket, JSON.stringify({ type: 'rejected', commandId: message.commandId ?? null, reason: player ? game.lastRejection : 'spectator' }));
          } catch { send(socket, JSON.stringify({ type: 'error', message: 'Invalid message' })); }
        }
      }
    });
    socket.on('error', () => socket.destroy());
    socket.on('close', () => { sockets.delete(socket); if(player)game.removePlayer(player.id); });
  });
  const broadcast = () => {
    const payload = JSON.stringify({ type: 'state', ...game.snapshot() });
    for (const client of sockets) send(client, payload);
  };
  const timer = setInterval(() => { game.tick(tickRate / 1000); broadcast(); }, tickRate);
  timer.unref();
  server.on('close', () => { clearInterval(timer); for (const socket of sockets) socket.destroy(); });
  return { server, game, sockets, broadcast };
}
