import test from 'node:test';
import assert from 'node:assert/strict';
import { autofillLineup, emptyLineup, newState, ROLES } from '../model.js';

function add(state, id, roles, history = [], status = 'default', present = true) {
  state.players.push({ id, name: id, battletag: '', roles, status, notes: '' });
  state.session.attendees.push({ playerId: id, present });
  history.forEach((role, index) => {
    state.session.games[index] ??= { id: `game-${index}`, lineup: [] };
    state.session.games[index].lineup.push({ playerId: id, role });
  });
}

function fixture(empty = ROLES) {
  const state = newState();
  for (const role of ROLES.filter(role => !empty.includes(role))) {
    add(state, `fixed-${role}`, [role]);
    state.session.lineup[role] = `fixed-${role}`;
  }
  return state;
}

test('finds a complete assignment instead of greedily stranding a role', () => {
  const state = fixture(['Tank', 'HSDPS']);
  add(state, 'flex', ['HSDPS', 'Tank']);
  add(state, 'dps', ['HSDPS']);
  const before = structuredClone(state);
  const result = autofillLineup(state);
  assert.equal(result.Tank, 'flex');
  assert.equal(result.HSDPS, 'dps');
  assert.deepEqual(state, before);
});

test('never partially fills, repeats players, or uses absent or off-role candidates', () => {
  const state = fixture(['Tank', 'FS']);
  add(state, 'flex', ['Tank', 'FS']);
  add(state, 'absent', ['FS'], [], 'trial', false);
  add(state, 'wrong-role', ['HSDPS']);
  const before = structuredClone(state);
  assert.throws(() => autofillLineup(state), /Tank \/ FS need 2 different players; only 1/);
  assert.deepEqual(state, before);
  state.players[0].roles = [];
  state.players.find(player => player.id === 'flex').roles = ['Tank'];
  assert.throws(() => autofillLineup(state), /No available present player for FS/);
});

test('preserves fixed players including absent off-role assignments', () => {
  const state = fixture(['FS']);
  state.players[0].roles = ['FS'];
  state.session.attendees[0].present = false;
  add(state, 'support', ['FS']);
  assert.deepEqual(autofillLineup(state), { ...state.session.lineup, FS: 'support' });
  state.session.lineup.FS = state.session.lineup.Tank;
  assert.throws(() => autofillLineup(state), /Check the selected players/);
});

test('diminishing returns prefer spreading playtime to multiple underplayed players', () => {
  const state = fixture(['Tank', 'HSDPS', 'FDPS']);
  add(state, 'newcomer', ['Tank']);
  add(state, 'one-game', ['Tank', 'HSDPS'], ['Tank']);
  add(state, 'another-one', ['HSDPS', 'FDPS'], ['HSDPS']);
  add(state, 'third-one', ['Tank', 'FDPS'], ['FDPS']);
  add(state, 'veteran', ['HSDPS'], Array(8).fill('HSDPS'));
  const result = autofillLineup(state);
  assert.ok(!Object.values(result).includes('veteran'));
  assert.ok(Object.values(result).includes('newcomer'));
});

test('playtime wins over role balance and trial status; active games count', () => {
  const state = fixture(['FS']);
  add(state, 'less-played', ['FS'], ['FS']);
  add(state, 'trial', ['FS', 'FDPS'], ['FDPS', 'FDPS'], 'trial');
  assert.equal(autofillLineup(state).FS, 'less-played');
  state.session.activeGame = { lineup: [{ playerId: 'less-played', role: 'FS' }] };
  assert.equal(autofillLineup(state).FS, 'trial');
});

test('improves group balance instead of penalizing unbalanced histories', () => {
  const state = fixture(['FS']);
  add(state, 'unbalanced', ['FDPS', 'FS'], Array(4).fill('FDPS'));
  add(state, 'balanced', ['FDPS', 'FS'], ['FDPS', 'FDPS', 'FS', 'FS'], 'trial');
  assert.equal(autofillLineup(state).FS, 'unbalanced');
});

test('balances assignments of the same selected people', () => {
  const state = fixture(['HSDPS', 'FS']);
  add(state, 'alex', ['HSDPS', 'FS'], ['HSDPS', 'HSDPS', 'HSDPS', 'FS']);
  add(state, 'blair', ['HSDPS', 'FS'], ['FS', 'FS', 'FS', 'HSDPS']);
  const result = autofillLineup(state);
  assert.equal(result.FS, 'alex');
  assert.equal(result.HSDPS, 'blair');
});

