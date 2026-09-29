export const STATE_VERSION = 1;
export const ROLES = ['Tank', 'HSDPS', 'FDPS', 'MS', 'FS'];
export const MODES = ['Control', 'Push', 'Hybrid', 'Escort', 'Flashpoint'];
export const OUTCOMES = ['win', 'loss', 'draw'];

export function validateState(input) {
  const fail = () => { throw new Error('This file is not a valid supported Scrims Helper backup. Nothing was changed.'); };
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const string = (value, max = 100) => typeof value === 'string' && value.length <= max;
  const identifier = value => string(value) && value.length > 0;
  const list = (value, max) => Array.isArray(value) && value.length <= max;
  const unique = values => new Set(values).size === values.length;
  const fields = (value, names) => object(value) && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
  const date = value => string(value) && Number.isFinite(Date.parse(value));
  const ids = value => list(value, 1000) && value.every(identifier) && unique(value);
  const reference = value => value === null || (fields(value, ['id', 'name']) && string(value.id) && string(value.name) && Boolean(value.name.trim()));
  const details = value => object(value) && reference(value.map) && reference(value.ourBan) && reference(value.theirBan) && (value.mode === '' || MODES.includes(value.mode));
  if (!fields(input, ['format', 'version', 'players', 'mapPoolPresets', 'customGameCode', 'activeScrimId', 'scrims']) || input.format !== 'scrims-helper-state' || input.version !== STATE_VERSION || !list(input.players, 1000) || !list(input.scrims, 100) || !input.scrims.length || !identifier(input.activeScrimId) || !string(input.customGameCode, 20) || !list(input.mapPoolPresets, 100)) fail();
  for (const player of input.players) {
    if (!fields(player, ['id', 'name', 'battletag', 'roles', 'status', 'notes', ...(Object.hasOwn(player || {}, 'offRoles') ? ['offRoles'] : [])]) || !identifier(player.id) || !string(player.name, 80) || !player.name.trim() || !string(player.battletag) || !string(player.notes, 500) || !list(player.roles, 5) || !unique(player.roles) || !player.roles.every(role => ROLES.includes(role)) || !['default', 'trial', 'team', 'ringer'].includes(player.status)) fail();
  }
  for (const player of input.players) {
    if (Object.hasOwn(player, 'offRoles') && (!list(player.offRoles, 5) || !unique(player.offRoles) || !player.offRoles.every(role => ROLES.includes(role) && !player.roles.includes(role)))) fail();
  }
  if (!unique(input.players.map(player => player.id))) fail();
  for (const preset of input.mapPoolPresets) {
    if (!fields(preset, ['id', 'name', 'mapIds']) || !identifier(preset.id) || !string(preset.name, 80) || !preset.name.trim() || !ids(preset.mapIds)) fail();
  }
  if (!unique(input.mapPoolPresets.map(preset => preset.id)) || !unique(input.mapPoolPresets.map(preset => preset.name.trim().toLowerCase()))) fail();
  const playerIds = new Set(input.players.map(player => player.id));
  for (const scrim of input.scrims) {
    if (!fields(scrim, ['id', 'createdAt', 'session']) || !identifier(scrim.id) || (scrim.createdAt !== '' && !date(scrim.createdAt))) fail();
    const session = scrim.session;
    if (!fields(session, ['title', 'contact', 'attendees', 'lineup', 'draft', 'activeGame', 'games', 'disabledMapIds']) || !string(session.title) || !string(session.contact) || !list(session.attendees, 1000) || !list(session.games, 10000) || !ids(session.disabledMapIds) || !fields(session.draft, ['map', 'mode', 'ourBan', 'theirBan']) || !details(session.draft)) fail();
    for (const attendee of session.attendees) {
      if (!fields(attendee, ['playerId', 'present']) || !playerIds.has(attendee.playerId) || typeof attendee.present !== 'boolean') fail();
    }
    const attendeeIds = session.attendees.map(attendee => attendee.playerId);
    if (!unique(attendeeIds) || !fields(session.lineup, ROLES) || !ROLES.every(role => session.lineup[role] === '' || attendeeIds.includes(session.lineup[role])) || !unique(Object.values(session.lineup).filter(Boolean))) fail();
    if (session.activeGame !== null && !object(session.activeGame)) fail();
    for (const game of [...session.games, ...(session.activeGame ? [session.activeGame] : [])]) {
      const keys = ['id', 'map', 'mode', 'ourBan', 'theirBan', 'outcome', 'playedAt', 'lineup', ...(Object.hasOwn(game || {}, 'startedAt') ? ['startedAt'] : [])];
      if (!fields(game, keys) || !identifier(game.id) || !details(game) || !date(game.playedAt) || (game.startedAt !== undefined && !date(game.startedAt)) || (game.outcome !== '' && !OUTCOMES.includes(game.outcome)) || !list(game.lineup, 5) || game.lineup.length !== 5) fail();
      for (const slot of game.lineup) {
        if (!fields(slot, ['role', 'playerId', 'name', 'battletag']) || !ROLES.includes(slot.role) || !identifier(slot.playerId) || !string(slot.name, 80) || !slot.name.trim() || !string(slot.battletag)) fail();
      }
      if (!unique(game.lineup.map(slot => slot.role)) || !unique(game.lineup.map(slot => slot.playerId))) fail();
    }
    if (!unique(session.games.map(game => game.id)) || (session.activeGame && (!date(session.activeGame.startedAt) || session.games.some(game => game.id === session.activeGame.id)))) fail();
  }
  if (!unique(input.scrims.map(scrim => scrim.id)) || !input.scrims.some(scrim => scrim.id === input.activeScrimId)) fail();
  return structuredClone(input);
}
