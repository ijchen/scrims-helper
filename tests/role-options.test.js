import { defaultSlot, snapshotRole } from './fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, currentSession, ROLES, setSlotRoles, playedRoles, autofillLineup, autofillUnavailableReason, assignmentChoices, startGame, finishGame, cancelActiveGame, replaceGamePlayer, lineupSwaps, createScrim, validateState } from '../model.js';

function fixture() {
  const state = newState();
  const session = currentSession(state);
  ['Tank', 'HSDPS', 'HSDPS', 'FS', 'FS'].forEach((role, index) => {
    const id = `p${index}`;
    state.players.push({ id, name: id, battletag: '', roles: [role], status: 'default', notes: '' });
    session.attendees.push({ playerId: id, present: true, priority: '1' });
  });
  setSlotRoles(state, 'dps2', ['HSDPS']);
  setSlotRoles(state, 'support1', ['MS', 'FS']);
  return state;
}

test('double hitscan and optional double flex support autofill distinct players and record actual roles', () => {
  const state = fixture();
  const session = currentSession(state);
  assert.equal(autofillUnavailableReason(state), '');
  assert.deepEqual(assignmentChoices(state, 'p1'), ['HSDPS', 'FDPS'].map(defaultSlot));
  session.lineup = autofillLineup(state);
  assert.equal(new Set(Object.values(session.lineup).map(slot => slot.playerId)).size, 5);
  startGame(state, 'game', '2026-10-19T12:00:00Z');
  assert.deepEqual(session.activeGame.lineup.map(slot => slot.roles), [['Tank'], ['HSDPS'], ['HSDPS'], ['FS'], ['FS']]);
  assert.deepEqual(validateState(state), state);
  setSlotRoles(state, 'support1', ['MS']);
  assert.deepEqual(session.activeGame.lineup[3].roles, 'FS'.split(' / '));
  cancelActiveGame(state);
  assert.deepEqual(playedRoles(session, 'support1'), 'FS'.split(' / '));
  assert.equal(new Set(Object.values(session.lineup).map(slot => slot.playerId)).size, 5);
});

test('flexible slots prefer main roles to fills and retain distinct-player feasibility', () => {
  const state = fixture();
  const session = currentSession(state);
  const player = state.players[3];
  player.offRoles = ['MS'];
  assert.deepEqual(playedRoles(session, 'support1', player), 'FS'.split(' / '));
  session.attendees[4].present = false;
  assert.match(autofillUnavailableReason(state), /2 different players/);
  assert.throws(() => autofillLineup(state));
  assert.deepEqual(Object.values(session.lineup).map(slot => slot.playerId), Array(5).fill(''));
});

test('duplicate-role game slots can be edited independently and all substitutions are matched', () => {
  const state = fixture();
  const session = currentSession(state);
  session.lineup = autofillLineup(state);
  startGame(state, 'game', '2026-10-19T12:00:00Z');
  const game = session.activeGame;
  const first = game.lineup[3].playerId;
  const second = game.lineup[4].playerId;
  replaceGamePlayer(state, game, 'support2', first);
  assert.equal(game.lineup[3].playerId, second);
  assert.equal(game.lineup[4].playerId, first);
  state.players.push({ id: 'replacement', name: 'Replacement', battletag: '', roles: ['FS'], status: 'default', notes: '' });
  session.attendees.push({ playerId: 'replacement', present: true, priority: '1' });
  session.lineup.support2.playerId = 'replacement';
  assert.equal(lineupSwaps(state).pairs.length, 1);
  replaceGamePlayer(state, game, 'support2', 'replacement');
  assert.equal(game.lineup[3].playerId, second);
  finishGame(state, '2026-10-19T12:30:00Z');
  assert.deepEqual(validateState(state), state);
});

test('role settings copy with setup and invalid or cross-group options are rejected', () => {
  const state = fixture();
  const original = currentSession(state);
  createScrim(state, 'next', '2026-10-20T12:00:00Z', true);
  assert.deepEqual(Object.values(currentSession(state).lineup).map(slot => slot.allowedRoles), Object.values(original.lineup).map(slot => slot.allowedRoles));
  setSlotRoles(state, 'support1', ['FS']);
  assert.deepEqual(original.lineup.support1.allowedRoles, ['MS', 'FS']);
  for (const roles of [[], ['Tank'], ['MS', 'MS'], ['invalid']]) {
    assert.throws(() => setSlotRoles(state, 'support1', roles));
    const bad = structuredClone(state);
    currentSession(bad).lineup.support1.allowedRoles = roles;
    assert.throws(() => validateState(bad));
  }
  assert.deepEqual(validateState(state), state);
  assert.deepEqual(ROLES.map(role => playedRoles(currentSession(state), defaultSlot(role))), [['Tank'], ['HSDPS'], ['HSDPS'], ['FS'], ['FS']]);
});
