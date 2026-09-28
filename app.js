import { ROLES, STORAGE_KEY, emptyLineup, newSession, newState, gamesFor, roleGroup, assignPlayer, swapPlayers, assignmentChoices, removeAttendee, lineupStatus, lineupSwaps, autofillLineup, startGame, finishGame, reopenLastGame, cancelActiveGame, validateBackup } from './model.js';
import { createGamesUI } from './games-ui.js';
import { THEME_KEY, PANEL_SPLIT_KEY, readSavedState, restoreSavedState, readPreference, isStateStorageKey } from './storage.js';

const element = id => document.getElementById(id);
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const roleNames = { Tank: 'Tank', HSDPS: 'Hitscan DPS', FDPS: 'Flex DPS', MS: 'Main support', FS: 'Flex support' };
const statusNames = { default: 'Default', trial: 'Trial', team: 'Team member' };
const statusBadge = player => player.status && player.status !== 'default' ? `<span class="status-badge ${player.status}">${statusNames[player.status]}</span>` : '';
const uid = () => crypto.randomUUID();
let state = newState();
let logLocked = false;
let attendancePromptOpen = false;
let draggedPlayerId = '';
let choosingPlayerId = '';
let choosingRole = '';
let hoveredRole = '';
let focusedRole = '';
let toastTimer;
let storageBlocked = false;
let rawBackup = null;
const themeKey = THEME_KEY;
let darkTheme = matchMedia('(prefers-color-scheme: dark)').matches;
try {
  const savedTheme = readPreference(localStorage, themeKey);
  if (savedTheme === 'dark' || savedTheme === 'light') darkTheme = savedTheme === 'dark';
} catch {}

function renderTheme() {
  document.documentElement.dataset.theme = darkTheme ? 'dark' : 'light';
  element('theme-toggle').setAttribute('aria-pressed', String(darkTheme));
  element('theme-toggle').textContent = darkTheme ? '☾' : '☀';
  const label = darkTheme ? 'Switch to light theme' : 'Switch to dark theme';
  element('theme-toggle').setAttribute('aria-label', label);
  element('theme-toggle').title = label;
}
renderTheme();
element('theme-toggle').onclick = () => {
  darkTheme = !darkTheme;
  renderTheme();
  try { localStorage.setItem(themeKey, darkTheme ? 'dark' : 'light'); }
  catch { notify('Theme changed for this visit; browser storage is unavailable.'); }
};
let flipCount = 0;
element('copy-scrim-code').onclick = async () => {
  try {
    await navigator.clipboard.writeText('DKEEH');
    notify('Scrim code copied: DKEEH');
  } catch {
    notify('Could not copy automatically. Scrim code: DKEEH');
  }
};
let coinResetTimer;
let coinRevealTimer;
let coinAnimation;
element('coin-flip').onclick = () => {
  clearTimeout(coinResetTimer);
  clearTimeout(coinRevealTimer);
  coinAnimation?.cancel();
  const button = element('coin-flip');
  const disc = element('coin-disc');
  const result = crypto.getRandomValues(new Uint32Array(1))[0] % 2 ? 'Heads' : 'Tails';
  flipCount += 1;
  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 560;
  const rotation = result === 'Heads' ? 1080 : 1260;
  button.classList.remove('coin-landed');
  button.classList.add('coin-flipping');
  element('coin-result').textContent = 'Flipping';
  button.setAttribute('aria-label', 'Flipping coin');
  disc.style.transform = `rotateY(${rotation}deg)`;
  if (duration) coinAnimation = disc.animate([
    { transform: 'translateY(0) rotateY(0deg) scale(1)' },
    { transform: `translateY(-6px) rotateY(${rotation * .45}deg) scale(1.12)`, offset: .45 },
    { transform: `translateY(0) rotateY(${rotation}deg) scale(1)` },
  ], { duration, easing: 'cubic-bezier(.2,.65,.3,1)' });
  coinRevealTimer = setTimeout(() => {
    button.classList.remove('coin-flipping');
    button.classList.add('coin-landed');
    element('coin-result').textContent = result;
    button.setAttribute('aria-label', `Flip again. Flip ${flipCount}: ${result}`);
    coinResetTimer = setTimeout(() => {
      button.classList.remove('coin-landed');
      disc.style.transform = '';
      element('coin-result').textContent = 'Flip coin';
      button.removeAttribute('aria-label');
    }, 2000);
  }, duration);
};

try {
  rawBackup = readSavedState(localStorage);
  if (rawBackup !== null) state = restoreSavedState(localStorage, rawBackup);
} catch {
  storageBlocked = true;
  element('storage-warning').hidden = false;
  element('storage-warning').textContent = 'Your saved data could not be read. It has not been overwritten. Export to recover the original data, then import a valid backup or start a new scrim. If browser storage is unavailable, changes will only last until you close this page.';
  element('save-status').textContent = 'Saving unavailable';
}

function notify(message, undo = null) {
  clearTimeout(toastTimer);
  const container = Array.from(document.querySelectorAll('dialog[open]')).at(-1) || document.body;
  container.append(element('toast'));
  element('toast').replaceChildren(document.createTextNode(message));
  if (undo) {
    const button = document.createElement('button');
    button.textContent = 'Undo';
    button.onclick = () => { undo(); element('toast').hidden = true; };
    element('toast').append(button);
  }
  element('toast').hidden = false;
  toastTimer = setTimeout(() => { element('toast').hidden = true; }, 6000);
}

