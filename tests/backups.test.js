import test from 'node:test';
import assert from 'node:assert/strict';
import { currentSession, newState, allScrims, autofillUnavailableReason, autofillLineup, ROLES, validateState } from '../model.js';
import { exportData, readImport, planImport } from '../backups.js';
import { deleteSavedData } from '../storage.js';

const player = id => ({ id, name: id, battletag: `${id}#1234`, roles: ['Tank'], status: 'ringer', notes: '' });
const roundtrip = (state, selection) => readImport(exportData(state, selection));

test('selective exports retain only selected categories and enforce player dependency', () => {
  const state = newState();
  assert.throws(() => exportData(state, {}, {}));
  assert.throws(() => exportData(state, { scrims: true }, {}));
  assert.deepEqual(roundtrip(state, { customGameCode: true }), { customGameCode: '' });
  assert.deepEqual(roundtrip(state, { players: true }), { players: [] });
  const data = roundtrip(state, { players: true, scrims: true });
  assert.deepEqual(data.scrims.items, allScrims(state));
  assert.notEqual(newState().activeScrimId, state.activeScrimId);
});

test('merge updates UUID matches, retains unrelated entries and does not mutate inputs', () => {
  const current = newState();
  current.players = [player('shared'), player('local')];
  const imported = structuredClone(current);
  imported.players = [{ ...player('shared'), name: 'Updated' }, player('new')];
  currentSession(imported).title = 'Updated scrim';
  const before = structuredClone(current);
  const data = roundtrip(imported, { players: true, scrims: true });
  const result = planImport(current, data, { players: 'merge', scrims: 'merge' });
  assert.equal(result.state.players.length, 3);
  assert.equal(result.state.players[0].name, 'Updated');
  assert.equal(allScrims(result.state).length, 1);
  assert.equal(currentSession(result.state).title, 'Updated scrim');
  assert.deepEqual(current, before);
  assert.match(result.summary.join(' '), /add 1, update 1, keep 1/);
});

test('player replacement requires replacing or explicitly clearing scrims', () => {
  const current = newState();
  current.players = [player('local')];
  currentSession(current).attendees = [{ playerId: 'local', present: true }];
  const incoming = newState();
  incoming.players = [player('remote')];
  const data = roundtrip(incoming, { players: true, scrims: true });
  assert.throws(() => planImport(current, data, { players: 'replace' }), /clearing/);
  assert.throws(() => planImport(current, data, { players: 'replace', scrims: 'merge', clearScrims: true }), /instead of merging/);
  assert.throws(() => planImport(current, data, { scrims: 'merge' }), /player directory/);
  const cleared = planImport(current, data, { players: 'replace', clearScrims: true }).state;
  assert.equal(currentSession(cleared).attendees.length, 0);
  assert.equal(allScrims(cleared).length, 1);
  assert.deepEqual(cleared.players, incoming.players);
  const replaced = planImport(current, data, { players: 'replace', scrims: 'replace' }).state;
  assert.deepEqual(replaced, incoming);
});

test('omitted and skipped categories survive, while included blank code resets', () => {
  const current = newState();
  current.customGameCode = 'ABC12';
  const data = { customGameCode: '' };
  assert.deepEqual(planImport(current, data, {}).state, current);
  const result = planImport(current, data, { customGameCode: 'replace' });
  assert.equal(result.state.customGameCode, '');
  assert.throws(() => planImport(current, data, { players: 'replace' }), /not in this file/);
});

test('malformed partial files, dangling references, preferences and duplicate IDs fail safely', () => {
  const wrap = data => ({ format: 'scrims-helper-export', version: 1, schema: 'scrims-helper-v1', data });
  for (const data of [{ players: null }, { preferences: { theme: 'neon' } }, { preferences: { panelSplit: 99 } }, { customGameCode: null }, { surprise: true }, {}]) assert.throws(() => readImport(wrap(data)));
  const state = newState();
  currentSession(state).attendees = [{ playerId: 'missing', present: true }];
  assert.throws(() => roundtrip(state, { players: true, scrims: true }));
  assert.throws(() => readImport(wrap({ scrims: { activeId: 'missing', items: [] } })));
  assert.throws(() => readImport(wrap({ players: [player('same'), player('same')] })));
});

test('preset name conflicts explain how to proceed', () => {
  const current = newState();
  current.mapPoolPresets = [{ id: 'local', name: 'League', mapIds: [] }];
  const data = { mapPoolPresets: [{ id: 'remote', name: 'League', mapIds: [] }] };
  assert.throws(() => planImport(current, data, { mapPoolPresets: 'merge' }), /same name/);
  assert.deepEqual(planImport(current, data, { mapPoolPresets: 'replace' }).state.mapPoolPresets, data.mapPoolPresets);
});

test('autofill availability agrees with feasibility, including shared-role bottlenecks', () => {
  const state = newState();
  assert.ok(autofillUnavailableReason(state));
  for (const role of ROLES) {
    state.players.push({ ...player(role), roles: [role] });
    currentSession(state).attendees.push({ playerId: role, present: true });
  }
  assert.equal(autofillUnavailableReason(state), '');
  state.players[4].roles = ['Tank'];
  state.players[3].roles = ['MS', 'FS'];
  assert.match(autofillUnavailableReason(state), /different players/);
  assert.throws(() => autofillLineup(state));
  state.players[4].roles = ['FS'];
  currentSession(state).lineup = autofillLineup(state);
  assert.equal(autofillUnavailableReason(state), 'Lineup is full');
  assert.deepEqual(validateState(state), state);
});

test('delete everything removes app data but leaves unrelated storage alone', () => {
  const keys = ['scrims-helper.state', 'scrims-helper.theme', 'scrims-helper.panelSplit', 'scrims-helper.barLayout', 'unrelated'];
  const values = new Map(keys.map(key => [key, 'value']));
  deleteSavedData({ removeItem: key => values.delete(key) });
  assert.deepEqual([...values.keys()], ['unrelated']);
});
