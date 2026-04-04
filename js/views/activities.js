import { getState, setState, subscribe } from '../state.js';
import * as Store from '../store/index.js';
import { showToast } from '../ui/feedback.js';
import { h, elab, iolab, modelab } from '../ui/helpers.js';

let _container    = null;
let _unsubscribe  = null;
let _delegHandler = null;
let _saveHandler  = null;
let _changeHandler = null;

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
  if (!list.length) { grid.innerHTML = '<div class="empty-state">Keine Aktivitäten gefunden.</div>'; return; }

  grid.innerHTML = list.map(a => {
    const tags = (a.tags??[]).map(t=>`<span class="tag tag-orange">${h(t)}</span>`).join('');
    const uc   = events.filter(e=>e.activityId===a.id).length;
    const isRomantic = a.mode === 'romantic';
    return `<div class="card">
      <div class="activity-title">${h(a.name)}${isRomantic?' <span class="tag tag-pink" style="font-size:11px;">♥</span>':''}</div>
      <div class="activity-meta">
        <span>📍 ${h(a.location??'–')}</span>
        <span>💶 ${a.budget?a.budget+'€/P.':'–'}</span>
        <span>👥 ${a.min??1}–${a.max??'∞'}</span>
        <span>⏱ ${a.duration??'?'}h</span>
        <span style="color:var(--accent2);">✓ ${uc}×</span>
      </div>
      <div style="margin-bottom:8px;">
        <span class="tag ${a.energy==='low'?'tag-green':a.energy==='high'?'tag-orange':'tag-blue'}">${elab(a.energy)}</span>
        <span class="tag tag-gray">${iolab(a.inout)}</span>
        <span class="tag ${isRomantic?'tag-pink':'tag-blue'}">${modelab(a.mode)}</span>
        ${tags}
      </div>
      ${a.todos?`<div style="font-size:12px;color:var(--muted);border-top:1px solid var(--border);padding-top:8px;"><strong style="font-weight:500;">Todos:</strong> ${h(a.todos)}</div>`:''}
      <div class="person-actions" style="margin-top:12px;">
        <button class="btn btn-sm" data-action="edit" data-id="${a.id}">Bearbeiten</button>
        <button class="btn btn-sm btn-danger" data-action="delete" data-id="${a.id}">Entfernen</button>
      </div>
    </div>`;
  }).join('');
}

// ============================================================
// MODAL
// ============================================================
function openActivityModal(id) {
  const { activities } = getState();
  const a = id ? activities.find(x=>x.id===id) : null;
  document.getElementById('activity-modal-title').textContent = a ? 'Aktivität bearbeiten' : 'Aktivität hinzufügen';
  document.getElementById('a-id').value       = a?.id ?? '';
  document.getElementById('a-name').value     = a?.name ?? '';
  document.getElementById('a-location').value = a?.location ?? '';
  document.getElementById('a-budget').value   = a?.budget ?? '';
  document.getElementById('a-energy').value   = a?.energy ?? 'low';
  document.getElementById('a-min').value      = a?.min ?? '';
  document.getElementById('a-max').value      = a?.max ?? '';
  document.getElementById('a-duration').value = a?.duration ?? '';
  document.getElementById('a-mode').value     = a?.mode ?? 'social';
  document.getElementById('a-inout').value    = a?.inout ?? 'indoor';
  document.getElementById('a-tags').value     = (a?.tags??[]).join(', ');
  document.getElementById('a-todos').value    = a?.todos ?? '';
  document.getElementById('activity-modal').classList.add('open');
}

async function saveActivity() {
  const name = document.getElementById('a-name').value.trim();
  if (!name) { showToast('Name ist Pflichtfeld.', 'error'); return; }
  const btn = document.getElementById('activity-save-btn');
  btn.classList.add('btn-loading');
  const id  = document.getElementById('a-id').value;
  const payload = {
    name,
    location: document.getElementById('a-location').value,
    budget:   parseFloat(document.getElementById('a-budget').value)||0,
    energy:   document.getElementById('a-energy').value,
    min:      parseInt(document.getElementById('a-min').value)||1,
    max:      parseInt(document.getElementById('a-max').value)||99,
    duration: parseFloat(document.getElementById('a-duration').value)||0,
    mode:     document.getElementById('a-mode').value,
    inout:    document.getElementById('a-inout').value,
    tags:     document.getElementById('a-tags').value.split(',').map(t=>t.trim()).filter(Boolean),
    todos:    document.getElementById('a-todos').value,
  };
  try {
    const { activities } = getState();
    if (id) {
      const { data, error } = await Store.updateActivity(id, payload);
      if (error) throw error;
      setState({ activities: activities.map(a => a.id===id ? data[0] : a) });
    } else {
      const { data, error } = await Store.addActivity(payload);
      if (error) throw error;
      setState({ activities: [data[0], ...activities] });
    }
    document.getElementById('activity-modal').classList.remove('open');
    showToast(`${h(name)} ${id?'aktualisiert':'hinzugefügt'}.`, 'success');
  } catch(err) {
    showToast('Fehler: '+err.message, 'error');
  } finally {
    btn.classList.remove('btn-loading');
  }
}

async function deleteActivity(id) {
  const { activities } = getState();
  const a = activities.find(x=>x.id===id);
  if (!a) return;
  const snapshot = structuredClone(activities);
  setState({ activities: activities.filter(x=>x.id!==id) });
  showToast(`${h(a.name)} gelöscht.`, '', () => { setState({ activities: snapshot }); });
  const { error } = await Store.deleteActivity(id);
  if (error) {
    setState({ activities: snapshot });
    showToast('Fehler beim Löschen: '+error.message, 'error');
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
  <div id="activities-grid" class="card-grid"></div>
</div>`;

  renderActivityGrid();

  _delegHandler = e => {
    const target = e.target;

    if (target.id === 'add-activity-btn') { openActivityModal(); return; }

    const editEl = target.closest('[data-action="edit"]');
    if (editEl) { openActivityModal(editEl.dataset.id); return; }

    const deleteEl = target.closest('[data-action="delete"]');
    if (deleteEl) { deleteActivity(deleteEl.dataset.id); return; }
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
  _container = null;
}
