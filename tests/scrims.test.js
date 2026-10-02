import test from 'node:test';
import assert from 'node:assert/strict';
import { currentSession, ROLES, newState, newSession, allScrims, createScrim, switchScrim, deleteScrim, startGame, finishGame, gamesFor, removeAttendee, validateState } from '../model.js';

function populatedState() {
  const state = newState();
  for (const role of ROLES) {
    state.players.push({ id: role, name: role, battletag: `${role}#1234`, roles: [role], status: 'default', notes: '' });
    currentSession(state).attendees.push({ playerId: role, present: true });
    currentSession(state).lineup[role] = role;
  }
  currentSession(state).title = 'First scrim';
  currentSession(state).contact = 'Coach#1234';
  currentSession(state).disabledMapIds = ['ilios'];
  startGame(state, 'completed', '2026-09-28T12:00:00Z');
  finishGame(state, '2026-09-28T12:10:00Z');
  startGame(state, 'active', '2026-09-28T12:15:00Z');
  return state;
}

test('switching scrims preserves complete sessions and isolates playtime', () => {
  const state = populatedState();
  const original = structuredClone(currentSession(state));
  const originalId = state.activeScrimId;
  createScrim(state, 'second', '2026-09-29T12:00:00Z');
  assert.deepEqual(currentSession(state), newSession('2026-09-29T12:00:00Z'));
  assert.equal(gamesFor(state, 'Tank'), 0);
  currentSession(state).contact = 'Other#1234';
  state.players[0].name = 'Shared name';
  switchScrim(state, originalId);
  assert.deepEqual(currentSession(state), original);
  assert.equal(gamesFor(state, 'Tank'), 1);
  assert.equal(state.players[0].name, 'Shared name');
  assert.equal(state.scrims.find(scrim => scrim.id === 'second').session.contact, 'Other#1234');
  assert.deepEqual(validateState(state), state);
  switchScrim(state, originalId);
  assert.equal(allScrims(state).length, 2);
  assert.throws(() => switchScrim(state, 'missing'));
});

test('copy setup resets attendance, contact, games, and lineup without sharing mutable pools', () => {
  const state = populatedState();
  createScrim(state, 'second', '2026-09-29T12:00:00Z', true);
  assert.deepEqual(currentSession(state), { ...newSession('2026-09-29T12:00:00Z'), disabledMapIds: ['ilios'], attendees: ROLES.map(role => ({ playerId: role, present: false })) });
  currentSession(state).disabledMapIds.push('oasis');
  currentSession(state).attendees[0].present = true;
  assert.deepEqual(state.scrims[0].session.disabledMapIds, ['ilios']);
  assert.ok(state.scrims[0].session.attendees.every(attendee => attendee.present));
  assert.deepEqual(validateState(state), state);
});

test('deleting active scrim selects newest remaining and cannot delete the last', () => {
  const state = newState();
  const originalId = state.activeScrimId;
  assert.throws(() => deleteScrim(state, originalId));
  createScrim(state, 'second', '2026-09-29T12:00:00Z');
  createScrim(state, 'third', '2026-09-30T12:00:00Z');
  deleteScrim(state, 'third');
  assert.equal(state.activeScrimId, 'second');
  deleteScrim(state, originalId);
  assert.equal(state.scrims.length, 1);
  assert.throws(() => deleteScrim(state, 'missing'));
  assert.deepEqual(validateState(state), state);
});

test('malformed archived sessions are rejected', () => {
  const state = populatedState();
  createScrim(state, 'second', '2026-09-29T12:00:00Z');
  for (const mutate of [
    copy => { copy.scrims[0].id = 'second'; },
    copy => { copy.scrims[0].createdAt = 'invalid'; },
    copy => { copy.scrims[0].session.attendees[0].playerId = 'missing'; },
    copy => { copy.scrims[0].session = null; },
    copy => { copy.activeScrimId = ''; },
  ]) {
    const copy = structuredClone(state);
    mutate(copy);
    assert.throws(() => validateState(copy));
  }
});

test('removing directory players across scrims preserves historical snapshots', () => {
  const state = populatedState();
  createScrim(state, 'second', '2026-09-29T12:00:00Z', true);
  for (const scrim of allScrims(state)) removeAttendee(state, 'Tank', scrim.id);
  state.players = state.players.filter(player => player.id !== 'Tank');
  assert.deepEqual(validateState(state), state);
  assert.equal(state.scrims[0].session.activeGame.lineup[0].playerId, 'Tank');
  assert.equal(state.scrims[0].session.games[0].lineup[0].playerId, 'Tank');
});
