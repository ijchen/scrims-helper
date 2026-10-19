export const ROLES = ['Tank', 'HSDPS', 'FDPS', 'MS', 'FS'];
export const SLOTS = ['tank', 'dps1', 'dps2', 'support1', 'support2'];
export const DEFAULT_SLOT_ROLES = { tank: ['Tank'], dps1: ['HSDPS'], dps2: ['FDPS'], support1: ['MS'], support2: ['FS'] };
export const slotGroup = slot => ({ tank: 'tank', dps1: 'dps', dps2: 'dps', support1: 'support', support2: 'support' })[slot];
export const roleGroup = role => ({ Tank: 'tank', HSDPS: 'dps', FDPS: 'dps', MS: 'support', FS: 'support' })[role];
export const roleLabel = roles => roles.join(' / ');
export const rolesInclude = (roles, playedRoles) => playedRoles.every(role => roles.includes(role));
export const validSlotRoles = (slot, roles) => SLOTS.includes(slot) && Array.isArray(roles) && roles.length > 0 && roles.length <= 2 && new Set(roles).size === roles.length && roles.every(role => ROLES.includes(role) && roleGroup(role) === slotGroup(slot));

// Equally ranked alternatives stay unresolved. Display order is canonical.
export function resolveRoles(roles, player) {
  const mains = roles.filter(role => player?.roles.includes(role));
  const fills = roles.filter(role => player?.offRoles?.includes(role));
  const possible = mains.length ? mains : fills.length ? fills : roles;
  return ROLES.filter(role => possible.includes(role));
}
