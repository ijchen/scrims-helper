import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultScrimTime, easternInput, fromEasternInput, discordTimestamp } from '../scrim-time.js';
import { newState, newSession, createScrim, currentSession, validateState } from '../model.js';
import { exportData, readImport } from '../backups.js';

test('default uses the Eastern calendar day at 8 PM, in summer and winter', () => {
  assert.equal(defaultScrimTime('2026-10-02T15:00:00Z'), '2026-10-03T00:00:00.000Z');
  assert.equal(defaultScrimTime('2026-10-03T02:00:00Z'), '2026-10-03T00:00:00.000Z');
  assert.equal(defaultScrimTime('2026-01-02T15:00:00Z'), '2026-01-03T01:00:00.000Z');
  assert.equal(newSession('2026-10-02T15:00:00Z').scheduledAt, '2026-10-03T00:00:00.000Z');
});

test('Eastern conversion handles DST changes and rejects invalid dates', () => {
  assert.equal(fromEasternInput('2026-03-08T20:00'), '2026-03-09T00:00:00.000Z');
  assert.equal(fromEasternInput('2026-11-01T20:00'), '2026-11-02T01:00:00.000Z');
  assert.equal(fromEasternInput('2026-11-01T01:30'), '2026-11-01T05:30:00.000Z');
  assert.throws(() => fromEasternInput('2026-03-08T02:30'), /clocks move forward/);
  for (const value of ['', 'invalid', '2026-02-30T20:00', '2026-10-02T25:00']) assert.throws(() => fromEasternInput(value));
  for (const value of ['2026-01-02T20:00', '2026-10-02T20:00', '2026-03-08T03:00', '2026-11-01T01:30']) assert.equal(easternInput(fromEasternInput(value)), value);
});

test('Discord timestamp uses epoch seconds and short-time style', () => {
  assert.equal(discordTimestamp('2026-10-03T00:00:00.000Z'), '<t:1790985600:t>');
});

test('schedule transfers, validates, and resets when copying a scrim setup', () => {
  const state = newState();
  currentSession(state).scheduledAt = '2026-11-02T01:00:00.000Z';
  assert.equal(readImport(exportData(state, { players: true, scrims: true })).scrims.items[0].session.scheduledAt, '2026-11-02T01:00:00.000Z');
  createScrim(state, 'next', '2026-10-02T15:00:00Z', true);
  assert.equal(currentSession(state).scheduledAt, '2026-10-03T00:00:00.000Z');
  for (const invalid of [null, 1790985600, '', '2026-02-30T20:00:00.000Z', '2026-10-02T20:00', '2026-10-02T20:00:00-04:00']) {
    currentSession(state).scheduledAt = invalid;
    assert.throws(() => validateState(state));
  }
  delete currentSession(state).scheduledAt;
  assert.deepEqual(validateState(state), state);
  assert.equal(currentSession(state).scheduledAt, undefined);
});
