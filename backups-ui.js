import { BACKUP_CATEGORIES, exportData, readImport, planImport } from './backups.js';
import { STORAGE_KEY } from './model.js';
import { deleteSavedData } from './storage.js';

const element = id => document.getElementById(id);

export function createBackupsUI({ getState, isRecovering, canImport, notify }) {
  let incoming = null;
  let choices = {};
  let plan = null;
  function download(value) {
    const url = URL.createObjectURL(new Blob([value], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `scrims-helper-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportSelection() {
    return Object.fromEntries([...element('export-options').querySelectorAll('input')].map(input => [input.dataset.category, input.checked]));
  }
  function syncExport() {
    const players = element('export-options').querySelector('[data-category="players"]');
    const scrims = element('export-options').querySelector('[data-category="scrims"]');
    if (!players.checked) scrims.checked = false;
    scrims.disabled = !players.checked;
    element('scrims-export-dependency').hidden = players.checked;
    element('export-download').disabled = !Object.values(exportSelection()).some(Boolean);
  }
  element('export-button').onclick = () => {
    element('export-options').innerHTML = Object.entries(BACKUP_CATEGORIES).map(([key, label]) => `<label class="transfer-check"><input type="checkbox" data-category="${key}" ${key === 'customGameCode' ? '' : 'checked'} ${key === 'scrims' ? 'aria-describedby="scrims-export-dependency"' : ''}><span>${label}</span>${key === 'scrims' ? '<small id="scrims-export-dependency" class="muted" hidden>Requires directory</small>' : ''}</label>`).join('');
    syncExport();
    element('export-dialog').showModal();
  };
  element('export-options').onchange = syncExport;
  element('export-download').onclick = () => {
    download(JSON.stringify(exportData(getState(), exportSelection()), null, 2));
    element('export-dialog').close();
  };
  function preview() {
    const clearing = choices.players === 'replace' && choices.scrims !== 'replace';
    element('clear-import-scrims-row').hidden = !clearing;
    choices.clearScrims = clearing && element('clear-import-scrims').checked;
    plan = null;
    try {
      if (!canImport()) throw new Error('Another tab changed your data. Reload before importing.');
      const candidate = planImport(getState(), incoming, choices);
      if (!candidate.summary.length) throw new Error('Choose something to import.');
      plan = candidate;
      element('import-preview').textContent = (isRecovering() ? 'This import replaces the saved data that couldn’t be loaded.\n' : '') + candidate.summary.join('\n');
    } catch (error) { element('import-preview').textContent = error.message; }
    element('import-apply').disabled = !plan;
  }
  element('import-button').onclick = () => element('import-file').click();
  element('import-file').onchange = async event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Choose a backup under 10 MB.');
      incoming = readImport(JSON.parse(await file.text()));
      choices = Object.fromEntries(Object.keys(incoming).map(key => [key, 'replace']));
      element('clear-import-scrims').checked = false;
      element('import-options').innerHTML = Object.entries(BACKUP_CATEGORIES).filter(([key]) => Object.hasOwn(incoming, key)).map(([key, label]) => {
        const options = ['scrims', 'players', 'mapPoolPresets'].includes(key) ? [['replace', 'Replace'], ['merge', 'Merge'], ['skip', 'Skip']] : [['replace', 'Replace'], ['skip', 'Skip']];
        return `<label class="transfer-option">${label}<select data-category="${key}">${options.map(([value, name]) => `<option value="${value}" ${choices[key] === value ? 'selected' : ''}>${name}</option>`).join('')}</select></label>`;
      }).join('');
      preview();
      element('import-dialog').showModal();
    } catch (error) { notify(error instanceof SyntaxError ? 'That file is not valid JSON. Nothing changed.' : error.message); }
  };
  element('import-options').onchange = event => {
    choices[event.target.dataset.category] = event.target.value;
    element('clear-import-scrims').checked = false;
    preview();
  };
  element('clear-import-scrims').onchange = preview;
  element('import-apply').onclick = () => {
    preview();
    if (!plan) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plan.state));
      location.reload();
    } catch {
      notify('Could not save the import. Browser storage may be full or unavailable.');
    }
  };
  element('delete-data-button').onclick = () => {
    element('delete-data-confirmation').value = '';
    element('delete-data-error').textContent = '';
    element('delete-data-accept').disabled = true;
    element('delete-data-dialog').showModal();
    element('delete-data-confirmation').focus();
  };
  element('delete-data-confirmation').oninput = () => {
    element('delete-data-accept').disabled = element('delete-data-confirmation').value !== 'delete everything';
  };
  element('delete-data-accept').onclick = () => {
    if (element('delete-data-confirmation').value !== 'delete everything') return;
    try { deleteSavedData(localStorage); location.reload(); }
    catch { element('delete-data-error').textContent = 'Could not delete all saved data. Check browser storage permissions and try again.'; }
  };
}
