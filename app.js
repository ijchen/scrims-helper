import { ROLES, STORAGE_KEY, emptyLineup, newState, gamesFor, roleGroup, assignPlayer, swapPlayers, assignmentChoices, removeAttendee, lineupStatus, lineupSwaps, autofillLineup, startGame, finishGame, reopenLastGame, cancelActiveGame } from './model.js';
import { gameDetails, referenceName } from './catalog-references.js';
import { createGamesUI } from './games-ui.js';
import { currentSession, currentScrim, gameCodeFor, allScrims, autofillUnavailableReason, playableRoles, preferredGamesFor } from './model.js';
import { createScrimsUI } from './scrims-ui.js';
import { createBackupsUI } from './backups-ui.js';
import { THEME_KEY, PANEL_SPLIT_KEY, readSavedState, restoreSavedState, readPreference, isStateStorageKey, deleteSavedData } from './storage.js';

const element = id => document.getElementById(id);
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const roleNames = { Tank: 'Tank', HSDPS: 'Hitscan DPS', FDPS: 'Flex DPS', MS: 'Main support', FS: 'Flex support' };
const statusNames = { default: 'Default', trial: 'Trial', team: 'Team member', ringer: 'Ringer' };
const roleBadges = (player, choices = []) => playableRoles(player).map(role => choices.includes(role) ? `<button class="role-chip role-choice ${roleGroup(role)}" data-choice-role="${role}" data-choice-player="${escapeHtml(player.id)}" aria-label="Play ${escapeHtml(player.name)} as ${role}">${role}</button>` : `<span data-role-chip="${role}" class="role-chip ${roleGroup(role)} ${player.roles.includes(role) ? '' : 'fill-role'}" title="${roleNames[role]} · ${player.roles.includes(role) ? 'Main' : 'Fill'}">${role}${player.roles.includes(role) ? '' : '<span class="fill-mark"> · Fill</span>'}</span>`).join('');
const statusBadge = player => player.status && player.status !== 'default' ? `<span class="status-badge ${player.status}">${statusNames[player.status]}</span>` : '';
const uid = () => crypto.randomUUID();
let state = newState();
let externalChange = false;
const pendingRemovals = new Set();
let closingRosterPicker = false;
let addNewPlayerToScrim = true;
let notesPlayerId = '';
let notesPreviewTarget = null;
let shiftHeld = false;

function updateShiftShortcuts() {
  for (const button of document.querySelectorAll('[data-shift-label], [data-delete-player]')) {
    const hasPendingRemovals = !button.hasAttribute('data-apply-removals') || currentSession(state).attendees.some(attendee => pendingRemovals.has(attendee.playerId));
    const active = shiftHeld && !button.disabled && hasPendingRemovals;
    button.classList.toggle('shift-action', active);
    if (button.dataset.shiftLabel) {
      button.dataset.normalLabel ??= button.textContent;
      const text = active ? button.dataset.shiftLabel : button.dataset.normalLabel;
      if (button.textContent !== text) button.textContent = text;
    }
    if (button.dataset.deletePlayer) {
      button.dataset.normalAriaLabel ??= button.getAttribute('aria-label');
      button.setAttribute('aria-label', button.dataset.normalAriaLabel + (active ? ' without confirmation' : ''));
    }
  }
}

function setShiftHeld(value) {
  if (shiftHeld === value) return;
  shiftHeld = value;
  updateShiftShortcuts();
}

