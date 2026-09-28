import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, MODES, modeRotation, newState, newSession, gamesFor, assignPlayer, swapPlayers, assignmentChoices, removeAttendee, lineupStatus, recordGame, startGame, finishGame, reopenLastGame, cancelActiveGame, replaceGamePlayer, setGameOutcome, validateBackup } from '../model.js';

test('results survive finish, edits and backups without changing playtime', () => {
  const state = readyState();
  startGame(state, 'result', '2026-09-27T12:00:00Z');
  setGameOutcome(state, 'result', 'win');
  assert.equal(gamesFor(state, 'player-0'), 0);
  finishGame(state, '2026-09-27T12:10:00Z');
  assert.equal(state.session.games[0].outcome, 'win');
  setGameOutcome(state, 'result', 'loss');
  assert.equal(gamesFor(state, 'player-0'), 1);
  assert.deepEqual(validateBackup(state), state);
  setGameOutcome(state, 'result', 'draw');
  assert.equal(validateBackup(state).session.games[0].outcome, 'draw');
  setGameOutcome(state, 'result', '');
  assert.equal(state.session.games[0].outcome, '');
  assert.throws(() => setGameOutcome(state, 'result', 'other'));
  assert.throws(() => setGameOutcome(state, 'missing', 'win'));
  delete state.session.games[0].outcome;
  assert.equal(validateBackup(state).session.games[0].outcome, '');
  state.session.games[0].outcome = 'other';
  assert.throws(() => validateBackup(state));
});

test('reopening removes credit and preserves both the snapshot and upcoming draft', () => {
  const state = readyState();
  state.session.gameLabel = 'Ilios';
  recordGame(state, 'done', '2026-09-27T12:00:00Z');
  state.session.gameLabel = 'Dorado';
  reopenLastGame(state);
  assert.equal(state.session.games.length, 0);
  assert.equal(state.session.activeGame.label, 'Ilios');
  assert.equal(state.session.gameLabel, 'Dorado');
  assert.equal(gamesFor(state, 'player-0'), 0);
  assert.throws(() => reopenLastGame(state));
  assert.deepEqual(validateBackup(state), state);
  finishGame(state, '2026-09-27T12:10:00Z');
  assert.equal(gamesFor(state, 'player-0'), 1);
});

test('start captures a lineup without crediting it; finish credits that snapshot once', () => {
  const state = readyState();
  state.session.gameLabel = "King's Row";
  state.session.nextGame.ourBan = 'Ana';
  startGame(state, 'live', '2026-09-27T12:00:00Z');
  assert.equal(state.session.games.length, 0);
  assert.equal(gamesFor(state, 'player-0'), 0);
  assert.equal(state.session.activeGame.mode, 'Hybrid');
  assert.equal(state.session.activeGame.ourBan, 'Ana');
  assert.equal(state.session.gameLabel, '');
  assert.throws(() => startGame(state, 'other', '2026-09-27T12:00:00Z'));
  assert.throws(() => recordGame(state, 'other', '2026-09-27T12:00:00Z'));
  assignPlayer(state, 'Tank', '');
  state.session.attendees[0].present = false;
  const restored = validateBackup(state);
  finishGame(restored, '2026-09-27T12:10:00Z');
  assert.equal(restored.session.activeGame, null);
  assert.equal(gamesFor(restored, 'player-0'), 1);
  assert.equal(restored.session.games[0].lineup[0].playerId, 'player-0');
  assert.throws(() => finishGame(restored, '2026-09-27T12:11:00Z'));
});

test('confirmed start marks only the chosen five present and does not credit games yet', () => {
  const state = readyState();
  state.session.attendees.forEach(attendee => { attendee.present = false; });
  state.players.push({ id: 'bench', name: 'Bench', battletag: '', roles: ['Tank'], status: 'default', notes: '' });
  state.session.attendees.push({ playerId: 'bench', present: false });
  assert.throws(() => startGame(state, 'start', '2026-09-27T12:00:00Z'));
  startGame(state, 'start', '2026-09-27T12:00:00Z', true);
  assert.equal(state.session.attendees.filter(attendee => attendee.present).length, 5);
  assert.equal(state.session.attendees.at(-1).present, false);
  assert.equal(state.session.games.length, 0);
  assert.deepEqual(validateBackup(state), state);
});

test('confirmed start never marks attendance on an incomplete lineup', () => {
  const state = readyState();
  state.session.attendees.forEach(attendee => { attendee.present = false; });
  state.session.lineup.Tank = '';
  const before = structuredClone(state);
  assert.throws(() => startGame(state, 'start', '2026-09-27T12:00:00Z', true));
  assert.deepEqual(state, before);
});

