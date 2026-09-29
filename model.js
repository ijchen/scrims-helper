import { MAPS, HEROES } from './catalog.js';
import { normalizeSearch } from './search.js';
import { ROLES, MODES, OUTCOMES, STATE_VERSION } from './schema.js';
import { catalogItem, referenceName, gameDetails } from './catalog-references.js';
export { ROLES, MODES, OUTCOMES, STATE_VERSION, validateState } from './schema.js';

export function gameWarnings(session, game, id = '') {
  const timeline = [...session.games, ...(session.activeGame ? [session.activeGame] : [])];
  const index = id ? timeline.findIndex(entry => entry.id === id) : timeline.length;
  const previous = timeline.slice(0, Math.max(0, index));
  const warnings = { map: [], ourBan: [], theirBan: [] };
  const identity = value => value?.id || normalizeSearch(referenceName(value));
  const map = identity(game.map);
  const mode = game.mode || catalogItem(MAPS, game.map)?.mode;
  if (map && previous.some(entry => identity(entry.map) === map)) warnings.map.push('Map already played');
  if (mode && modeRotation(previous).played.includes(mode)) warnings.map.push('Mode already played this rotation');
  if (session.bansEnabled === false) return warnings;
  for (const field of ['ourBan', 'theirBan']) {
    const hero = identity(game[field]);
    if (hero && previous.some(entry => identity(entry[field]) === hero)) warnings[field].push('Already banned by this team');
  }
  const ourRole = catalogItem(HEROES, game.ourBan)?.role;
  const theirRole = catalogItem(HEROES, game.theirBan)?.role;
  if (ourRole && ourRole === theirRole) {
    warnings.ourBan.push('Both bans have the same role');
    warnings.theirBan.push('Both bans have the same role');
  }
  return warnings;
}

export const STORAGE_KEY = 'scrims-helper.state';