function persist() {
  if (storageBlocked) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    element('save-status').textContent = 'Saved on this device';
    element('storage-warning').hidden = true;
  } catch {
    element('save-status').textContent = 'Not saved · export a backup';
    element('storage-warning').hidden = false;
    element('storage-warning').textContent = 'Browser storage is unavailable or full. Your changes are only in memory. Export a backup before closing this page.';
  }
}

function commit() {
  choosingPlayerId = '';
  choosingRole = '';
  clearTimeout(toastTimer);
  element('toast').hidden = true;
  persist();
  render();
}

function confirmAction(title, description, acceptLabel = 'Continue') {
  element('confirm-title').textContent = title;
  element('confirm-description').textContent = description;
  element('confirm-accept').textContent = acceptLabel;
  const dialog = element('confirm-dialog');
  return new Promise(resolve => {
    const finish = result => {
      dialog.close();
      element('confirm-accept').onclick = null;
      element('confirm-cancel').onclick = null;
      dialog.oncancel = null;
      resolve(result);
    };
    element('confirm-accept').onclick = () => finish(true);
    element('confirm-cancel').onclick = () => finish(false);
    dialog.oncancel = event => { event.preventDefault(); finish(false); };
    dialog.showModal();
    element('confirm-cancel').focus();
  });
}

function playerById(playerId) {
  return state.players.find(player => player.id === playerId);
}

function sortedAttendees() {
  const activePlayers = new Set(state.session.activeGame?.lineup.map(slot => slot.playerId) || []);
  return [...state.session.attendees].sort((first, second) => {
    const difference = gamesFor(state, first.playerId) + Number(activePlayers.has(first.playerId)) - gamesFor(state, second.playerId) - Number(activePlayers.has(second.playerId));
    const firstPlayer = playerById(first.playerId);
    const secondPlayer = playerById(second.playerId);
    return Number(second.present) - Number(first.present) || difference || Number(secondPlayer.status === 'trial') - Number(firstPlayer.status === 'trial') || firstPlayer.name.localeCompare(secondPlayer.name);
  });
}

