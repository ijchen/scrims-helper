import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, STORAGE_KEY, validateState } from '../model.js';
import { readSavedState, restoreSavedState, readPreference, THEME_KEY, deleteSavedData } from '../storage.js';
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
  assert.deepEqual(restoreSavedState(storage, readSavedState(storage)), state);
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
  for (const raw of ['broken', 'null', JSON.stringify({ version: 3 }), JSON.stringify({ ...newState(), version: 2 })]) {
    const storage = storageFor({ [STORAGE_KEY]: raw });
    assert.throws(() => restoreSavedState(storage, readSavedState(storage)));
    assert.equal(storage.getItem(STORAGE_KEY), raw);
  }
  const storage = storageFor({ 'scrimside.v1': '{"version":1}' });
  assert.throws(() => restoreSavedState(storage, readSavedState(storage)), { code: 'UNSUPPORTED_FORMAT' });
  assert.equal(storage.getItem(STORAGE_KEY), null);
});

test('new export marker distinguishes prerelease files, including partial exports', () => {
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
  const storage = storageFor({ 'scrimside.theme': 'light', [THEME_KEY]: 'dark', unrelated: 'keep', [STORAGE_KEY]: '{}' });
  assert.equal(readPreference(storage, THEME_KEY), 'dark');
  deleteSavedData(storage);
  assert.equal(storage.getItem(THEME_KEY), null);
  assert.equal(storage.getItem('scrimside.theme'), null);
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.equal(storage.getItem('unrelated'), 'keep');
});
