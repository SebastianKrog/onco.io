import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { Game } from '../server/game.js';

async function runningApp() {
  const game = new Game({ random: () => 0.5, id: () => 'player-1' });
  const app = createApp({ game, tickRate: 10_000 });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const { port } = app.server.address();
  return { ...app, base: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}` };
}

test('serves static files, types, and not-found responses', async t => {
  const app = await runningApp();
  t.after(() => app.server.close());
  const home = await fetch(app.base);
  assert.equal(home.status, 200); assert.match(home.headers.get('content-type'), /text\/html/); assert.match(await home.text(), /onco\.io/);
  const css = await fetch(`${app.base}/style.css`);
  assert.equal(css.status, 200); assert.match(css.headers.get('content-type'), /text\/css/);
  assert.equal((await fetch(`${app.base}/missing`)).status, 404);
  assert.equal((await fetch(`${app.base}/../package.json`)).status, 404);
});

test('connects players, accepts messages, broadcasts state, and removes on close', async t => {
  const app = await runningApp();
  t.after(() => app.server.close());
  const socket = new WebSocket(app.ws);
  const event = type => new Promise(resolve => socket.addEventListener(type, resolve, { once: true }));
  await event('open');
  const welcomeEvent = await event('message');
  assert.deepEqual(JSON.parse(welcomeEvent.data), { type: 'welcome', id: 'player-1' });
  socket.send(JSON.stringify({ type: 'join', name: '  Lab Team  ' }));
  socket.send(JSON.stringify({ type: 'start', regionId: 0 }));
  socket.send(JSON.stringify({ type: 'allocate', allocation: { research: 40, manufacturing: 40, infrastructure: 20 } }));
  socket.send('{bad json');
  const errorEvent = await event('message');
  assert.equal(JSON.parse(errorEvent.data).type, 'error');
  app.broadcast();
  const stateEvent = await event('message');
  const state = JSON.parse(stateEvent.data);
  assert.equal(state.type, 'state'); assert.equal(state.players[0].name, 'Lab Team');
  assert.equal(state.regions[0].ownerId, 'player-1');
  assert.deepEqual(state.players[0].allocation, { research: 40, manufacturing: 40, infrastructure: 20 });
  socket.close(); await event('close');
  for (let attempt = 0; app.game.players.size && attempt < 20; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(app.game.players.size, 0);
});
