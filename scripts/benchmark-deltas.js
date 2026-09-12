import { Game } from "../server/game.js";
import { createDelta } from "../client/state-sync.js";

const game = new Game({ seed: "delta-benchmark", lobbySize: 20 });
const player = game.addPlayer("Benchmark");
game.start(player, game.pads[0]);
let previous = game.snapshot({ includeTelemetryEvents: false });
let fullBytes = 0;
let deltaBytes = 0;
const history = [];
for (let frame = 0; frame < 40; frame += 1) {
  game.tick(0.25);
  const current = game.snapshot({ includeTelemetryEvents: false });
  const delta = createDelta(previous, current);
  fullBytes += Buffer.byteLength(JSON.stringify(current));
  deltaBytes += Buffer.byteLength(JSON.stringify(delta));
  history.push(delta);
  if (history.length > 32) history.shift();
  previous = structuredClone(current);
}
const retainedBytes =
  Buffer.byteLength(JSON.stringify(previous)) +
  Buffer.byteLength(JSON.stringify(history));
console.log(
  JSON.stringify(
    {
      frames: 40,
      fullBytes,
      deltaBytes,
      bandwidthReductionPercent: Number(
        ((1 - deltaBytes / fullBytes) * 100).toFixed(1),
      ),
      oldTransportRetainedBaselineBytes: 0,
      deltaTransportRetainedBytes: retainedBytes,
      historyLimit: 32,
    },
    null,
    2,
  ),
);
