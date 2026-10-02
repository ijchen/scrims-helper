import { allScrims, switchScrim, createScrim, deleteScrim } from './model.js';
import { scrimTimeLabel } from './scrim-time.js';

const element = id => document.getElementById(id);
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export function createScrimsUI({ getState, save, changed, confirmAction, notify, canCreate }) {
  let editingId = '';
  function render() {
    const state = getState();
    element('saved-scrim-list').innerHTML = [...allScrims(state)].sort((first, second) => second.createdAt.localeCompare(first.createdAt)).map(scrim => {
      const current = scrim.id === state.activeScrimId;
      const date = scrim.session.scheduledAt ? scrimTimeLabel(scrim.session.scheduledAt) : scrim.createdAt ? new Date(scrim.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date set';
      const record = ['win', 'loss', 'draw'].map(outcome => `<span class="scrim-record-${outcome}">${scrim.session.games.filter(game => game.outcome === outcome).length}${{ win: 'W', loss: 'L', draw: 'D' }[outcome]}</span>`).join(' ');
      return `<div class="saved-scrim-row ${current ? 'current' : ''}"><button class="saved-scrim-choice" data-switch-scrim="${escapeHtml(scrim.id)}" ${current ? 'aria-current="true"' : ''}><strong>${escapeHtml(scrim.session.title || 'Untitled scrim')}${current ? ' · Current' : ''}</strong><span class="muted small">${date} · ${scrim.session.games.length} games${scrim.session.finished ? ' · Done' : scrim.session.activeGame ? ' · In progress' : ''}</span><span class="small">${record}</span></button><button class="quiet" data-manage-scrim="${escapeHtml(scrim.id)}" aria-label="Edit ${escapeHtml(scrim.session.title || 'untitled scrim')}">⋯</button></div>`;
    }).join('');
  }
  function open() { render(); element('scrim-switcher').showModal(); }
  function add(copySetup) {
    if (!canCreate()) { notify('Reload or import a valid backup before creating a scrim.'); return; }
    try {
      createScrim(getState(), crypto.randomUUID(), new Date().toISOString(), copySetup);
      changed();
      element('scrim-switcher').close();
      element('session-title').focus();
    } catch (error) { notify(error.message); }
  }
  element('scrim-switcher-button').onclick = open;
  element('create-blank-scrim').onclick = () => add(false);
  element('copy-scrim-setup').onclick = () => add(true);
  element('saved-scrim-list').onclick = event => {
    const button = event.target.closest('button');
    if (button?.dataset.switchScrim) {
      switchScrim(getState(), button.dataset.switchScrim);
      changed();
      element('scrim-switcher').close();
    }
    if (button?.dataset.manageScrim) {
      editingId = button.dataset.manageScrim;
      element('saved-scrim-name').value = allScrims(getState()).find(scrim => scrim.id === editingId).session.title;
      element('delete-saved-scrim').disabled = getState().scrims.length === 1;
      element('delete-saved-scrim').title = getState().scrims.length > 1 ? 'Delete scrim' : 'Create another scrim before deleting the last one';
      element('scrim-editor').showModal();
    }
  };
  element('saved-scrim-name').oninput = () => {
    const scrim = allScrims(getState()).find(scrim => scrim.id === editingId);
    if (!scrim) return;
    scrim.session.title = element('saved-scrim-name').value;
    save();
  };
  element('delete-saved-scrim').onclick = async event => {
    const scrim = allScrims(getState()).find(scrim => scrim.id === editingId);
    if (!scrim || (!event.shiftKey && !await confirmAction('Delete this scrim?', `Delete “${scrim.session.title || 'Untitled scrim'}” and all its games? Your shared players and presets stay. Export a backup first if you want to keep it.`, 'Delete scrim'))) return;
    deleteScrim(getState(), scrim.id);
    element('scrim-editor').close();
    changed();
  };
  return { render };
}