test('returning an active game to upcoming preserves metadata and guards another draft', () => {
  const state = readyState();
  state.session.gameLabel = 'Ilios';
  startGame(state, 'live', '2026-09-27T12:00:00Z');
  state.session.gameLabel = 'Dorado';
  assert.throws(() => cancelActiveGame(state));
  state.session.gameLabel = '';
  cancelActiveGame(state);
  assert.equal(state.session.gameLabel, 'Ilios');
  assert.equal(state.session.nextGame.mode, 'Control');
  assert.equal(state.session.games.length, 0);
});

test('historical lineup corrections swap duplicates, update credit and preserve snapshots', () => {
  const state = readyState();
  recordGame(state, 'done', '2026-09-27T12:00:00Z');
  const game = state.session.games[0];
  replaceGamePlayer(state, game, 'Tank', 'player-4');
  assert.equal(gamesFor(state, 'player-4', 'tank'), 1);
  assert.equal(gamesFor(state, 'player-0', 'support'), 1);
  state.players.push({ id: 'new', name: 'Sub', battletag: 'Sub#1', roles: ['Tank'], status: 'default', notes: '' });
  replaceGamePlayer(state, game, 'Tank', 'new');
  assert.equal(gamesFor(state, 'player-4'), 0);
  assert.equal(gamesFor(state, 'new'), 1);
  assert.equal(state.session.lineup.Tank, 'player-0');
  assert.deepEqual(validateBackup(state), state);
  assert.throws(() => replaceGamePlayer(state, game, 'Tank', 'missing'));
});

test('legacy games remain completed and malformed active snapshots are rejected', () => {
  const state = readyState();
  recordGame(state, 'done', '2026-09-27T12:00:00Z');
  delete state.session.activeGame;
  assert.equal(validateBackup(state).session.activeGame, null);
  assert.equal(validateBackup(state).session.games.length, 1);
  state.session.activeGame = { ...state.session.games[0], startedAt: 'bad' };
  assert.throws(() => validateBackup(state));
  state.session.activeGame.startedAt = '2026-09-27T12:00:00Z';
  assert.throws(() => validateBackup(state));
});

test('game details persist, clear for the next game, and migrate old backups', () => {
  const state = readyState();
  state.session.gameLabel = 'Ilios';
  state.session.nextGame = { mode: 'Control', ourBan: 'Tracer', theirBan: 'Ana' };
  recordGame(state, 'map-game', new Date().toISOString());
  assert.equal(state.session.games[0].mode, 'Control');
  assert.equal(state.session.games[0].ourBan, 'Tracer');
  assert.equal(state.session.games[0].theirBan, 'Ana');
  assert.deepEqual(state.session.nextGame, { mode: '', ourBan: '', theirBan: '' });
  assert.deepEqual(validateBackup(state), state);
  delete state.session.nextGame;
  for (const field of ['mode', 'ourBan', 'theirBan']) delete state.session.games[0][field];
  const restored = validateBackup(state);
  assert.equal(restored.session.games[0].label, 'Ilios');
  assert.equal(restored.session.games[0].mode, '');
  assert.equal(restored.session.nextGame.ourBan, '');
  restored.session.games[0].mode = 'Invalid';
  assert.throws(() => validateBackup(restored));
  restored.session.games[0].mode = '';
  restored.session.nextGame.ourBan = 42;
  assert.throws(() => validateBackup(restored));
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
    state.session.attendees.push({ playerId: player.id, present: true });
    assignPlayer(state, role, player.id);
  }
  return state;
}

test('swaps exchange lineup and bench positions without changing history or attendance', () => {
  const state = readyState();
  recordGame(state, 'first', '2026-09-26T12:00:00Z');
  const history = structuredClone(state.session.games);
  swapPlayers(state, 'player-1', 'player-2');
  assert.equal(state.session.lineup.HSDPS, 'player-2');
  assert.equal(state.session.lineup.FDPS, 'player-1');
  const before = structuredClone(state);
  swapPlayers(state, 'player-1', 'player-1');
  assert.deepEqual(state, before);
  assert.throws(() => swapPlayers(state, 'player-1', 'missing'));
  assert.deepEqual(state, before);
  assignPlayer(state, 'Tank', '');
  swapPlayers(state, 'player-0', 'player-1');
  assert.equal(state.session.lineup.FDPS, 'player-0');
  assert.equal(Object.values(state.session.lineup).includes('player-1'), false);
  swapPlayers(state, 'player-0', 'player-1');
  assert.equal(state.session.lineup.FDPS, 'player-1');
  assert.deepEqual(state.session.games, history);
  assert.deepEqual(state.session.attendees, before.session.attendees);
});

