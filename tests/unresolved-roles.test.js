import { defaultSlot, snapshotRole } from './fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, currentSession, ROLES, setSlotRoles, playedRoles, autofillLineup, assignmentChoices, preferredGamesFor, gamesFor, startGame, finishGame, cancelActiveGame, setGameRoles, replaceGamePlayer, lineupSwaps, validateState } from '../model.js';
import { resolveRoles, roleGroup } from '../roles.js';

const pair = ['HSDPS', 'FDPS'];
const player = (id, roles, offRoles = []) => ({ id, name: id, battletag: '', roles, offRoles, status: 'default', notes: '' });
function add(state, entry) {
  state.players.push(entry);
  currentSession(state).attendees.push({ playerId: entry.id, present: true, priority: '1' });
}
function fixture(empty = 'HSDPS') {
  const state = newState();
  for (const role of ROLES.filter(role => role !== empty)) {
    add(state, player(role, [role]));
    currentSession(state).lineup[defaultSlot(role)].playerId = role;
  }
  return state;
}
function history(state, id, roles) {
  roles.forEach((role, index) => {
    currentSession(state).games[index] ||= { lineup: [] };
    currentSession(state).games[index].lineup.push({ playerId: id, ...snapshotRole(role) });
  });
}

test('role inference distinguishes main, fill, and unlisted without arbitrary tie breaks', () => {
  for (const [mains, fills, expected] of [
    [pair, [], 'HSDPS / FDPS'],
    [[], pair, 'HSDPS / FDPS'],
    [[], [], 'HSDPS / FDPS'],
    [['HSDPS'], ['FDPS'], 'HSDPS'],
    [['FDPS'], ['HSDPS'], 'FDPS'],
    [['HSDPS'], [], 'HSDPS'],
    [[], ['FDPS'], 'FDPS'],
  ]) {
    assert.deepEqual(resolveRoles(pair, player('p', mains, fills)), expected.split(' / '));
    assert.deepEqual(resolveRoles([...pair].reverse(), player('p', mains, fills)), expected.split(' / '));
  }
  assert.deepEqual(resolveRoles(['MS', 'FS'], player('p', ['MS', 'FS'])), 'MS / FS'.split(' / '));
  assert.deepEqual(resolveRoles(pair), 'HSDPS / FDPS'.split(' / '));
  assert.equal(roleGroup('MS'), 'support');
});

test('unresolved mains remain eligible and snapshots survive persistence, finish, and cancellation', () => {
  const state = fixture();
  const session = currentSession(state);
  add(state, player('flex', pair));
  setSlotRoles(state, 'dps1', pair);
  assert.ok(assignmentChoices(state, 'flex').includes('dps1'));
  session.lineup = autofillLineup(state);
  assert.deepEqual(playedRoles(session, 'dps1', state.players.at(-1)), 'HSDPS / FDPS'.split(' / '));
  startGame(state, 'first', '2026-10-19T12:00:00Z');
  assert.deepEqual(session.activeGame.lineup[1].roles, 'HSDPS / FDPS'.split(' / '));
  assert.equal(preferredGamesFor(state, 'flex'), 1);
  assert.deepEqual(validateState(state), state);
  cancelActiveGame(state);
  assert.deepEqual(session.lineup.dps1.allowedRoles, pair);
  startGame(state, 'second', '2026-10-19T12:00:00Z');
  finishGame(state, '2026-10-19T12:30:00Z');
  assert.equal(gamesFor(state, 'flex', 'dps'), 1);
  assert.equal(preferredGamesFor(state, 'flex'), 1);
  assert.deepEqual(validateState(state), state);
});

test('unresolved fills count as fills, not preferred games, and remain autofill eligible', () => {
  const state = fixture();
  const session = currentSession(state);
  add(state, player('flex', [], pair));
  setSlotRoles(state, 'dps1', pair);
  session.lineup = autofillLineup(state);
  startGame(state, 'first', '2026-10-19T12:00:00Z');
  assert.deepEqual(session.activeGame.lineup[1].roles, 'HSDPS / FDPS'.split(' / '));
  assert.equal(preferredGamesFor(state, 'flex'), 0);
});

