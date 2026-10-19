import { defaultSlot, snapshotRole } from './fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { currentSession, currentScrim, ROLES, MODES, modeRotation, newState, newSession, gamesFor, assignPlayer, swapPlayers, assignmentChoices, removeAttendee, lineupStatus, recordGame, startGame, finishGame, reopenLastGame, cancelActiveGame, replaceGamePlayer, setGameOutcome, validateState } from '../model.js';
import { mapRef, heroRef, setMap } from './fixtures.js';

test('results survive finish, edits and backups without changing playtime', () => {
  const state = readyState();
  startGame(state, 'result', '2026-09-27T12:00:00Z');
  setGameOutcome(state, 'result', 'win');
  assert.equal(gamesFor(state, 'player-0'), 0);
  finishGame(state, '2026-09-27T12:10:00Z');
  assert.equal(currentSession(state).games[0].outcome, 'win');
  setGameOutcome(state, 'result', 'loss');
  assert.equal(gamesFor(state, 'player-0'), 1);
  assert.deepEqual(validateState(state), state);
  setGameOutcome(state, 'result', 'draw');
  assert.equal(currentSession(validateState(state)).games[0].outcome, 'draw');
  setGameOutcome(state, 'result', '');
  assert.equal(currentSession(state).games[0].outcome, '');
  assert.throws(() => setGameOutcome(state, 'result', 'other'));
  assert.throws(() => setGameOutcome(state, 'missing', 'win'));
  delete currentSession(state).games[0].outcome;
  assert.throws(() => validateState(state));
  currentSession(state).games[0].outcome = 'other';
  assert.throws(() => validateState(state));
});

test('reopening removes credit and preserves both the snapshot and upcoming draft', () => {
  const state = readyState();
  setMap(state, 'Ilios');
  recordGame(state, 'done', '2026-09-27T12:00:00Z');
  setMap(state, 'Dorado');
  reopenLastGame(state);
  assert.equal(currentSession(state).games.length, 0);
  assert.deepEqual(currentSession(state).activeGame.map, mapRef('Ilios'));
  assert.deepEqual(currentSession(state).draft.map, mapRef('Dorado'));
  assert.equal(gamesFor(state, 'player-0'), 0);
  assert.throws(() => reopenLastGame(state));
  assert.deepEqual(validateState(state), state);
  finishGame(state, '2026-09-27T12:10:00Z');
  assert.equal(gamesFor(state, 'player-0'), 1);
});

test('start captures a lineup without crediting it; finish credits that snapshot once', () => {
  const state = readyState();
  setMap(state, "King's Row");
  currentSession(state).draft.ourBan = heroRef('Ana');
  startGame(state, 'live', '2026-09-27T12:00:00Z');
  assert.equal(currentSession(state).games.length, 0);
  assert.equal(gamesFor(state, 'player-0'), 0);
  assert.equal(currentSession(state).activeGame.mode, 'Hybrid');
  assert.deepEqual(currentSession(state).activeGame.ourBan, heroRef('Ana'));
  assert.deepEqual(currentSession(state).draft.map, mapRef(''));
  assert.throws(() => startGame(state, 'other', '2026-09-27T12:00:00Z'));
  assert.throws(() => recordGame(state, 'other', '2026-09-27T12:00:00Z'));
  assignPlayer(state, 'tank', '');
  currentSession(state).attendees[0].present = false;
  const restored = validateState(state);
  finishGame(restored, '2026-09-27T12:10:00Z');
  assert.equal(currentSession(restored).activeGame, null);
  assert.equal(gamesFor(restored, 'player-0'), 1);
  assert.equal(currentSession(restored).games[0].lineup[0].playerId, 'player-0');
  assert.throws(() => finishGame(restored, '2026-09-27T12:11:00Z'));
});

