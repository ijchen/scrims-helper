import test from 'node:test';
import assert from 'node:assert/strict';
import { currentSession, currentScrim, enabledMaps, newState, newSession, validateState, saveMapPoolPreset, loadMapPoolPreset, renameMapPoolPreset } from '../model.js';
import { mapRef, setMap } from './fixtures.js';
import { MAPS } from '../catalog.js';

test('renaming preserves the saved maps even when the current scrim differs', () => {
  const state = newState();
  saveMapPoolPreset(state, 'first', 'First');
  saveMapPoolPreset(state, 'second', 'Second');
  currentSession(state).disabledMapIds = MAPS.map(map => map.id);
  renameMapPoolPreset(state, 'first', ' New name ');
  assert.equal(state.mapPoolPresets[0].name, 'New name');
  assert.equal(state.mapPoolPresets[0].mapIds.length, MAPS.length);
  assert.throws(() => renameMapPoolPreset(state, 'first', 'second'));
  assert.throws(() => renameMapPoolPreset(state, 'first', ' '));
  assert.throws(() => renameMapPoolPreset(state, 'missing', 'Name'));
});

test('presets copy selections, survive new scrims and backups, and replace explicitly', () => {
  const state = newState();
  currentSession(state).disabledMapIds = [MAPS[0].id];
  saveMapPoolPreset(state, 'season', ' FACEIT season ');
  assert.equal(state.mapPoolPresets[0].name, 'FACEIT season');
  currentScrim(state).session = newSession();
  loadMapPoolPreset(state, 'season');
  assert.deepEqual(currentSession(state).disabledMapIds, [MAPS[0].id]);
  currentSession(state).disabledMapIds.push(MAPS[1].id);
  assert.ok(state.mapPoolPresets[0].mapIds.includes(MAPS[1].id));
  saveMapPoolPreset(state, 'season', 'FACEIT season', true);
  assert.equal(state.mapPoolPresets[0].mapIds.includes(MAPS[1].id), false);
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))), state);
  assert.throws(() => saveMapPoolPreset(state, 'duplicate', 'faceit season'));
  assert.throws(() => saveMapPoolPreset(state, 'blank', ' '));
  assert.throws(() => loadMapPoolPreset(state, 'missing'));
  assert.throws(() => saveMapPoolPreset(state, 'missing', 'Missing', true));
});

test('presets require explicit fields and preserve unknown map IDs', () => {
  const state = newState();
  delete state.mapPoolPresets;
  assert.throws(() => validateState(state));
  const preset = { id: 'pool', name: 'Pool', mapIds: ['future-map'] };
  state.mapPoolPresets = [preset];
  assert.deepEqual(validateState(state).mapPoolPresets, [preset]);
  loadMapPoolPreset(state, 'pool');
  assert.deepEqual(enabledMaps(currentSession(state)), []);
  for (const invalid of [null, {}, [null], [{ ...preset, name: '' }], [{ ...preset, mapIds: [1] }], [{ ...preset, mapIds: ['ilios', 'ilios'] }], [preset, preset], [preset, { ...preset, id: 'other', name: ' pool ' }]]) {
    state.mapPoolPresets = invalid;
    assert.throws(() => validateState(state));
  }
});

test('map pools default to all maps and only affect their scrim', () => {
  const state = newState();
  assert.deepEqual(enabledMaps(currentSession(state)), MAPS);
  currentSession(state).disabledMapIds = [MAPS[0].id];
  setMap(state, MAPS[0].name);
  assert.equal(enabledMaps(currentSession(state)).length, MAPS.length - 1);
  assert.equal(enabledMaps(currentSession(state)).some(map => map.id === MAPS[0].id), false);
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))), state);
  assert.deepEqual(currentSession(state).draft.map, mapRef(MAPS[0].name));
  currentScrim(state).session = newSession();
  assert.deepEqual(enabledMaps(currentSession(state)), MAPS);
});

test('map pools require explicit fields; all-disabled and unknown IDs survive backups', () => {
  const state = newState();
  delete currentSession(state).disabledMapIds;
  assert.throws(() => validateState(state));
  currentSession(state).disabledMapIds = [...MAPS.map(map => map.id), 'retired-map'];
  assert.deepEqual(enabledMaps(currentSession(state)), []);
  assert.deepEqual(validateState(state), state);
});

test('malformed map pools are rejected', () => {
  for (const disabledMapIds of [null, 'ilios', [42], [''], ['ilios', 'ilios']]) {
    const state = newState();
    currentSession(state).disabledMapIds = disabledMapIds;
    assert.throws(() => validateState(state));
  }
});
