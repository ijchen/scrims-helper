export const ROLES = ['Tank', 'HSDPS', 'FDPS', 'MS', 'FS'];
export const STORAGE_KEY = 'scrimside.v1';
export const MODES = ['Control', 'Push', 'Hybrid', 'Escort', 'Flashpoint'];

export function emptyGameDetails() {
  return { mode: '', ourBan: '', theirBan: '' };
}

export function modeRotation(games) {
  const played = new Set();
  let round = 1;
  for (const game of games) {
    if (!MODES.includes(game.mode)) continue;
    played.add(game.mode);
    if (played.size === MODES.length) {
      played.clear();
      round += 1;
    }
  }
  return { played: [...played], round };
}

export function emptyLineup() {
  return Object.fromEntries(ROLES.map(role => [role, '']));
}

export function newSession() {
  return { title: '', contact: '', attendees: [], lineup: emptyLineup(), gameLabel: '', nextGame: emptyGameDetails(), plans: [], games: [] };
}

export function newState() {
  return { version: 1, players: [], session: newSession() };
}

export function roleGroup(role) {
  return { Tank: 'tank', HSDPS: 'dps', FDPS: 'dps', MS: 'support', FS: 'support' }[role];
}

export function gamesFor(state, playerId, group = null) {
  return state.session.games.filter(game => game.lineup.some(slot => slot.playerId === playerId && (group === null || roleGroup(slot.role) === group))).length;
}

export function assignmentChoices(state, playerId) {
  const player = state.players.find(person => person.id === playerId);
  if (!player || !state.session.attendees.some(attendee => attendee.playerId === playerId)) return [];
  const roles = ROLES.filter(role => player.roles.includes(role));
  const current = roles.find(role => state.session.lineup[role] === playerId);
  if (current) return [current];
  if (roles.length <= 1) return roles;
  const open = roles.filter(role => !state.session.lineup[role]);
  return open.length ? open : roles;
}

export function assignPlayer(state, role, playerId, allowOffRole = false) {
  if (!ROLES.includes(role)) return;
  if (playerId && !state.session.attendees.some(attendee => attendee.playerId === playerId)) return;
  if (playerId && !state.players.some(player => player.id === playerId && (allowOffRole || player.roles.includes(role)))) return;
  for (const otherRole of ROLES) {
    if (playerId && state.session.lineup[otherRole] === playerId) state.session.lineup[otherRole] = '';
  }
  state.session.lineup[role] = playerId;
}

export function swapPlayers(state, firstId, secondId) {
  if (![firstId, secondId].every(playerId => state.players.some(player => player.id === playerId) && state.session.attendees.some(attendee => attendee.playerId === playerId))) throw new Error('Both players must be signed up.');
  for (const role of ROLES) {
    if (state.session.lineup[role] === firstId) state.session.lineup[role] = secondId;
    else if (state.session.lineup[role] === secondId) state.session.lineup[role] = firstId;
  }
}

export function removeAttendee(state, playerId) {
  state.session.attendees = state.session.attendees.filter(attendee => attendee.playerId !== playerId);
  for (const lineup of [state.session.lineup, ...state.session.plans.map(plan => plan.lineup)]) {
    for (const role of ROLES) if (lineup[role] === playerId) lineup[role] = '';
  }
}

export function lineupStatus(state) {
  const selected = ROLES.map(role => state.session.lineup[role]).filter(Boolean);
  const absent = selected.filter(playerId => !state.session.attendees.find(attendee => attendee.playerId === playerId)?.present);
  const offRole = ROLES.filter(role => {
    const player = state.players.find(person => person.id === state.session.lineup[role]);
    return player && !player.roles.includes(role);
  });
  return { filled: selected.length, absent, offRole, ready: selected.length === 5 && new Set(selected).size === 5 && absent.length === 0 };
}