test('confirmed start marks only the chosen five present and does not credit games yet', () => {
  const state = readyState();
  currentSession(state).attendees.forEach(attendee => { attendee.present = false; });
  state.players.push({ id: 'bench', name: 'Bench', battletag: '', roles: ['Tank'], status: 'default', notes: '' });
  currentSession(state).attendees.push({ playerId: 'bench', present: false, priority: '1' });
  assert.throws(() => startGame(state, 'start', '2026-09-27T12:00:00Z'));
  startGame(state, 'start', '2026-09-27T12:00:00Z', true);
  assert.equal(currentSession(state).attendees.filter(attendee => attendee.present).length, 5);
  assert.equal(currentSession(state).attendees.at(-1).present, false);
  assert.equal(currentSession(state).games.length, 0);
  assert.deepEqual(validateState(state), state);
});

test('confirmed start never marks attendance on an incomplete lineup', () => {
  const state = readyState();
  currentSession(state).attendees.forEach(attendee => { attendee.present = false; });
  currentSession(state).lineup.tank.playerId = '';
  const before = structuredClone(state);
  assert.throws(() => startGame(state, 'start', '2026-09-27T12:00:00Z', true));
  assert.deepEqual(state, before);
});

test('returning an active game to upcoming preserves metadata and guards another draft', () => {
  const state = readyState();
  setMap(state, 'Ilios');
  startGame(state, 'live', '2026-09-27T12:00:00Z');
  setMap(state, 'Dorado');
  assert.throws(() => cancelActiveGame(state));
  setMap(state, '');
  cancelActiveGame(state);
  assert.deepEqual(currentSession(state).draft.map, mapRef('Ilios'));
  assert.equal(currentSession(state).draft.mode, 'Control');
  assert.equal(currentSession(state).games.length, 0);
});

test('historical lineup corrections swap duplicates, update credit and preserve snapshots', () => {
  const state = readyState();
  recordGame(state, 'done', '2026-09-27T12:00:00Z');
  const game = currentSession(state).games[0];
  replaceGamePlayer(state, game, 'tank', 'player-4');
  assert.equal(gamesFor(state, 'player-4', 'tank'), 1);
  assert.equal(gamesFor(state, 'player-0', 'support'), 1);
  state.players.push({ id: 'new', name: 'Sub', battletag: 'Sub#1', roles: ['Tank'], status: 'default', notes: '' });
  replaceGamePlayer(state, game, 'tank', 'new');
  assert.equal(gamesFor(state, 'player-4'), 0);
  assert.equal(gamesFor(state, 'new'), 1);
  assert.equal(currentSession(state).lineup.tank.playerId, 'player-0');
  assert.deepEqual(validateState(state), state);
  assert.throws(() => replaceGamePlayer(state, game, 'tank', 'missing'));
});

test('malformed active snapshots are rejected', () => {
  const state = readyState();
  recordGame(state, 'done', '2026-09-27T12:00:00Z');
  currentSession(state).activeGame = { ...currentSession(state).games[0], startedAt: 'bad' };
  assert.throws(() => validateState(state));
  currentSession(state).activeGame.startedAt = '2026-09-27T12:00:00Z';
  assert.throws(() => validateState(state));
});

test('game details persist and clear for the next game', () => {
  const state = readyState();
  setMap(state, 'Ilios');
  currentSession(state).draft = { map: mapRef('Ilios'), mode: 'Control', ourBan: heroRef('Tracer'), theirBan: heroRef('Ana') };
  recordGame(state, 'map-game', new Date().toISOString());
  assert.equal(currentSession(state).games[0].mode, 'Control');
  assert.deepEqual(currentSession(state).games[0].ourBan, heroRef('Tracer'));
  assert.deepEqual(currentSession(state).games[0].theirBan, heroRef('Ana'));
  assert.deepEqual(currentSession(state).draft, { map: null, mode: '', ourBan: null, theirBan: null });
  assert.deepEqual(validateState(state), state);
  const restored = validateState(state);
  assert.deepEqual(currentSession(restored).games[0].map, mapRef('Ilios'));
  assert.equal(currentSession(restored).games[0].mode, 'Control');
  assert.deepEqual(currentSession(restored).draft.ourBan, heroRef(''));
  currentSession(restored).games[0].mode = 'Invalid';
  assert.throws(() => validateState(restored));
  currentSession(restored).games[0].mode = '';
  currentSession(restored).draft.ourBan = 42;
  assert.throws(() => validateState(restored));
});

