import { MAPS, HEROES } from './catalog.js';
import { findCatalogItem, normalizeSearch } from './search.js';

export function gameWarnings(session, game, id = '') {
  const timeline = [...session.games, ...(session.activeGame ? [session.activeGame] : [])];
  const index = id ? timeline.findIndex(entry => entry.id === id) : timeline.length;
  const previous = timeline.slice(0, Math.max(0, index));
  const warnings = { label: [], ourBan: [], theirBan: [] };
  const identity = (catalog, value) => findCatalogItem(catalog, value)?.id || normalizeSearch(value || '');
  const map = identity(MAPS, game.label);
  const mode = findCatalogItem(MAPS, game.label)?.mode || game.mode;
  if (map && previous.some(entry => identity(MAPS, entry.label) === map)) warnings.label.push('Map already played');
  if (mode && modeRotation(previous).played.includes(mode)) warnings.label.push('Mode already played this rotation');
  for (const field of ['ourBan', 'theirBan']) {
    const hero = identity(HEROES, game[field]);
    if (hero && previous.some(entry => identity(HEROES, entry[field]) === hero)) warnings[field].push('Already banned by this team');
  }
  const ourRole = findCatalogItem(HEROES, game.ourBan)?.role;
  const theirRole = findCatalogItem(HEROES, game.theirBan)?.role;
  if (ourRole && ourRole === theirRole) {
    warnings.ourBan.push('Both bans have the same role');
    warnings.theirBan.push('Both bans have the same role');
  }
  return warnings;
}

export const ROLES = ['Tank', 'HSDPS', 'FDPS', 'MS', 'FS'];
export const STORAGE_KEY = 'scrims-helper.state';
export const STATE_VERSION = 2;
export const MODES = ['Control', 'Push', 'Hybrid', 'Escort', 'Flashpoint'];
export const OUTCOMES = ['win', 'loss', 'draw'];

export function lineupSwaps(state) {
  const source = state.session.activeGame || state.session.games.at(-1);
  if (!source) throw new Error('Start a game first to compare lineups.');
  const next = ROLES.map(role => {
    const player = state.players.find(player => player.id === state.session.lineup[role]);
    return player ? { role, playerId: player.id, name: player.name, battletag: player.battletag } : null;
  });
  if (next.some(slot => !slot) || new Set(next.map(slot => slot.playerId)).size !== 5) throw new Error('Fill all five lineup slots to see swaps.');
  const incoming = next.filter(slot => !source.lineup.some(previous => previous.playerId === slot.playerId));
  const outgoing = ROLES.map(role => source.lineup.find(slot => slot.role === role)).filter(slot => slot && !next.some(player => player.playerId === slot.playerId));
  let best = { score: Infinity, pairs: [] };
  function match(remaining, pairs, score) {
    if (score >= best.score) return;
    if (pairs.length === incoming.length) { best = { score, pairs }; return; }
    const player = incoming[pairs.length];
    remaining.forEach((previous, index) => {
      const cost = player.role === previous.role ? 0 : roleGroup(player.role) === roleGroup(previous.role) ? 1 : 10;
      match(remaining.filter((_, otherIndex) => otherIndex !== index), [...pairs, { incoming: player, outgoing: previous }], score + cost);
    });
  }
  match(outgoing, [], 0);
  const name = player => player.battletag?.split('#')[0].trim() || player.name;
  return { source, pairs: best.pairs, message: best.pairs.map(pair => `${name(pair.incoming)} in for ${name(pair.outgoing)}`).join(', ') };
}

export function setGameOutcome(state, gameId, outcome) {
  if (outcome !== '' && !OUTCOMES.includes(outcome)) throw new Error('Unknown game result.');
  const game = state.session.activeGame?.id === gameId ? state.session.activeGame : state.session.games.find(game => game.id === gameId);
  if (!game) throw new Error('Game not found.');
  game.outcome = outcome;
}

export function emptyGameDetails() {
  return { mode: '', ourBan: '', theirBan: '' };
}

