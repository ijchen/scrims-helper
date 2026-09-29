import test from 'node:test';
import assert from 'node:assert/strict';
import { currentScrim, newState, newSession, validateState, gameCodeFor } from '../model.js';

test('custom game code defaults, survives backups and new scrims, and resets when blank', () => {
  const state = newState();
  assert.equal(gameCodeFor(state), 'DKEEH');
  state.customGameCode = ' ABC12 ';
  assert.equal(gameCodeFor(state), 'ABC12');
  currentScrim(state).session = newSession();
  assert.equal(gameCodeFor(validateState(state)), 'ABC12');
  assert.deepEqual(validateState(state), state);
  state.customGameCode = ' ';
  assert.equal(gameCodeFor(state), 'DKEEH');
  delete state.customGameCode;
  assert.throws(() => validateState(state));
  for (const value of [null, 123, {}, 'x'.repeat(21)]) {
    state.customGameCode = value;
    assert.throws(() => validateState(state));
  }
});