function roleIcon(group) {
  const paths = {
    tank: '<path d="M12 3 20 6v6c0 5-8 9-8 9s-8-4-8-9V6Z"/>',
    dps: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
    support: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">${paths[group]}</svg>`;
}

function gameBar(count, label, className, capacity, inProgress = false) {
  const segments = Array.from({ length: capacity }, (_, index) => `<span class="bar-segment ${index < count ? 'filled' : inProgress && index === count ? 'in-progress' : ''}"></span>`).join('');
  const description = `${count} ${label} games${inProgress ? ' · 1 in progress' : ''}`;
  return `<span class="game-bar ${className}" aria-label="${description}" title="${description} · ${capacity} game scale"><small>${label}</small><span class="playtime-track" style="--segments:${Math.max(1, capacity)}" aria-hidden="true">${segments}</span><strong>${count}</strong></span>`;
}

function copyPlayerButton(player) {
  return `<button class="copy-player" data-copy-player="${escapeHtml(player.id)}" aria-label="Copy BattleTag for ${escapeHtml(player.name)}" title="${player.battletag ? `Copy ${escapeHtml(player.battletag)}` : 'No BattleTag set'}" ${player.battletag ? '' : 'disabled'}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/></svg></button>`;
}

function playerCard(attendee) {
  const player = playerById(attendee.playerId);
  const assignedRole = ROLES.find(slot => state.session.lineup[slot] === player.id);
  const group = roleGroup(assignedRole) || roleGroup(player.roles[0]) || 'tank';
  const activeSlot = state.session.activeGame?.lineup.find(slot => slot.playerId === player.id);
  const activeGroup = roleGroup(activeSlot?.role);
  const barGroups = ['tank', 'dps', 'support'].filter(barGroup => player.roles.some(role => roleGroup(role) === barGroup) || roleGroup(assignedRole) === barGroup || activeGroup === barGroup || gamesFor(state, player.id, barGroup) > 0);
  const groupLabels = { tank: 'tank', dps: 'DPS', support: 'supp' };
  const capacity = Math.max(5, state.session.games.length + Number(Boolean(state.session.activeGame)));
  const offRole = assignedRole && !player.roles.includes(assignedRole);
  const option = role => `<option value="${role}" ${assignedRole === role ? 'selected' : ''}>${role}${player.roles.includes(role) ? '' : ' (off-role)'}</option>`;
  const usual = ROLES.filter(role => player.roles.includes(role));
  const fills = ROLES.filter(role => !player.roles.includes(role));
  const choices = choosingPlayerId === player.id ? assignmentChoices(state, player.id) : [];
  return `<article class="player-card roster-row ${roleGroup(assignedRole) || group} ${attendee.present ? '' : 'not-present'} ${assignedRole ? 'selected' : ''} ${offRole ? 'off-role' : ''} ${choices.length ? 'choosing' : ''}" data-player-card="${escapeHtml(player.id)}">
    <div class="attendance-cell"><label class="attendance" title="${attendee.present ? 'Here' : 'Not here'}"><input type="checkbox" data-present="${escapeHtml(player.id)}" ${attendee.present ? 'checked' : ''} aria-label="${escapeHtml(player.name)} is present"><span aria-hidden="true">${attendee.present ? '✓' : '−'}</span></label>${assignedRole ? `<span class="lineup-badge ${roleGroup(assignedRole)} ${offRole ? 'unusual' : ''}" role="img" aria-label="Playing ${assignedRole}${offRole ? ' (off-role)' : ''}" title="Playing ${assignedRole}${offRole ? ' (off-role)' : ''}">${roleIcon(roleGroup(assignedRole))}${offRole ? '<span class="role-alert" aria-hidden="true">!</span>' : ''}</span>` : ''}</div>
    <div class="player-info" draggable="true" data-pick-player="${escapeHtml(player.id)}" title="${escapeHtml(player.battletag)} · Drag to a lineup slot">
      <button class="player-name-action" data-quick-assign="${escapeHtml(player.id)}" aria-label="Put ${escapeHtml(player.name)} in the lineup"><span class="card-name">${escapeHtml(player.name)} ${statusBadge(player)}${attendee.present ? '' : '<span class="away-badge">Not here</span>'}</span></button>
      <span class="card-roles">${player.roles.map(role => choices.includes(role) ? `<button class="role-chip role-choice ${roleGroup(role)}" data-choice-role="${role}" data-choice-player="${escapeHtml(player.id)}" aria-label="Play ${escapeHtml(player.name)} as ${role}">${role}</button>` : `<span class="role-chip ${roleGroup(role)}">${role}</span>`).join('') || '<span class="muted small">No roles set</span>'}</span>
    </div>
    <label class="assignment-control"><span>Playing as</span><select data-assignment="${escapeHtml(player.id)}" aria-label="Playing as for ${escapeHtml(player.name)}"><option value="" ${!assignedRole ? 'selected' : ''}>Bench</option>${usual.length ? `<optgroup label="Usual roles">${usual.map(option).join('')}</optgroup>` : ''}${fills.length ? `<optgroup label="Fill (off-role)">${fills.map(option).join('')}</optgroup>` : ''}</select></label>
    <div class="playtime">${gameBar(gamesFor(state, player.id), 'total', 'total-games', capacity, Boolean(activeSlot))}${barGroups.map(barGroup => gameBar(gamesFor(state, player.id, barGroup), groupLabels[barGroup], `role-games ${barGroup}`, capacity, activeGroup === barGroup)).join('')}</div>
    <div class="row-actions">${copyPlayerButton(player)}<button class="remove-player" data-remove="${escapeHtml(player.id)}" aria-label="Remove ${escapeHtml(player.name)} from scrim" title="${attendee.present ? 'Mark not present before removing from scrim' : 'Remove from scrim'}" ${attendee.present ? 'disabled' : ''}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M8 12h8"/></svg></button><button class="edit-player" data-edit="${escapeHtml(player.id)}" title="Edit ${escapeHtml(player.name)}" aria-label="Edit ${escapeHtml(player.name)}">⋯</button></div>
  </article>`;
}

function renderBoard() {
  const focused = document.activeElement;
  const focusKey = ['present', 'assignment', 'quickAssign', 'copyPlayer', 'emptyRole'].find(key => focused?.dataset[key]);
  const focusValue = focused?.dataset[focusKey];
  const attendees = sortedAttendees();
  if (!attendees.some(attendee => attendee.playerId === choosingPlayerId)) choosingPlayerId = '';
  if (state.session.lineup[choosingRole]) choosingRole = '';
  const choices = choosingPlayerId ? assignmentChoices(state, choosingPlayerId) : [];
  element('board').classList.toggle('choosing-role', Boolean(choosingPlayerId));
  element('role-choice-text').textContent = choosingPlayerId ? `Choose a highlighted role for ${playerById(choosingPlayerId).name}. Press Escape or click the player again to cancel.` : choosingRole ? `Choose a player for ${choosingRole}. Highlighted players play this role; other players can still fill. Press Escape to cancel.` : '';
  element('board').hidden = attendees.length === 0;
  element('empty-roster').hidden = attendees.length !== 0;
  element('lineup-strip').innerHTML = ['tank', 'dps', 'support'].map(group => `<div class="lineup-group ${group}">
    <button class="group-preview" data-preview-group="${group}" aria-label="Highlight ${group === 'dps' ? 'DPS' : group} players">${roleIcon(group)}${group === 'dps' ? 'DPS' : group === 'tank' ? 'Tank' : 'Support'}</button>
    ${ROLES.filter(role => roleGroup(role) === group).map(role => {
    const player = playerById(state.session.lineup[role]);
    const offRole = player && !player.roles.includes(role);
    return `<button class="active-slot ${roleGroup(role)} ${offRole ? 'off-role' : ''} ${choices.includes(role) ? 'matching-option' : ''}" data-drop-role="${role}" ${choices.includes(role) ? `data-choice-role="${role}" data-choice-player="${escapeHtml(choosingPlayerId)}"` : `tabindex="${player ? '-1' : '0'}"`} ${player ? `data-slot-player="${escapeHtml(player.id)}" draggable="true"` : `data-empty-role="${role}"`} aria-label="${role} slot: ${escapeHtml(player?.name || 'empty')}${offRole ? ', off-role' : ''}">
      <span class="slot-role">${roleIcon(roleGroup(role))}${role}</span><span class="slot-name">${escapeHtml(player?.name || 'Empty')}</span>${offRole ? '<span class="off-role-badge">Off-role</span>' : ''}
    </button>`;
  }).join('')}</div>`).join('');
  element('player-roster').innerHTML = attendees.map(playerCard).join('') + '<button class="add-player-row" data-open-directory><span aria-hidden="true">＋</span> Add player</button>';
  const status = lineupStatus(state);
  element('lineup-status').textContent = `${state.session.activeGame ? 'Next lineup · ' : ''}${status.filled < 5 ? `${status.filled}/5 selected` : status.absent.length ? `${status.absent.length} not marked here` : '✓ Ready'}`;
  element('lineup-status').classList.toggle('ready', status.ready);
  element('clear-lineup').disabled = status.filled === 0;
  element('autofill-lineup').disabled = status.filled === 5;
  element('autofill-lineup').title = status.filled === 5 ? 'Lineup is full' : 'Fill empty slots with present players';
  const hasPreviousGame = Boolean(state.session.activeGame || state.session.games.length);
  element('lineup-swaps').disabled = !hasPreviousGame || status.filled !== 5;
  element('lineup-swaps').title = !hasPreviousGame ? 'Start a game first to compare lineups' : status.filled !== 5 ? 'Fill all five lineup slots to see swaps' : 'Compare with the active or most recent game';
  if (focusKey) {
    Array.from(element('board').querySelectorAll('input, select, button')).find(item => item.dataset[focusKey] === focusValue)?.focus({ preventScroll: true });
  }
  hoveredRole = previewTarget(element('lineup-strip').querySelector('[data-empty-role]:hover, [data-preview-group]:hover'));
  focusedRole = document.activeElement?.matches(':focus-visible') ? previewTarget(document.activeElement) : '';
  applyRolePreview();
}

function previewTarget(target) {
  const preview = target instanceof Element ? target.closest('[data-empty-role], [data-preview-group]') : null;
  return preview?.dataset.emptyRole || preview?.dataset.previewGroup || '';
}

function applyRolePreview() {
  const role = choosingPlayerId ? '' : choosingRole || hoveredRole || focusedRole;
  for (const slot of element('lineup-strip').querySelectorAll('[data-empty-role]')) {
    slot.classList.toggle('choosing-player', slot.dataset.emptyRole === choosingRole);
    slot.setAttribute('aria-pressed', String(slot.dataset.emptyRole === choosingRole));
  }
  for (const row of element('player-roster').querySelectorAll('[data-player-card]')) {
    const matches = role && playerById(row.dataset.playerCard).roles.some(playerRole => playerRole === role || roleGroup(playerRole) === role);
    row.classList.toggle('eligible-preview', Boolean(matches));
    row.classList.toggle('ineligible-preview', Boolean(role && !matches));
  }
}

function quickAssignPlayer(playerId) {
  if (choosingRole) {
    placePlayer(playerId, choosingRole);
    return;
  }
  const choices = assignmentChoices(state, playerId);
  if (choices.length <= 1) {
    choosingPlayerId = '';
    renderBoard();
  }
  if (!choices.length) openPlayer(playerId);
  else if (choices.length === 1) {
    if (state.session.lineup[choices[0]] !== playerId) placePlayer(playerId, choices[0]);
    else notify(`Already playing ${choices[0]}.`);
  } else {
    choosingPlayerId = choosingPlayerId === playerId ? '' : playerId;
    renderBoard();
  }
}

function placePlayer(playerId, role, swap = false) {
  const previous = { ...state.session.lineup };
  const previousRole = ROLES.find(slot => previous[slot] === playerId);
  const replaced = playerById(previous[role]);
  if (swap && replaced) swapPlayers(state, playerId, replaced.id);
  else if (role) assignPlayer(state, role, playerId, true);
  else if (previousRole) assignPlayer(state, previousRole, '');
  commit();
  const message = role ? `${playerById(playerId).name} → ${role}${replaced && replaced.id !== playerId ? ` · ${replaced.name} → ${swap && previousRole ? previousRole : 'Bench'}` : ''}` : `${playerById(playerId).name} → Bench`;
  notify(message, () => { state.session.lineup = previous; commit(); });
}

function renderDirectory() {
  const query = element('directory-search').value.toLowerCase();
  const players = [...state.players].sort((first, second) => first.name.localeCompare(second.name)).filter(player => `${player.name} ${player.battletag} ${player.roles.join(' ')}`.toLowerCase().includes(query));
  element('directory-list').innerHTML = players.length ? players.map(player => `<div class="directory-row"><label class="directory-person"><input type="checkbox" data-attendee="${escapeHtml(player.id)}" ${state.session.attendees.some(attendee => attendee.playerId === player.id) ? 'checked' : ''}><span><strong>${escapeHtml(player.name)} ${statusBadge(player)}</strong><small>${escapeHtml(player.battletag || 'No BattleTag')} · ${player.roles.join(' / ')}</small></span></label><button class="quiet" data-edit="${escapeHtml(player.id)}" aria-label="Edit ${escapeHtml(player.name)}">Edit</button></div>`).join('') : `<div class="empty-small"><p>${state.players.length ? 'No matching players.' : 'No players yet.'}</p><span>${state.players.length ? 'Try a different search.' : 'Add a player to get started.'}</span></div>`;
}

function renderGames() {
  element('undo-game').hidden = state.session.games.length === 0;
  gamesUI.render();
}

function render() {
  element('session-title').value = state.session.title;
  element('contact').value = state.session.contact;
  element('present-count').textContent = `${state.session.attendees.filter(attendee => attendee.present).length} / ${state.session.attendees.length}`;
  element('game-count').textContent = state.session.games.length;
  element('next-number').textContent = String(state.session.games.length + 1);
  renderBoard();
  renderGames();
  renderDirectory();
}

function openDirectory() {
  element('directory-search').value = '';
  renderDirectory();
  element('directory-dialog').showModal();
}

function openPlayer(playerId = '') {
  const player = playerById(playerId);
  element('player-form').reset();
  element('player-id').value = player?.id || '';
  element('player-name').value = player?.name || '';
  element('player-tag').value = player?.battletag || '';
  element('player-status').value = player?.status || 'default';
  element('player-notes').value = player?.notes || '';
  element('player-form-heading').textContent = player ? 'Edit player' : 'New player';
  element('delete-player').hidden = !player;
  element('player-error').textContent = '';
  element('player-roles').innerHTML = ROLES.map(role => `<label class="role-option ${roleGroup(role)}" title="${roleNames[role]}"><input type="checkbox" name="roles" value="${role}" ${player?.roles.includes(role) ? 'checked' : ''}>${role}</label>`).join('');
  element('player-dialog').showModal();
  element('player-name').focus();
}

for (const dialog of document.querySelectorAll('dialog')) {
  let pressedOutside = false;
  const outside = event => {
    const bounds = dialog.getBoundingClientRect();
    return event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
  };
  dialog.addEventListener('pointerdown', event => { pressedOutside = outside(event); });
  dialog.addEventListener('click', event => {
    if (!pressedOutside || !outside(event)) return;
    pressedOutside = false;
    if (dialog.id === 'confirm-dialog') element('confirm-cancel').click();
    else dialog.close();
  });
}

function endPlayerDrag() {
  draggedPlayerId = '';
  element('bench-drop-hint').hidden = true;
  element('board').classList.remove('dragging');
  document.querySelectorAll('.drop-target').forEach(slot => slot.classList.remove('drop-target', 'off-role-target'));
}

element('board').addEventListener('dragstart', event => {
  const card = event.target.closest('[data-pick-player], [data-slot-player]');
  if (!card || !event.dataTransfer) return;
  draggedPlayerId = card.dataset.pickPlayer || card.dataset.slotPlayer;
  event.dataTransfer.setData('text/plain', draggedPlayerId);
  event.dataTransfer.effectAllowed = 'move';
  element('board').classList.add('dragging');
});
element('board').addEventListener('dragover', event => {
  const slot = event.target.closest('[data-drop-role], [data-player-card]');
  if (!slot || !draggedPlayerId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.drop-target').forEach(target => target.classList.remove('drop-target', 'off-role-target'));
  slot.classList.add('drop-target');
  const role = slot.dataset.dropRole || ROLES.find(role => state.session.lineup[role] === slot.dataset.playerCard);
  const sourceRole = ROLES.find(role => state.session.lineup[role] === draggedPlayerId);
  const targetId = slot.dataset.playerCard || state.session.lineup[role];
  slot.classList.toggle('off-role-target', Boolean((role && !playerById(draggedPlayerId).roles.includes(role)) || (sourceRole && targetId && !playerById(targetId).roles.includes(sourceRole))));
});
element('board').addEventListener('dragleave', event => {
  const slot = event.target.closest('[data-drop-role], [data-player-card]');
  if (slot && !slot.contains(event.relatedTarget)) slot.classList.remove('drop-target', 'off-role-target');
});
document.addEventListener('dragend', endPlayerDrag);
document.addEventListener('dragover', event => {
  const canBench = draggedPlayerId && ROLES.some(role => state.session.lineup[role] === draggedPlayerId) && !event.target.closest('#lineup-strip, [data-player-card]');
  element('bench-drop-hint').hidden = !canBench;
  if (!canBench) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
});
document.addEventListener('drop', event => {
  if (!draggedPlayerId || event.target.closest('#lineup-strip, [data-player-card]')) return;
  const playerId = draggedPlayerId;
  if (!ROLES.some(role => state.session.lineup[role] === playerId)) return;
  event.preventDefault();
  endPlayerDrag();
  placePlayer(playerId, '');
});
element('board').addEventListener('drop', event => {
  const slot = event.target.closest('[data-drop-role], [data-player-card]');
  const playerId = draggedPlayerId;
  if (!slot || !playerId) return;
  event.preventDefault();
  const role = slot.dataset.dropRole || ROLES.find(role => state.session.lineup[role] === slot.dataset.playerCard);
  const sourceRole = ROLES.find(role => state.session.lineup[role] === playerId);
  const targetId = slot.dataset.playerCard;
  endPlayerDrag();
  if (!role) {
    if (sourceRole && targetId) placePlayer(targetId, sourceRole, true);
    return;
  }
  if (state.session.lineup[role] === playerId) return;
  placePlayer(playerId, role, true);
});

element('lineup-strip').addEventListener('pointerover', event => {
  hoveredRole = previewTarget(event.target);
  applyRolePreview();
});
element('lineup-strip').addEventListener('pointerout', event => {
  hoveredRole = previewTarget(event.relatedTarget);
  applyRolePreview();
});
element('lineup-strip').addEventListener('focusin', event => {
  focusedRole = event.target.matches(':focus-visible') ? previewTarget(event.target) : '';
  applyRolePreview();
});
element('lineup-strip').addEventListener('focusout', () => {
  focusedRole = '';
  applyRolePreview();
});

element('board').addEventListener('contextmenu', event => {
  const target = event.target.closest('[data-player-card], [data-slot-player]');
  if (!target || event.target.closest('input, select, textarea')) return;
  const playerId = target.dataset.playerCard || target.dataset.slotPlayer;
  if (!ROLES.some(role => state.session.lineup[role] === playerId)) return;
  event.preventDefault();
  placePlayer(playerId, '');
});

document.addEventListener('click', async event => {
  const row = event.target.closest('[data-player-card]');
  const choice = event.target.closest('[data-choice-player]');
  const emptySlot = event.target.closest('[data-empty-role]');
  if (choosingRole && !row && !emptySlot) {
    choosingRole = '';
    element('role-choice-text').textContent = '';
    applyRolePreview();
  }
  if (choosingPlayerId && row?.dataset.playerCard !== choosingPlayerId && choice?.dataset.choicePlayer !== choosingPlayerId) {
    choosingPlayerId = '';
    element('board').classList.remove('choosing-role');
    element('role-choice-text').textContent = '';
    document.querySelectorAll('.choosing, .matching-option').forEach(target => target.classList.remove('choosing', 'matching-option'));
    document.querySelectorAll('[data-choice-player]').forEach(target => {
      delete target.dataset.choicePlayer;
      delete target.dataset.choiceRole;
      if (target.classList.contains('role-choice')) {
        const chip = document.createElement('span');
        chip.className = target.className.replace('role-choice', '').trim();
        chip.textContent = target.textContent;
        target.replaceWith(chip);
      } else target.tabIndex = target.dataset.slotPlayer ? -1 : 0;
    });
    applyRolePreview();
  }
  if (row && !event.target.closest('button, input, select, textarea, label, a, .row-actions')) {
    quickAssignPlayer(row.dataset.playerCard);
    return;
  }
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.close) element(button.dataset.close).close();
  if (button.hasAttribute('data-open-directory')) openDirectory();
  if (button.dataset.edit) openPlayer(button.dataset.edit);
  if (button.dataset.quickAssign) quickAssignPlayer(button.dataset.quickAssign);
  if (button.dataset.choiceRole && button.dataset.choicePlayer === choosingPlayerId && assignmentChoices(state, choosingPlayerId).includes(button.dataset.choiceRole)) {
    placePlayer(choosingPlayerId, button.dataset.choiceRole);
    return;
  }
  if (button.dataset.emptyRole) {
    choosingPlayerId = '';
    choosingRole = choosingRole === button.dataset.emptyRole ? '' : button.dataset.emptyRole;
    renderBoard();
    return;
  }
  if (button.dataset.copyPlayer) {
    const player = playerById(button.dataset.copyPlayer);
    if (!player?.battletag) return;
    try {
      await navigator.clipboard.writeText(player.battletag);
      notify(`${player.battletag} copied.`);
    } catch {
      openPlayer(player.id);
      element('player-tag').focus();
      element('player-tag').select();
      notify('Use Ctrl+C or ⌘C to copy the selected BattleTag.');
    }
  }
  if (button.dataset.remove) {
    const player = playerById(button.dataset.remove);
    const attendee = state.session.attendees.find(item => item.playerId === player?.id);
    if (!attendee || attendee.present) return;
    const previous = structuredClone({ attendees: state.session.attendees, lineup: state.session.lineup });
    removeAttendee(state, player.id);
    commit();
    notify(`${player.name} removed from scrim.`, () => { Object.assign(state.session, previous); commit(); });
  }
});

document.addEventListener('change', async event => {
  const target = event.target;
  if (target.dataset.assignment) placePlayer(target.dataset.assignment, target.value);
  if (target.dataset.present) {
    const playerId = target.dataset.present;
    state.session.attendees.find(attendee => attendee.playerId === playerId).present = target.checked;
    commit();
  }
  if (target.dataset.attendee) {
    const playerId = target.dataset.attendee;
    if (target.checked) state.session.attendees.push({ playerId, present: false });
    else if (await confirmAction('Remove from this scrim?', 'This also clears this player from the lineup. Their played games and directory entry are kept.', 'Remove')) removeAttendee(state, playerId);
    commit();
    Array.from(document.querySelectorAll('[data-attendee]')).find(input => input.dataset.attendee === playerId)?.focus();
  }
});

for (const [inputId, field] of [['session-title', 'title'], ['contact', 'contact']]) {
  element(inputId).addEventListener('input', event => {
    state.session[field] = event.target.value;
    persist();
  });
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !document.querySelector('dialog[open]') && (choosingPlayerId || choosingRole)) {
    choosingPlayerId = '';
    choosingRole = '';
    renderBoard();
  }
});
element('directory-search').addEventListener('input', renderDirectory);
element('settings-button').onclick = () => element('settings-dialog').showModal();
element('add-players').onclick = openDirectory;
element('create-player').onclick = () => openPlayer();
element('lineup-swaps').onclick = () => {
  try {
    const { source, pairs, message } = lineupSwaps(state);
    const number = state.session.activeGame ? state.session.games.length + 1 : state.session.games.length;
    const swapArrow = '<svg class="swap-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>';
    element('swaps-source').innerHTML = `<span>Game ${number}${state.session.activeGame ? ' · In progress' : ' · Completed'}${source.label ? ` · ${escapeHtml(source.label)}` : ''}</span><span class="swaps-destination">${swapArrow} Current lineup</span>`;
    const playerLabel = player => `<strong>${escapeHtml(player.battletag?.split('#')[0].trim() || player.name)}</strong><small class="${roleGroup(player.role)}">${escapeHtml(player.role)}</small>`;
    element('swaps-list').innerHTML = pairs.length ? '<div class="swap-labels"><span>In</span><span></span><span>Out</span></div>' + pairs.map(pair => `<div class="swap-pair"><span>${playerLabel(pair.incoming)}</span>${swapArrow}<span>${playerLabel(pair.outgoing)}</span></div>`).join('') : '<p class="swaps-empty">No player swaps needed.</p>';
    element('swaps-message').value = message;
    element('swaps-message-field').hidden = !pairs.length;
    element('copy-swaps').hidden = !pairs.length;
    element('swaps-dialog').showModal();
  } catch (error) { notify(error.message); }
};
element('copy-swaps').onclick = async () => {
  try { await navigator.clipboard.writeText(element('swaps-message').value); notify('Swap message copied.'); }
  catch {
    element('swaps-message').focus();
    element('swaps-message').select();
    notify('Use Ctrl+C or ⌘C to copy the selected message.');
  }
};
element('clear-lineup').onclick = () => {
  const previous = { ...state.session.lineup };
  state.session.lineup = emptyLineup();
  commit();
  notify('Lineup cleared.', () => { state.session.lineup = previous; commit(); });
};
element('autofill-lineup').onclick = () => {
  try {
    const previous = { ...state.session.lineup };
    state.session.lineup = autofillLineup(state);
    commit();
    notify('Lineup filled.', () => { state.session.lineup = previous; commit(); });
  } catch (error) { notify(error.message); }
};

