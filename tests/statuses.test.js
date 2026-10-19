import { defaultSlot, snapshotRole } from './fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, currentSession, setPlayerPriority, validateState, createScrim, removeAttendee, autofillLineup, ROLES, newAttendee } from '../model.js';
import { PRIORITIES } from '../schema.js';
import { statusFor, effectivePriority, saveStatus, deleteStatus, orderedStatuses, moveStatus, placeStatus, sortedDirectoryPlayers } from '../statuses.js';
import { restoreSavedState } from '../storage.js';
import { exportData, readImport, planImport } from '../backups.js';

const player = (id = 'p', status = 'trial') => ({ id, name: id, battletag: '', roles: ['Tank'], status, notes: '' });
const custom = { id: 'custom', name: 'Academy', color: '#123456', priority: '2', showBadge: false };

test('priorities snapshot status defaults; manual changes and explicit resets use the same scale', () => {
  const state = newState();
  state.players.push(player());
  const attendee = newAttendee(state, 'p', true);
  currentSession(state).attendees.push(attendee);
  assert.equal(effectivePriority(state, attendee).value, '3/2');
  for (const option of PRIORITIES) {
    const previous = attendee.priority;
    saveStatus(state, { ...state.statuses.find(status => status.id === 'trial'), priority: option.value });
    assert.equal(attendee.priority, previous);
    setPlayerPriority(state, 'p', option.value);
    assert.equal(effectivePriority(state, attendee), option);
    setPlayerPriority(state, 'p', null);
  }
  saveStatus(state, { ...state.statuses.find(status => status.id === 'trial'), priority: '2' });
  setPlayerPriority(state, 'p', '1');
  assert.equal(effectivePriority(state, attendee).value, '1');
  assert.equal(attendee.priority, '1');
  setPlayerPriority(state, 'p', null);
  assert.equal(effectivePriority(state, attendee).value, '2');
  assert.equal(Object.hasOwn(attendee, 'priority'), true);
  setPlayerPriority(state, 'p', '5');
  createScrim(state, 'next', '', true);
  assert.equal(effectivePriority(state, currentSession(state).attendees[0]).value, '2');
  removeAttendee(state, 'p');
  currentSession(state).attendees.push(newAttendee(state, 'p', true));
  assert.equal(effectivePriority(state, currentSession(state).attendees[0]).value, '2');
});

test('statuses can be renamed, hidden, deleted, and empty without losing manual overrides', () => {
  const state = newState();
  saveStatus(state, custom);
  state.players.push(player('p', custom.id));
  currentSession(state).attendees.push({ playerId: 'p', present: true, priority: '1' });
  saveStatus(state, { ...custom, name: '  Bench  ', color: '#ffffff', showBadge: true });
  assert.equal(statusFor(state, state.players[0]).name, 'Bench');
  assert.equal(state.players[0].status, custom.id);
  for (const status of [...state.statuses]) deleteStatus(state, status.id);
  assert.deepEqual(state.statuses, []);
  assert.equal(state.players[0].status, 'default');
  assert.equal(statusFor(state, state.players[0]).showBadge, false);
  assert.equal(currentSession(state).attendees[0].priority, '1');
  assert.deepEqual(validateState(state), state);
  assert.throws(() => deleteStatus(state, 'default'));
});

test('status validation rejects bad definitions and dangling references without modifying state', () => {
  const state = newState();
  for (const changes of [{ id: 'default' }, { name: ' Default ' }, { name: '' }, { name: ' trial ' }, { color: 'red' }, { color: '#fff;bad' }, { priority: '5/4' }, { priority: '1.5' }, { showBadge: 1 }, { surprise: true }]) {
    const before = structuredClone(state);
    assert.throws(() => saveStatus(state, { ...custom, ...changes }));
    assert.deepEqual(state, before);
  }
  for (const mutate of [s => { delete s.statuses; }, s => { s.statuses = null; }, s => s.statuses.push(s.statuses[0]), s => s.statuses.push({ ...custom, name: 'TRIAL' }), s => s.players.push(player('p', 'missing')), s => { s.statuses[0].color = 'red'; }]) {
    const copy = structuredClone(state);
    mutate(copy);
    assert.throws(() => validateState(copy));
  }
});

test('prerelease formats and incomplete records are rejected without repair', () => {
  const state = newState();
  state.players = [player()];
  currentSession(state).attendees = [newAttendee(state, 'p', true)];
  for (const mutate of [s => { delete s.statuses; }, s => { delete s.statusOrder; }, s => { delete currentSession(s).attendees[0].priority; }, s => { s.version = 2; }]) {
    const invalid = structuredClone(state);
    mutate(invalid);
    const raw = JSON.stringify(invalid);
    assert.throws(() => restoreSavedState(raw));
    assert.equal(JSON.stringify(invalid), raw);
  }
  assert.throws(() => readImport({ format: 'scrims-helper-export', version: 1, data: { players: state.players } }));
});

