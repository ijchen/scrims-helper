import { STORAGE_KEY, validateBackup } from './model.js';

export const THEME_KEY = 'scrims-helper.theme';
export const PANEL_SPLIT_KEY = 'scrims-helper.panelSplit';
export const MIGRATION_REVIEW_DATE = '2026-10-12';
const legacyStateKey = 'scrimside.v1';
const legacyPreferences = { [THEME_KEY]: 'scrimside.theme', [PANEL_SPLIT_KEY]: 'scrimside.panelSplit' };

export function readSavedState(storage) {
  return storage.getItem(STORAGE_KEY) ?? storage.getItem(legacyStateKey);
}

export function restoreSavedState(storage, raw) {
  const state = validateBackup(JSON.parse(raw));
  const serialized = JSON.stringify(state);
  if (storage.getItem(STORAGE_KEY) !== serialized) storage.setItem(STORAGE_KEY, serialized);
  return state;
}

export function readPreference(storage, key) {
  const current = storage.getItem(key);
  if (current !== null) return current;
  const legacyKey = legacyPreferences[key];
  const legacy = legacyKey ? storage.getItem(legacyKey) : null;
  if (legacy === null) return null;
  const valid = key === THEME_KEY ? ['light', 'dark'].includes(legacy) : legacy.trim() !== '' && Number.isFinite(Number(legacy)) && Number(legacy) >= 25 && Number(legacy) <= 75;
  if (!valid) return null;
  try { storage.setItem(key, legacy); } catch {}
  return legacy;
}

export function isStateStorageKey(key) {
  return key === null || key === STORAGE_KEY || key === legacyStateKey;
}