export function lineupSwaps(state) {
  const source = currentSession(state).activeGame || currentSession(state).games.at(-1);
  if (!source) throw new Error('Start a game first to compare lineups.');
  const next = ROLES.map(role => {
    const player = state.players.find(player => player.id === currentSession(state).lineup[role]);
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
  const game = currentSession(state).activeGame?.id === gameId ? currentSession(state).activeGame : currentSession(state).games.find(game => game.id === gameId);
  if (!game) throw new Error('Game not found.');
  game.outcome = outcome;
}

export function emptyGameDetails() {
  return { map: null, mode: '', ourBan: null, theirBan: null };
}

export function modeRotation(games) {
  const played = new Set();
  let round = 1;
  for (const game of games) {
    const mode = game.mode || catalogItem(MAPS, game.map)?.mode;
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
  return { title: '', contact: '', attendees: [], lineup: emptyLineup(), draft: emptyGameDetails(), activeGame: null, games: [], disabledMapIds: [], bansEnabled: true };
}

export function enabledMaps(session) {
  return MAPS.filter(map => !(session.disabledMapIds || []).includes(map.id));
}

export function newState() {
  const id = crypto.randomUUID();
  return { format: 'scrims-helper-state', version: STATE_VERSION, players: [], mapPoolPresets: [], customGameCode: '', activeScrimId: id, scrims: [{ id, createdAt: '', session: newSession() }] };
}

export function allScrims(state) {
  return state.scrims;
}

export function currentScrim(state) {
  return state.scrims.find(scrim => scrim.id === state.activeScrimId);
}

export function currentSession(state) {
  return currentScrim(state).session;
}

export function switchScrim(state, id) {
  if (!state.scrims.some(scrim => scrim.id === id)) throw new Error('Scrim not found.');
  state.activeScrimId = id;
}

export function createScrim(state, id, createdAt, copySetup = false) {
  if (state.scrims.some(scrim => scrim.id === id)) throw new Error('Scrim already exists.');
  if (state.scrims.length >= 100) throw new Error('You can save up to 100 scrims. Export a backup before deleting older scrims.');
  const session = newSession();
  if (copySetup) {
    session.attendees = currentSession(state).attendees.map(attendee => ({ ...attendee, present: false }));
    session.disabledMapIds = [...currentSession(state).disabledMapIds];
    session.bansEnabled = currentSession(state).bansEnabled !== false;
  }
  state.scrims.push({ id, createdAt, session });
  state.activeScrimId = id;
}

export function deleteScrim(state, id) {
  if (!state.scrims.some(scrim => scrim.id === id)) throw new Error('Scrim not found.');
  if (id === state.activeScrimId) {
    const next = state.scrims.filter(scrim => scrim.id !== id).sort((first, second) => second.createdAt.localeCompare(first.createdAt))[0];
    if (!next) throw new Error('Create another scrim before deleting the last one.');
    switchScrim(state, next.id);
  }
  state.scrims = state.scrims.filter(scrim => scrim.id !== id);
}

export function gameCodeFor(state) {
  return state.customGameCode?.trim() || 'DKEEH';
}

export function saveMapPoolPreset(state, id, name, replace = false) {
  const presets = state.mapPoolPresets;
  const existing = presets.find(preset => preset.id === id);
  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length > 80) throw new Error('Enter a preset name (up to 80 characters).');
  if (presets.some(preset => preset.id !== id && preset.name.toLowerCase() === trimmedName.toLowerCase())) throw new Error('A preset with that name already exists. Choose another name.');
  if (replace && !existing) throw new Error('Preset not found.');
  if (!replace && existing) throw new Error('Preset already exists.');
  if (!existing && presets.length >= 100) throw new Error('You can save up to 100 map pools.');
  const mapIds = enabledMaps(currentSession(state)).map(map => map.id);
  if (existing) Object.assign(existing, { name: trimmedName, mapIds });
  else presets.push({ id, name: trimmedName, mapIds });
}

export function loadMapPoolPreset(state, id) {
  const preset = state.mapPoolPresets.find(preset => preset.id === id);
  if (!preset) throw new Error('Preset not found.');
  currentSession(state).disabledMapIds = MAPS.filter(map => !preset.mapIds.includes(map.id)).map(map => map.id);
}

export function renameMapPoolPreset(state, id, name) {
  const preset = state.mapPoolPresets.find(preset => preset.id === id);
  const trimmedName = name.trim();
  if (!preset) throw new Error('Preset not found.');
  if (!trimmedName || trimmedName.length > 80) throw new Error('Enter a preset name (up to 80 characters).');
  if (state.mapPoolPresets.some(item => item.id !== id && item.name.toLowerCase() === trimmedName.toLowerCase())) throw new Error('A preset with that name already exists.');
  preset.name = trimmedName;
}

export function roleGroup(role) {
  return { Tank: 'tank', HSDPS: 'dps', FDPS: 'dps', MS: 'support', FS: 'support' }[role];
}

export function gamesFor(state, playerId, group = null) {
  return currentSession(state).games.filter(game => game.lineup.some(slot => slot.playerId === playerId && (group === null || roleGroup(slot.role) === group))).length;
}

export function preferredGamesFor(state, playerId) {
  const roles = state.players.find(player => player.id === playerId)?.roles || [];
  const session = currentSession(state);
  return [...session.games, ...(session.activeGame ? [session.activeGame] : [])].filter(game => game.lineup.some(slot => slot.playerId === playerId && roles.includes(slot.role))).length;
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

export function playableRoles(player) {
  return [...player.roles, ...(player.offRoles || [])];
}

function autofillCandidates(state) {
  const lineup = { ...currentSession(state).lineup };
  const fixed = ROLES.map(role => lineup[role]).filter(Boolean);
  if (new Set(fixed).size !== fixed.length || fixed.some(id => !state.players.some(player => player.id === id))) throw new Error('Check the selected players before autofilling.');
  const emptyRoles = ROLES.filter(role => !lineup[role]);
  const present = new Set(currentSession(state).attendees.filter(attendee => attendee.present).map(attendee => attendee.playerId));
  const candidates = state.players.filter(player => present.has(player.id) && !fixed.includes(player.id) && emptyRoles.some(role => playableRoles(player).includes(role)));
  const fullMask = (1 << emptyRoles.length) - 1;
  const subsets = Array.from({ length: fullMask }, (_, index) => index + 1).map(mask => ({ mask, roles: emptyRoles.filter((_, index) => mask & (1 << index)) })).sort((first, second) => first.roles.length - second.roles.length);
  for (const { roles } of subsets) {
    const available = candidates.filter(player => roles.some(role => playableRoles(player).includes(role))).length;
    if (available < roles.length) {
      if (roles.length === 1) throw new Error(`No available present player for ${roles[0]}.`);
      throw new Error(`${roles.join(' / ')} need ${roles.length} different players; only ${available} eligible ${available === 1 ? 'player is' : 'players are'} available.`);
    }
  }
  return { lineup, emptyRoles, candidates, fullMask };
}

export function autofillUnavailableReason(state) {
  try {
    const { emptyRoles } = autofillCandidates(state);
    return emptyRoles.length ? '' : 'Lineup is full';
  } catch (error) { return error.message; }
}

export function autofillLineup(state, chooseRandom = randomBelow) {
  const { lineup, emptyRoles, candidates, fullMask } = autofillCandidates(state);
  if (!emptyRoles.length) return lineup;
  const history = [...currentSession(state).games, ...(currentSession(state).activeGame ? [currentSession(state).activeGame] : [])];
  const counts = new Map(candidates.map(player => [player.id, { total: 0, fills: 0, mainRoles: new Set(player.roles), roles: Object.fromEntries(ROLES.map(role => [role, 0])) }]));
  for (const game of history) {
    for (const slot of game.lineup) {
      const count = counts.get(slot.playerId);
      if (count) {
        if (count.mainRoles.has(slot.role)) { count.total += 1; count.roles[slot.role] += 1; }
        else count.fills += 1;
      }
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
      if (!playableRoles(player).includes(role)) return null;
      if (!player.roles.includes(role)) return [0n, 0, 0, -(count.fills + 1), 0];
      const group = roleGroup(role);
      const subroles = ROLES.filter(subrole => roleGroup(subrole) === group && player.roles.includes(subrole));
      return [denominator / BigInt(count.total + 1), Number(player.status === 'trial'), balanceGain(groupCounts, groups.indexOf(group)), 0, balanceGain(subroles.map(subrole => count.roles[subrole]), subroles.indexOf(role))];
    })];
  }));
  const compare = (first, second) => {
    for (let index = 0; index < first.length; index += 1) {
      if (first[index] !== second[index]) return first[index] > second[index] ? 1 : -1;
    }
    return 0;
  };
  let options = new Map([[0, { score: [0n, 0, 0, 0, 0], ways: 1n, lineup }]]);
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
  if (!player || !currentSession(state).attendees.some(attendee => attendee.playerId === playerId)) return [];
  const roles = ROLES.filter(role => player.roles.includes(role));
  const current = roles.find(role => currentSession(state).lineup[role] === playerId);
  if (current) return [current];
  if (roles.length <= 1) return roles;
  const open = roles.filter(role => !currentSession(state).lineup[role]);
  return open.length ? open : roles;
}

