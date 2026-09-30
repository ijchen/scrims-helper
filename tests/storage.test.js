import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, STORAGE_KEY, validateState } from '../model.js';
import { readSavedState, restoreSavedState, readPreference, THEME_KEY, PANEL_SPLIT_KEY, BAR_LAYOUT_KEY, isStateStorageKey, deleteSavedData } from '../storage.js';
import { exportData, readImport } from '../backups.js';

function storageFor(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: () => { throw new Error('Loading must not write'); },
    removeItem: key => values.delete(key),
  };
}

test('v1 state validates without writes, mutation, defaults or generated IDs', () => {
  const state = newState();
  const raw = JSON.stringify(state);
  const storage = storageFor({ [STORAGE_KEY]: raw });
  assert.deepEqual(restoreSavedState(readSavedState(storage)), state);
  assert.equal(state.format, 'scrims-helper-state');
  assert.equal(state.version, 1);
  const generate = crypto.randomUUID;
  crypto.randomUUID = () => { throw new Error('Validation must not generate IDs'); };
  try { assert.deepEqual(validateState(state), state); }
  finally { crypto.randomUUID = generate; }
  delete state.customGameCode;
  assert.throws(() => validateState(state));
});

test('unsupported and corrupt saves stay untouched', () => {
  for (const raw of ['broken', 'null', JSON.stringify({ version: 3 }), JSON.stringify({ ...newState(), version: 2 }), JSON.stringify({ ...newState(), players: null })]) {
    const storage = storageFor({ [STORAGE_KEY]: raw });
    assert.throws(() => restoreSavedState(readSavedState(storage)));
    assert.equal(storage.getItem(STORAGE_KEY), raw);
  }
  assert.throws(() => restoreSavedState(JSON.stringify({ ...newState(), version: 2 })), { code: 'UNSUPPORTED_FORMAT' });
});

test('exports require a supported envelope, including partial exports', () => {
  const exported = exportData(newState(), { players: true });
  assert.equal(exported.format, 'scrims-helper-export');
  assert.equal(exported.version, 1);
  assert.equal(exported.schema, 'scrims-helper-v1');
  assert.deepEqual(readImport(JSON.parse(JSON.stringify(exported))), { players: [] });
  for (const input of [
    { format: 'scrims-helper-export', version: 1, data: { players: [] } },
    { ...exported, version: 2 }, { version: 1 }, newState(),
  ]) assert.throws(() => readImport(input), /unsupported format/);
});

test('preferences are device-local and reset removes only app-owned keys', () => {
  const storage = storageFor({ [PANEL_SPLIT_KEY]: '62', [THEME_KEY]: 'dark', [BAR_LAYOUT_KEY]: 'grouped', unrelated: 'keep', [STORAGE_KEY]: '{}' });
  assert.equal(readPreference(storage, THEME_KEY), 'dark');
  deleteSavedData(storage);
  assert.equal(storage.getItem(THEME_KEY), null);
  assert.equal(storage.getItem(BAR_LAYOUT_KEY), null);
  assert.equal(storage.getItem(PANEL_SPLIT_KEY), null);
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.equal(storage.getItem('unrelated'), 'keep');
});

test('storage reads only the current key and propagates access errors', () => {
  const queried = [];
  assert.equal(readSavedState({ getItem: key => { queried.push(key); return null; } }), null);
  assert.deepEqual(queried, [STORAGE_KEY]);
  const error = new Error('Storage denied');
  assert.throws(() => readSavedState({ getItem: () => { throw error; } }), caught => caught === error);
});

test('cross-tab protection watches state changes and whole-storage clears', () => {
  assert.equal(isStateStorageKey(STORAGE_KEY), true);
  assert.equal(isStateStorageKey(null), true);
  for (const key of [THEME_KEY, PANEL_SPLIT_KEY, BAR_LAYOUT_KEY, 'unrelated']) assert.equal(isStateStorageKey(key), false);
});
