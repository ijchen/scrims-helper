import { PRIORITIES, validateStatus } from './schema.js';

const DEFAULT_STATUS = Object.freeze({ id: 'default', name: 'Default', color: '#808080', priority: '1', showBadge: false });

export function orderedStatuses(state) {
  const statuses = [...state.statuses, DEFAULT_STATUS];
  const byId = new Map(statuses.map(status => [status.id, status]));
  return state.statusOrder.map(id => byId.get(id));
}

export function moveStatus(state, id, direction) {
  if (![1, -1].includes(direction)) throw new Error('Invalid status move.');
  const order = orderedStatuses(state).map(status => status.id);
  const index = order.indexOf(id);
  if (index < 0) throw new Error('Status not found.');
  const target = index + direction;
  if (target < 0 || target >= order.length) return;
  [order[index], order[target]] = [order[target], order[index]];
  state.statusOrder = order;
}

export function placeStatus(state, id, targetId, after = false) {
  const order = orderedStatuses(state).map(status => status.id);
  if (!order.includes(id) || !order.includes(targetId)) throw new Error('Status not found.');
  if (id === targetId) return;
  const remaining = order.filter(statusId => statusId !== id);
  remaining.splice(remaining.indexOf(targetId) + Number(after), 0, id);
  state.statusOrder = remaining;
}

export function sortedDirectoryPlayers(state) {
  const ranks = new Map(orderedStatuses(state).map((status, index) => [status.id, index]));
  return [...state.players].sort((a, b) => ranks.get(a.status) - ranks.get(b.status) || a.name.localeCompare(b.name));
}

export function statusFor(state, player) {
  return state.statuses.find(status => status.id === player?.status) || DEFAULT_STATUS;
}

export function effectivePriority(state, attendee) {
  const value = attendee.priority;
  return PRIORITIES.find(option => option.value === value);
}

export function saveStatus(state, status) {
  validateStatus(status);
  const saved = { ...status, name: status.name.trim() };
  const index = state.statuses.findIndex(item => item.id === saved.id);
  if (state.statuses.some(item => item.id !== saved.id && item.name.trim().toLowerCase() === saved.name.toLowerCase())) throw new Error('A status with that name already exists.');
  if (index < 0 && state.statuses.length >= 100) throw new Error('You can save up to 100 statuses.');
  if (index < 0) {
    state.statuses.push(saved);
    state.statusOrder.push(saved.id);
  }
  else state.statuses[index] = saved;
}

export function deleteStatus(state, id) {
  if (id === 'default' || !state.statuses.some(status => status.id === id)) throw new Error('Status not found.');
  state.statuses = state.statuses.filter(status => status.id !== id);
  state.statusOrder = state.statusOrder.filter(statusId => statusId !== id);
  for (const player of state.players) if (player.status === id) player.status = 'default';
}