async function gameAction(action, outcome) {
  if (logLocked || attendancePromptOpen) return;
  try {
    let markPresent = false;
    if (action === 'start' && !state.session.activeGame && lineupStatus(state).filled === 5 && lineupStatus(state).absent.length) {
      const lineup = JSON.stringify(state.session.lineup);
      const names = lineupStatus(state).absent.map(playerId => playerById(playerId).name);
      attendancePromptOpen = true;
      try {
        markPresent = await confirmAction('Are these players here?', `${names.join('\n')}\n\nNot marked present yet.`, 'Mark them here & start');
      } finally { attendancePromptOpen = false; }
      if (!markPresent) return;
      if (lineup !== JSON.stringify(state.session.lineup)) { notify('The lineup changed. Please start again.'); return; }
    }
    if (action === 'start') startGame(state, uid(), new Date().toISOString(), markPresent);
    else if (action === 'finish') {
      if (!['win', 'loss', 'draw'].includes(outcome)) return;
      finishGame(state, new Date().toISOString());
      state.session.games.at(-1).outcome = outcome;
    }
    else if (action === 'cancel') cancelActiveGame(state);
    else if (action === 'reopen') reopenLastGame(state);
    else return;
    logLocked = true;
    commit();
    if (action !== 'finish') gamesUI.showCurrent();
    document.querySelectorAll('[data-game-action]').forEach(button => { button.disabled = true; });
    setTimeout(() => { logLocked = false; renderBoard(); renderGames(); }, 1000);
    notify(action === 'start' ? 'Game started · five players captured' : action === 'finish' ? 'Game completed · +1 for the recorded five' : action === 'reopen' ? 'Game reopened · playtime credit removed until finished' : 'Returned to upcoming');
  } catch (error) { notify(error.message); }
}
element('undo-game').onclick = () => {
  if (!state.session.games.length) return;
  const previousLabel = state.session.gameLabel;
  const previousSettings = { ...state.session.nextGame };
  const game = state.session.games.pop();
  state.session.gameLabel = game.label;
  state.session.nextGame = { mode: game.mode, ourBan: game.ourBan, theirBan: game.theirBan };
  commit();
  gamesUI.showCurrent();
  notify('Game undone · upcoming map and bans restored.', () => {
    state.session.games.push(game);
    state.session.gameLabel = previousLabel;
    state.session.nextGame = previousSettings;
    commit();
  });
};
element('new-session').onclick = async () => {
  if (await confirmAction('Start a fresh scrim?', 'Your player directory stays. Attendance, lineups, and game history will be cleared. Export first if you want to keep this scrim.', 'Start new scrim')) {
    state.session = newSession();
    storageBlocked = false;
    rawBackup = null;
    commit();
    element('settings-dialog').close();
    openDirectory();
    notify('New scrim.');
  }
};
element('copy-contact').onclick = async () => {
  if (!state.session.contact.trim()) return notify('Add the opponent’s BattleTag first.');
  try { await navigator.clipboard.writeText(state.session.contact); notify('Opponent BattleTag copied.'); }
  catch { element('contact').focus(); element('contact').select(); notify('Use Ctrl+C or ⌘C to copy the selected BattleTag.'); }
};

