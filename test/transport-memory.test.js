import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { setImmediate as immediate } from 'node:timers/promises';
import { createApp } from '../server/app.js';
import { Game } from '../server/game.js';

function decodeFrame(buffer) {
  const size = buffer[1] & 127;
  const offset = size === 127 ? 10 : size === 126 ? 4 : 2;
  return JSON.parse(buffer.subarray(offset).toString());
}

test('live snapshots omit historical events without changing diagnostics', () => {
  const game = new Game({ columns: 2, rows: 2, seed: 'transport-memory' });
  const player = game.addPlayer('Human');
  game.start(player, 0);
  game.dispatch(player, 0, 1, 50, 'medicine');
  game.tick(.25);
  const full = game.snapshot();
  const live = game.snapshot({ includeTelemetryEvents: false });

  assert.ok(full.telemetry.events.length > 0);
  assert.deepEqual(live.telemetry.events, []);
  assert.equal(full.telemetry, game.telemetry);
  assert.equal(live.telemetry.totals, full.telemetry.totals);
  assert.deepEqual(live.players, full.players);
  assert.deepEqual(live.regions, full.regions);
  assert.deepEqual(live.playtest, full.playtest);
  assert.ok(game.snapshot().telemetry.events.length > 0);
});

test('a stalled client retains one frame while healthy clients receive fresh state', async t => {
  let version = 0, pendingWrite;
  const slowFrames = [], fastFrames = [];
  const game = {
    tick() {},
    snapshot(options) {
      assert.deepEqual(options, { includeTelemetryEvents: false });
      return { version };
    },
  };
  const app = createApp({ game, tickRate: 1000000 });
  const slow = new Writable({
    highWaterMark: 1,
    write(chunk, encoding, callback) {
      slowFrames.push(chunk);
      pendingWrite = callback;
    },
  });
  const fast = new Writable({
    write(chunk, encoding, callback) { fastFrames.push(chunk); callback(); },
  });
  app.sockets.add(slow);
  app.sockets.add(fast);
  t.after(() => { slow.destroy(); fast.destroy(); app.server.close(); });

  for (version = 1; version <= 50; version++) app.broadcast();
  assert.equal(slowFrames.length, 1);
  assert.equal(slow.writableLength, slowFrames[0].length);
  assert.equal(fastFrames.length, 50);
  assert.equal(decodeFrame(fastFrames.at(-1)).version, 50);
  assert.equal(slowFrames[0], fastFrames[0], 'clients share the encoded frame');

  pendingWrite();
  await immediate();
  version = 99;
  app.broadcast();
  assert.equal(slowFrames.length, 2);
  assert.equal(decodeFrame(slowFrames[1]).version, 99);
});

test('no snapshots are built when there are no writable recipients', t => {
  const app = createApp({
    tickRate: 1000000,
    game: { tick() {}, snapshot() { assert.fail('unnecessary snapshot'); } },
  });
  t.after(() => app.server.close());
  app.broadcast();
  app.sockets.add({ destroyed: true });
  app.sockets.add({ writableEnded: true });
  app.sockets.add({ writableNeedDrain: true });
  app.sockets.add({ writableLength: 100 });
  app.broadcast();
  app.sockets.clear();
});

test('an oversized frame closes a connection instead of buffering unbounded data', t => {
  const app = createApp({
    tickRate: 1000000,
    game: { tick() {}, snapshot() { return { message: 'x'.repeat(1024 * 1024) }; } },
  });
  const receiver = new Writable({ write() { assert.fail('oversized write'); } });
  app.sockets.add(receiver);
  t.after(() => app.server.close());
  app.broadcast();
  assert.equal(receiver.destroyed, true);
  assert.equal(receiver.writableLength, 0);
});

test('default publication is four snapshots per second with unchanged simulation ticks', t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let ticks = 0, broadcasts = 0, simulatedSeconds = 0;
  const app = createApp({ game: {
    tick(seconds) { ticks++; simulatedSeconds += seconds; },
    snapshot() { broadcasts++; return { elapsed: simulatedSeconds }; },
  } });
  const receiver = new Writable({ write(chunk, encoding, callback) { callback(); } });
  app.sockets.add(receiver);
  t.after(() => { receiver.destroy(); app.server.close(); });
  for (let count = 0; count < 20; count++) t.mock.timers.tick(50);
  assert.equal(ticks, 20);
  assert.ok(Math.abs(simulatedSeconds - 1) < 1e-9);
  assert.equal(broadcasts, 4);
});