test('mode rotation handles duplicates, missing modes, edits, undo and full cycles', () => {
  const games = [{ mode: '' }, { mode: 'Control' }, { mode: 'Control' }];
  assert.deepEqual(modeRotation(games), { played: ['Control'], round: 1 });
  games.push(...MODES.slice(1).map(mode => ({ mode })));
  assert.deepEqual(modeRotation(games), { played: [], round: 2 });
  games.pop();
  assert.equal(modeRotation(games).round, 1);
  assert.equal(modeRotation(games).played.length, 4);
  games[1].mode = 'Flashpoint';
  assert.equal(modeRotation(games).round, 2);
  games.push({ mode: 'Push' });
  assert.deepEqual(modeRotation(games), { played: ['Push'], round: 2 });
});

function readyState() {
  const state = newState();
  for (const [index, role] of ROLES.entries()) {
    const player = { id: `player-${index}`, name: `Player ${index}`, battletag: `Player#${index}`, roles: [role], status: 'default', notes: '' };
    state.players.push(player);
    currentSession(state).attendees.push({ playerId: player.id, present: true, priority: '1' });
    assignPlayer(state, defaultSlot(role), player.id);
  }
  return state;
}

test('swaps exchange lineup and bench positions without changing history or attendance', () => {
  const state = readyState();
  recordGame(state, 'first', '2026-09-26T12:00:00Z');
  const history = structuredClone(currentSession(state).games);
  swapPlayers(state, 'player-1', 'player-2');
  assert.equal(currentSession(state).lineup.dps1.playerId, 'player-2');
  assert.equal(currentSession(state).lineup.dps2.playerId, 'player-1');
  const before = structuredClone(state);
  swapPlayers(state, 'player-1', 'player-1');
  assert.deepEqual(state, before);
  assert.throws(() => swapPlayers(state, 'player-1', 'missing'));
  assert.deepEqual(state, before);
  assignPlayer(state, 'tank', '');
  swapPlayers(state, 'player-0', 'player-1');
  assert.equal(currentSession(state).lineup.dps2.playerId, 'player-0');
  assert.equal(Object.values(currentSession(state).lineup).map(slot => slot.playerId).includes('player-1'), false);
  swapPlayers(state, 'player-0', 'player-1');
  assert.equal(currentSession(state).lineup.dps2.playerId, 'player-1');
  assert.deepEqual(currentSession(state).games, history);
  assert.deepEqual(currentSession(state).attendees, currentSession(before).attendees);
});

test('quick assignment picks a single role or unique opening, otherwise offers choices', () => {
  const state = readyState();
  const player = { id: 'flex', name: 'Flex', battletag: '', roles: ['MS'], status: 'default', notes: '' };
  state.players.push(player);
  currentSession(state).attendees.push({ playerId: player.id, present: false, priority: '1' });
  assert.deepEqual(assignmentChoices(state, player.id), ['MS'].map(defaultSlot));
  player.roles = ['Tank', 'MS', 'FS'];
  assert.deepEqual(assignmentChoices(state, player.id), ['Tank', 'MS', 'FS'].map(defaultSlot));
  assignPlayer(state, 'support2', '');
  assert.deepEqual(assignmentChoices(state, player.id), ['FS'].map(defaultSlot));
  assignPlayer(state, 'support1', '');
  assert.deepEqual(assignmentChoices(state, player.id), ['MS', 'FS'].map(defaultSlot));
  assignPlayer(state, 'support2', player.id);
  assert.deepEqual(assignmentChoices(state, player.id), ['FS'].map(defaultSlot));
  player.roles = ['Tank'];
  assert.deepEqual(assignmentChoices(state, player.id), ['Tank'].map(defaultSlot));
  player.roles = [];
  assert.deepEqual(assignmentChoices(state, player.id), []);
  assert.deepEqual(assignmentChoices(state, 'unknown'), []);
  removeAttendee(state, player.id);
  assert.deepEqual(assignmentChoices(state, player.id), []);
});

