import { getState, setState, subscribe } from '../state.js';
import * as Store from '../store/index.js';
import { showToast } from '../ui/feedback.js';
import { h, elab, iolab, modelab, sanitize, initCharCounter } from '../ui/helpers.js';

const LIMITS = { name: 100, location: 200, todos: 1000 };

let _container     = null;
let _unsubscribe   = null;
let _delegHandler  = null;
let _saveHandler   = null;
let _changeHandler = null;
let _counterCleanups = [];

// ============================================================
// RENDER GRID
// ============================================================
function renderActivityGrid() {
  const { activities, events } = getState();
  const grid       = document.getElementById('activities-grid');
  if (!grid) return;
  const filterMode = document.getElementById('activity-filter-mode')?.value ?? '';
  let list = activities;
  if (filterMode) list = list.filter(a => a.mode === filterMode || a.mode === 'both');

  if (!list.length) {
    grid.innerHTML = `
      <div class="empty-state--cta">
        <div class="empty-state__icon"><i data-lucide="zap" class="icon icon--xl"></i></div>
        <div class="empty-state__title">Noch keine Aktivitäten</div>
        <div class="empty-state__desc">Erstelle Aktivitäten wie "Klettern", "Kino" oder "Kochen" — sie werden dann bei Vorschlägen verwendet.</div>
        <button class="btn btn-primary" id="empty-add-activity-btn">+ Aktivität hinzufügen</button>
      </div>`;
    window.lucide?.createIcons();
    return;
  }

  const energyEmoji = { low: '😌', medium: '⚡', high: '🔥' };
  const energyColor = { low: 'tag-green', medium: 'tag-blue', high: 'tag-orange' };
  const energyBg    = { low: 'activity-row__icon--green', medium: 'activity-row__icon--blue', high: 'activity-row__icon--orange' };

  grid.innerHTML = `<div class="activity-list">${list.map(a => {
    const uc         = events.filter(e => e.activity_id === a.id).length;
    const isRomantic = a.mode === 'romantic';
    const emoji      = energyEmoji[a.energy] ?? '⚡';
    const eColor     = energyColor[a.energy] ?? 'tag-blue';
    const eBg        = energyBg[a.energy]    ?? 'activity-row__icon--blue';

    return `<div class="activity-row" data-action="toggle-detail" data-id="${a.id}">
  <div class="activity-row__icon ${eBg}">${emoji}</div>
  <div class="activity-row__name">${h(a.name)}${isRomantic ? '<span class="tag tag-pink" style="margin-left:6px;font-size:10px;">♥</span>' : ''}</div>
  <div class="activity-row__meta">
    <span class="tag ${eColor}">${elab(a.energy)}</span>
    ${a.location ? `<span style="font-size:12px;color:var(--muted);display:flex;align-items:center;gap:3px;"><i data-lucide="map-pin" class="icon icon--sm"></i>${h(a.location)}</span>` : ''}
    <span style="font-size:12px;color:var(--muted);">${uc}× genutzt</span>
  </div>
  <div class="activity-row__actions">
    <button class="btn btn-sm" data-action="edit" data-id="${a.id}">Bearbeiten</button>
    <button class="btn btn-sm btn-danger" data-action="delete" data-id="${a.id}">Entfernen</button>
  </div>
  <div class="activity-row__detail" id="detail-${a.id}">
    <div class="activity-row__detail-grid">
      ${a.location ? `<div><span class="activity-row__detail-label">Ort</span>${h(a.location)}</div>` : ''}
      <div><span class="activity-row__detail-label">Budget</span>${a.budget ? a.budget + ' €/Person' : '–'}</div>
      <div><span class="activity-row__detail-label">Personen</span>${a.min_people ?? 1}–${a.max_people ?? '∞'}</div>
      <div><span class="activity-row__detail-label">Energie</span>${elab(a.energy)}</div>
      <div><span class="activity-row__detail-label">Dauer</span>${a.duration ? a.duration + ' h' : '–'}</div>
      <div><span class="activity-row__detail-label">Indoor/Outdoor</span>${iolab(a.inout)}</div>
    </div>
    ${(a.tags ?? []).length ? `<div class="activity-row__detail-tags">${a.tags.map(t => `<span class="tag tag-gray">${h(t)}</span>`).join('')}</div>` : ''}
  </div>
</div>`;
  }).join('')}</div>`;

  window.lucide?.createIcons();
}

// ============================================================
// MODAL
// ============================================================
function openActivityModal(id) {
  const { activities } = getState();
  const a = id ? activities.find(x => x.id === id) : null;
  document.getElementById('activity-modal-title').textContent = a ? 'Aktivität bearbeiten' : 'Aktivität hinzufügen';
  document.getElementById('a-id').value       = a?.id ?? '';
  document.getElementById('a-name').value     = a?.name ?? '';
  document.getElementById('a-location').value = a?.location ?? '';
  document.getElementById('a-budget').value   = a?.budget ?? '';
  document.getElementById('a-energy').value   = a?.energy ?? 'low';
  document.getElementById('a-min').value      = a?.min_people ?? '';
  document.getElementById('a-max').value      = a?.max_people ?? '';
  document.getElementById('a-duration').value = a?.duration ?? '';
  document.getElementById('a-mode').value     = a?.mode ?? 'social';
  document.getElementById('a-inout').value    = a?.inout ?? 'indoor';
  document.getElementById('a-tags').value     = (a?.tags ?? []).join(', ');
  document.getElementById('a-todos').value    = a?.todos ?? '';
  document.getElementById('activity-modal').classList.add('open');

  _counterCleanups.forEach(fn => fn());
  _counterCleanups = [
    initCharCounter('a-name', 'counter-a-name', LIMITS.name),
  ];
}

