import test from 'node:test';
import assert from 'node:assert/strict';
import { gameWarnings, newSession } from '../model.js';

test('map repeats span the scrim, mode repeats reset after all five modes', () => {
  const session = newSession();
  session.games = [{ id: 'first', label: 'Ilios', mode: 'Control' }];
  assert.equal(gameWarnings(session, { label: 'ILIOS' }).label.length, 2);
  assert.deepEqual(gameWarnings(session, { label: 'Nepal' }).label, ['Mode already played this rotation']);
  session.games.push(...['Push', 'Hybrid', 'Escort', 'Flashpoint'].map(mode => ({ id: mode, mode })));
  assert.deepEqual(gameWarnings(session, { label: 'Ilios' }).label, ['Map already played']);
  assert.deepEqual(gameWarnings(session, { label: 'Nepal' }).label, []);
});

test('ban repeats are team-specific and role conflicts mark both bans', () => {
  const session = newSession();
  session.games = [{ id: 'first', ourBan: 'Ana', theirBan: 'Tracer' }];
  assert.deepEqual(gameWarnings(session, { ourBan: 'ana', theirBan: 'tracer' }), {
    label: [], ourBan: ['Already banned by this team'], theirBan: ['Already banned by this team'],
  });
  assert.deepEqual(gameWarnings(session, { ourBan: 'Tracer', theirBan: 'Ana' }), { label: [], ourBan: [], theirBan: [] });
  const warnings = gameWarnings(session, { ourBan: 'Baptiste', theirBan: 'Mercy' });
  assert.deepEqual(warnings.ourBan, ['Both bans have the same role']);
  assert.deepEqual(warnings.theirBan, warnings.ourBan);
  assert.deepEqual(gameWarnings(session, {}), { label: [], ourBan: [], theirBan: [] });
});

test('history uses only preceding games and upcoming includes the active snapshot', () => {
  const session = newSession();
  const first = { id: 'first', label: 'Ilios', ourBan: 'Ana' };
  const second = { ...first, id: 'second' };
  session.games = [first, second];
  assert.deepEqual(gameWarnings(session, first, first.id), { label: [], ourBan: [], theirBan: [] });
  assert.equal(gameWarnings(session, second, second.id).label.length, 2);
  session.activeGame = { id: 'live', label: 'Dorado', theirBan: 'Tracer' };
  assert.deepEqual(gameWarnings(session, session.activeGame, 'live'), { label: [], ourBan: [], theirBan: [] });
  assert.equal(gameWarnings(session, { label: 'Dorado', theirBan: 'Tracer' }).label.length, 2);
  assert.equal(gameWarnings(session, { theirBan: 'Tracer' }).theirBan.length, 1);
  session.games[0].label = 'Nepal';
  assert.deepEqual(gameWarnings(session, second, second.id).label, ['Mode already played this rotation']);
});
