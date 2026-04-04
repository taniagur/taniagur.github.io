import { getState, setState, subscribe } from '../state.js';
import * as Store from '../store/index.js';
import { showToast } from '../ui/feedback.js';
import { h, ini, avc, dSince, fmtDate, catlab, scoreFriend } from '../ui/helpers.js';

let _container    = null;
let _unsubscribe  = null;
let _delegHandler = null;
let _saveHandler  = null;

// ============================================================
// RENDER GRID
// ============================================================
function renderFriendGrid() {
  const { friends, events } = getState();
  const grid      = document.getElementById('friends-grid');
  if (!grid) return;
  const filterCat = document.getElementById('friend-filter-category')?.value ?? '';
  let list = friends;
  if (filterCat) list = list.filter(f => f.category === filterCat);
  if (!list.length) { grid.innerHTML = '<div class="empty-state">Keine Freunde gefunden.</div>'; return; }

  grid.innerHTML = list.map(f => {
    const bday    = f.birthday ? new Date(f.birthday) : null;
    const bdayStr = bday ? bday.toLocaleDateString('de-DE',{day:'2-digit',month:'long'}) : '–';
    const plbl    = {partner:'mit Partner',solo:'alleine',either:'flexibel'}[f.partner]??'–';
    const pcls    = {partner:'badge-partner',solo:'badge-solo',either:'tag-gray'}[f.partner]??'tag-gray';
    const dayTags = (f.days??[]).map(d=>`<span class="tag tag-gray">${d}</span>`).join('');
    const since   = dSince(f.last_seen);
    const scls    = since>90?'tag-red':since>30?'tag-yellow':'tag-green';
    const slbl    = f.last_seen?`vor ${since}T`:'Nie';
    const ec      = events.filter(e=>(e.peopleIds??[]).includes(f.id)).length;
    const score   = Math.round(scoreFriend(f, null, events));
    const isRomantic = f.category === 'romantic';
    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div class="person-avatar ${avc(f.id, f.category)}">${ini(f.name)}</div>
        <div style="display:flex;gap:4px;align-items:center;">
          ${isRomantic?'<span class="tag tag-pink">♥ Romantisch</span>':''}
          <span class="tag ${scls}">${slbl}</span>
        </div>
      </div>
      <div class="person-name">${h(f.name)}</div>
      <div class="person-meta">🎂 ${bdayStr}<br>📍 ${h(f.city??'–')}<br>Treffen: ${ec}× · Priorität: ${score}/100<br>Kategorie: ${catlab(f.category)}</div>
      <div style="margin:6px 0;"><div class="score-bar"><div class="score-fill" style="width:${score}%"></div></div></div>
      <div style="margin:6px 0;">${dayTags}</div>
      <span class="badge ${pcls}">${plbl}</span>
      ${f.notes?`<div style="margin-top:10px;font-size:12px;color:var(--muted);border-top:1px solid var(--border);padding-top:8px;">${h(f.notes)}</div>`:''}
      <div class="person-actions">
        <button class="btn btn-sm" data-action="edit" data-id="${f.id}">Bearbeiten</button>
        <button class="btn btn-sm" data-action="history" data-id="${f.id}">Verlauf</button>
        <button class="btn btn-sm btn-danger" data-action="delete" data-id="${f.id}">Entfernen</button>
      </div>
    </div>`;
  }).join('');
}

// ============================================================
// MODAL
// ============================================================
function openPersonModal(id) {
  const { friends } = getState();
  const f = id ? friends.find(x=>x.id===id) : null;
  document.getElementById('person-modal-title').textContent = f ? 'Freund bearbeiten' : 'Freund hinzufügen';
  document.getElementById('p-id').value       = f?.id ?? '';
  document.getElementById('p-name').value     = f?.name ?? '';
  document.getElementById('p-birthday').value = f?.birthday ?? '';
  document.getElementById('p-city').value     = f?.city ?? '';
  document.getElementById('p-category').value = f?.category ?? 'friend';
  document.getElementById('p-partner').value  = f?.partner ?? 'solo';
  document.getElementById('p-notes').value    = f?.notes ?? '';
  document.querySelectorAll('#p-days .day-btn').forEach(btn => {
    btn.classList.toggle('sel', !!(f?.days?.includes(btn.dataset.day)));
    btn.onclick = () => btn.classList.toggle('sel');
  });
  document.getElementById('person-modal').classList.add('open');
}

async function savePerson() {
  const name = document.getElementById('p-name').value.trim();
  if (!name) { showToast('Name ist Pflichtfeld.', 'error'); return; }
  const btn  = document.getElementById('person-save-btn');
  btn.classList.add('btn-loading');
  const days = [...document.querySelectorAll('#p-days .day-btn.sel')].map(b=>b.dataset.day);
  const id   = document.getElementById('p-id').value;
  const payload = {
    name,
    birthday: document.getElementById('p-birthday').value,
    city:     document.getElementById('p-city').value,
    category: document.getElementById('p-category').value,
    partner:  document.getElementById('p-partner').value,
    days,
    notes:    document.getElementById('p-notes').value,
  };
  try {
    const { friends } = getState();
    if (id) {
      const { data, error } = await Store.updateFriend(id, payload);
      if (error) throw error;
      setState({ friends: friends.map(f => f.id===id ? data[0] : f) });
    } else {
      const { data, error } = await Store.addFriend(payload);
      if (error) throw error;
      setState({ friends: [data[0], ...friends] });
    }
    document.getElementById('person-modal').classList.remove('open');
    showToast(`${h(name)} ${id?'aktualisiert':'hinzugefügt'}.`, 'success');
  } catch(err) {
    showToast('Fehler: '+err.message, 'error');
  } finally {
    btn.classList.remove('btn-loading');
  }
}

async function deletePerson(id) {
  const { friends } = getState();
  const f = friends.find(x=>x.id===id);
  if (!f) return;
  const snapshot = structuredClone(friends);
  setState({ friends: friends.filter(x=>x.id!==id) });
  showToast(`${h(f.name)} entfernt.`, '', () => { setState({ friends: snapshot }); });
  const { error } = await Store.deleteFriend(id);
  if (error) {
    setState({ friends: snapshot });
    showToast('Fehler beim Löschen: '+error.message, 'error');
  }
}

function showHistory(id) {
  const { friends, events } = getState();
  const f = friends.find(x=>x.id===id);
  if (!f) return;
  const evs = events.filter(e=>(e.peopleIds??[]).includes(id)).sort((a,b)=>b.date.localeCompare(a.date));
  document.getElementById('history-modal-title').textContent = `${f.name} – Verlauf`;
  document.getElementById('history-content').innerHTML = evs.length
    ? evs.map(e=>`<div class="log-entry ${e.done?'done':''} ${e.mode==='romantic'?'romantic':''}">
        <div class="log-date">${fmtDate(e.date)}${e.time?' · '+h(e.time):''}</div>
        <div class="log-activity">${h(e.activityName)}${e.mode==='romantic'?' ♥':''}</div>
        ${e.note?`<div class="log-note">${h(e.note)}</div>`:''}
        ${e.done?'<span class="tag tag-green">✓</span>':'<span class="tag tag-yellow">offen</span>'}
      </div>`).join('')
    : '<div style="font-size:13px;color:var(--muted);">Noch keine Treffen eingetragen.</div>';
  document.getElementById('history-modal').classList.add('open');
}

// ============================================================
// PUBLIC API
// ============================================================
export function render(container) {
  _container = container;

  container.innerHTML = `
<div style="padding:24px;max-width:960px;margin:0 auto;">
  <div class="section-header">
    <div><div class="section-title">Freunde</div><div class="section-sub">Alle Kontakte.</div></div>
    <button class="btn btn-primary" id="add-friend-btn">+ Hinzufügen</button>
  </div>
  <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
    <select id="friend-filter-category" style="max-width:180px;">
      <option value="">Alle Kategorien</option>
      <option value="friend">Freunde</option>
      <option value="romantic">Romantisch</option>
      <option value="family">Familie</option>
      <option value="work">Arbeit</option>
    </select>
  </div>
  <div id="friends-grid" class="card-grid"></div>
</div>`;

  renderFriendGrid();

  _delegHandler = e => {
    const target = e.target;

    if (target.id === 'add-friend-btn') { openPersonModal(); return; }

    const filterSel = target.closest('#friend-filter-category');
    if (filterSel) { renderFriendGrid(); return; }

    const editEl = target.closest('[data-action="edit"]');
    if (editEl) { openPersonModal(editEl.dataset.id); return; }

    const deleteEl = target.closest('[data-action="delete"]');
    if (deleteEl) { deletePerson(deleteEl.dataset.id); return; }

    const historyEl = target.closest('[data-action="history"]');
    if (historyEl) { showHistory(historyEl.dataset.id); return; }
  };

  // Filter change
  container.addEventListener('click', _delegHandler);
  container.addEventListener('change', e => {
    if (e.target.id === 'friend-filter-category') renderFriendGrid();
  });

  _saveHandler = () => savePerson();
  document.getElementById('person-save-btn').addEventListener('click', _saveHandler);

  _unsubscribe = subscribe(() => renderFriendGrid());
}

export function cleanup() {
  if (_delegHandler && _container) {
    _container.removeEventListener('click', _delegHandler);
    _delegHandler = null;
  }
  if (_saveHandler) {
    const btn = document.getElementById('person-save-btn');
    if (btn) btn.removeEventListener('click', _saveHandler);
    _saveHandler = null;
  }
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  _container = null;
}