test('unresolved history counts in main-game priority and broad-role balancing', () => {
  const state = fixture('FS');
  add(state, player('needs-support', [...pair, 'FS']));
  add(state, player('needs-dps', [...pair, 'FS']));
  history(state, 'needs-support', Array(3).fill('HSDPS / FDPS'));
  history(state, 'needs-dps', Array(3).fill('FS'));
  assert.equal(preferredGamesFor(state, 'needs-support'), 3);
  assert.equal(autofillLineup(state).support2.playerId, 'needs-support');
  state.players.find(p => p.id === 'needs-dps').roles = ['FS'];
  assert.equal(autofillLineup(state).support2.playerId, 'needs-support');
});

test('unresolved history neither credits nor penalizes a particular subrole', () => {
  for (const role of pair) {
    const state = fixture(role);
    add(state, player('unresolved', pair));
    add(state, player('hitscan-heavy', pair));
    history(state, 'unresolved', Array(3).fill('HSDPS / FDPS'));
    history(state, 'hitscan-heavy', Array(3).fill('HSDPS'));
    assert.equal(autofillLineup(state)[defaultSlot(role)].playerId, role === 'HSDPS' ? 'unresolved' : 'hitscan-heavy');
  }
});

test('an unresolved proposed assignment has no arbitrary subrole preference', () => {
  const state = fixture();
  setSlotRoles(state, 'dps1', pair);
  add(state, player('hitscan-heavy', pair));
  add(state, player('flex-heavy', pair));
  history(state, 'hitscan-heavy', Array(3).fill('HSDPS'));
  history(state, 'flex-heavy', Array(3).fill('FDPS'));
  assert.equal(autofillLineup(state, () => 0n).dps1.playerId, 'flex-heavy');
  assert.equal(autofillLineup(state, n => n - 1n).dps1.playerId, 'hitscan-heavy');
});

test('clarifying recorded roles updates preferred counts without changing planned slots or player identities', () => {
  const state = fixture();
  const session = currentSession(state);
  add(state, player('flex', pair));
  setSlotRoles(state, 'dps1', pair);
  session.lineup = autofillLineup(state);
  startGame(state, 'first', '2026-10-19T12:00:00Z');
  const game = session.activeGame;
  const ids = game.lineup.map(slot => slot.playerId);
  setGameRoles(game, 'dps1', 'FDPS'.split(' / '));
  assert.deepEqual(game.lineup.map(slot => slot.playerId), ids);
  assert.deepEqual(session.lineup.dps1.allowedRoles, pair);
  assert.throws(() => setGameRoles(game, 'dps1', ['MS']));
  setGameRoles(game, 'dps1', 'HSDPS / FDPS'.split(' / '));
  state.players.find(p => p.id === 'flex').roles = ['FDPS'];
  assert.equal(preferredGamesFor(state, 'flex'), 0);
  assert.deepEqual(game.lineup[1].roles, 'HSDPS / FDPS'.split(' / '));
  setGameRoles(game, 'dps1', 'FDPS'.split(' / '));
  assert.equal(preferredGamesFor(state, 'flex'), 1);
  assert.deepEqual(validateState(state), state);
});

test('unresolved snapshots retain group-aware swaps and independent player editing', () => {
  const state = fixture();
  const session = currentSession(state);
  add(state, player('flex', pair));
  setSlotRoles(state, 'dps1', pair);
  session.lineup = autofillLineup(state);
  startGame(state, 'first', '2026-10-19T12:00:00Z');
  add(state, player('replacement', pair));
  session.lineup.dps1.playerId = 'replacement';
  assert.equal(lineupSwaps(state).pairs[0].outgoing.playerId, 'flex');
  replaceGamePlayer(state, session.activeGame, 'dps1', 'replacement');
  assert.deepEqual(session.activeGame.lineup[1].roles, 'HSDPS / FDPS'.split(' / '));
  assert.equal(session.activeGame.lineup[1].playerId, 'replacement');
  assert.deepEqual(validateState(state), state);
});

test('backup validation requires same-group role arrays in games', () => {
  const state = fixture();
  const session = currentSession(state);
  add(state, player('flex', pair));
  setSlotRoles(state, 'dps1', pair);
  session.lineup = autofillLineup(state);
  startGame(state, 'first', '2026-10-19T12:00:00Z');
  for (const role of [[], ['HSDPS', 'FS'], ['Tank', 'HSDPS'], ['MS', 'FS'], ['HSDPS', 'HSDPS'], 'HSDPS / FDPS']) {
    const bad = structuredClone(state);
    currentSession(bad).activeGame.lineup[1].roles = role;
    assert.throws(() => validateState(bad));
  }
  const bad = structuredClone(state);
  bad.players.at(-1).roles = ['HSDPS / FDPS'];
  assert.throws(() => validateState(bad));
});
