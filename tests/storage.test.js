import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, ROLES, STORAGE_KEY, STATE_VERSION, recordGame, startGame, validateBackup } from '../model.js';
import { THEME_KEY, PANEL_SPLIT_KEY, MIGRATION_REVIEW_DATE, readSavedState, restoreSavedState, readPreference, isStateStorageKey } from '../storage.js';

function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  const writes = [];
  return {
    values, writes,
    getItem: key => values.get(key) ?? null,
    setItem(key, value) { writes.push(key); values.set(key, value); },
  };
}

function legacyState() {
  const state = newState();
  for (const [index, role] of ROLES.entries()) {
    const id = `player-${index}`;
    state.players.push({ id, name: `Player ${index}`, battletag: `Tag#${index}`, roles: [role], notes: 'Keep this', status: index ? 'team' : 'trial' });
    state.session.attendees.push({ playerId: id, present: true });
    state.session.lineup[role] = id;
  }
  state.session.title = 'Saved scrim';
  state.session.contact = 'Opponent#1234';
  state.session.gameLabel = 'Ilios';
  state.session.nextGame = { mode: 'Control', ourBan: 'Ana', theirBan: 'Tracer' };
  recordGame(state, 'completed', '2026-09-28T12:00:00Z');
  state.session.games[0].outcome = 'win';
  state.session.gameLabel = 'Dorado';
  startGame(state, 'active', '2026-09-28T12:10:00Z');
  state.session.gameLabel = 'Nepal';
  state.session.nextGame = { mode: 'Control', ourBan: 'Mercy', theirBan: 'Ashe' };
  state.session.attendees[0].present = false;
  state.version = 1;
  state.session.plans = [{ id: 'plan', label: 'Old lineup', lineup: { ...state.session.lineup } }];
  return state;
}

test('migrates the full scrim to v2 while retaining the original recovery copy', () => {
  const legacy = legacyState();
  const raw = JSON.stringify(legacy);
  const storage = memoryStorage({ 'scrimside.v1': raw });
  const restored = restoreSavedState(storage, readSavedState(storage));
  const expected = structuredClone(legacy);
  expected.version = STATE_VERSION;
  delete expected.session.plans;
  assert.deepEqual(restored, expected);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), expected);
  assert.equal(storage.getItem('scrimside.v1'), raw);
  assert.equal(legacy.session.plans.length, 1);
  assert.deepEqual(validateBackup(restored), restored);
});

test('repeat loads use new saves without reimporting or rewriting', () => {
  const storage = memoryStorage({ 'scrimside.v1': JSON.stringify(legacyState()) });
  const restored = restoreSavedState(storage, readSavedState(storage));
  restored.session.title = 'Edited after migration';
  storage.setItem(STORAGE_KEY, JSON.stringify(restored));
  storage.writes.length = 0;
  assert.deepEqual(restoreSavedState(storage, readSavedState(storage)), restored);
  assert.deepEqual(storage.writes, []);
});

test('corrupt current data never silently falls back to stale legacy data', () => {
  for (const raw of ['', 'not json', JSON.stringify({ version: 999 })]) {
    const storage = memoryStorage({ [STORAGE_KEY]: raw, 'scrimside.v1': JSON.stringify(legacyState()) });
    assert.equal(readSavedState(storage), raw);
    assert.throws(() => restoreSavedState(storage, raw));
    assert.equal(storage.getItem(STORAGE_KEY), raw);
    assert.deepEqual(storage.writes, []);
  }
});

test('corrupt legacy data and failed writes preserve the originals', () => {
  const invalid = legacyState();
  invalid.session.plans[0].lineup.Tank = 'unknown';
  for (const raw of ['broken', JSON.stringify(invalid)]) {
    const storage = memoryStorage({ 'scrimside.v1': raw });
    assert.throws(() => restoreSavedState(storage, readSavedState(storage)));
    assert.equal(storage.getItem('scrimside.v1'), raw);
    assert.equal(storage.getItem(STORAGE_KEY), null);
  }
  const raw = JSON.stringify(legacyState());
  const storage = memoryStorage({ 'scrimside.v1': raw });
  storage.setItem = () => { throw new Error('Quota exceeded'); };
  assert.throws(() => restoreSavedState(storage, readSavedState(storage)), /Quota exceeded/);
  assert.equal(storage.getItem('scrimside.v1'), raw);
  assert.equal(storage.getItem(STORAGE_KEY), null);
});

test('oldest backups gain defaults while preserving historical records', () => {
  const legacy = legacyState();
  delete legacy.players[0].status;
  delete legacy.session.activeGame;
  delete legacy.session.nextGame;
  for (const field of ['outcome', 'mode', 'ourBan', 'theirBan']) delete legacy.session.games[0][field];
  const restored = validateBackup(legacy);
  assert.equal(restored.version, 2);
  assert.equal(restored.players[0].status, 'default');
  assert.equal(restored.session.activeGame, null);
  assert.deepEqual(restored.session.nextGame, { mode: '', ourBan: '', theirBan: '' });
  assert.equal(restored.session.games[0].outcome, '');
  assert.deepEqual(restored.session.games[0].lineup, legacy.session.games[0].lineup);
  assert.equal('plans' in restored.session, false);
});

test('theme and divider migrate once, and current preferences always win', () => {
  const storage = memoryStorage({ 'scrimside.theme': 'dark', 'scrimside.panelSplit': '42.5' });
  assert.equal(readPreference(storage, THEME_KEY), 'dark');
  assert.equal(readPreference(storage, PANEL_SPLIT_KEY), '42.5');
  assert.equal(storage.getItem(THEME_KEY), 'dark');
  assert.equal(storage.getItem(PANEL_SPLIT_KEY), '42.5');
  assert.equal(storage.getItem('scrimside.theme'), 'dark');
  storage.setItem(THEME_KEY, 'light');
  storage.setItem(PANEL_SPLIT_KEY, '70');
  assert.equal(readPreference(storage, THEME_KEY), 'light');
  assert.equal(readPreference(storage, PANEL_SPLIT_KEY), '70');
});

test('invalid legacy preferences are ignored; blocked writes still return valid preferences', () => {
  const storage = memoryStorage({ 'scrimside.theme': 'invalid', 'scrimside.panelSplit': 'Infinity' });
  assert.equal(readPreference(storage, THEME_KEY), null);
  assert.equal(readPreference(storage, PANEL_SPLIT_KEY), null);
  assert.deepEqual(storage.writes, []);
  storage.values.set('scrimside.theme', 'dark');
  storage.setItem = () => { throw new Error('Blocked'); };
  assert.equal(readPreference(storage, THEME_KEY), 'dark');
});

test('clean installs use only new keys and both old and new tabs trigger conflict protection', () => {
  const storage = memoryStorage();
  assert.equal(readSavedState(storage), null);
  assert.equal(readPreference(storage, THEME_KEY), null);
  assert.equal(readPreference(storage, PANEL_SPLIT_KEY), null);
  assert.equal(newState().version, STATE_VERSION);
  assert.equal('plans' in newState().session, false);
  for (const key of [STORAGE_KEY, 'scrimside.v1', null]) assert.equal(isStateStorageKey(key), true);
  for (const key of [THEME_KEY, PANEL_SPLIT_KEY, 'unrelated']) assert.equal(isStateStorageKey(key), false);
  assert.equal(MIGRATION_REVIEW_DATE, '2026-10-12');
});
