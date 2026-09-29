import { findCatalogItem } from './search.js';

export function catalogReference(catalog, name) {
  if (!name.trim()) return null;
  const item = findCatalogItem(catalog, name);
  return { id: item?.id || '', name };
}

export function catalogItem(catalog, reference) {
  return reference?.id ? catalog.find(item => item.id === reference.id) : undefined;
}

export function referenceName(reference) {
  return reference?.name || '';
}

export function gameDetails(game) {
  return structuredClone({ map: game.map, mode: game.mode, ourBan: game.ourBan, theirBan: game.theirBan });
}