window.addEventListener('keydown', event => setShiftHeld(event.shiftKey), true);
window.addEventListener('keyup', event => setShiftHeld(event.key === 'Shift' ? false : event.shiftKey), true);
window.addEventListener('pointerdown', event => setShiftHeld(event.shiftKey), true);
window.addEventListener('pointermove', event => setShiftHeld(event.shiftKey), true);
window.addEventListener('blur', () => setShiftHeld(false));
window.addEventListener('focus', () => setShiftHeld(false));
document.addEventListener('visibilitychange', () => { if (document.hidden) setShiftHeld(false); });
let logLocked = false;
let attendancePromptOpen = false;
let draggedPlayerId = '';
let choosingPlayerId = '';
let choosingRole = '';
let hoveredRole = '';
let focusedRole = '';
let toastTimer;
let storageBlocked = false;
const themeKey = THEME_KEY;
let darkTheme = true;
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
  const code = gameCodeFor(state);
  try {
    await navigator.clipboard.writeText(code);
    notify(`Scrim code copied: ${code}`);
  } catch {
    notify(`Could not copy automatically. Scrim code: ${code}`);
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
  const rawBackup = readSavedState(localStorage);
  if (rawBackup !== null) state = restoreSavedState(localStorage, rawBackup);
} catch (error) {
  storageBlocked = true;
  if (error.code !== 'UNSUPPORTED_FORMAT') {
    element('storage-recovery-heading').textContent = 'Your saved data couldn’t be loaded';
    element('storage-recovery-message').textContent = 'It may be damaged, or browser storage may be unavailable. Nothing has been changed.';
  }
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
  const counts = new Map(currentSession(state).attendees.map(attendee => [attendee.playerId, preferredGamesFor(state, attendee.playerId)]));
  return [...currentSession(state).attendees].sort((first, second) => {
    const difference = counts.get(first.playerId) - counts.get(second.playerId);
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

function playerNotesButton(player) {
  return player.notes?.trim() ? `<button class="player-note-button" data-notes="${escapeHtml(player.id)}" title="" aria-label="Notes for ${escapeHtml(player.name)}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M5 3h14v13l-5 5H5Zm9 18v-5h5M8 7h8M8 11h8"/></svg></button>` : '';
}

function hideNotesPreview() {
  element('notes-preview').hidden = true;
  notesPreviewTarget?.removeAttribute('aria-describedby');
  notesPreviewTarget = null;
}

function showNotesPreview(target) {
  const notes = playerById(target.dataset.notes)?.notes;
  if (!notes?.trim()) return;
  hideNotesPreview();
  const preview = element('notes-preview');
  (target.closest('dialog') || document.body).append(preview);
  preview.textContent = notes;
  preview.style.left = '12px';
  preview.style.top = '12px';
  preview.hidden = false;
  notesPreviewTarget = target;
  target.setAttribute('aria-describedby', preview.id);
  const bounds = target.getBoundingClientRect();
  const width = preview.offsetWidth;
  const height = preview.offsetHeight;
  preview.style.left = `${Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12))}px`;
  preview.style.top = `${Math.max(12, bounds.bottom + height + 20 <= window.innerHeight ? bounds.bottom + 8 : bounds.top - height - 8)}px`;
}

document.addEventListener('pointerover', event => {
  const target = event.target.closest('[data-notes]');
  if (target && target !== notesPreviewTarget && event.pointerType !== 'touch') showNotesPreview(target);
});
document.addEventListener('pointerout', event => {
  if (notesPreviewTarget && !notesPreviewTarget.contains(event.relatedTarget)) hideNotesPreview();
});
document.addEventListener('focusin', event => {
  const target = event.target.closest('[data-notes]');
  if (target) showNotesPreview(target);
  else hideNotesPreview();
});
document.addEventListener('focusout', hideNotesPreview);
document.addEventListener('click', hideNotesPreview);
document.addEventListener('scroll', hideNotesPreview, true);
document.addEventListener('keydown', event => { if (event.key === 'Escape') hideNotesPreview(); });
window.addEventListener('resize', hideNotesPreview);

function playerCard(attendee) {
  const player = playerById(attendee.playerId);
  const assignedRole = ROLES.find(slot => currentSession(state).lineup[slot] === player.id);
  const group = roleGroup(assignedRole) || roleGroup(player.roles[0]) || 'tank';
  const activeSlot = currentSession(state).activeGame?.lineup.find(slot => slot.playerId === player.id);
  const activeGroup = roleGroup(activeSlot?.role);
  const barGroups = ['tank', 'dps', 'support'].filter(barGroup => playableRoles(player).some(role => roleGroup(role) === barGroup) || roleGroup(assignedRole) === barGroup || activeGroup === barGroup || gamesFor(state, player.id, barGroup) > 0);
  const groupLabels = { tank: 'tank', dps: 'DPS', support: 'supp' };
  const capacity = Math.max(5, currentSession(state).games.length + Number(Boolean(currentSession(state).activeGame)));
  const offRole = assignedRole && !playableRoles(player).includes(assignedRole);
  const filling = assignedRole && (player.offRoles || []).includes(assignedRole);
  const option = role => `<option value="${role}" ${assignedRole === role ? 'selected' : ''}>${role}${player.roles.includes(role) ? '' : (player.offRoles || []).includes(role) ? ' (fill)' : ' (unlisted)'}</option>`;
  const usual = ROLES.filter(role => player.roles.includes(role));
  const fills = player.offRoles || [];
  const unlisted = ROLES.filter(role => !playableRoles(player).includes(role));
  const choices = choosingPlayerId === player.id ? assignmentChoices(state, player.id) : [];
  return `<article class="player-card roster-row ${roleGroup(assignedRole) || group} ${attendee.present ? '' : 'not-present'} ${assignedRole ? 'selected' : ''} ${offRole ? 'off-role' : ''} ${choices.length ? 'choosing' : ''}" data-player-card="${escapeHtml(player.id)}">
    <div class="attendance-cell"><label class="attendance" title="${attendee.present ? 'Here' : 'Not here'}"><input type="checkbox" data-present="${escapeHtml(player.id)}" ${attendee.present ? 'checked' : ''} aria-label="${escapeHtml(player.name)} is present"><span aria-hidden="true">${attendee.present ? '✓' : '−'}</span></label>${assignedRole ? `<span class="lineup-badge ${roleGroup(assignedRole)} ${offRole ? 'unusual' : filling ? 'fill-assignment' : ''}" role="img" aria-label="Playing ${assignedRole}${offRole ? ' (unlisted)' : filling ? ' (fill)' : ''}" title="Playing ${assignedRole}${offRole ? ' (unlisted)' : filling ? ' (fill)' : ''}">${roleIcon(roleGroup(assignedRole))}${filling ? '<span class="fill-label">Fill</span>' : ''}${offRole ? '<span class="role-alert" aria-hidden="true">!</span>' : ''}</span>` : ''}</div>
    <div class="player-info" draggable="true" data-pick-player="${escapeHtml(player.id)}" title="${escapeHtml(player.battletag)} · Drag to a lineup slot">
      <div class="player-name-line"><button class="player-name-action" data-quick-assign="${escapeHtml(player.id)}" aria-label="Put ${escapeHtml(player.name)} in the lineup"><span class="card-name">${escapeHtml(player.name)} ${statusBadge(player)}${attendee.present ? '' : '<span class="away-badge">Not here</span>'}</span></button>${playerNotesButton(player)}</div>
      <span class="card-roles">${roleBadges(player, choices) || '<span class="muted small">No roles set</span>'}</span>
    </div>
    <label class="assignment-control"><span>Playing as</span><select data-assignment="${escapeHtml(player.id)}" aria-label="Playing as for ${escapeHtml(player.name)}"><option value="" ${!assignedRole ? 'selected' : ''}>Bench</option>${usual.length ? `<optgroup label="Main roles">${usual.map(option).join('')}</optgroup>` : ''}${fills.length ? `<optgroup label="Fill roles">${fills.map(option).join('')}</optgroup>` : ''}${unlisted.length ? `<optgroup label="Unlisted">${unlisted.map(option).join('')}</optgroup>` : ''}</select></label>
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
  if (currentSession(state).lineup[choosingRole]) choosingRole = '';
  const choices = choosingPlayerId ? assignmentChoices(state, choosingPlayerId) : [];
  element('board').classList.toggle('choosing-role', Boolean(choosingPlayerId));
  element('role-choice-text').textContent = choosingPlayerId ? `Choose a highlighted role for ${playerById(choosingPlayerId).name}. Press Escape or click the player again to cancel.` : choosingRole ? `Choose a player for ${choosingRole}. Highlighted players play this role; other players can still fill. Press Escape to cancel.` : '';
  element('board').hidden = attendees.length === 0;
  element('empty-roster').hidden = attendees.length !== 0;
  element('lineup-strip').innerHTML = ['tank', 'dps', 'support'].map(group => `<div class="lineup-group ${group}">
    <button class="group-preview" data-preview-group="${group}" aria-label="Highlight ${group === 'dps' ? 'DPS' : group} players">${roleIcon(group)}${group === 'dps' ? 'DPS' : group === 'tank' ? 'Tank' : 'Support'}</button>
    ${ROLES.filter(role => roleGroup(role) === group).map(role => {
    const player = playerById(currentSession(state).lineup[role]);
    const offRole = player && !playableRoles(player).includes(role);
    const filling = player && (player.offRoles || []).includes(role);
    return `<button class="active-slot ${roleGroup(role)} ${offRole ? 'off-role' : ''} ${choices.includes(role) ? 'matching-option' : ''}" data-drop-role="${role}" ${choices.includes(role) ? `data-choice-role="${role}" data-choice-player="${escapeHtml(choosingPlayerId)}"` : `tabindex="${player ? '-1' : '0'}"`} ${player ? `data-slot-player="${escapeHtml(player.id)}" draggable="true"` : `data-empty-role="${role}"`} aria-label="${role} slot: ${escapeHtml(player?.name || 'empty')}${offRole ? ', unlisted' : filling ? ', fill' : ''}">
      <span class="slot-role">${roleIcon(roleGroup(role))}${role}</span><span class="slot-name">${escapeHtml(player?.name || 'Empty')}</span>${offRole ? '<span class="off-role-badge">Unlisted</span>' : filling ? '<span class="fill-slot-badge">Fill</span>' : ''}
    </button>`;
  }).join('')}</div>`).join('');
  element('player-roster').innerHTML = attendees.map(playerCard).join('') + '<button class="add-player-row" data-open-directory><span aria-hidden="true">＋</span> Add player</button>';
  const status = lineupStatus(state);
  element('lineup-status').textContent = `${currentSession(state).activeGame ? 'Next lineup · ' : ''}${status.filled < 5 ? `${status.filled}/5 selected` : status.absent.length ? `${status.absent.length} not marked here` : '✓ Ready'}`;
  element('lineup-status').classList.toggle('ready', status.ready);
  element('clear-lineup').disabled = status.filled === 0;
  const autofillReason = autofillUnavailableReason(state);
  element('autofill-lineup').disabled = Boolean(autofillReason);
  element('autofill-lineup').title = autofillReason || 'Fill empty slots with present players';
  const hasPreviousGame = Boolean(currentSession(state).activeGame || currentSession(state).games.length);
  element('lineup-swaps').disabled = !hasPreviousGame || status.filled !== 5;
  element('lineup-swaps').title = !hasPreviousGame ? 'Start a game first to compare lineups' : status.filled !== 5 ? 'Fill all five lineup slots to see swaps' : 'Compare with the active or most recent game · Shift-click to copy';
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
    const player = playerById(row.dataset.playerCard);
    const matchesRole = playerRole => playerRole === role || roleGroup(playerRole) === role;
    const matches = role && player.roles.some(matchesRole);
    const fills = role && !matches && (player.offRoles || []).some(matchesRole);
    row.classList.toggle('fill-preview', Boolean(fills));
    for (const badge of row.querySelectorAll('[data-role-chip]')) badge.classList.toggle('fill-match', Boolean(fills && matchesRole(badge.dataset.roleChip)));
    row.classList.toggle('eligible-preview', Boolean(matches));
    row.classList.toggle('ineligible-preview', Boolean(role && !matches && !fills));
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
    if (currentSession(state).lineup[choices[0]] !== playerId) placePlayer(playerId, choices[0]);
    else notify(`Already playing ${choices[0]}.`);
  } else {
    choosingPlayerId = choosingPlayerId === playerId ? '' : playerId;
    renderBoard();
  }
}

function placePlayer(playerId, role, swap = false) {
  const previous = { ...currentSession(state).lineup };
  const previousRole = ROLES.find(slot => previous[slot] === playerId);
  const replaced = playerById(previous[role]);
  if (swap && replaced) swapPlayers(state, playerId, replaced.id);
  else if (role) assignPlayer(state, role, playerId, true);
  else if (previousRole) assignPlayer(state, previousRole, '');
  commit();
  const message = role ? `${playerById(playerId).name} → ${role}${replaced && replaced.id !== playerId ? ` · ${replaced.name} → ${swap && previousRole ? previousRole : 'Bench'}` : ''}` : `${playerById(playerId).name} → Bench`;
  notify(message, () => { currentSession(state).lineup = previous; commit(); });
}

function directoryPlayers(query) {
  const search = query.toLowerCase();
  return [...state.players].sort((first, second) => first.name.localeCompare(second.name)).filter(player => `${player.name} ${player.battletag} ${playableRoles(player).join(' ')} ${player.notes || ''} ${statusNames[player.status] || ''}`.toLowerCase().includes(search));
}

function renderDirectory() {
  const players = directoryPlayers(element('directory-search').value);
  element('directory-list').innerHTML = players.length ? players.map(player => `<div class="directory-row ${pendingRemovals.has(player.id) ? 'pending-removal' : ''}"><label class="directory-person"><input type="checkbox" data-attendee="${escapeHtml(player.id)}" ${currentSession(state).attendees.some(attendee => attendee.playerId === player.id) && !pendingRemovals.has(player.id) ? 'checked' : ''}><span><strong>${escapeHtml(player.name)} ${statusBadge(player)}</strong><small>${escapeHtml(player.battletag || 'No BattleTag')} · ${player.roles.join(' / ')}${player.offRoles?.length ? ' · Fill: ' + player.offRoles.join(' / ') : ''}</small></span></label><button class="quiet" data-edit="${escapeHtml(player.id)}" aria-label="Edit ${escapeHtml(player.name)}">Edit</button></div>`).join('') : '<p class="muted small">No matching players.</p>';
  const count = currentSession(state).attendees.filter(attendee => pendingRemovals.has(attendee.playerId)).length;
  element('pending-removals').textContent = count ? `${count} pending removal${count === 1 ? '' : 's'}` : '';
  renderManagedDirectory();
}

function renderManagedDirectory() {
  const players = directoryPlayers(element('manage-directory-search').value);
  element('directory-player-count').textContent = `${state.players.length} player${state.players.length === 1 ? '' : 's'}`;
  element('manage-directory-list').innerHTML = players.length ? players.map(player => `<div class="directory-row"><div class="managed-player"><div class="managed-player-heading"><strong>${escapeHtml(player.name)}</strong>${statusBadge(player)}<span class="muted small">${escapeHtml(player.battletag || 'No BattleTag')}</span></div><div class="card-roles">${roleBadges(player)}</div>${player.notes?.trim() ? `<button class="directory-note" data-notes="${escapeHtml(player.id)}" title="" aria-label="Notes for ${escapeHtml(player.name)}">${escapeHtml(player.notes)}</button>` : ''}</div><div class="row-actions">${copyPlayerButton(player)}<button class="quiet" data-edit="${escapeHtml(player.id)}" aria-label="Edit ${escapeHtml(player.name)}">Edit</button><button class="directory-delete danger" data-delete-player="${escapeHtml(player.id)}" title="Delete player · Shift-click to skip confirmation" aria-label="Delete ${escapeHtml(player.name)}"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></svg></button></div></div>`).join('') : '<p class="muted small">No matching players.</p>';
  updateShiftShortcuts();
}

function renderGames() {
  element('undo-game').hidden = currentSession(state).games.length === 0;
  gamesUI.render();
}

function render() {
  renderGameCode();
  element('session-title').value = currentSession(state).title;
  element('contact').value = currentSession(state).contact;
  element('present-count').textContent = `${currentSession(state).attendees.filter(attendee => attendee.present).length} / ${currentSession(state).attendees.length}`;
  element('game-count').textContent = currentSession(state).games.length;
  element('next-number').textContent = String(currentSession(state).games.length + 1);
  renderBoard();
  renderGames();
  renderDirectory();
  if (element('scrim-switcher').open) scrimsUI.render();
  updateShiftShortcuts();
}

function openDirectory() {
  pendingRemovals.clear();
  element('directory-search').value = '';
  renderDirectory();
  element('directory-dialog').showModal();
}

async function closeRosterPicker(skipConfirmation = false) {
  if (closingRosterPicker) return;
  closingRosterPicker = true;
  try {
    const removing = currentSession(state).attendees.filter(attendee => pendingRemovals.has(attendee.playerId));
    if (removing.length && (skipConfirmation || await confirmAction(`Remove ${removing.length} player${removing.length === 1 ? '' : 's'} from this scrim?`, `${removing.map(attendee => `• ${playerById(attendee.playerId).name}`).join('\n')}\n\nTheir lineup slots will be cleared. Directory entries and played games are kept.`, 'Remove players'))) {
      for (const attendee of removing) removeAttendee(state, attendee.playerId);
      commit();
    }
    pendingRemovals.clear();
    element('directory-dialog').close();
  } finally { closingRosterPicker = false; }
}

function closeDialog(id) {
  if (id === 'directory-dialog') closeRosterPicker();
  else element(id).close();
}

function openPlayer(playerId = '', addToScrim = true) {
  addNewPlayerToScrim = addToScrim;
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
  element('player-roles').innerHTML = ROLES.map(role => {
    const preference = player?.roles.includes(role) ? 'main' : player?.offRoles?.includes(role) ? 'fill' : 'none';
    return `<button type="button" class="role-cycle ${roleGroup(role)}" data-role="${role}" data-preference="${preference}"><span>${role}</span><span data-preference-label></span></button>`;
  }).join('');
  element('player-roles').querySelectorAll('button').forEach(updateRoleCycle);
  element('player-dialog').showModal();
  element('player-name').focus();
}

for (const dialog of document.querySelectorAll('dialog')) {
  if (dialog.id === 'storage-recovery-dialog') continue;
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
    else closeDialog(dialog.id);
  });
}
element('directory-dialog').addEventListener('cancel', event => { event.preventDefault(); closeRosterPicker(); });

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
  const role = slot.dataset.dropRole || ROLES.find(role => currentSession(state).lineup[role] === slot.dataset.playerCard);
  const sourceRole = ROLES.find(role => currentSession(state).lineup[role] === draggedPlayerId);
  const targetId = slot.dataset.playerCard || currentSession(state).lineup[role];
  slot.classList.toggle('off-role-target', Boolean((role && !playableRoles(playerById(draggedPlayerId)).includes(role)) || (sourceRole && targetId && !playableRoles(playerById(targetId)).includes(sourceRole))));
});
element('board').addEventListener('dragleave', event => {
  const slot = event.target.closest('[data-drop-role], [data-player-card]');
  if (slot && !slot.contains(event.relatedTarget)) slot.classList.remove('drop-target', 'off-role-target');
});
document.addEventListener('dragend', endPlayerDrag);
document.addEventListener('dragover', event => {
  const canBench = draggedPlayerId && ROLES.some(role => currentSession(state).lineup[role] === draggedPlayerId) && !event.target.closest('#lineup-strip, [data-player-card]');
  element('bench-drop-hint').hidden = !canBench;
  if (!canBench) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
});
document.addEventListener('drop', event => {
  if (!draggedPlayerId || event.target.closest('#lineup-strip, [data-player-card]')) return;
  const playerId = draggedPlayerId;
  if (!ROLES.some(role => currentSession(state).lineup[role] === playerId)) return;
  event.preventDefault();
  endPlayerDrag();
  placePlayer(playerId, '');
});
element('board').addEventListener('drop', event => {
  const slot = event.target.closest('[data-drop-role], [data-player-card]');
  const playerId = draggedPlayerId;
  if (!slot || !playerId) return;
  event.preventDefault();
  const role = slot.dataset.dropRole || ROLES.find(role => currentSession(state).lineup[role] === slot.dataset.playerCard);
  const sourceRole = ROLES.find(role => currentSession(state).lineup[role] === playerId);
  const targetId = slot.dataset.playerCard;
  endPlayerDrag();
  if (!role) {
    if (sourceRole && targetId) placePlayer(targetId, sourceRole, true);
    return;
  }
  if (currentSession(state).lineup[role] === playerId) return;
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
  if (!ROLES.some(role => currentSession(state).lineup[role] === playerId)) return;
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
  if (button.dataset.close === 'directory-dialog' && button.dataset.applyRemovals !== undefined) closeRosterPicker(event.shiftKey);
  else if (button.dataset.close) closeDialog(button.dataset.close);
  if (button.hasAttribute('data-open-directory')) openDirectory();
  if (button.dataset.edit) openPlayer(button.dataset.edit);
  if (button.dataset.deletePlayer) await deletePlayer(button.dataset.deletePlayer, event.shiftKey);
  if (button.dataset.notes) {
    const player = playerById(button.dataset.notes);
    if (!player) return;
    notesPlayerId = player.id;
    element('player-notes-heading').textContent = `${player.name} · Notes`;
    element('quick-player-notes').value = player.notes || '';
    element('player-notes-dialog').showModal();
    element('quick-player-notes').focus();
  }
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
    const attendee = currentSession(state).attendees.find(item => item.playerId === player?.id);
    if (!attendee || attendee.present) return;
    const previous = structuredClone({ attendees: currentSession(state).attendees, lineup: currentSession(state).lineup });
    removeAttendee(state, player.id);
    commit();
    notify(`${player.name} removed from scrim.`, () => { Object.assign(currentSession(state), previous); commit(); });
  }
});

document.addEventListener('change', async event => {
  const target = event.target;
  if (target.dataset.assignment) placePlayer(target.dataset.assignment, target.value);
  if (target.dataset.present) {
    const playerId = target.dataset.present;
    currentSession(state).attendees.find(attendee => attendee.playerId === playerId).present = target.checked;
    commit();
  }
  if (target.dataset.attendee) {
    const playerId = target.dataset.attendee;
    if (target.checked) {
      pendingRemovals.delete(playerId);
      if (!currentSession(state).attendees.some(attendee => attendee.playerId === playerId)) currentSession(state).attendees.push({ playerId, present: false });
    } else pendingRemovals.add(playerId);
    commit();
    Array.from(document.querySelectorAll('[data-attendee]')).find(input => input.dataset.attendee === playerId)?.focus();
  }
});

for (const [inputId, field] of [['session-title', 'title'], ['contact', 'contact']]) {
  element(inputId).addEventListener('input', event => {
    currentSession(state)[field] = event.target.value;
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
element('manage-directory-search').addEventListener('input', renderManagedDirectory);
element('manage-directory-button').onclick = () => {
  element('manage-directory-search').value = '';
  renderManagedDirectory();
  element('manage-directory-dialog').showModal();
  updateShiftShortcuts();
  element('manage-directory-search').focus();
};
element('directory-create-player').onclick = () => openPlayer('', false);
element('quick-player-notes').oninput = () => {
  const player = playerById(notesPlayerId);
  if (!player) return;
  player.notes = element('quick-player-notes').value;
  commit();
};
function renderGameCode() {
  const code = gameCodeFor(state);
  if (document.activeElement !== element('custom-game-code')) element('custom-game-code').value = state.customGameCode;
  element('scrim-code-label').textContent = code;
  element('copy-scrim-code').setAttribute('aria-label', `Copy scrim code ${code}`);
  element('copy-scrim-code').title = `Copy scrim code ${code}`;
}
element('custom-game-code').oninput = () => {
  state.customGameCode = element('custom-game-code').value;
  persist();
  renderGameCode();
};
element('settings-button').onclick = () => {
  element('custom-game-code').value = state.customGameCode;
  element('settings-dialog').showModal();
};
element('add-players').onclick = openDirectory;
element('create-player').onclick = () => openPlayer();
element('lineup-swaps').onclick = async event => {
  try {
    const { source, pairs, message } = lineupSwaps(state);
    const number = currentSession(state).activeGame ? currentSession(state).games.length + 1 : currentSession(state).games.length;
    const swapArrow = '<svg class="swap-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>';
    element('swaps-source').innerHTML = `<span>Game ${number}${currentSession(state).activeGame ? ' · In progress' : ' · Completed'}${referenceName(source.map) ? ` · ${escapeHtml(referenceName(source.map))}` : ''}</span><span class="swaps-destination">${swapArrow} Current lineup</span>`;
    const playerLabel = player => `<strong>${escapeHtml(player.battletag?.split('#')[0].trim() || player.name)}</strong><small class="${roleGroup(player.role)}">${escapeHtml(player.role)}</small>`;
    element('swaps-list').innerHTML = pairs.length ? '<div class="swap-labels"><span>In</span><span></span><span>Out</span></div>' + pairs.map(pair => `<div class="swap-pair"><span>${playerLabel(pair.incoming)}</span>${swapArrow}<span>${playerLabel(pair.outgoing)}</span></div>`).join('') : '<p class="swaps-empty">No player swaps needed.</p>';
    element('swaps-message').value = message;
    element('swaps-message-field').hidden = !pairs.length;
    element('copy-swaps').hidden = !pairs.length;
    if (event.shiftKey) {
      if (!pairs.length) return notify('No player swaps needed.');
      await copySwaps();
    } else element('swaps-dialog').showModal();
  } catch (error) { notify(error.message); }
};
async function copySwaps() {
  try { await navigator.clipboard.writeText(element('swaps-message').value); notify('Swap message copied.'); }
  catch {
    if (!element('swaps-dialog').open) element('swaps-dialog').showModal();
    element('swaps-message').focus();
    element('swaps-message').select();
    notify('Use Ctrl+C or ⌘C to copy the selected message.');
  }
}
element('copy-swaps').onclick = copySwaps;
element('clear-lineup').onclick = () => {
  const previous = { ...currentSession(state).lineup };
  currentSession(state).lineup = emptyLineup();
  commit();
  notify('Lineup cleared.', () => { currentSession(state).lineup = previous; commit(); });
};
element('autofill-lineup').onclick = () => {
  try {
    const previous = { ...currentSession(state).lineup };
    currentSession(state).lineup = autofillLineup(state);
    commit();
    notify('Lineup filled.', () => { currentSession(state).lineup = previous; commit(); });
  } catch (error) { notify(error.message); }
};

async function gameAction(action, outcome) {
  if (logLocked || attendancePromptOpen) return;
  try {
    let markPresent = false;
    if (action === 'start' && !currentSession(state).activeGame && lineupStatus(state).filled === 5 && lineupStatus(state).absent.length) {
      const lineup = JSON.stringify(currentSession(state).lineup);
      const names = lineupStatus(state).absent.map(playerId => playerById(playerId).name);
      attendancePromptOpen = true;
      try {
        markPresent = await confirmAction('Are these players here?', `${names.join('\n')}\n\nNot marked present yet.`, 'Mark them here & start');
      } finally { attendancePromptOpen = false; }
      if (!markPresent) return;
      if (lineup !== JSON.stringify(currentSession(state).lineup)) { notify('The lineup changed. Please start again.'); return; }
    }
    if (action === 'start') startGame(state, uid(), new Date().toISOString(), markPresent);
    else if (action === 'finish') {
      if (!['win', 'loss', 'draw'].includes(outcome)) return;
      finishGame(state, new Date().toISOString());
      currentSession(state).games.at(-1).outcome = outcome;
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
  if (!currentSession(state).games.length) return;
  const previousDraft = gameDetails(currentSession(state).draft);
  const game = currentSession(state).games.pop();
  currentSession(state).draft = gameDetails(game);
  commit();
  gamesUI.showCurrent();
  notify('Game undone · upcoming map and bans restored.', () => {
    currentSession(state).games.push(game);
    currentSession(state).draft = previousDraft;
    commit();
  });
};
element('copy-contact').onclick = async () => {
  if (!currentSession(state).contact.trim()) return notify('Add the opponent’s BattleTag first.');
  try { await navigator.clipboard.writeText(currentSession(state).contact); notify('Opponent BattleTag copied.'); }
  catch { element('contact').focus(); element('contact').select(); notify('Use Ctrl+C or ⌘C to copy the selected BattleTag.'); }
};

function updateRoleCycle(button) {
  const labels = { none: 'Unlisted', main: 'Main', fill: 'Fill' };
  const next = { none: 'main', main: 'fill', fill: 'none' }[button.dataset.preference];
  button.querySelector('[data-preference-label]').textContent = labels[button.dataset.preference];
  button.setAttribute('aria-label', `${roleNames[button.dataset.role]}: ${labels[button.dataset.preference]}. Change to ${labels[next]}.`);
  button.title = `Change to ${labels[next]}`;
}

element('player-roles').onclick = event => {
  const button = event.target.closest('[data-preference]');
  if (!button) return;
  button.dataset.preference = { none: 'main', main: 'fill', fill: 'none' }[button.dataset.preference];
  updateRoleCycle(button);
  savePlayer();
};

function savePlayer() {
  const selected = [...document.querySelectorAll('#player-roles [data-preference]')];
  const roles = selected.filter(button => button.dataset.preference === 'main').map(button => button.dataset.role);
  const offRoles = selected.filter(button => button.dataset.preference === 'fill').map(button => button.dataset.role);
  const name = element('player-name').value.trim() || 'Unnamed player';
  const playerId = element('player-id').value;
  const player = { id: playerId || uid(), name, battletag: element('player-tag').value.trim(), roles, offRoles, status: element('player-status').value, notes: element('player-notes').value.trim() };
  if (playerId) {
    state.players[state.players.findIndex(person => person.id === playerId)] = player;
  }
  else {
    state.players.push(player);
    if (addNewPlayerToScrim) currentSession(state).attendees.push({ playerId: player.id, present: false });
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
async function deletePlayer(playerId, skipConfirmation = false) {
  const player = playerById(playerId);
  if (!player) return;
  if (skipConfirmation || await confirmAction(`Delete ${player.name}?`, 'This removes the player from the directory and every saved scrim’s roster and lineup. Past game records keep their original name.', 'Delete player')) {
    for (const scrim of allScrims(state)) removeAttendee(state, playerId, scrim.id);
    state.players = state.players.filter(player => player.id !== playerId);
    pendingRemovals.delete(playerId);
    commit();
    if (element('player-dialog').open && element('player-id').value === playerId) element('player-dialog').close();
  }
}
element('delete-player').onclick = event => deletePlayer(element('player-id').value, event.shiftKey);


window.addEventListener('storage', event => {
  if (!isStateStorageKey(event.key)) return;
  externalChange = true;
  storageBlocked = true;
  element('save-status').textContent = 'Another tab changed this scrim';
  element('storage-warning').hidden = false;
  element('storage-warning').textContent = 'Another tab changed the saved scrim. Saving is paused here to avoid overwriting it. Reload to use the latest saved data, or export this tab’s changes first.';
});

const gamesUI = createGamesUI({ getState: () => state, save: commit, action: gameAction, roleIcon, confirmAction });
const scrimsUI = createScrimsUI({ getState: () => state, save: commit, confirmAction, notify, canCreate: () => !storageBlocked, changed: () => {
  gamesUI.reset();
  hoveredRole = '';
  focusedRole = '';
  draggedPlayerId = '';
  commit();
  element('player-roster').scrollTop = 0;
} });
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
if (!currentScrim(state).createdAt) currentScrim(state).createdAt = new Date().toISOString();
createBackupsUI({ getState: () => state, isRecovering: () => storageBlocked, canImport: () => !externalChange, notify });
render();

element('storage-recovery-dialog').addEventListener('cancel', event => event.preventDefault());
element('storage-import').onclick = () => element('import-file').click();
element('storage-start-fresh').onclick = () => {
  try {
    deleteSavedData(localStorage);
    location.reload();
  } catch {
    element('storage-recovery-error').textContent = 'Could not clear saved data. Check browser storage permissions and try again.';
  }
};
if (storageBlocked) element('storage-recovery-dialog').showModal();
