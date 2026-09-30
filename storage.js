import { STORAGE_KEY, STATE_VERSION, validateState } from './model.js';

export const THEME_KEY = 'scrims-helper.theme';
export const PANEL_SPLIT_KEY = 'scrims-helper.panelSplit';
export const BAR_LAYOUT_KEY = 'scrims-helper.barLayout';

export function readSavedState(storage) {
  return storage.getItem(STORAGE_KEY);
}

export function restoreSavedState(raw) {
  const input = JSON.parse(raw);
  if (input?.format !== 'scrims-helper-state' || input.version !== STATE_VERSION) {
    const error = new Error('This saved data isn’t supported');
    error.code = 'UNSUPPORTED_FORMAT';
    throw error;
  }
  return validateState(input);
}

export function readPreference(storage, key) {
  return storage.getItem(key);
}

export function isStateStorageKey(key) {
  return key === null || key === STORAGE_KEY;
}

export function deleteSavedData(storage) {
  for (const key of [STORAGE_KEY, THEME_KEY, PANEL_SPLIT_KEY, BAR_LAYOUT_KEY]) storage.removeItem(key);
}
