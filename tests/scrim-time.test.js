import test from 'node:test';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { defaultScrimTime, localInput, fromLocalInput, discordTimestamp } from '../scrim-time.js';
import { newState, newSession, createScrim, currentSession, validateState } from '../model.js';
import { exportData, readImport } from '../backups.js';

test('default uses the local calendar day at 8 PM and sessions use the same default', () => {
  for (const now of ['2026-10-02T15:00:00Z', '2026-10-03T02:00:00Z', '2026-01-02T15:00:00Z']) {
    assert.equal(localInput(defaultScrimTime(now)), `${localInput(now).slice(0, 10)}T20:00`);
    assert.equal(newSession(now).scheduledAt, defaultScrimTime(now));
  }
});

test('local conversion rejects malformed dates and round-trips valid input', () => {
  for (const value of ['', 'invalid', '2026-02-30T20:00', '2026-10-02T25:00', '2026-10-02T20:00Z']) assert.throws(() => fromLocalInput(value));
  for (const value of ['2026-01-02T20:00', '2026-10-02T20:00']) assert.equal(localInput(fromLocalInput(value)), value);
});

test('device timezones control defaults, DST handling, and labels without changing stored instants', () => {
  const moduleUrl = new URL('../scrim-time.js', import.meta.url).href;
  for (const [zone, expectedDefault, summer, winter, gap, repeated, earlier] of [
    ['America/New_York', '2026-10-03T00:00:00.000Z', '2026-07-01T00:00:00.000Z', '2026-01-01T01:00:00.000Z', '2026-03-08T02:30', '2026-11-01T01:30', '2026-11-01T05:30:00.000Z'],
    ['America/Los_Angeles', '2026-10-03T03:00:00.000Z', '2026-07-01T03:00:00.000Z', '2026-01-01T04:00:00.000Z', '2026-03-08T02:30', '2026-11-01T01:30', '2026-11-01T08:30:00.000Z'],
    ['UTC', '2026-10-03T20:00:00.000Z', '2026-06-30T20:00:00.000Z', '2025-12-31T20:00:00.000Z'],
    ['Asia/Kathmandu', '2026-10-03T14:15:00.000Z', '2026-06-30T14:15:00.000Z', '2025-12-31T14:15:00.000Z'],
    ['Australia/Lord_Howe', '2026-10-03T09:30:00.000Z', '2026-06-30T09:30:00.000Z', '2025-12-31T09:00:00.000Z', '2026-10-04T02:15', '2026-04-05T01:45', '2026-04-04T14:45:00.000Z'],
    ['Pacific/Apia', '2026-10-03T07:00:00.000Z', '2026-06-30T07:00:00.000Z', '2025-12-31T07:00:00.000Z', '2011-12-30T20:00'],
  ]) {
    const script = `
      import assert from 'node:assert/strict';
      import { defaultScrimTime, fromLocalInput, localInput, scrimTimeLabel, discordTimestamp } from ${JSON.stringify(moduleUrl)};
      const [zone, expectedDefault, summer, winter, gap, repeated, earlier] = ${JSON.stringify([zone, expectedDefault, summer, winter, gap, repeated, earlier])};
      assert.equal(defaultScrimTime('2026-10-03T02:00:00Z'), expectedDefault);
      assert.equal(fromLocalInput('2026-06-30T20:00'), summer);
      assert.equal(fromLocalInput('2025-12-31T20:00'), winter);
      if (gap) assert.throws(() => fromLocalInput(gap), /clocks move forward/);
      if (repeated) { assert.equal(fromLocalInput(repeated), earlier); assert.equal(localInput(earlier), repeated); }
      const instant = '2026-10-03T00:00:00.000Z';
      assert.equal(scrimTimeLabel(instant), new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(instant)));
      assert.equal(discordTimestamp(instant), '<t:1790985600:t>');
    `;
    execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: zone }, stdio: 'pipe' });
  }
});

test('Discord timestamp uses epoch seconds and short-time style', () => {
  assert.equal(discordTimestamp('2026-10-03T00:00:00.000Z'), '<t:1790985600:t>');
});

test('schedule transfers, validates, and resets when copying a scrim setup', () => {
  const state = newState();
  currentSession(state).scheduledAt = '2026-11-02T01:00:00.000Z';
  assert.equal(readImport(exportData(state, { players: true, scrims: true })).scrims.items[0].session.scheduledAt, '2026-11-02T01:00:00.000Z');
  createScrim(state, 'next', '2026-10-02T15:00:00Z', true);
  assert.equal(currentSession(state).scheduledAt, defaultScrimTime('2026-10-02T15:00:00Z'));
  for (const invalid of [null, 1790985600, '', '2026-02-30T20:00:00.000Z', '2026-10-02T20:00', '2026-10-02T20:00:00-04:00']) {
    currentSession(state).scheduledAt = invalid;
    assert.throws(() => validateState(state));
  }
  delete currentSession(state).scheduledAt;
  assert.deepEqual(validateState(state), state);
  assert.equal(currentSession(state).scheduledAt, undefined);
});