export function assignPlayer(state, role, playerId, allowOffRole = false) {
  if (!ROLES.includes(role)) return;
  if (playerId && !currentSession(state).attendees.some(attendee => attendee.playerId === playerId)) return;
  if (playerId && !state.players.some(player => player.id === playerId && (allowOffRole || player.roles.includes(role)))) return;
  for (const otherRole of ROLES) {
    if (playerId && currentSession(state).lineup[otherRole] === playerId) currentSession(state).lineup[otherRole] = '';
  }
  currentSession(state).lineup[role] = playerId;
}

export function swapPlayers(state, firstId, secondId) {
  if (![firstId, secondId].every(playerId => state.players.some(player => player.id === playerId) && currentSession(state).attendees.some(attendee => attendee.playerId === playerId))) throw new Error('Both players must be signed up.');
  for (const role of ROLES) {
    if (currentSession(state).lineup[role] === firstId) currentSession(state).lineup[role] = secondId;
    else if (currentSession(state).lineup[role] === secondId) currentSession(state).lineup[role] = firstId;
  }
}

export function removeAttendee(state, playerId, scrimId = state.activeScrimId) {
  const session = state.scrims.find(scrim => scrim.id === scrimId)?.session;
  if (!session) return;
  session.attendees = session.attendees.filter(attendee => attendee.playerId !== playerId);
  for (const role of ROLES) if (session.lineup[role] === playerId) session.lineup[role] = '';
}

