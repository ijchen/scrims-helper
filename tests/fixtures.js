import { currentSession } from '../model.js';
import { MAPS, HEROES } from '../catalog.js';
import { catalogReference } from '../catalog-references.js';

export const mapRef = name => catalogReference(MAPS, name);
export const heroRef = name => catalogReference(HEROES, name);

export function setMap(state, name, mode = '') {
  currentSession(state).draft.map = mapRef(name);
  currentSession(state).draft.mode = mode || MAPS.find(map => map.id === currentSession(state).draft.map?.id)?.mode || '';
}

// Default-layout fixture helpers keep player-role scenarios readable.
export const defaultSlot = role => ({ Tank: 'tank', HSDPS: 'dps1', FDPS: 'dps2', MS: 'support1', FS: 'support2' })[role];
export const snapshotRole = label => {
  const roles = label.split(' / ');
  return { slot: defaultSlot(roles[0]), roles };
};
