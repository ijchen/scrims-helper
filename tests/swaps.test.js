import { defaultSlot, snapshotRole } from './fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { currentSession, newState, ROLES, lineupSwaps, recordGame } from '../model.js';

function fixture() {
  const state = newState();
  for (let index = 0; index < 10; index += 1) {
    const id = `player-${index}`;
    state.players.push({ id, name: `Player ${index}`, battletag: `Tag${index}#1234`, roles: [...ROLES], status: 'default', notes: '' });
    currentSession(state).attendees.push({ playerId: id, present: true, priority: '1' });
    if (index < 5) currentSession(state).lineup[defaultSlot(ROLES[index])].playerId = id;
  }
  recordGame(state, 'previous', '2026-09-27T12:00:00Z');
  return state;
}

test('unchanged membership produces no swaps even when everyone changes roles', () => {
  const state = fixture();
  ROLES.forEach((role, index) => { currentSession(state).lineup[defaultSlot(role)].playerId = `player-${(index + 1) % 5}`; });
  assert.deepEqual(lineupSwaps(state).pairs, []);
  assert.equal(lineupSwaps(state).message, '');
});

test('pairs subs by role group despite internal role changes', () => {
  const state = fixture();
  currentSession(state).lineup.tank.playerId = 'player-5';
  currentSession(state).lineup.support1.playerId = 'player-4';
  currentSession(state).lineup.support2.playerId = 'player-6';
  assert.equal(lineupSwaps(state).message, 'Tag5 in for Tag0, Tag6 in for Tag3');
});

test('global matching reserves exact matches rather than greedy cross-role pairs', () => {
  const state = fixture();
  currentSession(state).lineup.tank.playerId = 'player-3';
  currentSession(state).lineup.dps1.playerId = 'player-5';
  currentSession(state).lineup.dps2.playerId = 'player-2';
  currentSession(state).lineup.support1.playerId = 'player-6';
  currentSession(state).lineup.support2.playerId = 'player-7';
  const result = lineupSwaps(state);
  assert.equal(result.message, 'Tag5 in for Tag1, Tag6 in for Tag0, Tag7 in for Tag4');
  assert.equal(new Set(result.pairs.map(pair => pair.outgoing.playerId)).size, 3);
});

test('active snapshot takes priority, names fall back, comparison does not mutate state', () => {
  const state = fixture();
  currentSession(state).activeGame = structuredClone(currentSession(state).games[0]);
  currentSession(state).activeGame.id = 'active';
  currentSession(state).activeGame.lineup[0] = { ...snapshotRole('Tank'), playerId: 'deleted', name: 'Former player', battletag: '' };
  state.players[0].battletag = '';
  const before = structuredClone(state);
  const result = lineupSwaps(state);
  assert.equal(result.source.id, 'active');
  assert.equal(result.message, 'Player 0 in for Former player');
  assert.deepEqual(state, before);
});

test('missing source, incomplete and duplicate lineups are rejected', () => {
  assert.throws(() => lineupSwaps(newState()), /Start a game/);
  const state = fixture();
  currentSession(state).lineup.tank.playerId = '';
  assert.throws(() => lineupSwaps(state), /Fill all five/);
  currentSession(state).lineup.tank.playerId = currentSession(state).lineup.support1.playerId;
  assert.throws(() => lineupSwaps(state), /Fill all five/);
});

test('five substitutions prefer exact roles and ignore attendance for planning', () => {
  const state = fixture();
  ROLES.forEach((role, index) => { currentSession(state).lineup[defaultSlot(role)].playerId = `player-${index + 5}`; });
  currentSession(state).attendees.forEach(attendee => { attendee.present = false; });
  const result = lineupSwaps(state);
  assert.equal(result.pairs.length, 5);
  assert.ok(result.pairs.every(pair => pair.incoming.roles.join() === pair.outgoing.roles.join()));
});
