import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS } from '../catalog.js';
import { enabledMaps, newState, newSession, validateBackup } from '../model.js';

test('map pools default to all maps and only affect their scrim', () => {
  const state = newState();
  assert.deepEqual(enabledMaps(state.session), MAPS);
  state.session.disabledMapIds = [MAPS[0].id];
  state.session.gameLabel = MAPS[0].name;
  assert.equal(enabledMaps(state.session).length, MAPS.length - 1);
  assert.equal(enabledMaps(state.session).some(map => map.id === MAPS[0].id), false);
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(state))), state);
  assert.equal(state.session.gameLabel, MAPS[0].name);
  state.session = newSession();
  assert.deepEqual(enabledMaps(state.session), MAPS);
});

test('older saves enable all maps; all-disabled and unknown IDs survive backups', () => {
  const state = newState();
  delete state.session.disabledMapIds;
  assert.deepEqual(validateBackup(state).session.disabledMapIds, []);
  state.session.disabledMapIds = [...MAPS.map(map => map.id), 'retired-map'];
  assert.deepEqual(enabledMaps(state.session), []);
  assert.deepEqual(validateBackup(state), state);
});

test('malformed map pools are rejected', () => {
  for (const disabledMapIds of [null, 'ilios', [42], [''], ['ilios', 'ilios']]) {
    const state = newState();
    state.session.disabledMapIds = disabledMapIds;
    assert.throws(() => validateBackup(state));
  }
});