test('subroles break group-balance ties before trials', () => {
  const state = fixture(['HSDPS']);
  add(state, 'flex-heavy', ['HSDPS', 'FDPS'], ['FDPS', 'FDPS', 'FDPS', 'HSDPS']);
  add(state, 'hitscan-heavy', ['HSDPS', 'FDPS'], ['HSDPS', 'HSDPS', 'HSDPS', 'FDPS'], 'trial');
  assert.equal(autofillLineup(state).HSDPS, 'flex-heavy');
});

test('trials beat default and team players only on otherwise tied scores', () => {
  const state = fixture(['Tank']);
  add(state, 'team', ['Tank'], [], 'team');
  add(state, 'default', ['Tank']);
  add(state, 'trial', ['Tank'], [], 'trial');
  assert.equal(autofillLineup(state).Tank, 'trial');
});

test('randomizes only exact ties and can choose either tied player', () => {
  const state = fixture(['Tank']);
  add(state, 'alphabet-first', ['Tank']);
  add(state, 'alphabet-last', ['Tank']);
  assert.equal(autofillLineup(state, () => 0n).Tank, 'alphabet-last');
  assert.equal(autofillLineup(state, limit => limit - 1n).Tank, 'alphabet-first');
});

test('handles a large flexible roster without enumerating full lineups', () => {
  const state = fixture();
  for (let index = 0; index < 100; index += 1) add(state, `player-${index}`, [...ROLES]);
  const result = autofillLineup(state);
  assert.equal(new Set(Object.values(result)).size, 5);
  assert.ok(Object.values(result).every(Boolean));
  assert.deepEqual(state.session.lineup, emptyLineup());
  state.session.lineup = result;
  assert.deepEqual(autofillLineup(state), result);
});

test('broad-role balance outranks a better subrole balance', () => {
  const state = fixture(['HSDPS']);
  add(state, 'needs-dps', ['HSDPS', 'FDPS', 'FS'], ['HSDPS', 'HSDPS', 'FS', 'FS']);
  add(state, 'needs-hitscan', ['HSDPS', 'FDPS', 'FS'], ['FDPS', 'FDPS', 'FDPS', 'FS'], 'trial');
  assert.equal(autofillLineup(state).HSDPS, 'needs-dps');
});

test('global optimizer matches exhaustive scoring on varied small rosters', () => {
  let seed = 12345;
  const random = maximum => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % maximum;
  };
  const group = role => role === 'Tank' ? 'tank' : role.endsWith('DPS') ? 'dps' : 'support';
  const variance = values => {
    const mean = values.reduce((sum, count) => sum + count, 0) / values.length;
    return values.reduce((sum, count) => sum + (count - mean) ** 2, 0);
  };
  const compare = (first, second) => {
    for (let index = 0; index < first.length; index += 1) {
      if (Math.abs(first[index] - second[index]) > 1e-8) return Math.sign(first[index] - second[index]);
    }
    return 0;
  };
  for (let scenario = 0; scenario < 30; scenario += 1) {
    const state = fixture();
    for (let index = 0; index < 7; index += 1) {
      const roles = ROLES.filter(() => random(3) > 0);
      if (!roles.length) roles.push(ROLES[index % 5]);
      add(state, `player-${index}`, roles, Array.from({ length: random(6) }, () => ROLES[random(5)]), random(3) === 0 ? 'trial' : 'team');
    }
    const score = lineup => ROLES.reduce((total, role) => {
      const player = state.players.find(player => player.id === lineup[role]);
      const history = state.session.games.flatMap(game => game.lineup.filter(slot => slot.playerId === player.id));
      const groups = [...new Set(player.roles.map(group))];
      const before = groups.map(category => history.filter(slot => group(slot.role) === category).length);
      const after = before.map((count, index) => count + Number(groups[index] === group(role)));
      const subroles = player.roles.filter(subrole => group(subrole) === group(role));
      const subBefore = subroles.map(subrole => history.filter(slot => slot.role === subrole).length);
      const subAfter = subBefore.map((count, index) => count + Number(subroles[index] === role));
      return [total[0] + 1 / (history.length + 1), total[1] + variance(before) - variance(after), total[2] + variance(subBefore) - variance(subAfter), total[3] + Number(player.status === 'trial')];
    }, [0, 0, 0, 0]);
    let best = null;
    function enumerate(lineup, used, index) {
      if (index === ROLES.length) {
        const value = score(lineup);
        if (!best || compare(value, best) > 0) best = value;
        return;
      }
      for (const player of state.players) {
        if (!used.includes(player.id) && player.roles.includes(ROLES[index])) enumerate({ ...lineup, [ROLES[index]]: player.id }, [...used, player.id], index + 1);
      }
    }
    enumerate({}, [], 0);
    if (!best) assert.throws(() => autofillLineup(state));
    else assert.equal(compare(score(autofillLineup(state)), best), 0, `scenario ${scenario}`);
  }
});