test('quick assignment picks a single role or unique opening, otherwise offers choices', () => {
  const state = readyState();
  const player = { id: 'flex', name: 'Flex', battletag: '', roles: ['MS'], status: 'default', notes: '' };
  state.players.push(player);
  state.session.attendees.push({ playerId: player.id, present: false });
  assert.deepEqual(assignmentChoices(state, player.id), ['MS']);
  player.roles = ['Tank', 'MS', 'FS'];
  assert.deepEqual(assignmentChoices(state, player.id), ['Tank', 'MS', 'FS']);
  assignPlayer(state, 'FS', '');
  assert.deepEqual(assignmentChoices(state, player.id), ['FS']);
  assignPlayer(state, 'MS', '');
  assert.deepEqual(assignmentChoices(state, player.id), ['MS', 'FS']);
  assignPlayer(state, 'FS', player.id);
  assert.deepEqual(assignmentChoices(state, player.id), ['FS']);
  player.roles = ['Tank'];
  assert.deepEqual(assignmentChoices(state, player.id), ['Tank']);
  player.roles = [];
  assert.deepEqual(assignmentChoices(state, player.id), []);
  assert.deepEqual(assignmentChoices(state, 'unknown'), []);
  removeAttendee(state, player.id);
  assert.deepEqual(assignmentChoices(state, player.id), []);
});

test('game logging credits all five once and retains the lineup for the next game', () => {
  const state = readyState();
  state.session.gameLabel = 'Practice map';
  recordGame(state, 'game-1', new Date().toISOString());
  for (const player of state.players) assert.equal(gamesFor(state, player.id), 1);
  assert.equal(state.session.games[0].label, 'Practice map');
  assert.equal(state.session.gameLabel, '');
  assert.equal(lineupStatus(state).ready, true);
  state.players[0].name = 'Renamed';
  assert.equal(state.session.games[0].lineup[0].name, 'Player 0');
  state.session.games.pop();
  assert.equal(gamesFor(state, 'player-0'), 0);
});

test('missing, absent, and duplicate players cannot be logged', () => {
  const state = readyState();
  state.session.attendees[0].present = false;
  assert.throws(() => recordGame(state, 'game', new Date().toISOString()));
  state.session.attendees[0].present = true;
  state.session.lineup.Tank = '';
  assert.throws(() => recordGame(state, 'game', new Date().toISOString()));
  state.session.lineup.Tank = state.session.lineup.FDPS;
  assert.throws(() => recordGame(state, 'game', new Date().toISOString()));
  assert.equal(state.session.games.length, 0);
});

test('explicit off-role fills log their actual role and survive backups', () => {
  const state = readyState();
  assignPlayer(state, 'FS', 'player-0', true);
  assert.equal(state.session.lineup.Tank, '');
  assert.equal(state.session.lineup.FS, 'player-0');
  assert.equal(lineupStatus(state).ready, false);
  assignPlayer(state, 'Tank', 'player-4', true);
  assert.equal(lineupStatus(state).ready, true);
  assert.deepEqual(lineupStatus(state).offRole, ['Tank', 'FS']);
  recordGame(state, 'fill-game', new Date().toISOString());
  assert.equal(gamesFor(state, 'player-0', 'support'), 1);
  assert.equal(gamesFor(state, 'player-0', 'tank'), 0);
  assert.deepEqual(state.players[0].roles, ['Tank']);
  assert.deepEqual(validateBackup(state), state);
  state.session.attendees[0].present = false;
  assert.equal(lineupStatus(state).ready, false);
  assignPlayer(state, 'Tank', 'unknown', true);
  assert.equal(state.session.lineup.Tank, 'player-4');
});

test('flex assignments move a player instead of occupying two slots', () => {
  const state = readyState();
  state.players[0].roles.push('FS');
  assignPlayer(state, 'FS', 'player-0');
  assert.equal(state.session.lineup.Tank, '');
  assert.equal(state.session.lineup.FS, 'player-0');
  assignPlayer(state, 'MS', 'player-0');
  assert.equal(state.session.lineup.MS, 'player-3');
  assignPlayer(state, 'Tank', 'unknown');
  assert.equal(state.session.lineup.Tank, '');
});