export function lineupStatus(state) {
  const selected = ROLES.map(role => currentSession(state).lineup[role]).filter(Boolean);
  const absent = selected.filter(playerId => !currentSession(state).attendees.find(attendee => attendee.playerId === playerId)?.present);
  const offRole = ROLES.filter(role => {
    const player = state.players.find(person => person.id === currentSession(state).lineup[role]);
    return player && !player.roles.includes(role);
  });
  return { filled: selected.length, absent, offRole, ready: selected.length === 5 && new Set(selected).size === 5 && absent.length === 0 };
}

function captureGame(state, id, playedAt) {
  if (!lineupStatus(state).ready) throw new Error('Choose five different players and mark them all present first.');
  const lineup = ROLES.map(role => {
    const player = state.players.find(person => person.id === currentSession(state).lineup[role]);
    return { role, playerId: player.id, name: player.name, battletag: player.battletag };
  });
  return { id, ...gameDetails(currentSession(state).draft), ...(currentSession(state).bansEnabled === false ? { ourBan: null, theirBan: null } : {}), outcome: '', playedAt, lineup };
}

export function startGame(state, id, startedAt, markPresent = false) {
  if (currentSession(state).activeGame) throw new Error('Finish the current game first.');
  const selected = new Set(Object.values(currentSession(state).lineup));
  const attendees = markPresent ? currentSession(state).attendees.map(attendee => ({ ...attendee, present: attendee.present || selected.has(attendee.playerId) })) : currentSession(state).attendees;
  const game = captureGame({ ...state, scrims: state.scrims.map(scrim => scrim.id === state.activeScrimId ? { ...scrim, session: { ...scrim.session, attendees } } : scrim) }, id, startedAt);
  currentSession(state).attendees = attendees;
  currentSession(state).activeGame = { ...game, startedAt };
  currentSession(state).draft = emptyGameDetails();
}

export function finishGame(state, playedAt) {
  if (!currentSession(state).activeGame) throw new Error('Start a game first.');
  const game = currentSession(state).activeGame;
  currentSession(state).games.push({ ...game, playedAt });
  currentSession(state).activeGame = null;
}

export function reopenLastGame(state) {
  if (currentSession(state).activeGame) throw new Error('Finish or cancel the current game first.');
  if (!currentSession(state).games.length) throw new Error('No completed game to reopen.');
  const game = currentSession(state).games.pop();
  currentSession(state).activeGame = { ...game, startedAt: game.startedAt || game.playedAt };
}

export function cancelActiveGame(state) {
  if (!currentSession(state).activeGame) return;
  const game = currentSession(state).activeGame;
  if (Object.values(currentSession(state).draft).some(Boolean)) throw new Error('Clear the upcoming map and bans before returning this game to upcoming.');
  currentSession(state).draft = gameDetails(game);
  for (const role of ROLES) {
    const slot = game.lineup.find(slot => slot.role === role);
    currentSession(state).lineup[role] = currentSession(state).attendees.some(attendee => attendee.playerId === slot.playerId) ? slot.playerId : '';
  }
  currentSession(state).activeGame = null;
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
  if (currentSession(state).activeGame) throw new Error('Finish the current game first.');
  currentSession(state).games.push(captureGame(state, id, playedAt));
  currentSession(state).draft = emptyGameDetails();
}