test('game logging credits all five once and retains the lineup for the next game', () => {
  const state = readyState();
  setMap(state, 'Practice map');
  recordGame(state, 'game-1', new Date().toISOString());
  for (const player of state.players) assert.equal(gamesFor(state, player.id), 1);
  assert.deepEqual(currentSession(state).games[0].map, mapRef('Practice map'));
  assert.deepEqual(currentSession(state).draft.map, mapRef(''));
  assert.equal(lineupStatus(state).ready, true);
  state.players[0].name = 'Renamed';
  assert.equal(currentSession(state).games[0].lineup[0].name, 'Player 0');
  currentSession(state).games.pop();
  assert.equal(gamesFor(state, 'player-0'), 0);
});

test('missing, absent, and duplicate players cannot be logged', () => {
  const state = readyState();
  currentSession(state).attendees[0].present = false;
  assert.throws(() => recordGame(state, 'game', new Date().toISOString()));
  currentSession(state).attendees[0].present = true;
  currentSession(state).lineup.tank.playerId = '';
  assert.throws(() => recordGame(state, 'game', new Date().toISOString()));
  currentSession(state).lineup.tank.playerId = currentSession(state).lineup.dps2.playerId;
  assert.throws(() => recordGame(state, 'game', new Date().toISOString()));
  assert.equal(currentSession(state).games.length, 0);
});

test('explicit off-role fills log their actual role and survive backups', () => {
  const state = readyState();
  assignPlayer(state, 'support2', 'player-0', true);
  assert.equal(currentSession(state).lineup.tank.playerId, '');
  assert.equal(currentSession(state).lineup.support2.playerId, 'player-0');
  assert.equal(lineupStatus(state).ready, false);
  assignPlayer(state, 'tank', 'player-4', true);
  assert.equal(lineupStatus(state).ready, true);
  assert.deepEqual(lineupStatus(state).offRole, ['tank', 'support2']);
  recordGame(state, 'fill-game', new Date().toISOString());
  assert.equal(gamesFor(state, 'player-0', 'support'), 1);
  assert.equal(gamesFor(state, 'player-0', 'tank'), 0);
  assert.deepEqual(state.players[0].roles, ['Tank']);
  assert.deepEqual(validateState(state), state);
  currentSession(state).attendees[0].present = false;
  assert.equal(lineupStatus(state).ready, false);
  assignPlayer(state, 'tank', 'unknown', true);
  assert.equal(currentSession(state).lineup.tank.playerId, 'player-4');
});

test('flex assignments move a player instead of occupying two slots', () => {
  const state = readyState();
  state.players[0].roles.push('FS');
  assignPlayer(state, 'support2', 'player-0');
  assert.equal(currentSession(state).lineup.tank.playerId, '');
  assert.equal(currentSession(state).lineup.support2.playerId, 'player-0');
  assignPlayer(state, 'support1', 'player-0');
  assert.equal(currentSession(state).lineup.support1.playerId, 'player-3');
  assignPlayer(state, 'tank', 'unknown');
  assert.equal(currentSession(state).lineup.tank.playerId, '');
});

test('removing an attendee clears the lineup while preserving played games', () => {
  const state = readyState();
  recordGame(state, 'game', new Date().toISOString());
  removeAttendee(state, 'player-0');
  assert.equal(currentSession(state).lineup.tank.playerId, '');
  assert.equal(gamesFor(state, 'player-0'), 1);
  assert.equal(state.players.length, 5);
  state.players = state.players.filter(player => player.id !== 'player-0');
  assert.doesNotThrow(() => validateState(state));
});

test('backups round-trip attendance and history without sharing references', () => {
  const state = readyState();
  recordGame(state, 'game', new Date().toISOString());
  const restored = validateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored, state);
  restored.players[0].name = 'Changed';
  assert.notEqual(restored.players[0].name, state.players[0].name);
});

