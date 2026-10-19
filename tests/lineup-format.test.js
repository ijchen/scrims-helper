import test from 'node:test';
import assert from 'node:assert/strict';
import { SLOTS, ROLES, newState, currentSession, setSlotRoles, assignPlayer, autofillLineup, recordGame, cancelActiveGame, startGame, replaceGamePlayer, setGameRoles, validateState } from '../model.js';
import { restoreSavedState } from '../storage.js';
import { exportData, readImport } from '../backups.js';

function ready() {
  const state = newState();
  const session = currentSession(state);
  for (const slot of SLOTS) {
    state.players.push({ id: slot, name: slot, battletag: '', roles: [...ROLES], status: 'default', notes: '' });
    session.attendees.push({ playerId: slot, present: true, priority: '1' });
    assignPlayer(state, slot, slot);
  }
  return state;
}

test('requirements and players share explicit neutral slots, while snapshots store possible played roles', () => {
  const state = ready();
  const session = currentSession(state);
  setSlotRoles(state, 'dps1', ['HSDPS', 'FDPS']);
  state.players.find(p => p.id === 'dps1').roles = ['HSDPS'];
  setSlotRoles(state, 'dps2', ['HSDPS', 'FDPS']);
  recordGame(state, 'game', '2026-10-19T12:00:00Z');
  assert.deepEqual(session.lineup.dps1, { allowedRoles: ['HSDPS', 'FDPS'], playerId: 'dps1' });
  assert.deepEqual(session.games[0].lineup.find(entry => entry.slot === 'dps1').roles, ['HSDPS']);
  assert.deepEqual(session.games[0].lineup.find(entry => entry.slot === 'dps2').roles, ['HSDPS', 'FDPS']);
  setSlotRoles(state, 'dps2', ['FDPS']);
  assert.deepEqual(session.games[0].lineup.find(entry => entry.slot === 'dps2').roles, ['HSDPS', 'FDPS']);
  const exported = exportData(state, { players: true, scrims: true });
  assert.deepEqual(Object.keys(exported).sort(), ['data', 'format', 'version']);
  assert.equal(exported.version, 1);
  assert.deepEqual(readImport(exported), exported.data);
});

test('old prerelease structures fail without rewriting or defaulting saved data', () => {
  const state = ready();
  for (const change of [
    session => { session.lineup = Object.fromEntries(ROLES.map(role => [role, ''])); },
    session => { session.roleOptions = {}; },
    session => { delete session.lineup.dps1.allowedRoles; },
    session => { session.lineup.dps1 = ''; },
    session => { session.lineup.dps1.allowedRoles = ['MS']; },
  ]) {
    const bad = structuredClone(state);
    change(currentSession(bad));
    const raw = JSON.stringify(bad);
    assert.throws(() => restoreSavedState(raw));
    assert.equal(JSON.stringify(bad), raw);
  }
  recordGame(state, 'game', '2026-10-19T12:00:00Z');
  const snapshot = currentSession(state).games[0].lineup[0];
  snapshot.role = snapshot.roles[0];
  delete snapshot.roles;
  delete snapshot.slot;
  assert.throws(() => validateState(state));
});

test('snapshot slot IDs, not array position or subroles, identify game edits and cancellation', () => {
  const state = ready();
  const session = currentSession(state);
  setSlotRoles(state, 'dps1', ['HSDPS']);
  setSlotRoles(state, 'dps2', ['HSDPS']);
  startGame(state, 'game', '2026-10-19T12:00:00Z');
  session.activeGame.lineup.reverse();
  replaceGamePlayer(state, session.activeGame, 'dps2', 'dps1');
  setGameRoles(session.activeGame, 'dps2', ['HSDPS', 'FDPS']);
  const recorded = session.activeGame.lineup.find(slot => slot.slot === 'dps2');
  assert.equal(recorded.playerId, 'dps1');
  assert.deepEqual(validateState(state), state);
  cancelActiveGame(state);
  assert.deepEqual(session.lineup.dps2, { allowedRoles: ['HSDPS', 'FDPS'], playerId: 'dps1' });
  assert.equal(session.lineup.dps1.playerId, 'dps2');
});

test('invalid snapshot slot identities or role arrays cannot bypass validation', () => {
  const state = ready();
  recordGame(state, 'game', '2026-10-19T12:00:00Z');
  for (const change of [
    game => { game.lineup[1].slot = 'dps2'; },
    game => { game.lineup[1].slot = 'HSDPS'; },
    game => { game.lineup[1].roles = 'HSDPS / FDPS'; },
    game => { game.lineup[1].roles = ['MS']; },
    game => { game.lineup[1].roles = ['HSDPS', 'HSDPS']; },
    game => { game.lineup[1].roles = []; },
  ]) {
    const bad = structuredClone(state);
    change(currentSession(bad).games[0]);
    assert.throws(() => validateState(bad));
  }
});

test('autofill preserves requirements and does not share mutable entries with the input', () => {
  const state = ready();
  const session = currentSession(state);
  setSlotRoles(state, 'dps1', ['HSDPS', 'FDPS']);
  assignPlayer(state, 'dps1', '');
  const before = structuredClone(session.lineup);
  const result = autofillLineup(state);
  assert.deepEqual(session.lineup, before);
  assert.equal(result.dps1.playerId, 'dps1');
  assert.deepEqual(result.dps1.allowedRoles, ['HSDPS', 'FDPS']);
  result.dps1.allowedRoles.pop();
  result.tank.playerId = '';
  assert.deepEqual(session.lineup, before);
});
