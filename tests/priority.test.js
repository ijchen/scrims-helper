import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, currentSession, ROLES, PRIORITIES, autofillLineup, setPlayerPriority, createScrim, removeAttendee, validateState } from '../model.js';
import { exportData, readImport } from '../backups.js';

function fixture() {
  const state = newState();
  for (const role of ROLES.slice(1)) {
    state.players.push({ id: role, name: role, roles: [role], status: 'default', notes: '', battletag: '' });
    currentSession(state).attendees.push({ playerId: role, present: true });
    currentSession(state).lineup[role] = role;
  }
  return state;
}

function add(state, id, games, priority = '1', status = 'default') {
  state.players.push({ id, name: id, roles: ['Tank'], status, notes: '', battletag: '' });
  currentSession(state).attendees.push({ playerId: id, present: true });
  setPlayerPriority(state, id, priority);
  for (let index = 0; index < games; index++) {
    currentSession(state).games[index] ??= { lineup: [] };
    currentSession(state).games[index].lineup.push({ role: 'Tank', playerId: id });
  }
}

test('priority can favor more-played players; exact weighted ties use unweighted fairness before trials', () => {
  const state = fixture();
  add(state, 'boosted', 3, '2', 'trial');
  add(state, 'regular', 2);
  assert.equal(autofillLineup(state).Tank, 'boosted');
  currentSession(state).games[1].lineup = currentSession(state).games[1].lineup.filter(slot => slot.playerId !== 'regular');
  assert.equal(autofillLineup(state).Tank, 'regular');
});

test('reciprocal priorities tie exactly without floating point', () => {
  const state = fixture();
  add(state, 'third', 2, '1/3');
  add(state, 'normal', 8, '1', 'trial');
  assert.equal(autofillLineup(state).Tank, 'third');
});

test('intermediate priorities retain exact ties and survive export', () => {
  for (const [value, games, otherGames] of [['3/2', 2, 1], ['2/3', 1, 2]]) {
    const state = fixture();
    add(state, 'intermediate', games, value);
    add(state, 'normal', otherGames);
    assert.equal(autofillLineup(state).Tank, games < otherGames ? 'intermediate' : 'normal');
    currentSession(state).games = [];
    assert.doesNotThrow(() => validateState(state));
    assert.equal(readImport(exportData(state, { players: true, scrims: true })).scrims.items[0].session.attendees.find(attendee => attendee.playerId === 'intermediate').priority, value);
  }
});

test('weighted fairness includes an in-progress preferred game immediately', () => {
  const state = fixture();
  add(state, 'boosted', 2, '2');
  add(state, 'regular', 1);
  assert.equal(autofillLineup(state).Tank, 'boosted');
  currentSession(state).activeGame = { lineup: [{ role: 'Tank', playerId: 'boosted' }] };
  assert.equal(autofillLineup(state).Tank, 'regular');
});

test('common scaling preserves rankings and exact randomized ties', () => {
  const state = fixture();
  add(state, 'first', 2, '1/2');
  add(state, 'second', 5);
  const before = autofillLineup(state, () => 0n);
  setPlayerPriority(state, 'first', '1');
  setPlayerPriority(state, 'second', '2');
  assert.deepEqual(autofillLineup(state, () => 0n), before);
  currentSession(state).games = [];
  for (const value of ['1', '5']) {
    setPlayerPriority(state, 'first', value);
    setPlayerPriority(state, 'second', value);
    assert.equal(autofillLineup(state, () => 0n).Tank, 'second');
    assert.equal(autofillLineup(state, limit => limit - 1n).Tank, 'first');
  }
});

test('priority stays per scrim, transfers, validates, and resets on copied setup or re-adding', () => {
  const state = fixture();
  add(state, 'player', 0, '1/3');
  assert.equal(readImport(exportData(state, { players: true, scrims: true })).scrims.items[0].session.attendees.at(-1).priority, '1/3');
  for (const invalid of [-5, 5, 0, .25, 1.5, '1.5', '2/2', '6', null, NaN]) {
    assert.throws(() => setPlayerPriority(state, 'player', invalid));
    const copy = structuredClone(state);
    currentSession(copy).attendees.at(-1).priority = invalid;
    assert.throws(() => validateState(copy));
  }
  assert.throws(() => setPlayerPriority(state, 'missing', '1'));
  removeAttendee(state, 'player');
  currentSession(state).attendees.push({ playerId: 'player', present: true });
  assert.equal(currentSession(state).attendees.at(-1).priority, undefined);
  setPlayerPriority(state, 'player', '5');
  createScrim(state, 'new', '2026-09-30T12:00:00Z', true);
  assert.ok(currentSession(state).attendees.every(attendee => attendee.priority === undefined));
  assert.doesNotThrow(() => validateState(state));
});

test('fills earn no weighted benefit, including high-priority trials', () => {
  const state = fixture();
  add(state, 'main', 10, '1/5');
  add(state, 'fill', 0, '5', 'trial');
  state.players.at(-1).roles = [];
  state.players.at(-1).offRoles = ['Tank'];
  assert.equal(autofillLineup(state).Tank, 'main');
});

test('weighted optimizer agrees with independent exact rational enumeration', () => {
  const addFraction = (first, second) => [first[0] * second[1] + second[0] * first[1], first[1] * second[1]];
  const compareFraction = (first, second) => {
    const difference = first[0] * second[1] - second[0] * first[1];
    return difference > 0n ? 1 : difference < 0n ? -1 : 0;
  };
  const compare = (first, second) => compareFraction(first[0], second[0]) || compareFraction(first[1], second[1]);
  for (let scenario = 0; scenario < 12; scenario++) {
    const state = newState();
    const counts = new Map();
    for (let index = 0; index < 7; index++) {
      const id = 'player-' + index;
      const games = (index * 7 + scenario * 3) % 13;
      const value = PRIORITIES[(index * 3 + scenario) % PRIORITIES.length].value;
      add(state, id, games, value);
      state.players.at(-1).roles = ROLES.filter((role, roleIndex) => (index + roleIndex + scenario) % 3 !== 0);
      for (const game of currentSession(state).games) {
        const slot = game.lineup.find(slot => slot.playerId === id);
        if (slot) slot.role = state.players.at(-1).roles[0];
      }
      counts.set(id, games);
    }
    const score = lineup => Object.values(lineup).reduce((total, id) => {
      const priority = PRIORITIES.find(option => option.value === (currentSession(state).attendees.find(attendee => attendee.playerId === id).priority ?? '1'));
      return [addFraction(total[0], [BigInt(priority.numerator), BigInt(priority.denominator * (counts.get(id) + 1))]), addFraction(total[1], [1n, BigInt(counts.get(id) + 1)])];
    }, [[0n, 1n], [0n, 1n]]);
    let best = null;
    function enumerate(lineup, used, index) {
      if (index === ROLES.length) {
        const result = score(lineup);
        if (!best || compare(result, best) > 0) best = result;
        return;
      }
      for (const player of state.players) {
        if (!used.includes(player.id) && player.roles.includes(ROLES[index])) enumerate({ ...lineup, [ROLES[index]]: player.id }, [...used, player.id], index + 1);
      }
    }
    enumerate({}, [], 0);
    assert.equal(compare(score(autofillLineup(state)), best), 0);
  }
});
