import test from 'node:test';
import assert from 'node:assert/strict';
import { mapRef, heroRef } from './fixtures.js';
import { gameWarnings, newSession } from '../model.js';

test('map repeats span the scrim, mode repeats reset after all five modes', () => {
  const session = newSession();
  session.games = [{ id: 'first', map: mapRef('Ilios'), mode: 'Control' }];
  assert.equal(gameWarnings(session, { map: mapRef('ILIOS') }).map.length, 2);
  assert.deepEqual(gameWarnings(session, { map: mapRef('Nepal') }).map, ['Mode already played this rotation']);
  session.games.push(...['Push', 'Hybrid', 'Escort', 'Flashpoint'].map(mode => ({ id: mode, mode })));
  assert.deepEqual(gameWarnings(session, { map: mapRef('Ilios') }).map, ['Map already played']);
  assert.deepEqual(gameWarnings(session, { map: mapRef('Nepal') }).map, []);
});

test('ban repeats are team-specific and role conflicts mark both bans', () => {
  const session = newSession();
  session.games = [{ id: 'first', ourBan: heroRef('Ana'), theirBan: heroRef('Tracer') }];
  assert.deepEqual(gameWarnings(session, { ourBan: heroRef('ana'), theirBan: heroRef('tracer') }), {
    map: [], ourBan: ['Already banned by this team'], theirBan: ['Already banned by this team'],
  });
  assert.deepEqual(gameWarnings(session, { ourBan: heroRef('Tracer'), theirBan: heroRef('Ana') }), { map: [], ourBan: [], theirBan: [] });
  const warnings = gameWarnings(session, { ourBan: heroRef('Baptiste'), theirBan: heroRef('Mercy') });
  assert.deepEqual(warnings.ourBan, ['Both bans have the same role']);
  assert.deepEqual(warnings.theirBan, warnings.ourBan);
  assert.deepEqual(gameWarnings(session, {}), { map: [], ourBan: [], theirBan: [] });
});

test('history uses only preceding games and upcoming includes the active snapshot', () => {
  const session = newSession();
  const first = { id: 'first', map: mapRef('Ilios'), ourBan: heroRef('Ana') };
  const second = { ...first, id: 'second' };
  session.games = [first, second];
  assert.deepEqual(gameWarnings(session, first, first.id), { map: [], ourBan: [], theirBan: [] });
  assert.equal(gameWarnings(session, second, second.id).map.length, 2);
  session.activeGame = { id: 'live', map: mapRef('Dorado'), theirBan: heroRef('Tracer') };
  assert.deepEqual(gameWarnings(session, session.activeGame, 'live'), { map: [], ourBan: [], theirBan: [] });
  assert.equal(gameWarnings(session, { map: mapRef('Dorado'), theirBan: heroRef('Tracer') }).map.length, 2);
  assert.equal(gameWarnings(session, { theirBan: heroRef('Tracer') }).theirBan.length, 1);
  session.games[0].map = mapRef('Nepal');
  assert.deepEqual(gameWarnings(session, second, second.id).map, ['Mode already played this rotation']);
});
