import { currentSession } from '../model.js';
import { MAPS, HEROES } from '../catalog.js';
import { catalogReference } from '../catalog-references.js';

export const mapRef = name => catalogReference(MAPS, name);
export const heroRef = name => catalogReference(HEROES, name);

export function setMap(state, name, mode = '') {
  currentSession(state).draft.map = mapRef(name);
  currentSession(state).draft.mode = mode || MAPS.find(map => map.id === currentSession(state).draft.map?.id)?.mode || '';
}
