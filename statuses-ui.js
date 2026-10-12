import { PRIORITIES } from './schema.js';
import { saveStatus, deleteStatus, orderedStatuses, moveStatus, placeStatus } from './statuses.js';

const element = id => document.getElementById(id);
const trashIcon = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></svg>';

export function createStatusesUI({ getState, escapeHtml, confirmAction, onChange }) {
  let editingId = '';
  function showList(focus = false) {
    element('status-editor').hidden = true;
    element('statuses-list-view').hidden = false;
    element('directory-footer').hidden = false;
    render();
    if (focus) {
      const button = [...element('statuses-list').querySelectorAll('[data-edit-status]')].find(button => button.dataset.editStatus === editingId);
      (button || element('add-status')).focus();
    }
  }
  function selectTab(tab, focus = false) {
    for (const name of ['players', 'statuses']) {
      const selected = tab === name;
      const button = element(`directory-${name}-tab`);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      element(`directory-${name}-panel`).hidden = !selected;
      element(`directory-${name}-panel`).inert = !selected;
      if (selected && focus) button.focus();
    }
    element('directory-player-count').hidden = tab !== 'players';
    element('directory-status-count').hidden = tab !== 'statuses';
    showList();
  }
  for (const name of ['players', 'statuses']) {
    const button = element(`directory-${name}-tab`);
    button.onclick = () => selectTab(name);
    button.onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      selectTab(event.key === 'Home' ? 'players' : event.key === 'End' ? 'statuses' : name === 'players' ? 'statuses' : 'players', true);
    };
  }
  element('status-back').onclick = () => showList(true);
  function render() {
    const statuses = orderedStatuses(getState());
    const query = element('status-search').value.trim().toLowerCase();
    const matches = statuses.filter(status => status.name.toLowerCase().includes(query));
    element('directory-status-count').textContent = `${statuses.length} status${statuses.length === 1 ? '' : 'es'}`;
    element('statuses-list').innerHTML = matches.length ? matches.map(status => {
      const priority = PRIORITIES.find(option => option.value === status.priority);
      const handle = `<button class="status-drag quiet" data-drag-status="${escapeHtml(status.id)}" ${query ? 'disabled' : ''} aria-label="Reorder ${escapeHtml(status.name)}" aria-keyshortcuts="ArrowUp ArrowDown" title="${query ? 'Clear search to reorder' : 'Reorder'}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h14"/></svg></button>`;
      const fixed = status.id === 'default';
      const actions = `<button class="quiet" data-edit-status="${escapeHtml(status.id)}" ${fixed ? 'disabled title="Default cannot be edited"' : ''} aria-label="Edit ${escapeHtml(status.name)}">Edit</button><button class="directory-delete danger" data-delete-status="${escapeHtml(status.id)}" ${fixed ? 'disabled' : ''} title="${fixed ? 'Default cannot be deleted' : 'Delete status'}" aria-label="Delete ${escapeHtml(status.name)}">${trashIcon}</button>`;
      return `<div class="directory-row" data-status-row="${escapeHtml(status.id)}">${handle}<span class="status-swatch" style="background:${status.color}" aria-hidden="true"></span><div class="status-description">${status.showBadge ? `<span class="status-badge" style="--status-color:${status.color}">${escapeHtml(status.name)}</span>` : `<strong>${escapeHtml(status.name)}</strong>`}</div><span class="status-priority" aria-label="Default autofill priority: ${priority.label}">${priority.label}</span><div class="row-actions status-row-actions">${actions}</div></div>`;
    }).join('') : `<p class="muted small">${statuses.length ? 'No matching statuses.' : 'No custom statuses.'}</p>`;
    element('add-status').disabled = getState().statuses.length >= 100;
  }
  function syncControls() {
    const badge = element('status-preview');
    badge.textContent = element('status-name').value.trim() || 'New status';
    badge.style.setProperty('--status-color', element('status-color').value);
    badge.hidden = !element('status-show-badge').checked;
    const priority = PRIORITIES[Number(element('status-priority').value)];
    element('status-priority-value').textContent = priority.label;
    element('status-priority').setAttribute('aria-valuetext', priority.label);
    element('delete-status').hidden = !editingId;
  }
  function save() {
    syncControls();
    // Leave an untouched new form empty; once editing, retain the last valid name.
    const name = element('status-name').value.trim();
    if (!name) {
      element('status-error').textContent = 'Enter a status name to save your changes.';
      return false;
    }
    try {
      const id = editingId || crypto.randomUUID();
      saveStatus(getState(), {
        id, name, color: element('status-color').value,
        priority: PRIORITIES[Number(element('status-priority').value)].value,
        showBadge: element('status-show-badge').checked,
      });
      editingId = id;
      element('delete-status').hidden = false;
      element('status-error').textContent = '';
      onChange();
      render();
      return true;
    } catch (error) {
      element('status-error').textContent = error.message;
      return false;
    }
  }
  function edit(id = '') {
    editingId = id;
    const status = getState().statuses.find(status => status.id === id);
    element('status-editor-heading').textContent = status ? 'Edit status' : 'New status';
    element('status-name').value = status?.name || '';
    element('status-color').value = status?.color || '#52805b';
    element('status-priority').value = PRIORITIES.findIndex(option => option.value === (status?.priority || '1'));
    element('status-show-badge').checked = status?.showBadge ?? true;
    element('status-error').textContent = '';
    syncControls();
    element('statuses-list-view').hidden = true;
    element('directory-footer').hidden = true;
    element('status-editor').hidden = false;
    element('status-name').focus();
  }
  async function remove(id, skipConfirmation = false) {
    const status = getState().statuses.find(status => status.id === id);
    if (!status) return;
    if (skipConfirmation || await confirmAction(`Delete ${status.name}?`, 'Players with this status will return to Default. Their saved scrim priorities are kept.', 'Delete status')) {
      deleteStatus(getState(), status.id);
      onChange();
      render();
      if (!element('status-editor').hidden && editingId === id) showList(true);
    }
  }
  element('status-priority').max = PRIORITIES.length - 1;
  element('status-priority-ticks').innerHTML = PRIORITIES.map((priority, index) => `<span style="left:${index / (PRIORITIES.length - 1) * 100}%" class="${priority.value === '1' ? 'neutral' : ''}">${priority.label}</span>`).join('');
  element('status-search').oninput = render;
  element('add-status').onclick = () => edit();
  element('status-form').oninput = save;
  element('status-form').onsubmit = event => {
    event.preventDefault();
    if (!editingId && !element('status-name').value.trim()) showList(true);
    else if (save()) showList(true);
  };
  element('delete-status').onclick = event => remove(editingId, event.shiftKey);
  element('statuses-list').onclick = event => {
    const editButton = event.target.closest('[data-edit-status]');
    if (editButton && !editButton.disabled) { edit(editButton.dataset.editStatus); return; }
    const deleteButton = event.target.closest('[data-delete-status]');
    if (deleteButton && !deleteButton.disabled) remove(deleteButton.dataset.deleteStatus, event.shiftKey);
  };
  function finishMove(id) {
    onChange();
    render();
    [...element('statuses-list').querySelectorAll('[data-drag-status]')].find(button => button.dataset.dragStatus === id)?.focus();
  }
  const list = element('statuses-list');
  list.onkeydown = event => {
    const handle = event.target.closest('[data-drag-status]');
    if (!handle || handle.disabled || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    moveStatus(getState(), handle.dataset.dragStatus, event.key === 'ArrowUp' ? -1 : 1);
    finishMove(handle.dataset.dragStatus);
  };
  let drag = null;
  function cancelDrag() {
    if (!drag) return;
    const previous = drag;
    drag = null;
    cancelAnimationFrame(previous.frame);
    if (previous.handle.hasPointerCapture(previous.pointerId)) previous.handle.releasePointerCapture(previous.pointerId);
    list.classList.remove('status-sorting');
    for (const row of previous.rows) {
      row.element.classList.remove('status-dragging');
      row.element.style.removeProperty('transform');
    }
  }
  function drawDrag() {
    if (!drag?.started) return;
    const panel = element('directory-statuses-panel');
    const bounds = panel.getBoundingClientRect();
    const beforeScroll = panel.scrollTop;
    if (drag.y < bounds.top + 28) panel.scrollTop -= 10;
    else if (drag.y > bounds.bottom - 28) panel.scrollTop += 10;
    const scrollDelta = panel.scrollTop - drag.scrollTop;
    const offset = drag.y - drag.startY + scrollDelta;
    const top = drag.rows[drag.index].top + offset;
    const bottom = top + drag.height;
    drag.destination = drag.index;
    // Swap when the leading edge crosses a neighbor's midpoint, rather than
    // requiring the dragged row to travel a full row height before it moves.
    drag.rows.forEach((row, index) => {
      const midpoint = row.top + row.height / 2;
      if (index < drag.index && top < midpoint) drag.destination = Math.min(drag.destination, index);
      if (index > drag.index && bottom > midpoint) drag.destination = Math.max(drag.destination, index);
    });
    drag.rows.forEach((row, index) => {
      let shift = 0;
      if (index === drag.index) shift = offset;
      else if (index > drag.index && index <= drag.destination) shift = -drag.height;
      else if (index < drag.index && index >= drag.destination) shift = drag.height;
      row.element.style.transform = `translateY(${shift}px)`;
    });
    // Continue scrolling while a held pointer stays near the panel edge.
    if (panel.scrollTop !== beforeScroll) drag.frame = requestAnimationFrame(drawDrag);
  }
  list.onpointerdown = event => {
    const handle = event.target.closest('[data-drag-status]');
    if (!handle || handle.disabled || event.button !== 0) return;
    const rows = [...list.querySelectorAll('[data-status-row]')].map(element => {
      const rect = element.getBoundingClientRect();
      return { element, top: rect.top, height: rect.height };
    });
    const index = rows.findIndex(row => row.element.dataset.statusRow === handle.dataset.dragStatus);
    drag = { id: handle.dataset.dragStatus, handle, pointerId: event.pointerId, startY: event.clientY, y: event.clientY,
      rows, index, destination: index, height: rows[index].height,
      scrollTop: element('directory-statuses-panel').scrollTop, started: false, frame: 0 };
    handle.setPointerCapture(event.pointerId);
  };
  list.onpointermove = event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.y = event.clientY;
    if (!drag.started && Math.abs(drag.y - drag.startY) < 5) return;
    drag.started = true;
    list.classList.add('status-sorting');
    drag.rows[drag.index].element.classList.add('status-dragging');
    cancelAnimationFrame(drag.frame);
    drawDrag();
  };
  list.onpointerup = event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const completed = drag;
    cancelDrag();
    if (completed.started && completed.destination !== completed.index) {
      const target = completed.rows[completed.destination].element.dataset.statusRow;
      placeStatus(getState(), completed.id, target, completed.destination > completed.index);
      finishMove(completed.id);
    }
  };
  list.onpointercancel = cancelDrag;
  list.onlostpointercapture = cancelDrag;
  list.addEventListener('keydown', event => { if (event.key === 'Escape') cancelDrag(); });
  return { open() { element('status-search').value = ''; selectTab('players'); element('manage-directory-dialog').showModal(); } };
}
