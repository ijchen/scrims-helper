import { MAPS, HEROES } from './catalog.js';
import { findCatalogItem, searchCatalog } from './search.js';
import { catalogItem, catalogReference, referenceName } from './catalog-references.js';
import { currentSession, ROLES, MODES, OUTCOMES, modeRotation, gameWarnings, roleGroup, lineupStatus, replaceGamePlayer, setGameOutcome, enabledMaps, saveMapPoolPreset, loadMapPoolPreset, renameMapPoolPreset } from './model.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const element = id => document.getElementById(id);
const warningText = warnings => warnings.length ? `<span class="conflict-note">⚠ ${warnings.join(' · ')}</span>` : '';

export const finishControls = () => `<div class="finish-controls" role="group" aria-label="Finish game with result">${OUTCOMES.map(outcome => `<button class="finish-result ${outcome}" data-game-action="finish" data-finish-outcome="${outcome}" title="Finish game as a ${outcome} and count playtime">${{ win: 'Win', loss: 'Loss', draw: 'Draw' }[outcome]}</button>`).join('')}</div>`;

export function createGamesUI({ getState, save, action, roleIcon, confirmAction }) {
  let picker = null;
  let filter = '';
  let editingId = null;
  let prepareNext = false;
  let previousCompletedCount = null;
  const pickerDialog = element('catalog-dialog');
  const editor = element('game-editor');
  let editingPresetId = '';
  function renderPresetControls() {
    const enabled = new Set(enabledMaps(currentSession(getState())).map(map => map.id));
    element('map-pool-all').setAttribute('aria-pressed', String(enabled.size === MAPS.length));
    element('map-pool-none').setAttribute('aria-pressed', String(enabled.size === 0));
    element('map-pool-presets').innerHTML = getState().mapPoolPresets.map(preset => {
      const matches = MAPS.every(map => enabled.has(map.id) === preset.mapIds.includes(map.id));
      return `<div class="pool-chip"><button data-load-pool="${escapeHtml(preset.id)}" aria-pressed="${matches}" title="Load ${escapeHtml(preset.name)}">${escapeHtml(preset.name)}</button><button data-edit-pool="${escapeHtml(preset.id)}" aria-label="Manage ${escapeHtml(preset.name)}" title="Rename or delete">⋯</button></div>`;
    }).join('');
  }
  function syncPoolCheckboxes() {
    const enabled = new Set(enabledMaps(currentSession(getState())).map(map => map.id));
    element('map-pool-list').querySelectorAll('[data-pool-map]').forEach(checkbox => { checkbox.checked = enabled.has(checkbox.dataset.poolMap); });
    renderPresetControls();
  }
  function openPresetEditor(id = '') {
    editingPresetId = id;
    const preset = getState().mapPoolPresets.find(preset => preset.id === id);
    element('pool-preset-heading').textContent = preset ? 'Manage pool' : 'Save pool';
    element('map-pool-name').value = preset?.name || '';
    element('map-pool-feedback').textContent = '';
    element('delete-map-pool').hidden = !preset;
    element('save-preset-submit').textContent = preset ? 'Rename' : 'Save';
    element('pool-preset-editor').showModal();
    element('map-pool-name').focus();
    element('map-pool-name').select();
  }
  element('save-pool-button').onclick = () => openPresetEditor();
  element('map-pool-presets').onclick = event => {
    const button = event.target.closest('button');
    if (button?.dataset.loadPool) {
      loadMapPoolPreset(getState(), button.dataset.loadPool);
      save();
      syncPoolCheckboxes();
      [...element('map-pool-presets').querySelectorAll('[data-load-pool]')].find(item => item.dataset.loadPool === button.dataset.loadPool)?.focus({ preventScroll: true });
    }
    if (button?.dataset.editPool) openPresetEditor(button.dataset.editPool);
  };
  element('save-map-pool-form').onsubmit = event => {
    event.preventDefault();
    try {
      if (editingPresetId) renameMapPoolPreset(getState(), editingPresetId, element('map-pool-name').value);
      else saveMapPoolPreset(getState(), crypto.randomUUID(), element('map-pool-name').value);
      save();
      element('pool-preset-editor').close();
      renderPresetControls();
    } catch (error) { element('map-pool-feedback').textContent = error.message; }
  };
  element('delete-map-pool').onclick = async event => {
    const preset = getState().mapPoolPresets.find(preset => preset.id === editingPresetId);
    if (!preset || (!event.shiftKey && !await confirmAction('Delete saved pool?', `Delete “${preset.name}”? This scrim’s map selection stays unchanged.`, 'Delete'))) return;
    getState().mapPoolPresets = getState().mapPoolPresets.filter(item => item.id !== preset.id);
    save();
    element('pool-preset-editor').close();
    renderPresetControls();
  };
  element('edit-map-pool').onclick = () => {
    renderPresetControls('');
    element('map-pool-name').value = '';
    element('map-pool-feedback').textContent = '';
    const enabled = new Set(enabledMaps(currentSession(getState())).map(map => map.id));
    element('map-pool-list').innerHTML = MODES.map(mode => `<section class="map-pool-group"><h3>${mode}</h3><div class="map-pool-grid">${MAPS.filter(map => map.mode === mode).map(map => `<label class="map-pool-option"><img src="${map.image}" alt="" loading="lazy"><span><input type="checkbox" data-pool-map="${map.id}" ${enabled.has(map.id) ? 'checked' : ''}>${escapeHtml(map.name)}</span></label>`).join('')}</div></section>`).join('');
    element('map-pool-dialog').showModal();
    element('map-pool-list').scrollTop = 0;
  };
  element('map-pool-list').addEventListener('change', event => {
    const mapId = event.target.dataset.poolMap;
    if (!MAPS.some(map => map.id === mapId)) return;
    const session = currentSession(getState());
    const disabled = new Set(session.disabledMapIds || []);
    if (event.target.checked) disabled.delete(mapId);
    else disabled.add(mapId);
    session.disabledMapIds = [...disabled];
    element('map-pool-feedback').textContent = '';
    save();
    renderPresetControls();
  });
  function setAllMaps(enabled) {
    currentSession(getState()).disabledMapIds = enabled ? [] : MAPS.map(map => map.id);
    element('map-pool-feedback').textContent = '';
    element('map-pool-list').querySelectorAll('[data-pool-map]').forEach(checkbox => { checkbox.checked = enabled; });
    save();
    renderPresetControls();
  }
  element('map-pool-all').onclick = () => setAllMaps(true);
  element('map-pool-none').onclick = () => setAllMaps(false);
  const getGame = id => {
    const session = currentSession(getState());
    if (!id) return { ...session.draft, lineup: ROLES.map(role => {
      const player = getState().players.find(player => player.id === session.lineup[role]);
      return { role, playerId: player?.id || '', name: player?.name || 'Empty' };
    }) };
    return session.activeGame?.id === id ? session.activeGame : session.games.find(game => game.id === id);
  };

  const mapButton = (game, id) => {
    const map = catalogItem(MAPS, game.map);
    const warnings = gameWarnings(currentSession(getState()), game, id).map;
    return `<button class="game-map ${map ? 'has-image' : ''} ${warnings.length ? 'has-conflict' : ''}" data-game-pick="map" data-game-id="${escapeHtml(id)}" aria-label="Choose map${referenceName(game.map) ? `: ${escapeHtml(referenceName(game.map))}` : ''}${warnings.length ? ` · ${warnings.join(' · ')}` : ''}">
      ${map ? `<img src="${map.image}" alt="" loading="lazy">` : '<span class="map-placeholder" aria-hidden="true">◇</span>'}
      <span class="map-caption"><strong>${escapeHtml(referenceName(game.map) || 'Choose map')}</strong><small>${escapeHtml(game.mode || map?.mode || 'Map not set')}</small>${warningText(warnings)}</span>
    </button>`;
  };

  element('toggle-bans').onclick = () => {
    const session = currentSession(getState());
    session.bansEnabled = session.bansEnabled === false;
    save();
  };
  const banButton = (game, field, id) => {
    if (currentSession(getState()).bansEnabled === false) return '';
    const hero = catalogItem(HEROES, game[field]);
    const team = field === 'ourBan' ? 'Our ban' : 'Their ban';
    const warnings = gameWarnings(currentSession(getState()), game, id)[field];
    return `<button class="game-ban ${hero?.role || ''} ${warnings.length ? 'has-conflict' : ''}" data-game-pick="${field}" data-game-id="${escapeHtml(id)}" aria-label="${team}: ${escapeHtml(referenceName(game[field]) || 'not set')}${warnings.length ? ` · ${warnings.join(' · ')}` : ''}">
      <span class="ban-portrait">${hero ? `<img src="${hero.image}" alt="" loading="lazy">` : '<span aria-hidden="true">⊘</span>'}</span>
      <span><small>${team}</small><strong>${escapeHtml(referenceName(game[field]) || 'Choose hero')}</strong>${warningText(warnings)}</span>
    </button>`;
  };

  const outcomeControls = game => `<div class="game-outcome" role="group" aria-label="Game result"><span>Result</span>${OUTCOMES.map(outcome => `<button class="result-option ${outcome}" data-game-result="${outcome}" data-result-game="${escapeHtml(game.id)}" aria-pressed="${game.outcome === outcome}" title="${game.outcome === outcome ? 'Clear result' : `Mark as ${outcome}`}">${{ win: 'Win', loss: 'Loss', draw: 'Draw' }[outcome]}</button>`).join('')}</div>`;

  function render() {
    cancelGameScroll();
    const state = getState();
    const session = currentSession(state);
    const bansEnabled = session.bansEnabled !== false;
    element('toggle-bans').textContent = bansEnabled ? 'Bans on' : 'Bans off';
    element('toggle-bans').setAttribute('aria-pressed', String(bansEnabled));
    element('toggle-bans').title = bansEnabled ? 'Turn off hero bans for this scrim' : 'Turn on hero bans for this scrim';
    const readiness = lineupStatus(state);
    const previousSelector = element('game-overview');
    const previousScroll = element('game-rows').scrollTop;
    const historyScroll = { top: previousSelector?.scrollTop || 0, left: previousSelector?.scrollLeft || 0 };
    const justCompleted = previousCompletedCount !== null && session.games.length > previousCompletedCount;
    const previousLiveCard = element('game-rows').querySelector('.game-card.live');
    const completedAnchor = justCompleted && previousLiveCard?.dataset.gameEntry === session.games.at(-1)?.id ? previousLiveCard.getBoundingClientRect().top : null;
    if (justCompleted) {
      historyScroll.top = 0;
      historyScroll.left = Number.MAX_SAFE_INTEGER;
    }
    previousCompletedCount = session.games.length;
    element('games-record').innerHTML = OUTCOMES.map(outcome => `<span class="record-${outcome}" title="${{ win: 'Wins', loss: 'Losses', draw: 'Draws' }[outcome]}">${session.games.filter(game => game.outcome === outcome).length}${{ win: 'W', loss: 'L', draw: 'D' }[outcome]}</span>`).join('');
    const rotation = modeRotation(session.games);
    element('mode-tracker').innerHTML = MODES.map(mode => `<button class="mode-token ${rotation.played.includes(mode) ? 'played' : ''}" data-pick-mode="${mode}" aria-label="Choose upcoming ${mode} map" title="Choose upcoming ${mode} map${rotation.played.includes(mode) ? ' · already played this rotation' : ''}">${rotation.played.includes(mode) ? '✓ ' : ''}${mode}</button>`).join('');
    const card = ({ game, id, number, status }) => `
      <article class="game-card ${status}" data-game-entry="${escapeHtml(id)}">
        <header class="game-card-heading"><div><strong>Game ${number}</strong><span class="game-stage ${status}">${status === 'live' ? '● In progress' : status === 'completed' ? '✓ Completed' : 'Upcoming'}</span></div>
          <div class="game-card-actions">${status === 'live' ? '<button class="quiet" data-game-action="cancel">Back to upcoming</button>' : status === 'upcoming' ? `${readiness.absent.length ? `<span class="attendance-warning">${readiness.absent.length} not marked here</span>` : ''}<button class="primary" data-game-action="start" ${session.activeGame || readiness.filled < 5 ? 'disabled' : ''} title="${session.activeGame ? 'Finish the current game first' : readiness.filled < 5 ? 'Choose a player for all five slots first' : readiness.absent.length ? 'Confirm attendance and start the game' : 'Capture these five players and start the game'}">Start game</button>` : ''}${status === 'upcoming' ? '' : `<button class="quiet" data-edit-game="${escapeHtml(id)}" aria-label="Edit Game ${number}">Edit</button>`}</div>
        </header>
        <div class="game-card-content"><div class="game-map-settings">${mapButton(game, id)}${status === 'upcoming' && referenceName(game.map).trim() && !catalogItem(MAPS, game.map) ? `<label class="field custom-mode-field">Map mode<select id="upcoming-map-mode"><option value="">Choose mode</option>${MODES.map(mode => `<option ${game.mode === mode ? 'selected' : ''}>${mode}</option>`).join('')}</select></label>` : ''}</div><div class="game-card-details"><div class="game-bans">${banButton(game, 'ourBan', id)}${banButton(game, 'theirBan', id)}</div>
        <div class="game-lineup" aria-label="Game ${number} players">${game.lineup.map(slot => `<span class="game-player" title="${escapeHtml(slot.role)}: ${escapeHtml(slot.name)}"><span class="${roleGroup(slot.role)}">${roleIcon(roleGroup(slot.role))}<small>${slot.role}</small></span><strong>${escapeHtml(slot.name)}</strong></span>`).join('')}</div></div></div>
        ${status === 'upcoming' ? '' : status === 'live' ? `<div class="game-outcome">${finishControls()}</div>` : outcomeControls(game)}
      </article>`;
    element('game-overview').hidden = session.games.length === 0;
    element('game-overview').innerHTML = session.games.map((game, index) => ({ game, number: index + 1 })).map(({ game, number }) => {
        const map = catalogItem(MAPS, game.map);
        return `<button class="history-choice" data-history-game="${escapeHtml(game.id)}" aria-label="Game ${number}: ${escapeHtml(referenceName(game.map) || 'Map not set')}, ${game.outcome || 'result not set'}">${map ? `<img src="${map.image}" alt="" loading="lazy">` : '<span class="history-map-placeholder" aria-hidden="true">◇</span>'}<span><small>Game ${number}</small><strong>${escapeHtml(referenceName(game.map) || 'Map not set')}</strong></span><span class="result-mark ${game.outcome || ''}">${{ win: 'W', loss: 'L', draw: 'D' }[game.outcome] || '—'}</span></button>`;
      }).join('');
      const upcoming = { game: getGame(''), id: '', number: session.games.length + (session.activeGame ? 2 : 1), status: 'upcoming' };
      element('game-rows').innerHTML = session.activeGame ? `<div class="current-games ${prepareNext ? 'preparing-next' : ''}">${card({ game: session.activeGame, id: session.activeGame.id, number: session.games.length + 1, status: 'live' })}${prepareNext ? card(upcoming) : ''}</div><button class="quiet prepare-next" id="prepare-next" aria-expanded="${prepareNext}">${prepareNext ? 'Hide next game' : `Prepare Game ${upcoming.number} →`}</button>` : card(upcoming);
    element('game-rows').insertAdjacentHTML('beforeend', session.games.map((game, index) => ({ game, id: game.id, number: index + 1, status: 'completed' })).reverse().map(card).join(''));
    element('game-rows').scrollTop = previousScroll;
    const selector = element('game-overview');
    if (selector) { selector.scrollTop = historyScroll.top; selector.scrollLeft = historyScroll.left; }
    if (justCompleted) {
      if (completedAnchor !== null && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const rows = element('game-rows');
        const completed = [...rows.querySelectorAll('.game-card.completed')].find(card => card.dataset.gameEntry === session.games.at(-1).id);
        const scroller = getComputedStyle(rows).overflowY === 'auto' ? rows : document.scrollingElement;
        scroller.scrollTop += completed.getBoundingClientRect().top - completedAnchor;
      }
      jumpToGame('', true);
    }
    applyGameHighlight();
  }

  let scrollFrame = null;
  let highlightTimer;
  let highlightedGameId = '';

  function cancelGameScroll() {
    if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
    scrollFrame = null;
  }

  function applyGameHighlight() {
    document.querySelectorAll('[data-history-game], [data-game-entry]').forEach(item => {
      item.classList.toggle('game-jump-highlight', Boolean(highlightedGameId) && (item.dataset.historyGame ?? item.dataset.gameEntry) === highlightedGameId);
    });
  }

  function flashGame(id) {
    clearTimeout(highlightTimer);
    highlightedGameId = id;
    applyGameHighlight();
    highlightTimer = setTimeout(() => {
      highlightedGameId = '';
      applyGameHighlight();
    }, 1300);
  }

  for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
    document.addEventListener(event, cancelGameScroll, { passive: true, capture: true });
  }

  function jumpToGame(id, animate = false) {
    cancelGameScroll();
    const target = [...element('game-rows').querySelectorAll('[data-game-entry]')].find(card => card.dataset.gameEntry === id);
    if (!target) return;
    const rows = element('game-rows');
    const panelScroll = getComputedStyle(rows).overflowY === 'auto';
    const scroller = panelScroll ? rows : document.scrollingElement;
    const start = scroller.scrollTop;
    const offset = target.getBoundingClientRect().top - (panelScroll ? rows.getBoundingClientRect().top : 12);
    const end = Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight, start + offset));
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      scroller.scrollTop = end;
      return;
    }
    const started = performance.now();
    const tick = now => {
      const progress = Math.min(1, (now - started) / 240);
      scroller.scrollTop = start + (end - start) * (1 - (1 - progress) ** 3);
      scrollFrame = progress < 1 ? requestAnimationFrame(tick) : null;
    };
    scrollFrame = requestAnimationFrame(tick);
  }

  element('game-rows').addEventListener('change', event => {
    if (event.target.id !== 'upcoming-map-mode') return;
    updateField('', 'mode', event.target.value);
    element('upcoming-map-mode')?.focus({ preventScroll: true });
  });

  function updateField(id, field, value) {
    const session = currentSession(getState());
    const game = getGame(id);
    if (!game) return;
    const target = id ? game : session.draft;
    if (field === 'map') {
      target.map = value;
      target.mode = catalogItem(MAPS, value)?.mode || '';
    } else target[field] = value;
    save();
    if (editor.open) renderEditor();
    const container = editor.open ? editor : element('game-rows');
    [...container.querySelectorAll('[data-game-pick]')].find(button => button.dataset.gameId === id && button.dataset.gamePick === field)?.focus({ preventScroll: true });
  }

  function renderPicker() {
    const maps = picker.field === 'map';
    const query = element('catalog-search').value;
    const collection = maps ? enabledMaps(currentSession(getState())) : HEROES;
    const candidates = collection.filter(item => !filter || (maps ? item.mode : item.role) === filter);
    const matches = searchCatalog(candidates, query).map(item => {
      const candidate = { ...getGame(picker.id), [picker.field]: { id: item.id, name: item.name }, ...(maps ? { mode: item.mode } : {}) };
      const warnings = gameWarnings(currentSession(getState()), candidate, picker.id)[picker.field];
      return { item, warnings };
    }).sort((first, second) => Number(Boolean(first.warnings.length)) - Number(Boolean(second.warnings.length)));
    element('catalog-filters').innerHTML = [['', 'All'], ...(maps ? MODES.map(mode => [mode, mode]) : [['tank', 'Tank'], ['dps', 'DPS'], ['support', 'Support']])].map(([value, label]) => `<button class="quiet" data-catalog-filter="${value}" aria-pressed="${filter === value}">${label}</button>`).join('');
    element('catalog-results').classList.toggle('map-results', maps);
    element('catalog-results').innerHTML = matches.map(({ item, warnings }) => {
      return `<button class="catalog-option ${maps ? '' : item.role} ${warnings.length ? 'has-conflict' : ''}" data-catalog-id="${item.id}" aria-label="${escapeHtml(item.name)}${maps ? `, ${item.mode}` : ''}${warnings.length ? ` · ${warnings.join(' · ')}` : ''}"><img src="${item.image}" alt="" loading="lazy"><strong>${escapeHtml(item.name)}</strong><small>${maps ? item.mode : item.role === 'dps' ? 'DPS' : item.role}</small>${warningText(warnings)}</button>`;
    }).join('') || '<p class="muted">No matches.</p>';
    element('catalog-custom').hidden = !query.trim() || (maps && Boolean(findCatalogItem(MAPS, query)));
    element('catalog-custom').textContent = `Use custom ${maps ? 'map' : 'hero'}: ${query.trim()}`;
  }

  function openPicker(id, field, initialFilter = '') {
    if (!getGame(id)) return;
    if (!id) { prepareNext = true; render(); jumpToGame(''); }
    picker = { id, field };
    filter = initialFilter;
    element('catalog-heading').textContent = field === 'map' ? 'Choose map' : field === 'ourBan' ? 'Our hero ban' : 'Their hero ban';
    element('catalog-search').value = '';
    element('catalog-search').placeholder = field === 'map' ? 'Search maps' : 'Search heroes';
    renderPicker();
    pickerDialog.showModal();
    element('catalog-search').focus();
  }

  function selectPicker(value) {
    const target = picker;
    pickerDialog.close();
    picker = null;
    updateField(target.id, target.field, value);
  }

  element('catalog-search').addEventListener('input', renderPicker);
  element('catalog-search').addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      element('catalog-results').querySelector('button')?.focus();
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      element('catalog-results').querySelector('button')?.click();
    }
  });
  element('catalog-results').addEventListener('keydown', event => {
    const buttons = [...element('catalog-results').querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement);
    if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      const next = index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1);
      if (next < 0) element('catalog-search').focus();
      else buttons[Math.min(next, buttons.length - 1)]?.focus();
    }
  });
  pickerDialog.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-catalog-filter')) {
      filter = button.dataset.catalogFilter;
      renderPicker();
    }
    if (button.dataset.catalogId) {
      const item = (picker.field === 'map' ? MAPS : HEROES).find(item => item.id === button.dataset.catalogId);
      selectPicker({ id: item.id, name: item.name });
    }
  });
  element('catalog-clear').onclick = () => selectPicker(null);
  element('catalog-custom').onclick = () => selectPicker(catalogReference(picker.field === 'map' ? MAPS : HEROES, element('catalog-search').value.trim().slice(0, 100)));

  function renderEditor() {
    const game = getGame(editingId);
    if (!game) { editor.close(); return; }
    const map = catalogItem(MAPS, game.map);
    const state = getState();
    const isActive = editingId && currentSession(state).activeGame?.id === editingId;
    element('reopen-game').hidden = !editingId || Boolean(currentSession(state).activeGame) || currentSession(state).games.at(-1)?.id !== editingId;
    element('game-editor-heading').textContent = editingId ? isActive ? 'Edit in-progress game' : `Edit Game ${currentSession(state).games.findIndex(item => item.id === editingId) + 1}` : 'Upcoming game';
    element('game-editor-fields').innerHTML = `<div class="editor-media">${mapButton(game, editingId)}<div class="game-bans">${banButton(game, 'ourBan', editingId)}${banButton(game, 'theirBan', editingId)}</div></div>${editingId ? outcomeControls(game) : ''}${map ? '' : `<label class="field">Mode (custom map)<select id="custom-map-mode"><option value="">Not set</option>${MODES.map(mode => `<option ${game.mode === mode ? 'selected' : ''}>${mode}</option>`).join('')}</select></label>`}`;
    element('game-editor-roster').innerHTML = editingId ? game.lineup.map(slot => {
      const options = new Map(game.lineup.map(item => [item.playerId, item.name]));
      for (const player of state.players) options.set(player.id, player.name);
      return `<label class="recorded-slot"><span class="${roleGroup(slot.role)}">${roleIcon(roleGroup(slot.role))}${slot.role}</span><select data-recorded-role="${slot.role}" aria-label="Recorded ${slot.role} player">${[...options].sort((first, second) => first[1].localeCompare(second[1])).map(([id, name]) => `<option value="${escapeHtml(id)}" ${id === slot.playerId ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select></label>`;
    }).join('') : '<p class="muted small">Use the lineup above to choose the next five.</p>';
  }

  editor.addEventListener('change', event => {
    if (event.target.id === 'custom-map-mode') updateField(editingId, 'mode', event.target.value);
    if (event.target.dataset.recordedRole) {
      const role = event.target.dataset.recordedRole;
      replaceGamePlayer(getState(), getGame(editingId), role, event.target.value);
      save();
      renderEditor();
      editor.querySelector(`[data-recorded-role="${role}"]`)?.focus();
    }
  });
  element('reopen-game').onclick = () => {
    editor.close();
    action('reopen');
  };

  document.addEventListener('contextmenu', event => {
    const button = event.target.closest('[data-game-pick]');
    if (!button) return;
    event.preventDefault();
    updateField(button.dataset.gameId, button.dataset.gamePick, null);
  });

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.pickMode) openPicker('', 'map', button.dataset.pickMode);
    if (button.dataset.historyGame) {
      flashGame(button.dataset.historyGame);
      jumpToGame(button.dataset.historyGame, true);
    }
    if (button.id === 'prepare-next') { prepareNext = !prepareNext; render(); element('prepare-next')?.focus({ preventScroll: true }); }
    if (button.dataset.gameResult) {
      const game = getGame(button.dataset.resultGame);
      if (!game) return;
      const result = button.dataset.gameResult;
      setGameOutcome(getState(), game.id, game.outcome === result ? '' : result);
      save();
      if (editor.open) renderEditor();
      const container = editor.open ? editor : element('game-rows');
      [...container.querySelectorAll('[data-game-result]')].find(item => item.dataset.resultGame === game.id && item.dataset.gameResult === result)?.focus({ preventScroll: true });
    }
    if (button.dataset.gamePick) openPicker(button.dataset.gameId, button.dataset.gamePick);
    if (button.hasAttribute('data-edit-game')) {
      editingId = button.dataset.editGame;
      renderEditor();
      editor.showModal();
    }
    if (button.dataset.gameAction) action(button.dataset.gameAction, button.dataset.finishOutcome);
  });

  return {
    reset() { previousCompletedCount = null; prepareNext = false; picker = null; editingId = null; cancelGameScroll(); element('game-rows').scrollTop = 0; },
    render,
    openPicker,
    showCurrent() { prepareNext = false; render(); jumpToGame(currentSession(getState()).activeGame?.id || ''); },
  };
}
