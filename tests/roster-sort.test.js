import { defaultSlot, snapshotRole } from './fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, currentSession, sortedAttendees, setPlayerPriority, emptyLineup, newAttendee } from '../model.js';

function add(state, id, games = 0, status = 'default', present = true) {
  state.players.push({ id, name: id, roles: ['Tank'], offRoles: ['MS'], status, notes: '', battletag: '' });
  currentSession(state).attendees.push(newAttendee(state, id, present));
  for (let index = 0; index < games; index++) {
    currentSession(state).games[index] ??= { lineup: [] };
    currentSession(state).games[index].lineup.push({ playerId: id, ...snapshotRole('Tank') });
  }
}
const order = state => sortedAttendees(state).map(attendee => attendee.playerId);

test('roster uses inherited and manual priorities, with present players first', () => {
  const state = newState();
  add(state, 'Regular', 2);
  add(state, 'Trial', 3, 'trial');
  add(state, 'Absent', 0, 'trial', false);
  assert.deepEqual(order(state), ['Trial', 'Regular', 'Absent']);
  setPlayerPriority(state, 'Trial', '1');
  assert.deepEqual(order(state), ['Regular', 'Trial', 'Absent']);
  setPlayerPriority(state, 'Trial', null);
  assert.deepEqual(order(state), ['Trial', 'Regular', 'Absent']);
});

test('exact weighted ties favor fewer main games, then alphabetical names', () => {
  const state = newState();
  add(state, 'A more played', 8);
  add(state, 'Z fewer games', 2);
  setPlayerPriority(state, 'Z fewer games', '1/3');
  assert.deepEqual(order(state), ['Z fewer games', 'A more played']);
  add(state, 'B fewer games', 2);
  setPlayerPriority(state, 'B fewer games', '1/3');
  assert.deepEqual(order(state), ['B fewer games', 'Z fewer games', 'A more played']);
});

test('active main games count, fill games do not, and selected lineup never changes ranking', () => {
  const state = newState();
  add(state, 'Alex');
  add(state, 'Blake');
  const session = currentSession(state);
  session.games = [{ lineup: [{ playerId: 'Alex', ...snapshotRole('MS') }] }];
  assert.deepEqual(order(state), ['Alex', 'Blake']);
  session.activeGame = { lineup: [{ playerId: 'Alex', ...snapshotRole('Tank') }] };
  assert.deepEqual(order(state), ['Blake', 'Alex']);
  const before = structuredClone(state);
  order(state);
  assert.deepEqual(state, before);
  session.lineup = { ...emptyLineup(), tank: { allowedRoles: ['Tank'], playerId: 'Blake' }, support1: { allowedRoles: ['MS'], playerId: 'Alex' } };
  assert.deepEqual(order(state), ['Blake', 'Alex']);
  session.activeGame.lineup[0].roles = ['MS'];
  assert.deepEqual(order(state), ['Alex', 'Blake']);
});
