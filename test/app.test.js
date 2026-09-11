import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { Game } from '../server/game.js';

async function runningApp() {
  let id = 0;
  const game = new Game({ random: () => 0.5, id: () => `identity-${++id}`, placementSeconds: 0.25 });
  const app = createApp({ game, tickRate: 10_000 });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const { port } = app.server.address();
  return { ...app, base: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}` };
}

async function connect(url) {
  const socket = new WebSocket(url);
  const welcome = new Promise(resolve => socket.addEventListener('message', event => resolve(JSON.parse(event.data)), { once: true }));
  await once(socket, 'open');
  return { socket, welcome: await welcome };
}

function advance(game, seconds) {
  while (seconds > 0) { const step = Math.min(5, seconds); game.tick(step); seconds -= step; }
}

test('serves static files, types, and not-found responses', async t => {
  const app = await runningApp();
  t.after(() => { for (const socket of app.sockets) socket.destroy(); app.server.close(); });
  const home = await fetch(app.base);
  assert.equal(home.status, 200); assert.match(home.headers.get('content-type'), /text\/html/); assert.match(await home.text(), /onco\.io/);
  const css = await fetch(`${app.base}/style.css`);
  assert.equal(css.status, 200); assert.match(css.headers.get('content-type'), /text\/css/);
  assert.equal((await fetch(`${app.base}/missing`)).status, 404);
  assert.equal((await fetch(`${app.base}/../package.json`)).status, 404);
});

test('connects players, accepts messages, broadcasts state, and enables automation on close', async t => {
  const app = await runningApp();
  t.after(() => { for (const client of app.sockets) client.destroy(); app.server.close(); });
  const socket = new WebSocket(app.ws);
  const event = type => new Promise(resolve => socket.addEventListener(type, resolve, { once: true }));
  await event('open');
  const welcomeEvent = await event('message');
  const welcome = JSON.parse(welcomeEvent.data);
  assert.equal(welcome.type, 'welcome'); assert.equal(welcome.id, 'identity-1'); assert.ok(welcome.credential); assert.equal(welcome.spectator, false);
  socket.send(JSON.stringify({ type: 'join', name: '  Lab Team  ', commandId: 'join' }));
  const pad = app.game.pads[0];
  socket.send(JSON.stringify({ type: 'start', regionId: pad, commandId: 'start' }));
  await new Promise(resolve=>setTimeout(resolve,10));
  app.game.tick(0.25);
  socket.send(JSON.stringify({ type: 'allocate', allocation: { research: 40, manufacturing: 40, infrastructure: 20 }, commandId: 'budget' }));
  await new Promise(resolve=>setTimeout(resolve,10)); app.game.tick(0.25);
  const statePromise=event('message'); app.broadcast();
  const stateEvent = await statePromise;
  const state = JSON.parse(stateEvent.data);
  assert.equal(state.type, 'state'); assert.equal(state.players[0].name, 'Lab Team');
  assert.equal(state.regions[pad].ownerId, 'identity-1');
  assert.deepEqual(state.players[0].allocation, { research: 40, manufacturing: 40, infrastructure: 20 });
  socket.close(); await event('close');
  for (let attempt = 0; app.game.players.get('identity-1').connected && attempt < 20; attempt += 1) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(app.game.players.size, 20);
  assert.equal(app.game.players.get('identity-1').bot, false);
  app.game.tick(5);app.game.tick(5);app.game.tick(5);app.game.tick(5);app.game.tick(5);app.game.tick(5);app.game.tick(.25);
  assert.equal(app.game.players.get('identity-1').bot, true);
});

test('a client transport error closes the socket without crashing the server', async t => {
  const app = await runningApp();
  t.after(() => app.server.close());
  const client = new WebSocket(app.ws);
  await new Promise(resolve => client.addEventListener('open', resolve, { once: true }));
  const socket = [...app.sockets][0];

  socket.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
  await once(socket, 'close');

  assert.equal(socket.destroyed, true);
  assert.equal(app.sockets.size, 0);
  assert.equal(app.game.players.get('identity-1').connected, false);
});

test('a superseded company socket cannot disconnect the active reconnect', async t => {
  const app = await runningApp();
  t.after(() => { for (const client of app.sockets) client.destroy(); app.server.close(); });

  const first = await connect(app.ws);
  const second = await connect(`${app.ws}?credential=${encodeURIComponent(first.welcome.credential)}`);
  assert.equal(second.welcome.id, first.welcome.id);
  assert.equal(second.welcome.reconnected, true);

  const firstClosed = once(first.socket, 'close');
  first.socket.close();
  await firstClosed;
  advance(app.game, 30.25);

  const player = app.game.players.get(first.welcome.id);
  assert.equal(player.connected, true);
  assert.equal(player.bot, false);

  const spectator = await connect(app.ws);
  assert.equal(spectator.welcome.spectator, true);
  const spectatorClosed = once(spectator.socket, 'close');
  spectator.socket.close();
  await spectatorClosed;
  assert.equal(player.connected, true);

  const secondClosed = once(second.socket, 'close');
  second.socket.close();
  await secondClosed;
  for (let attempt = 0; player.connected && attempt < 20; attempt += 1) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(player.connected, false);
  assert.equal(player.bot, false);

  advance(app.game, 30.25);
  assert.equal(player.bot, true);
});
