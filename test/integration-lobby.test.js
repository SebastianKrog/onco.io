import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { MAP_TEMPLATES } from '../server/map.js';

test('lobby-sized integration runs instantiate the official requested map',()=>{const lobbySize=Number(process.env.LOBBY_SIZE||20),game=new Game({lobbySize,seed:`integration-${lobbySize}`});assert.deepEqual({columns:game.map.columns,rows:game.map.rows},MAP_TEMPLATES[lobbySize]);assert.equal(game.regions.length,lobbySize*8);assert.equal(game.pads.length,lobbySize);});