export function recordGame(state, id, playedAt) {
  if (!lineupStatus(state).ready) throw new Error('Choose five different players and mark them all present first.');
  const lineup = ROLES.map(role => {
    const player = state.players.find(person => person.id === state.session.lineup[role]);
    return { role, playerId: player.id, name: player.name, battletag: player.battletag };
  });
  state.session.games.push({ id, label: state.session.gameLabel.trim(), ...state.session.nextGame, playedAt, lineup });
  state.session.gameLabel = '';
  state.session.nextGame = emptyGameDetails();
}

export function validateBackup(input) {
  const fail = () => { throw new Error('This file is not a valid Scrimside v1 backup. Nothing was changed.'); };
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const string = (value, max = 100) => typeof value === 'string' && value.length <= max;
  const list = (value, max) => Array.isArray(value) && value.length <= max;
  const identifier = value => string(value, 100) && value.length > 0;
  const unique = values => new Set(values).size === values.length;
  if (!object(input) || input.version !== 1 || !list(input.players, 1000) || !object(input.session)) fail();
  for (const player of input.players) {
    if (!object(player) || !identifier(player.id) || !string(player.name, 80) || !player.name.trim() || !string(player.battletag) || !string(player.notes, 500) || !list(player.roles, 5) || !unique(player.roles) || !player.roles.every(role => ROLES.includes(role))) fail();
    if (player.status !== undefined && !['default', 'trial', 'team'].includes(player.status)) fail();
  }
  if (!unique(input.players.map(player => player.id))) fail();
  const session = input.session;
  const checkGameDetails = details => {
    if (!object(details)) fail();
    if (details.mode !== undefined && details.mode !== '' && !MODES.includes(details.mode)) fail();
    for (const field of ['ourBan', 'theirBan']) if (details[field] !== undefined && !string(details[field])) fail();
  };
  if (session.nextGame !== undefined) checkGameDetails(session.nextGame);
  if (!string(session.title) || !string(session.contact) || !string(session.gameLabel) || !list(session.attendees, 1000) || !list(session.plans, 1000) || !list(session.games, 10000)) fail();
  const playerIds = new Set(input.players.map(player => player.id));
  for (const attendee of session.attendees) {
    if (!object(attendee) || !playerIds.has(attendee.playerId) || typeof attendee.present !== 'boolean') fail();
  }
  if (!unique(session.attendees.map(attendee => attendee.playerId))) fail();
  const attendeeIds = new Set(session.attendees.map(attendee => attendee.playerId));
  const checkLineup = lineup => {
    if (!object(lineup) || Object.keys(lineup).length !== 5 || !ROLES.every(role => lineup[role] === '' || attendeeIds.has(lineup[role]))) fail();
    if (!unique(ROLES.map(role => lineup[role]).filter(Boolean))) fail();
  };
  checkLineup(session.lineup);
  for (const plan of session.plans) {
    if (!object(plan) || !identifier(plan.id) || !string(plan.label)) fail();
    checkLineup(plan.lineup);
  }
  if (!unique(session.plans.map(plan => plan.id))) fail();
  for (const game of session.games) {
    checkGameDetails(game);
    if (!object(game) || !identifier(game.id) || !string(game.label) || !string(game.playedAt) || !Number.isFinite(Date.parse(game.playedAt)) || !list(game.lineup, 5) || game.lineup.length !== 5) fail();
    for (const slot of game.lineup) {
      if (!object(slot) || !ROLES.includes(slot.role) || !identifier(slot.playerId) || !string(slot.name, 80) || !slot.name.trim() || !string(slot.battletag)) fail();
    }
    if (!unique(game.lineup.map(slot => slot.role)) || !unique(game.lineup.map(slot => slot.playerId))) fail();
  }
  if (!unique(session.games.map(game => game.id))) fail();
  const normalized = JSON.parse(JSON.stringify(input));
  for (const player of normalized.players) player.status ??= 'default';
  normalized.session.nextGame = { ...emptyGameDetails(), ...normalized.session.nextGame };
  for (const game of normalized.session.games) {
    for (const [field, value] of Object.entries(emptyGameDetails())) game[field] ??= value;
  }
  return normalized;
}
