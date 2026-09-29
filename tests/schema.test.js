import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, currentSession, ROLES, startGame, finishGame, validateState } from '../model.js';
import { exportData, readImport, planImport } from '../backups.js';
import { mapRef, heroRef } from './fixtures.js';

test('optional fill preferences round trip and reject duplicates, overlap and unknown roles', () => {
  const state = newState();
  state.players.push({ id: 'fill', name: 'Fill', battletag: '', roles: ['Tank'], status: 'default', notes: '' });
  assert.deepEqual(validateState(state), state);
  state.players[0].offRoles = ['FS', 'MS'];
  assert.deepEqual(readImport(exportData(state, { players: true })).players, state.players);
  for (const value of [null, undefined, ['Tank'], ['FS', 'FS'], ['Healer'], 'FS']) {
    state.players[0].offRoles = value;
    assert.throws(() => validateState(state));
  }
});

test('v1 round trip preserves snapshots, custom names, unknown IDs and all shared data', () => {
  const state = newState();
  const session = currentSession(state);
  for (const role of ROLES) {
    const id = crypto.randomUUID();
    state.players.push({ id, name: role, battletag: role + '#123', roles: [role], status: 'ringer', notes: 'Notes' });
    session.attendees.push({ playerId: id, present: true });
    session.lineup[role] = id;
  }
  session.draft = { map: mapRef('Ilios'), mode: 'Control', ourBan: heroRef('Ana'), theirBan: { id: '', name: 'Custom hero' } };
  startGame(state, crypto.randomUUID(), '2026-09-28T12:00:00Z');
  state.players[0].name = 'New name';
  assert.equal(session.activeGame.lineup[0].name, 'Tank');
  finishGame(state, '2026-09-28T12:15:00Z');
  session.draft = { map: { id: 'removed-map', name: 'Recorded map name' }, mode: 'Push', ourBan: null, theirBan: null };
  startGame(state, crypto.randomUUID(), '2026-09-28T12:20:00Z');
  session.draft.map = { id: '', name: 'Next custom map' };
  state.mapPoolPresets = [{ id: crypto.randomUUID(), name: 'Season', mapIds: ['removed-map'] }];
  state.customGameCode = 'ABCDE';
  const before = structuredClone(state);
  const data = readImport(JSON.parse(JSON.stringify(exportData(state, { players: true, scrims: true, mapPoolPresets: true, customGameCode: true }))));
  const result = planImport(newState(), data, { players: 'replace', scrims: 'replace', mapPoolPresets: 'replace', customGameCode: 'replace' }).state;
  assert.deepEqual(result, state);
  assert.deepEqual(state, before);
  session.activeGame.map.name = 'Changed';
  assert.equal(currentSession(result).activeGame.map.name, 'Recorded map name');
});

test('v1 rejects unexpected fields and broken relationships without repairing them', () => {
  const original = newState();
  for (const mutate of [
    state => { delete state.format; },
    state => { state.unexpected = true; },
    state => { state.activeScrimId = 'missing'; },
    state => { currentSession(state).lineup.Tank = 'missing'; },
    state => { currentSession(state).draft.map = { id: 'ilios', name: 'Ilios', extra: true }; },
    state => { currentSession(state).draft.ourBan = 'Ana'; },
  ]) {
    const state = structuredClone(original);
    mutate(state);
    const before = structuredClone(state);
    assert.throws(() => validateState(state));
    assert.deepEqual(state, before);
  }
});