test('custom statuses travel with directory backups and follow merge, replace, and skip', () => {
  const incoming = newState();
  incoming.statuses = [custom];
  incoming.statusOrder = [custom.id, 'default'];
  incoming.players = [player('p', custom.id)];
  currentSession(incoming).attendees = [{ playerId: 'p', present: true, priority: '1' }];
  const data = readImport(exportData(incoming, { players: true, scrims: true }));
  const current = newState();
  assert.deepEqual(planImport(current, data, {}).state, current);
  const merged = planImport(current, data, { players: 'merge', scrims: 'merge' }).state;
  assert.equal(merged.statuses.length, 4);
  assert.equal(statusFor(merged, merged.players[0]).name, custom.name);
  const replaced = planImport(current, data, { players: 'replace', scrims: 'replace' }).state;
  assert.deepEqual(replaced, incoming);
  const collision = newState();
  saveStatus(collision, { ...custom, id: 'different' });
  assert.throws(() => planImport(collision, data, { players: 'merge' }), /same name/);
  const updated = { ...data, statuses: [{ ...custom, priority: '3' }] };
  assert.equal(planImport(merged, updated, { players: 'merge' }).state.statuses.find(s => s.id === custom.id).priority, '3');
  const envelope = exportData(incoming, { players: true });
  delete envelope.data.statuses;
  assert.throws(() => readImport(envelope), /[Ss]tatus/);
  const empty = newState();
  empty.statuses = [];
  empty.statusOrder = ['default'];
  const emptyData = readImport(exportData(empty, { players: true }));
  assert.deepEqual(planImport(current, emptyData, { players: 'replace', clearScrims: true }).state.statuses, []);
});

test('trial identity has no tiebreak advantage when effective priorities are equal', () => {
  const state = newState();
  for (const role of ROLES.slice(1)) {
    state.players.push({ ...player(role, 'default'), roles: [role] });
    currentSession(state).attendees.push({ playerId: role, present: true, priority: '1' });
    currentSession(state).lineup[defaultSlot(role)].playerId = role;
  }
  state.players.push(player('trial'), player('regular', 'default'));
  currentSession(state).attendees.push({ playerId: 'trial', present: true, priority: '1' }, { playerId: 'regular', present: true, priority: '1' });
  assert.equal(autofillLineup(state, () => 0n).tank.playerId, 'regular');
  assert.equal(autofillLineup(state, limit => limit - 1n).tank.playerId, 'trial');
  setPlayerPriority(state, 'trial', null);
  assert.equal(autofillLineup(state).tank.playerId, 'trial');
});


test('status order includes immutable Default and sorts directory names within each status', () => {
  const state = newState();
  assert.deepEqual(orderedStatuses(state).map(s => s.name), ['Team Member', 'Trial', 'Ringer', 'Default']);
  state.players = [player('Zoe', 'trial'), player('Amy', 'default'), player('Alex', 'trial'), player('Bea', 'team')];
  assert.deepEqual(sortedDirectoryPlayers(state).map(p => p.name), ['Bea', 'Alex', 'Zoe', 'Amy']);
  moveStatus(state, 'trial', -1);
  assert.deepEqual(orderedStatuses(state).map(s => s.id), ['trial', 'team', 'ringer', 'default']);
  assert.deepEqual(sortedDirectoryPlayers(state).map(p => p.name), ['Alex', 'Zoe', 'Bea', 'Amy']);
  moveStatus(state, 'default', -1);
  assert.deepEqual(sortedDirectoryPlayers(state).map(p => p.name), ['Alex', 'Zoe', 'Bea', 'Amy']);
  assert.throws(() => saveStatus(state, { ...custom, id: 'default' }));
  assert.throws(() => deleteStatus(state, 'default'));
  assert.throws(() => moveStatus(state, 'missing', 1));
  assert.throws(() => moveStatus(state, 'trial', 2));
  saveStatus(state, custom);
  assert.equal(state.statusOrder.at(-1), custom.id);
  deleteStatus(state, 'team');
  assert.ok(!state.statusOrder.includes('team'));
  assert.deepEqual(validateState(state), state);
});

test('status order validates a complete permutation including Default', () => {
  for (const order of [null, [], ['default'], ['default', 'trial', 'team', 'missing'], ['trial', 'trial', 'team', 'ringer']]) {
    const state = newState(); state.statusOrder = order;
    assert.throws(() => validateState(state));
  }
  const state = newState(); state.statuses = []; state.statusOrder = ['default'];
  assert.deepEqual(validateState(state), state);
});

