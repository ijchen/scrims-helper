import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, currentSession, createScrim, switchScrim, ROLES, recordGame, gameWarnings, validateState } from '../model.js';
import { exportData, readImport } from '../backups.js';
import { heroRef } from './fixtures.js';

test('bans default on, persist per scrim, and copy only when reusing setup', () => {
  const state = newState();
  const original = state.activeScrimId;
  currentSession(state).bansEnabled = false;
  assert.equal(readImport(exportData(state, { players: true, scrims: true })).scrims.items[0].session.bansEnabled, false);
  createScrim(state, 'copy', '2026-09-29T12:00:00Z', true);
  assert.equal(currentSession(state).bansEnabled, false);
  createScrim(state, 'fresh', '2026-09-29T12:00:00Z');
  assert.equal(currentSession(state).bansEnabled, true);
  switchScrim(state, original);
  assert.equal(currentSession(state).bansEnabled, false);
  delete currentSession(state).bansEnabled;
  assert.doesNotThrow(() => validateState(state));
  for (const invalid of [null, 0, 'false']) {
    currentSession(state).bansEnabled = invalid;
    assert.throws(() => validateState(state));
  }
});

test('disabled bans do not enter new games or warnings and do not erase history', () => {
  const state = newState();
  const session = currentSession(state);
  for (const role of ROLES) {
    state.players.push({ id: role, name: role, roles: [role], battletag: '', status: 'default', notes: '' });
    session.attendees.push({ playerId: role, present: true });
    session.lineup[role] = role;
  }
  session.draft.ourBan = heroRef('Ana');
  session.draft.theirBan = heroRef('Mercy');
  recordGame(state, 'before', '2026-09-29T12:00:00Z');
  session.draft.ourBan = heroRef('Ana');
  session.bansEnabled = false;
  assert.deepEqual(gameWarnings(session, session.draft).ourBan, []);
  assert.deepEqual(session.games[0].ourBan, heroRef('Ana'));
  recordGame(state, 'after', '2026-09-29T12:10:00Z');
  assert.equal(session.games[1].ourBan, null);
  assert.equal(session.games[1].theirBan, null);
  session.bansEnabled = true;
  assert.deepEqual(session.games[0].ourBan, heroRef('Ana'));
  assert.doesNotThrow(() => validateState(state));
});
