import { STATE_VERSION } from './schema.js';
import { newState, allScrims, validateState } from './model.js';

export const BACKUP_CATEGORIES = { players: 'Player directory', scrims: 'Scrims', mapPoolPresets: 'Map pool presets', customGameCode: 'Custom game code' };
const owns = (object, key) => Object.hasOwn(object, key);

export function exportData(state, selected) {
  const data = {};
  if (selected.scrims && !selected.players) throw new Error('Scrims require the player directory.');
  if (selected.players) {
    data.statuses = state.statuses;
    data.statusOrder = state.statusOrder;
  }
  if (selected.scrims) data.scrims = { activeId: state.activeScrimId, items: allScrims(state) };
  for (const key of ['players', 'mapPoolPresets', 'customGameCode']) if (selected[key]) data[key] = state[key];
  if (!Object.keys(data).length) throw new Error('Choose something to export.');
  return { format: 'scrims-helper-export', version: STATE_VERSION, schema: 'scrims-helper-v1', data: structuredClone(data) };
}

function withScrims(state, scrims) {
  if (!scrims || Object.keys(scrims).length !== 2 || !Object.hasOwn(scrims, 'activeId') || !Object.hasOwn(scrims, 'items') || !Array.isArray(scrims.items) || !scrims.items.length) throw new Error('The scrim list is invalid.');
  const active = scrims.items.find(scrim => scrim?.id === scrims.activeId);
  if (!active) throw new Error('The active scrim is missing.');
  state.activeScrimId = active.id;
  state.scrims = scrims.items;
  return state;
}

export function readImport(input) {
  if (input?.format !== 'scrims-helper-export' || input.version !== STATE_VERSION || input.schema !== `scrims-helper-v${input.version}`) throw new Error('This backup uses an unsupported format.');
  if (Object.keys(input).some(key => !['format', 'version', 'schema', 'data'].includes(key))) throw new Error('Unrecognized export fields.');
  const data = input.data;
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Object.keys(data).length || Object.keys(data).some(key => !owns(BACKUP_CATEGORIES, key) && !['statuses', 'statusOrder'].includes(key))) throw new Error('Unrecognized export format.');
  if (owns(data, 'scrims') && !owns(data, 'players')) throw new Error('This file contains scrims without their player directory.');
  if (owns(data, 'statusOrder') && !owns(data, 'statuses')) throw new Error('Status order requires status definitions.');
  if (owns(data, 'statuses') && !owns(data, 'players')) throw new Error('Statuses require the player directory.');
  if (owns(data, 'players') && (!owns(data, 'statuses') || !owns(data, 'statusOrder'))) throw new Error('The player directory is missing its statuses or status order.');
  const state = newState();
  if (owns(data, 'statuses')) state.statuses = data.statuses;
  if (owns(data, 'statusOrder')) state.statusOrder = data.statusOrder;
  for (const key of ['players', 'mapPoolPresets', 'customGameCode']) if (owns(data, key)) state[key] = data[key];
  if (owns(data, 'scrims')) withScrims(state, data.scrims);
  const normalized = validateState(state);
  const result = structuredClone(data);
  if (owns(data, 'players')) result.statuses = normalized.statuses;
  if (owns(data, 'statusOrder')) result.statusOrder = normalized.statusOrder;
  for (const key of ['players', 'mapPoolPresets', 'customGameCode']) if (owns(data, key)) result[key] = normalized[key];
  if (owns(data, 'scrims')) result.scrims = { activeId: normalized.activeScrimId, items: allScrims(normalized) };
  return result;
}

export function planImport(current, data, choices) {
  const next = structuredClone(current);
  const summary = [];
  const mode = key => choices[key] || 'skip';
  for (const key of Object.keys(BACKUP_CATEGORIES)) {
    if (!owns(data, key) && mode(key) !== 'skip') throw new Error(`${BACKUP_CATEGORIES[key]} is not in this file.`);
    const allowed = ['scrims', 'players', 'mapPoolPresets'].includes(key) ? ['skip', 'merge', 'replace'] : ['skip', 'replace'];
    if (!allowed.includes(mode(key))) throw new Error('Invalid import option.');
  }
  if (mode('scrims') !== 'skip' && mode('players') === 'skip') throw new Error('Import the player directory to import scrims.');
  if (mode('players') === 'replace' && mode('scrims') !== 'replace' && !choices.clearScrims) throw new Error('Replacing players also requires replacing or clearing all scrims.');
  if (mode('players') === 'replace' && mode('scrims') === 'merge') throw new Error('Replace scrims instead of merging when replacing players.');
  function combine(key, existing, incoming, label = BACKUP_CATEGORIES[key]) {
    const ids = new Set(existing.map(item => item.id));
    if (mode(key) === 'replace') {
      summary.push(`${label}: replace all ${existing.length} with ${incoming.length}.`);
      return incoming;
    }
    const updates = incoming.filter(item => ids.has(item.id)).length;
    summary.push(`${label}: add ${incoming.length - updates}, update ${updates}, keep ${existing.length - updates}.`);
    const merged = new Map(existing.map(item => [item.id, item]));
    for (const item of incoming) merged.set(item.id, item);
    return [...merged.values()];
  }
  if (mode('players') !== 'skip') {
    const incoming = data.statuses;
    next.statuses = structuredClone(combine('players', current.statuses, incoming, 'Custom statuses'));
    if (mode('players') === 'replace') {
      next.statusOrder = [...data.statusOrder];
    } else {
      const importedOrder = data.statusOrder;
      next.statusOrder = [...importedOrder, ...current.statusOrder.filter(id => !importedOrder.includes(id))];
    }
    const names = next.statuses.map(status => status.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) throw new Error('Different statuses have the same name. Rename a status first, or replace the player directory.');
    summary.push(mode('players') === 'replace' ? 'Status order: use imported order.' : 'Status order: imported order first, then local-only statuses.');
  }
  for (const key of ['players', 'mapPoolPresets']) if (mode(key) !== 'skip') next[key] = combine(key, current[key], data[key], key === 'players' ? 'Players' : BACKUP_CATEGORIES[key]);
  if (mode('scrims') !== 'skip') {
    const items = combine('scrims', allScrims(next), data.scrims.items);
    withScrims(next, { items, activeId: mode('scrims') === 'merge' ? current.activeScrimId : data.scrims.activeId });
  } else if (mode('players') === 'replace' && choices.clearScrims) {
    const fresh = newState();
    next.activeScrimId = fresh.activeScrimId;
    next.scrims = fresh.scrims;
    summary.push(`Scrims: clear all ${allScrims(current).length}; start an empty scrim.`);
  }
  if (mode('customGameCode') === 'replace') {
    next.customGameCode = data.customGameCode;
    summary.push(`Custom game code: replace with ${data.customGameCode.trim() || 'DKEEH (default)'}.`);
  }
  if (mode('players') === 'merge' && mode('scrims') !== 'replace') summary.push('Imported player roles and statuses also apply to retained scrims. Saved scrim priorities are kept.');
  const names = next.mapPoolPresets.map(preset => preset.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) throw new Error('Different presets have the same name. Rename a preset first, or choose Replace or Skip for presets.');
  return { state: validateState(next), summary };
}
