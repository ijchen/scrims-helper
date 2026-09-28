import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, ROLES, lineupSwaps, recordGame } from '../model.js';

function fixture() {
  const state = newState();
  for (let index = 0; index < 10; index += 1) {
    const id = `player-${index}`;
    state.players.push({ id, name: `Player ${index}`, battletag: `Tag${index}#1234`, roles: [...ROLES], status: 'default', notes: '' });
    state.session.attendees.push({ playerId: id, present: true });
    if (index < 5) state.session.lineup[ROLES[index]] = id;
  }
  recordGame(state, 'previous', '2026-09-27T12:00:00Z');
  return state;
}

test('unchanged membership produces no swaps even when everyone changes roles', () => {
  const state = fixture();
  ROLES.forEach((role, index) => { state.session.lineup[role] = `player-${(index + 1) % 5}`; });
  assert.deepEqual(lineupSwaps(state).pairs, []);
  assert.equal(lineupSwaps(state).message, '');
});

test('pairs subs by role group despite internal role changes', () => {
  const state = fixture();
  state.session.lineup.Tank = 'player-5';
  state.session.lineup.MS = 'player-4';
  state.session.lineup.FS = 'player-6';
  assert.equal(lineupSwaps(state).message, 'Tag5 in for Tag0, Tag6 in for Tag3');
});

test('global matching reserves exact matches rather than greedy cross-role pairs', () => {
  const state = fixture();
  state.session.lineup.Tank = 'player-3';
  state.session.lineup.HSDPS = 'player-5';
  state.session.lineup.FDPS = 'player-2';
  state.session.lineup.MS = 'player-6';
  state.session.lineup.FS = 'player-7';
  const result = lineupSwaps(state);
  assert.equal(result.message, 'Tag5 in for Tag1, Tag6 in for Tag0, Tag7 in for Tag4');
  assert.equal(new Set(result.pairs.map(pair => pair.outgoing.playerId)).size, 3);
});

test('active snapshot takes priority, names fall back, comparison does not mutate state', () => {
  const state = fixture();
  state.session.activeGame = structuredClone(state.session.games[0]);
  state.session.activeGame.id = 'active';
  state.session.activeGame.lineup[0] = { role: 'Tank', playerId: 'deleted', name: 'Former player', battletag: '' };
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
  state.session.lineup.Tank = '';
  assert.throws(() => lineupSwaps(state), /Fill all five/);
  state.session.lineup.Tank = state.session.lineup.MS;
  assert.throws(() => lineupSwaps(state), /Fill all five/);
});

test('five substitutions prefer exact roles and ignore attendance for planning', () => {
  const state = fixture();
  ROLES.forEach((role, index) => { state.session.lineup[role] = `player-${index + 5}`; });
  state.session.attendees.forEach(attendee => { attendee.present = false; });
  const result = lineupSwaps(state);
  assert.equal(result.pairs.length, 5);
  assert.ok(result.pairs.every(pair => pair.incoming.role === pair.outgoing.role));
});