test('removing an attendee clears the lineup while preserving played games', () => {
  const state = readyState();
  recordGame(state, 'game', new Date().toISOString());
  removeAttendee(state, 'player-0');
  assert.equal(state.session.lineup.Tank, '');
  assert.equal(gamesFor(state, 'player-0'), 1);
  assert.equal(state.players.length, 5);
  state.players = state.players.filter(player => player.id !== 'player-0');
  assert.doesNotThrow(() => validateBackup(state));
});

test('backups round-trip attendance and history without sharing references', () => {
  const state = readyState();
  recordGame(state, 'game', new Date().toISOString());
  const restored = validateBackup(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored, state);
  restored.players[0].name = 'Changed';
  assert.notEqual(restored.players[0].name, state.players[0].name);
});

test('malformed backups fail validation before replacing any state', () => {
  const mutations = [
    state => { state.version = 999; },
    state => { state.session.plans = []; },
    state => { state.players[0].roles = ['Unknown']; },
    state => { state.players[0].status = 'unknown'; },
    state => { state.players[0].name = ' '; },
    state => { state.players.push(state.players[0]); },
    state => { state.session.attendees[0].playerId = 'missing'; },
    state => { state.session.attendees[0].present = 'yes'; },
    state => { state.session.lineup.Tank = 'missing'; },
    state => { state.session.lineup.Tank = state.session.lineup.FS; },
    state => { state.session.lineup.extra = ''; },
    state => { state.session.games[0].lineup.pop(); },
    state => { state.session.games[0].playedAt = 'not a date'; },
  ];
  for (const mutate of mutations) {
    const state = readyState();
    recordGame(state, 'game', new Date().toISOString());
    mutate(state);
    assert.throws(() => validateBackup(state));
  }
  for (const invalid of [null, [], {}, { version: 1 }, 'text']) assert.throws(() => validateBackup(invalid));
});

test('new scrim clears game counts while retaining reusable players', () => {
  const state = readyState();
  recordGame(state, 'game', new Date().toISOString());
  state.session = newSession();
  assert.equal(state.players.length, 5);
  assert.equal(gamesFor(state, 'player-0'), 0);
  assert.equal(state.session.attendees.length, 0);
  assert.doesNotThrow(() => validateBackup(state));
});

test('player statuses survive backups and older backups default to unmarked', () => {
  const state = readyState();
  state.players[0].status = 'trial';
  state.players[1].status = 'team';
  delete state.players[2].status;
  const restored = validateBackup(state);
  assert.equal(restored.players[0].status, 'trial');
  assert.equal(restored.players[1].status, 'team');
  assert.equal(restored.players[2].status, 'default');
  assert.equal(state.players[2].status, undefined);
});

test('partially entered players survive backups without becoming eligible for a role', () => {
  const state = newState();
  state.players.push({ id: 'draft', name: 'Unnamed player', battletag: '', roles: [], status: 'trial', notes: '' });
  state.session.attendees.push({ playerId: 'draft', present: false });
  const restored = validateBackup(state);
  assert.deepEqual(restored, state);
  assignPlayer(restored, 'Tank', 'draft');
  assert.equal(restored.session.lineup.Tank, '');
});

test('role counts combine DPS and support slots and use historical roles', () => {
  const state = readyState();
  for (const player of state.players) player.roles = [...ROLES];
  for (const [index, role] of ['Tank', 'HSDPS', 'FDPS', 'MS', 'FS', 'FS'].entries()) {
    const displaced = state.session.lineup[role];
    const previous = ROLES.find(slot => state.session.lineup[slot] === 'player-0');
    assignPlayer(state, role, 'player-0');
    if (displaced !== 'player-0') assignPlayer(state, previous, displaced);
    recordGame(state, `game-${index}`, new Date().toISOString());
  }
  state.players[0].roles = ['Tank'];
  assignPlayer(state, 'FS', '');
  assert.equal(gamesFor(state, 'player-0'), 6);
  assert.equal(gamesFor(state, 'player-0', 'tank'), 1);
  assert.equal(gamesFor(state, 'player-0', 'dps'), 2);
  assert.equal(gamesFor(state, 'player-0', 'support'), 3);
  state.session.games.pop();
  const restored = validateBackup(JSON.parse(JSON.stringify(state)));
  assert.equal(gamesFor(restored, 'player-0'), 5);
  assert.equal(gamesFor(restored, 'player-0', 'support'), 2);
  assert.equal(gamesFor(restored, 'missing', 'tank'), 0);
  restored.session = newSession();
  assert.equal(gamesFor(restored, 'player-0', 'support'), 0);
});