export function modeRotation(games) {
  const played = new Set();
  let round = 1;
  for (const game of games) {
    const mode = findCatalogItem(MAPS, game.label)?.mode || game.mode;
    if (!MODES.includes(mode)) continue;
    played.add(mode);
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
  return { title: '', contact: '', attendees: [], lineup: emptyLineup(), gameLabel: '', nextGame: emptyGameDetails(), activeGame: null, games: [] };
}

export function newState() {
  return { version: STATE_VERSION, players: [], session: newSession() };
}

export function roleGroup(role) {
  return { Tank: 'tank', HSDPS: 'dps', FDPS: 'dps', MS: 'support', FS: 'support' }[role];
}

export function gamesFor(state, playerId, group = null) {
  return state.session.games.filter(game => game.lineup.some(slot => slot.playerId === playerId && (group === null || roleGroup(slot.role) === group))).length;
}

function randomBelow(limit) {
  if (limit === 1n) return 0n;
  const bits = limit.toString(2).length;
  const words = new Uint32Array(Math.ceil(bits / 32));
  const mask = (1n << BigInt(bits)) - 1n;
  let value;
  do {
    crypto.getRandomValues(words);
    value = words.reduce((total, word) => (total << 32n) | BigInt(word), 0n) & mask;
  } while (value >= limit);
  return value;
}

export function autofillLineup(state, chooseRandom = randomBelow) {
  const lineup = { ...state.session.lineup };
  const fixed = ROLES.map(role => lineup[role]).filter(Boolean);
  if (new Set(fixed).size !== fixed.length || fixed.some(id => !state.players.some(player => player.id === id))) throw new Error('Check the selected players before autofilling.');
  const emptyRoles = ROLES.filter(role => !lineup[role]);
  if (!emptyRoles.length) return lineup;
  const present = new Set(state.session.attendees.filter(attendee => attendee.present).map(attendee => attendee.playerId));
  const candidates = state.players.filter(player => present.has(player.id) && !fixed.includes(player.id) && emptyRoles.some(role => player.roles.includes(role)));
  const fullMask = (1 << emptyRoles.length) - 1;
  const subsets = Array.from({ length: fullMask }, (_, index) => index + 1).map(mask => ({ mask, roles: emptyRoles.filter((_, index) => mask & (1 << index)) })).sort((first, second) => first.roles.length - second.roles.length);
  for (const { roles } of subsets) {
    const available = candidates.filter(player => roles.some(role => player.roles.includes(role))).length;
    if (available < roles.length) {
      if (roles.length === 1) throw new Error(`No available present player for ${roles[0]}.`);
      throw new Error(`${roles.join(' / ')} need ${roles.length} different players; only ${available} eligible ${available === 1 ? 'player is' : 'players are'} available.`);
    }
  }
  const history = [...state.session.games, ...(state.session.activeGame ? [state.session.activeGame] : [])];
  const counts = new Map(candidates.map(player => [player.id, { total: 0, roles: Object.fromEntries(ROLES.map(role => [role, 0])) }]));
  for (const game of history) {
    for (const slot of game.lineup) {
      const count = counts.get(slot.playerId);
      if (count) { count.total += 1; count.roles[slot.role] += 1; }
    }
  }
  const gcd = (first, second) => {
    while (second) [first, second] = [second, first % second];
    return first;
  };
  const denominator = candidates.reduce((multiple, player) => {
    const divisor = BigInt(counts.get(player.id).total + 1);
    return multiple / gcd(multiple, divisor) * divisor;
  }, 1n);
  const balanceGain = (values, index) => (12 * values.reduce((sum, count) => sum + count, 0) + 6) / values.length - 12 * values[index] - 6;
  const scores = new Map(candidates.map(player => {
    const count = counts.get(player.id);
    const groups = [...new Set(player.roles.map(roleGroup))];
    const groupCounts = groups.map(group => ROLES.filter(role => roleGroup(role) === group).reduce((sum, role) => sum + count.roles[role], 0));
    return [player.id, emptyRoles.map(role => {
      if (!player.roles.includes(role)) return null;
      const group = roleGroup(role);
      const subroles = ROLES.filter(subrole => roleGroup(subrole) === group && player.roles.includes(subrole));
      return [denominator / BigInt(count.total + 1), balanceGain(groupCounts, groups.indexOf(group)), balanceGain(subroles.map(subrole => count.roles[subrole]), subroles.indexOf(role)), Number(player.status === 'trial')];
    })];
  }));
  const compare = (first, second) => {
    for (let index = 0; index < first.length; index += 1) {
      if (first[index] !== second[index]) return first[index] > second[index] ? 1 : -1;
    }
    return 0;
  };
  let options = new Map([[0, { score: [0n, 0, 0, 0], ways: 1n, lineup }]]);
  for (const player of candidates) {
    const next = new Map(options);
    for (const [mask, option] of options) {
      emptyRoles.forEach((role, index) => {
        const gain = scores.get(player.id)[index];
        if (!gain || mask & (1 << index)) return;
        const nextMask = mask | (1 << index);
        const score = option.score.map((value, criterion) => value + gain[criterion]);
        const existing = next.get(nextMask);
        const comparison = existing ? compare(score, existing.score) : 1;
        if (comparison < 0) return;
        const proposal = { score, ways: option.ways, lineup: { ...option.lineup, [role]: player.id } };
        if (comparison > 0) next.set(nextMask, proposal);
        else {
          const ways = existing.ways + proposal.ways;
          const selected = chooseRandom(ways) < proposal.ways ? proposal : existing;
          next.set(nextMask, { ...selected, ways });
        }
      });
    }
    options = next;
  }
  return options.get(fullMask).lineup;
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
  for (const role of ROLES) if (state.session.lineup[role] === playerId) state.session.lineup[role] = '';
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

function captureGame(state, id, playedAt) {
  if (!lineupStatus(state).ready) throw new Error('Choose five different players and mark them all present first.');
  const lineup = ROLES.map(role => {
    const player = state.players.find(person => person.id === state.session.lineup[role]);
    return { role, playerId: player.id, name: player.name, battletag: player.battletag };
  });
  return { id, label: state.session.gameLabel.trim(), ...state.session.nextGame, mode: findCatalogItem(MAPS, state.session.gameLabel)?.mode || state.session.nextGame.mode, outcome: '', playedAt, lineup };
}

export function startGame(state, id, startedAt, markPresent = false) {
  if (state.session.activeGame) throw new Error('Finish the current game first.');
  const selected = new Set(Object.values(state.session.lineup));
  const attendees = markPresent ? state.session.attendees.map(attendee => ({ ...attendee, present: attendee.present || selected.has(attendee.playerId) })) : state.session.attendees;
  const game = captureGame({ ...state, session: { ...state.session, attendees } }, id, startedAt);
  state.session.attendees = attendees;
  state.session.activeGame = { ...game, startedAt };
  state.session.gameLabel = '';
  state.session.nextGame = emptyGameDetails();
}

export function finishGame(state, playedAt) {
  if (!state.session.activeGame) throw new Error('Start a game first.');
  const game = state.session.activeGame;
  state.session.games.push({ ...game, playedAt });
  state.session.activeGame = null;
}

export function reopenLastGame(state) {
  if (state.session.activeGame) throw new Error('Finish or cancel the current game first.');
  if (!state.session.games.length) throw new Error('No completed game to reopen.');
  const game = state.session.games.pop();
  state.session.activeGame = { ...game, startedAt: game.startedAt || game.playedAt };
}

export function cancelActiveGame(state) {
  if (!state.session.activeGame) return;
  const game = state.session.activeGame;
  if (state.session.gameLabel || Object.values(state.session.nextGame).some(Boolean)) throw new Error('Clear the upcoming map and bans before returning this game to upcoming.');
  state.session.gameLabel = game.label;
  state.session.nextGame = { mode: game.mode, ourBan: game.ourBan, theirBan: game.theirBan };
  for (const role of ROLES) {
    const slot = game.lineup.find(slot => slot.role === role);
    state.session.lineup[role] = state.session.attendees.some(attendee => attendee.playerId === slot.playerId) ? slot.playerId : '';
  }
  state.session.activeGame = null;
}

export function replaceGamePlayer(state, game, role, playerId) {
  if (!ROLES.includes(role)) throw new Error('Unknown role.');
  const target = game.lineup.find(slot => slot.role === role);
  if (!target) throw new Error('Missing game slot.');
  const existing = game.lineup.find(slot => slot.playerId === playerId);
  if (existing) {
    const previousRole = existing.role;
    existing.role = role;
    target.role = previousRole;
  } else {
    const player = state.players.find(player => player.id === playerId);
    if (!player) throw new Error('Player not found.');
    Object.assign(target, { playerId, name: player.name, battletag: player.battletag });
  }
  game.lineup.sort((first, second) => ROLES.indexOf(first.role) - ROLES.indexOf(second.role));
}

export function recordGame(state, id, playedAt) {
  if (state.session.activeGame) throw new Error('Finish the current game first.');
  state.session.games.push(captureGame(state, id, playedAt));
  state.session.gameLabel = '';
  state.session.nextGame = emptyGameDetails();
}

export function validateBackup(input) {
  const fail = () => { throw new Error('This file is not a valid supported Scrims Helper backup. Nothing was changed.'); };
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const string = (value, max = 100) => typeof value === 'string' && value.length <= max;
  const list = (value, max) => Array.isArray(value) && value.length <= max;
  const identifier = value => string(value, 100) && value.length > 0;
  const unique = values => new Set(values).size === values.length;
  if (!object(input) || ![1, STATE_VERSION].includes(input.version) || !list(input.players, 1000) || !object(input.session)) fail();
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
  if (!string(session.title) || !string(session.contact) || !string(session.gameLabel) || !list(session.attendees, 1000) || !list(session.games, 10000)) fail();
  if (input.version === 1 ? !list(session.plans, 1000) : session.plans !== undefined) fail();
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
  for (const plan of session.plans || []) {
    if (!object(plan) || !identifier(plan.id) || !string(plan.label)) fail();
    checkLineup(plan.lineup);
  }
  if (session.plans && !unique(session.plans.map(plan => plan.id))) fail();
  for (const game of [...session.games, ...(session.activeGame ? [session.activeGame] : [])]) {
    checkGameDetails(game);
    if (game.outcome !== undefined && game.outcome !== '' && !OUTCOMES.includes(game.outcome)) fail();
    if (!object(game) || !identifier(game.id) || !string(game.label) || !string(game.playedAt) || !Number.isFinite(Date.parse(game.playedAt)) || !list(game.lineup, 5) || game.lineup.length !== 5) fail();
    for (const slot of game.lineup) {
      if (!object(slot) || !ROLES.includes(slot.role) || !identifier(slot.playerId) || !string(slot.name, 80) || !slot.name.trim() || !string(slot.battletag)) fail();
    }
    if (!unique(game.lineup.map(slot => slot.role)) || !unique(game.lineup.map(slot => slot.playerId))) fail();
    if (game.startedAt !== undefined && (!string(game.startedAt) || !Number.isFinite(Date.parse(game.startedAt)))) fail();
  }
  if (session.activeGame !== undefined && session.activeGame !== null && !object(session.activeGame)) fail();
  if (session.activeGame && (!string(session.activeGame.startedAt) || !Number.isFinite(Date.parse(session.activeGame.startedAt)) || session.games.some(game => game.id === session.activeGame.id))) fail();
  if (!unique(session.games.map(game => game.id))) fail();
  const normalized = JSON.parse(JSON.stringify(input));
  normalized.version = STATE_VERSION;
  delete normalized.session.plans;
  for (const player of normalized.players) player.status ??= 'default';
  normalized.session.nextGame = { ...emptyGameDetails(), ...normalized.session.nextGame };
  normalized.session.activeGame ??= null;
  for (const game of [...normalized.session.games, ...(normalized.session.activeGame ? [normalized.session.activeGame] : [])]) {
    game.outcome ??= '';
    for (const [field, value] of Object.entries(emptyGameDetails())) game[field] ??= value;
  }
  return normalized;
}