test('status order survives saving and directory transfers, with incoming order first on merge', () => {
  const source = newState(); moveStatus(source, 'trial', -1);
  assert.deepEqual(restoreSavedState(JSON.stringify(source)), source);
  const data = readImport(exportData(source, { players: true }));
  assert.deepEqual(data.statusOrder, source.statusOrder);
  const target = newState(); saveStatus(target, custom); moveStatus(target, custom.id, -1);
  const merged = planImport(target, data, { players: 'merge' }).state;
  assert.deepEqual(merged.statusOrder, [...source.statusOrder, custom.id]);
  assert.deepEqual(planImport(target, data, { players: 'replace', clearScrims: true }).state.statusOrder, source.statusOrder);
  assert.deepEqual(planImport(target, data, {}).state.statusOrder, target.statusOrder);
  const older = readImport(exportData(newState(), { players: true }));
  const replaced = planImport(target, older, { players: 'replace', clearScrims: true }).state;
  assert.deepEqual(replaced.statusOrder, newState().statusOrder);
  assert.deepEqual(orderedStatuses(replaced).map(s => s.id), ['team', 'trial', 'ringer', 'default']);
});


test('drag placement moves statuses before or after a target, including Default', () => {
  const state = newState();
  placeStatus(state, 'ringer', 'team');
  assert.deepEqual(state.statusOrder, ['ringer', 'team', 'trial', 'default']);
  placeStatus(state, 'default', 'team', true);
  assert.deepEqual(state.statusOrder, ['ringer', 'team', 'default', 'trial']);
  placeStatus(state, 'trial', 'trial');
  assert.deepEqual(state.statusOrder, ['ringer', 'team', 'default', 'trial']);
  assert.throws(() => placeStatus(state, 'missing', 'default'));
  assert.throws(() => placeStatus(state, 'trial', 'missing'));
  assert.deepEqual(validateState(state), state);
});

test('directory merges use explicit incoming order regardless of definition array order', () => {
  const target = newState();
  saveStatus(target, custom);
  const source = newState();
  source.statusOrder = ['ringer', 'trial', 'team', 'default'];
  const data = readImport(exportData(source, { players: true }));
  const before = structuredClone(target);
  const result = planImport(target, data, { players: 'merge' });
  assert.deepEqual(result.state.statusOrder, ['ringer', 'trial', 'team', 'default', custom.id]);
  assert.deepEqual(target, before);
  assert.match(result.summary.join('\n'), /Custom statuses: add 0, update 3, keep 1/);
  assert.deepEqual(orderedStatuses(restoreSavedState(JSON.stringify(result.state))), orderedStatuses(result.state));
});

test('directory-only imports update shared statuses but keep all saved scrim priorities', () => {
  const target = newState();
  target.players = [player('inherited'), player('manual')];
  currentSession(target).attendees = [newAttendee(target, 'inherited', true), { playerId: 'manual', present: true, priority: '1' }];
  const source = newState();
  saveStatus(source, { ...source.statuses.find(status => status.id === 'trial'), name: 'Tryout', color: '#123456', priority: '2', showBadge: false });
  const data = readImport(exportData(source, { players: true }));
  const result = planImport(target, data, { players: 'merge' });
  assert.deepEqual(result.state.scrims, target.scrims);
  assert.equal(effectivePriority(result.state, currentSession(result.state).attendees[0]).value, '3/2');
  assert.equal(effectivePriority(result.state, currentSession(result.state).attendees[1]).value, '1');
  assert.equal(statusFor(result.state, result.state.players[0]).name, 'Tryout');
  assert.match(result.summary.join('\n'), /Saved scrim priorities are kept/);
  assert.deepEqual(planImport(target, data, {}).state, target);
});

test('directory imports reject status name conflicts atomically', () => {
  const target = newState();
  saveStatus(target, { ...target.statuses.find(status => status.id === 'trial'), priority: '2' });
  const source = newState(); source.players = [player()];
  const data = readImport(exportData(source, { players: true }));
  const merged = planImport(target, data, { players: 'merge' }).state;
  assert.equal(statusFor(merged, merged.players[0]).priority, '3/2');
  deleteStatus(target, 'trial');
  saveStatus(target, { ...custom, name: 'Trial' });
  const before = structuredClone(target);
  assert.throws(() => planImport(target, data, { players: 'merge' }), /same name/);
  assert.deepEqual(target, before);
});

test('saved priorities survive status changes and deletion across scrims', () => {
  const state = newState();
  state.players.push(player());
  currentSession(state).attendees.push(newAttendee(state, 'p', true));
  const first = currentSession(state);
  saveStatus(state, { ...state.statuses.find(status => status.id === 'trial'), priority: '2' });
  createScrim(state, 'second', '', true);
  const second = currentSession(state);
  assert.equal(first.attendees[0].priority, '3/2');
  assert.equal(second.attendees[0].priority, '2');
  state.players[0].status = 'team';
  state.players[0].roles = ['MS'];
  assert.equal(effectivePriority(state, first.attendees[0]).value, '3/2');
  assert.equal(effectivePriority(state, second.attendees[0]).value, '2');
  deleteStatus(state, 'team');
  assert.equal(second.attendees[0].priority, '2');
  setPlayerPriority(state, 'p', null);
  assert.equal(second.attendees[0].priority, '1');
  assert.equal(first.attendees[0].priority, '3/2');
  assert.deepEqual(restoreSavedState(JSON.stringify(state)), state);
  const data = readImport(exportData(state, { players: true, scrims: true }));
  assert.deepEqual(data.scrims.items, state.scrims);
});