test('malformed backups fail validation before replacing any state', () => {
  const mutations = [
    state => { state.version = 999; },
    state => { currentSession(state).plans = []; },
    state => { state.players[0].roles = ['Unknown']; },
    state => { state.players[0].status = 'unknown'; },
    state => { state.players[0].name = ' '; },
    state => { state.players.push(state.players[0]); },
    state => { currentSession(state).attendees[0].playerId = 'missing'; },
    state => { currentSession(state).attendees[0].present = 'yes'; },
    state => { currentSession(state).lineup.tank.playerId = 'missing'; },
    state => { currentSession(state).lineup.tank.playerId = currentSession(state).lineup.support2.playerId; },
    state => { currentSession(state).lineup.extra = ''; },
    state => { currentSession(state).games[0].lineup.pop(); },
    state => { currentSession(state).games[0].playedAt = 'not a date'; },
  ];
  for (const mutate of mutations) {
    const state = readyState();
    recordGame(state, 'game', new Date().toISOString());
    mutate(state);
    assert.throws(() => validateState(state));
  }
  for (const invalid of [null, [], {}, { version: 1 }, 'text']) assert.throws(() => validateState(invalid));
});

test('new scrim clears game counts while retaining reusable players', () => {
  const state = readyState();
  recordGame(state, 'game', new Date().toISOString());
  currentScrim(state).session = newSession();
  assert.equal(state.players.length, 5);
  assert.equal(gamesFor(state, 'player-0'), 0);
  assert.equal(currentSession(state).attendees.length, 0);
  assert.doesNotThrow(() => validateState(state));
});

test('player statuses survive backups and missing statuses are rejected', () => {
  const state = readyState();
  state.players[0].status = 'trial';
  state.players[1].status = 'team';
  delete state.players[2].status;
  assert.throws(() => validateState(state));
  state.players[2].status = 'default';
  const restored = validateState(state);
  assert.equal(restored.players[0].status, 'trial');
  assert.equal(restored.players[1].status, 'team');
  assert.equal(restored.players[2].status, 'default');
  assert.equal(state.players[2].status, 'default');
});

test('partially entered players survive backups without becoming eligible for a role', () => {
  const state = newState();
  state.players.push({ id: 'draft', name: 'Unnamed player', battletag: '', roles: [], status: 'trial', notes: '' });
  currentSession(state).attendees.push({ playerId: 'draft', present: false, priority: '1' });
  const restored = validateState(state);
  assert.deepEqual(restored, state);
  assignPlayer(restored, 'tank', 'draft');
  assert.equal(currentSession(restored).lineup.tank.playerId, '');
});

test('role counts combine DPS and support slots and use historical roles', () => {
  const state = readyState();
  for (const player of state.players) player.roles = [...ROLES];
  for (const [index, role] of ['Tank', 'HSDPS', 'FDPS', 'MS', 'FS', 'FS'].entries()) {
    const displaced = currentSession(state).lineup[defaultSlot(role)].playerId;
    const previous = ROLES.find(slot => currentSession(state).lineup[defaultSlot(slot)].playerId === 'player-0');
    assignPlayer(state, defaultSlot(role), 'player-0');
    if (displaced !== 'player-0') assignPlayer(state, defaultSlot(previous), displaced);
    recordGame(state, `game-${index}`, new Date().toISOString());
  }
  state.players[0].roles = ['Tank'];
  assignPlayer(state, 'support2', '');
  assert.equal(gamesFor(state, 'player-0'), 6);
  assert.equal(gamesFor(state, 'player-0', 'tank'), 1);
  assert.equal(gamesFor(state, 'player-0', 'dps'), 2);
  assert.equal(gamesFor(state, 'player-0', 'support'), 3);
  currentSession(state).games.pop();
  const restored = validateState(JSON.parse(JSON.stringify(state)));
  assert.equal(gamesFor(restored, 'player-0'), 5);
  assert.equal(gamesFor(restored, 'player-0', 'support'), 2);
  assert.equal(gamesFor(restored, 'missing', 'tank'), 0);
  currentScrim(restored).session = newSession();
  assert.equal(gamesFor(restored, 'player-0', 'support'), 0);
});