function savePlayer() {
  const roles = Array.from(document.querySelectorAll('#player-roles input:checked')).map(input => input.value);
  const name = element('player-name').value.trim() || 'Unnamed player';
  const playerId = element('player-id').value;
  const player = { id: playerId || uid(), name, battletag: element('player-tag').value.trim(), roles, status: element('player-status').value, notes: element('player-notes').value.trim() };
  if (playerId) {
    state.players[state.players.findIndex(person => person.id === playerId)] = player;
  }
  else {
    state.players.push(player);
    state.session.attendees.push({ playerId: player.id, present: false });
    element('player-id').value = player.id;
    element('delete-player').hidden = false;
  }
  commit();
}
element('player-form').addEventListener('input', savePlayer);
element('player-form').onsubmit = event => {
  event.preventDefault();
  element('player-dialog').close();
};
element('delete-player').onclick = async () => {
  const playerId = element('player-id').value;
  if (await confirmAction('Delete this player?', 'This removes the player from the directory, roster, and lineup. Past game records keep their original name.', 'Delete player')) {
    removeAttendee(state, playerId);
    state.players = state.players.filter(player => player.id !== playerId);
    commit();
    element('player-dialog').close();
  }
};

element('export-button').onclick = () => {
  const recovering = storageBlocked && rawBackup !== null;
  const blob = new Blob([recovering ? rawBackup : JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `scrims-helper-${recovering ? 'recovery-' : ''}${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify(recovering ? 'Original unreadable data exported for recovery.' : 'Backup exported. Import it on another device to pick up here.');
};
element('import-button').onclick = () => element('import-file').click();
element('import-file').onchange = async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('Backup is too large. Choose a file under 10 MB.');
    const input = JSON.parse(await file.text());
    const imported = validateBackup(input);
    const legacyPlansNotice = input.version === 1 && input.session.plans.length ? ' Saved lineup plans are no longer used and will not be imported; they remain in your original backup file.' : '';
    if (await confirmAction('Replace your data with this backup?', `Import ${imported.players.length} players and ${imported.session.games.length} games. This replaces your current directory and scrim. Export your current data first if you need it.${legacyPlansNotice}`, 'Import backup')) {
      state = imported;
      storageBlocked = false;
      rawBackup = null;
      commit();
      notify('Backup imported. You’re ready to go.');
    }
  } catch (error) { notify(error instanceof SyntaxError ? 'That file is not valid JSON. Nothing was changed.' : error.message); }
};

window.addEventListener('storage', event => {
  if (!isStateStorageKey(event.key)) return;
  storageBlocked = true;
  element('save-status').textContent = 'Another tab changed this scrim';
  element('storage-warning').hidden = false;
  element('storage-warning').textContent = 'Another tab changed the saved scrim. Saving is paused here to avoid overwriting it. Reload to use the latest saved data, or export this tab’s changes first.';
  rawBackup = null;
});

const gamesUI = createGamesUI({ getState: () => state, save: commit, action: gameAction, roleIcon });
const divider = element('panel-divider');
const splitKey = PANEL_SPLIT_KEY;
let panelSplit = 62;
let resizePointer = null;
function setPanelSplit(value, save = false) {
  panelSplit = Math.min(75, Math.max(25, value));
  document.documentElement.style.setProperty('--roster-share', `${panelSplit}fr`);
  document.documentElement.style.setProperty('--games-share', `${100 - panelSplit}fr`);
  divider.setAttribute('aria-valuenow', String(Math.round(panelSplit)));
  divider.setAttribute('aria-valuetext', `${Math.round(panelSplit)}% roster, ${Math.round(100 - panelSplit)}% games`);
  if (save) { try { localStorage.setItem(splitKey, String(panelSplit)); } catch {} }
}
try {
  const saved = readPreference(localStorage, splitKey);
  if (saved !== null && Number.isFinite(Number(saved))) panelSplit = Number(saved);
} catch {}
setPanelSplit(panelSplit);
divider.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  event.preventDefault();
  resizePointer = event.pointerId;
  divider.setPointerCapture(event.pointerId);
  divider.focus({ preventScroll: true });
  document.body.classList.add('resizing-panels');
});
divider.addEventListener('pointermove', event => {
  if (resizePointer !== event.pointerId) return;
  const main = document.querySelector('main');
  const bounds = main.getBoundingClientRect();
  const styles = getComputedStyle(main);
  const left = parseFloat(styles.paddingLeft);
  const width = bounds.width - left - parseFloat(styles.paddingRight) - divider.offsetWidth;
  if (width > 0) setPanelSplit((event.clientX - bounds.left - left - divider.offsetWidth / 2) / width * 100);
});
function finishPanelResize() {
  if (resizePointer === null) return;
  resizePointer = null;
  document.body.classList.remove('resizing-panels');
  setPanelSplit(panelSplit, true);
}
divider.addEventListener('pointerup', finishPanelResize);
divider.addEventListener('pointercancel', finishPanelResize);
divider.addEventListener('lostpointercapture', finishPanelResize);
divider.addEventListener('dblclick', () => setPanelSplit(62, true));
divider.addEventListener('keydown', event => {
  const values = { ArrowLeft: panelSplit - (event.shiftKey ? 5 : 1), ArrowRight: panelSplit + (event.shiftKey ? 5 : 1), Home: 25, End: 75, Enter: 62 };
  if (!(event.key in values)) return;
  event.preventDefault();
  setPanelSplit(values[event.key], true);
});
render();
