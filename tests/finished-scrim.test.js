import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, currentSession, setScrimFinished, createScrim, ROLES, startGame, finishGame, reopenLastGame, validateState } from '../model.js';
import { exportData, readImport } from '../backups.js';

test('finishing preserves setup and history, round trips, and resumes without losing the draft', () => {
  const state = newState();
  const session = currentSession(state);
  session.draft.map = { id: '', name: 'Next map' };
  setScrimFinished(state, true);
  assert.equal(readImport(exportData(state, { players: true, scrims: true })).scrims.items[0].session.finished, true);
  assert.throws(() => startGame(state, 'game', '2026-09-30T12:00:00Z'), /Reopen/);
  setScrimFinished(state, false);
  assert.equal(session.draft.map.name, 'Next map');
  setScrimFinished(state, true);
  createScrim(state, 'new', '2026-09-30T12:00:00Z', true);
  assert.equal(currentSession(state).finished, false);
});

test('an active game must finish first; reopening a game resumes the scrim', () => {
  const state = newState();
  const session = currentSession(state);
  for (const role of ROLES) {
    state.players.push({ id: role, name: role, battletag: '', roles: [role], status: 'default', notes: '' });
    session.attendees.push({ playerId: role, present: true });
    session.lineup[role] = role;
  }
  startGame(state, 'game', '2026-09-30T12:00:00Z');
  assert.throws(() => setScrimFinished(state, true));
  session.finished = true;
  assert.throws(() => validateState(state));
  session.finished = false;
  finishGame(state, '2026-09-30T12:10:00Z');
  setScrimFinished(state, true);
  reopenLastGame(state);
  assert.equal(session.finished, false);
  assert.equal(session.activeGame.id, 'game');
  assert.doesNotThrow(() => validateState(state));
  delete session.finished;
  assert.doesNotThrow(() => validateState(state));
  session.finished = 'yes';
  assert.throws(() => validateState(state));
});