async function saveActivity() {
  const name = sanitize(document.getElementById('a-name').value.trim(), LIMITS.name);
  if (!name) { showToast('Name ist Pflichtfeld.', 'error'); return; }
  if (name.length > LIMITS.name) { showToast(`Name darf max. ${LIMITS.name} Zeichen haben.`, 'error'); return; }
  const btn = document.getElementById('activity-save-btn');
  btn.classList.add('btn-loading');
  const id  = document.getElementById('a-id').value;
  const payload = {
    name,
    location: document.getElementById('a-location').value,
    budget:   parseFloat(document.getElementById('a-budget').value) || 0,
    energy:   document.getElementById('a-energy').value,
    min_people: parseInt(document.getElementById('a-min').value) || 1,
    max_people: parseInt(document.getElementById('a-max').value) || 99,
    duration: parseFloat(document.getElementById('a-duration').value) || 0,
    mode:     document.getElementById('a-mode').value,
    inout:    document.getElementById('a-inout').value,
    tags:     document.getElementById('a-tags').value.split(',').map(t => t.trim()).filter(Boolean) || [],
    todos:    document.getElementById('a-todos').value || null,
  };
  try {
    const { activities } = getState();
    if (id) {
      const { data, error } = await Store.updateActivity(id, payload);
      if (error) throw error;
      setState({ activities: activities.map(a => a.id === id ? data[0] : a) });
    } else {
      const { data, error } = await Store.addActivity(payload);
      if (error) throw error;
      setState({ activities: [data[0], ...activities] });
    }
    document.getElementById('activity-modal').classList.remove('open');
    showToast(`${h(name)} ${id ? 'aktualisiert' : 'hinzugefügt'}.`, 'success');
  } catch(err) {
    showToast('Fehler: ' + err.message, 'error');
  } finally {
    btn.classList.remove('btn-loading');
  }
}

async function deleteActivity(id) {
  const { activities } = getState();
  const a = activities.find(x => x.id === id);
  if (!a) return;
  const snapshot = structuredClone(activities);
  setState({ activities: activities.filter(x => x.id !== id) });
  showToast(`${h(a.name)} gelöscht.`, '', () => { setState({ activities: snapshot }); });
  const { error } = await Store.deleteActivity(id);
  if (error) {
    setState({ activities: snapshot });
    showToast('Fehler beim Löschen: ' + error.message, 'error');
  }
}

// ============================================================
// PUBLIC API
// ============================================================
export function render(container) {
  _container = container;

  container.innerHTML = `
<div style="padding:24px;max-width:960px;margin:0 auto;">
  <div class="section-header">
    <div><div class="section-title">Aktivitäten</div><div class="section-sub">Ideen für gemeinsame Unternehmungen.</div></div>
    <button class="btn btn-primary" id="add-activity-btn">+ Hinzufügen</button>
  </div>
  <div style="display:flex;gap:8px;margin-bottom:16px;">
    <select id="activity-filter-mode" style="max-width:180px;">
      <option value="">Alle Modi</option>
      <option value="social">Freunde</option>
      <option value="romantic">Romantisch</option>
      <option value="both">Beides</option>
    </select>
  </div>
  <div id="activities-grid"></div>
</div>`;

  renderActivityGrid();

  _delegHandler = e => {
    const target = e.target;

    if (target.id === 'add-activity-btn')       { openActivityModal(); return; }
    if (target.id === 'empty-add-activity-btn') { openActivityModal(); return; }

    const editEl = target.closest('[data-action="edit"]');
    if (editEl) { openActivityModal(editEl.dataset.id); return; }

    const deleteEl = target.closest('[data-action="delete"]');
    if (deleteEl) { deleteActivity(deleteEl.dataset.id); return; }

    // Toggle detail expansion (skip if clicked an action button)
    const rowEl = target.closest('[data-action="toggle-detail"]');
    if (rowEl && !target.closest('.activity-row__actions')) {
      const detail = document.getElementById('detail-' + rowEl.dataset.id);
      if (detail) detail.classList.toggle('open');
      return;
    }
  };

  _changeHandler = e => {
    if (e.target.id === 'activity-filter-mode') renderActivityGrid();
  };

  container.addEventListener('click', _delegHandler);
  container.addEventListener('change', _changeHandler);

  _saveHandler = () => saveActivity();
  document.getElementById('activity-save-btn').addEventListener('click', _saveHandler);

  _unsubscribe = subscribe(() => renderActivityGrid());
}

export function cleanup() {
  if (_delegHandler && _container) {
    _container.removeEventListener('click', _delegHandler);
    _delegHandler = null;
  }
  if (_changeHandler && _container) {
    _container.removeEventListener('change', _changeHandler);
    _changeHandler = null;
  }
  if (_saveHandler) {
    const btn = document.getElementById('activity-save-btn');
    if (btn) btn.removeEventListener('click', _saveHandler);
    _saveHandler = null;
  }
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  _counterCleanups.forEach(fn => fn());
  _counterCleanups = [];
  _container = null;
}
