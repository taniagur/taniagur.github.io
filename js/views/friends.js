import { getState, setState, subscribe } from '../state.js';
import * as Store from '../store/index.js';
import { showToast } from '../ui/feedback.js';
import { callAI } from '../ui/ai.js';
import { h, ini, avc, dSince, fmtDate, catlab, scoreFriend, sanitize, initCharCounter } from '../ui/helpers.js';

const LIMITS = { name: 100, city: 100, notes: 2000 };

// Current AI profile chips in the modal
let _aiProfile = {};

let _container         = null;
let _unsubscribe       = null;
let _delegHandler      = null;
let _changeHandler     = null;
let _saveHandler       = null;
let _modalHandler      = null;
let _aiModalHandler    = null;
let _counterCleanups   = [];

// ============================================================
// RENDER GRID
// ============================================================
function renderFriendGrid() {
  const { friends, events, profile: userProfile } = getState();
  const aiEnabled = !!userProfile?.settings?.ai_enabled;
  const grid      = document.getElementById('friends-grid');
  if (!grid) return;
  const filterCat = document.getElementById('friend-filter-category')?.value ?? '';
  let list = friends;
  if (filterCat) list = list.filter(f => f.category === filterCat);

  if (!list.length) {
    grid.innerHTML = `
      <div class="empty-state--cta">
        <div class="empty-state__icon"><i data-lucide="users" class="icon icon--xl"></i></div>
        <div class="empty-state__title">Noch keine Freunde eingetragen</div>
        <div class="empty-state__desc">Füge deinen ersten Freund hinzu, um Treffen zu planen und den Überblick zu behalten.</div>
        <button class="btn btn-primary" id="empty-add-friend-btn">+ Freund hinzufügen</button>
      </div>`;
    window.lucide?.createIcons();
    return;
  }

  grid.innerHTML = list.map(f => {
    const bday    = f.birthday ? new Date(f.birthday) : null;
    const bdayStr = bday ? bday.toLocaleDateString('de-DE', { day: '2-digit', month: 'long' }) : '–';
    const plbl    = { partner: 'mit Partner', solo: 'alleine', either: 'flexibel' }[f.partner] ?? '–';
    const pcls    = { partner: 'badge-partner', solo: 'badge-solo', either: 'tag-gray' }[f.partner] ?? 'tag-gray';
    const dayTags = (f.days ?? []).map(d => `<span class="tag tag-gray">${d}</span>`).join('');
    const since   = dSince(f.last_seen);
    const scls    = since > 90 ? 'tag-red' : since > 30 ? 'tag-yellow' : 'tag-green';
    const slbl    = f.last_seen ? `vor ${since}T` : 'Nie';
    const ec      = events.filter(e => (e.people_ids ?? []).includes(f.id)).length;
    const score   = Math.round(scoreFriend(f, null, events));
    const isRomantic = f.category === 'romantic';

    return `<div class="friend-card">
  <div class="friend-card__header">
    <div class="person-avatar ${avc(f.id, f.category)}">${ini(f.name)}</div>
    <div class="friend-card__badges">
      ${isRomantic ? '<span class="tag tag-pink">♥ Romantisch</span>' : ''}
      <span class="tag ${scls}">${slbl}</span>
    </div>
  </div>
  <div>
    <div class="friend-card__name">${h(f.name)}</div>
    <div class="friend-card__city">
      <i data-lucide="map-pin" class="icon icon--sm"></i>
      ${h(f.city ?? '–')}
    </div>
  </div>
  <div class="friend-card__meta">
    <span><i data-lucide="calendar" class="icon icon--sm"></i> ${bdayStr}</span>
    <span><i data-lucide="layers" class="icon icon--sm"></i> ${ec}× Treffen</span>
  </div>
  <div class="score-bar"><div class="score-fill" style="width:${score}%"></div></div>
  <div class="friend-card__tags">
    <span class="badge ${pcls}">${plbl}</span>
    <span class="tag tag-gray">${catlab(f.category)}</span>
    ${dayTags}
  </div>
  ${f.notes ? `<div class="friend-card__notes">${h(f.notes)}</div>` : ''}
  <div class="friend-card__actions">
    <button class="btn btn-sm" data-action="edit" data-id="${f.id}">Bearbeiten</button>
    <button class="btn btn-sm" data-action="history" data-id="${f.id}">Verlauf</button>
    ${aiEnabled ? `<button class="btn btn-sm" data-action="ai-suggest" data-id="${f.id}">✨ Vorschlag</button>` : ''}
    <button class="btn btn-sm btn-danger" data-action="delete" data-id="${f.id}">Entfernen</button>
  </div>
</div>`;
  }).join('');

  window.lucide?.createIcons();
}

// ============================================================
// MODAL
// ============================================================
function openPersonModal(id) {
  const { friends } = getState();
  const f = id ? friends.find(x => x.id === id) : null;
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

  // AI profile section — show only if ai_enabled
  const { profile: userProfile } = getState();
  const aiEnabled = !!userProfile?.settings?.ai_enabled;
  const aiSection = document.getElementById('ai-profile-section');
  if (aiSection) aiSection.style.display = aiEnabled ? '' : 'none';
  document.getElementById('p-ai-text').value = '';

  // Load existing AI profile chips
  _aiProfile = f?.profile ? { ...f.profile } : {};
  renderAIChips();

  // Char counters
  _counterCleanups.forEach(fn => fn());
  _counterCleanups = [
    initCharCounter('p-name',  'counter-p-name',  LIMITS.name),
    initCharCounter('p-city',  'counter-p-city',  LIMITS.city),
    initCharCounter('p-notes', 'counter-p-notes', LIMITS.notes),
  ];
}

function renderAIChips() {
  const container = document.getElementById('p-ai-chips');
  const row = document.getElementById('p-ai-chips-row');
  if (!container || !row) return;

  const entries = [];
  if (_aiProfile.interessen?.length) {
    for (const tag of _aiProfile.interessen) entries.push({ label: '', value: tag, key: 'interessen', arrVal: tag });
  }
  if (_aiProfile.personality)       entries.push({ label: 'Persönlichkeit', value: _aiProfile.personality, key: 'personality' });
  if (_aiProfile.energy_level)      entries.push({ label: 'Energie', value: _aiProfile.energy_level, key: 'energy_level' });
  if (_aiProfile.relationship_depth) entries.push({ label: 'Nähe', value: _aiProfile.relationship_depth, key: 'relationship_depth' });

  if (!entries.length) { row.style.display = 'none'; return; }
  row.style.display = '';

  container.innerHTML = entries.map((e, i) =>
    `<span class="ai-chip" data-chip-idx="${i}">` +
    (e.label ? `<span class="ai-chip__label">${h(e.label)}:</span>` : '') +
    `${h(e.value)} <span class="ai-chip__remove" data-action="remove-chip" data-key="${e.key}" ${e.arrVal ? `data-arr-val="${h(e.arrVal)}"` : ''}>×</span>` +
    `</span>`
  ).join('');
}

async function analyzeWithAI() {
  const text = document.getElementById('p-ai-text').value.trim();
  if (!text) { showToast('Bitte zuerst einen Text eingeben.', 'error'); return; }
  const btn = document.getElementById('p-ai-analyze-btn');
  const orig = btn.textContent;
  btn.textContent = 'Analysiere…';
  btn.disabled = true;
  try {
    const result = await callAI('extract', { text });
    if (result && typeof result === 'object') {
      _aiProfile = {
        ..._aiProfile,
        interessen: result.interessen ?? _aiProfile.interessen ?? [],
        personality: result.personality ?? _aiProfile.personality,
        energy_level: result.energy_level ?? _aiProfile.energy_level,
        relationship_depth: result.relationship_depth ?? _aiProfile.relationship_depth,
      };
      // Also fill empty form fields from extraction
      if (result.vorname && !document.getElementById('p-name').value) {
        document.getElementById('p-name').value = result.vorname;
      }
      if (result.stadt && !document.getElementById('p-city').value) {
        document.getElementById('p-city').value = result.stadt;
      }
      if (result.kategorie) {
        const catEl = document.getElementById('p-category');
        if (catEl && ['friend','romantic','family','work'].includes(result.kategorie)) {
          catEl.value = result.kategorie;
        }
      }
      renderAIChips();
      document.getElementById('p-ai-text').value = '';
      showToast('Profil analysiert.', 'success');
    }
  } catch (err) {
    showToast('KI-Fehler: ' + err.message, 'error');
  } finally {
    btn.textContent = orig;
    btn.disabled = false;
  }
}

function removeChip(key, arrVal) {
  if (arrVal && Array.isArray(_aiProfile[key])) {
    _aiProfile[key] = _aiProfile[key].filter(v => v !== arrVal);
  } else {
    delete _aiProfile[key];
  }
  renderAIChips();
}

function addChip() {
  const input = document.getElementById('p-ai-chip-input');
  const val = input.value.trim();
  if (!val) return;
  if (!_aiProfile.interessen) _aiProfile.interessen = [];
  if (!_aiProfile.interessen.includes(val)) {
    _aiProfile.interessen.push(val);
  }
  input.value = '';
  renderAIChips();
}

// ============================================================
// AI ACTIVITY SUGGESTION
// ============================================================
let _suggestFriend = null;
let _lastAISuggestion = null;

function openAISuggestModal(friendId) {
  const { friends } = getState();
  const f = friends.find(x => x.id === friendId);
  if (!f) return;
  _suggestFriend = f;
  _lastAISuggestion = null;

  // Build transparency list
  const prof = f.profile ?? {};
  const dataItems = [
    `Vorname: ${h(f.name.split(' ')[0])}`,
    f.city ? `Stadt: ${h(f.city)}` : null,
    f.category ? `Kategorie: ${h(catlab(f.category))}` : null,
    prof.interessen?.length ? `Interessen: ${prof.interessen.map(i => h(i)).join(', ')}` : null,
    prof.personality ? `Persönlichkeit: ${h(prof.personality)}` : null,
    prof.energy_level ? `Energielevel: ${h(prof.energy_level)}` : null,
    prof.relationship_depth ? `Beziehungsnähe: ${h(prof.relationship_depth)}` : null,
  ].filter(Boolean);

  document.getElementById('ai-suggest-modal-title').textContent = `✨ Vorschlag für ${f.name}`;
  document.getElementById('ai-suggest-data-list').innerHTML = dataItems.map(d => `<li>${d}</li>`).join('');
  document.getElementById('ai-suggest-loading').style.display = 'none';
  document.getElementById('ai-suggest-result').style.display = 'none';
  document.getElementById('ai-suggest-generate-btn').style.display = '';
  document.getElementById('ai-suggest-retry-btn').style.display = 'none';
  document.getElementById('ai-suggest-save-btn').style.display = 'none';
  document.getElementById('ai-suggest-modal').classList.add('open');
}

async function generateAISuggestion() {
  if (!_suggestFriend) return;
  const f = _suggestFriend;
  const prof = f.profile ?? {};

  const payload = {
    profile: {
      vorname: f.name.split(' ')[0],
      stadt: f.city ?? null,
      kategorie: catlab(f.category),
      interessen: prof.interessen ?? [],
      personality: prof.personality ?? null,
      energy_level: prof.energy_level ?? null,
      relationship_depth: prof.relationship_depth ?? null,
    },
  };

  document.getElementById('ai-suggest-loading').style.display = '';
  document.getElementById('ai-suggest-result').style.display = 'none';
  document.getElementById('ai-suggest-generate-btn').style.display = 'none';
  document.getElementById('ai-suggest-retry-btn').style.display = 'none';
  document.getElementById('ai-suggest-save-btn').style.display = 'none';

  try {
    const result = await callAI('activity', payload);
    _lastAISuggestion = result;
    document.getElementById('ai-suggest-result').innerHTML = `
      <div class="ai-suggest-card">
        <div class="ai-suggest-card__name">${h(result.name ?? 'Vorschlag')}</div>
        ${result.beschreibung ? `<div class="ai-suggest-card__desc">${h(result.beschreibung)}</div>` : ''}
        <div class="ai-suggest-card__meta">
          ${result.ort ? `<div><span class="ai-suggest-card__label">Ort</span>${h(result.ort)}</div>` : ''}
          ${result.budget ? `<div><span class="ai-suggest-card__label">Budget</span>${h(String(result.budget))}</div>` : ''}
          ${result.dauer ? `<div><span class="ai-suggest-card__label">Dauer</span>${h(String(result.dauer))}</div>` : ''}
          ${result.energie ? `<div><span class="ai-suggest-card__label">Energie</span>${h(result.energie)}</div>` : ''}
        </div>
        ${result.warum ? `<div class="ai-suggest-card__reason">${h(result.warum)}</div>` : ''}
      </div>`;
    document.getElementById('ai-suggest-result').style.display = '';
    document.getElementById('ai-suggest-retry-btn').style.display = '';
    document.getElementById('ai-suggest-save-btn').style.display = '';
  } catch (err) {
    const msg = /rate/i.test(err.message) ? 'Tageslimit erreicht. Versuche es morgen erneut.'
              : /fetch|network|timeout/i.test(err.message) ? 'KI nicht erreichbar. Bitte später erneut versuchen.'
              : err.message;
    document.getElementById('ai-suggest-result').innerHTML =
      `<div style="color:var(--danger);font-size:var(--text-sm);padding:var(--sp-3);">${h(msg)}</div>`;
    document.getElementById('ai-suggest-result').style.display = '';
    document.getElementById('ai-suggest-retry-btn').style.display = '';
  } finally {
    document.getElementById('ai-suggest-loading').style.display = 'none';
  }
}

async function saveAISuggestionAsActivity() {
  if (!_lastAISuggestion) return;
  const s = _lastAISuggestion;
  const payload = {
    name: s.name ?? 'KI-Vorschlag',
    location: s.ort ?? '',
    budget: parseFloat(String(s.budget).replace(/[^\d.]/g, '')) || 0,
    energy: ['low', 'medium', 'high'].includes(s.energie) ? s.energie : 'medium',
    min_people: 1,
    max_people: 4,
    duration: parseFloat(String(s.dauer).replace(/[^\d.]/g, '')) || 0,
    mode: 'social',
    inout: 'both',
    tags: [],
    todos: null,
  };
  try {
    const { data, error } = await Store.addActivity(payload);
    if (error) throw error;
    const { activities } = getState();
    setState({ activities: [data[0], ...activities] });
    document.getElementById('ai-suggest-modal').classList.remove('open');
    showToast(`"${h(s.name)}" als Aktivität gespeichert.`, 'success');
  } catch (err) {
    showToast('Fehler: ' + err.message, 'error');
  }
}

async function savePerson() {
  const name = sanitize(document.getElementById('p-name').value.trim(), LIMITS.name);
  if (!name) { showToast('Name ist Pflichtfeld.', 'error'); return; }
  const city  = sanitize(document.getElementById('p-city').value,  LIMITS.city);
  const notes = sanitize(document.getElementById('p-notes').value, LIMITS.notes);
  if (name.length  > LIMITS.name)  { showToast(`Name darf max. ${LIMITS.name} Zeichen haben.`,  'error'); return; }
  if (city.length  > LIMITS.city)  { showToast(`Wohnort darf max. ${LIMITS.city} Zeichen haben.`, 'error'); return; }
  if (notes.length > LIMITS.notes) { showToast(`Notizen darf max. ${LIMITS.notes} Zeichen haben.`, 'error'); return; }
  const btn  = document.getElementById('person-save-btn');
  btn.classList.add('btn-loading');
  const days = [...document.querySelectorAll('#p-days .day-btn.sel')].map(b => b.dataset.day) || [];
  const id   = document.getElementById('p-id').value;
  // Include AI profile if any chips exist
  const hasProfile = Object.keys(_aiProfile).some(k =>
    Array.isArray(_aiProfile[k]) ? _aiProfile[k].length : _aiProfile[k]
  );
  const payload = {
    name,
    birthday: document.getElementById('p-birthday').value,
    city,
    category: document.getElementById('p-category').value,
    partner:  document.getElementById('p-partner').value,
    days,
    notes,
    profile: hasProfile ? _aiProfile : null,
  };
  try {
    const { friends } = getState();
    if (id) {
      const { data, error } = await Store.updateFriend(id, payload);
      if (error) throw error;
      setState({ friends: friends.map(f => f.id === id ? data[0] : f) });
    } else {
      const { data, error } = await Store.addFriend(payload);
      if (error) throw error;
      setState({ friends: [data[0], ...friends] });
    }
    document.getElementById('person-modal').classList.remove('open');
    showToast(`${h(name)} ${id ? 'aktualisiert' : 'hinzugefügt'}.`, 'success');
  } catch(err) {
    showToast('Fehler: ' + err.message, 'error');
  } finally {
    btn.classList.remove('btn-loading');
  }
}

async function deletePerson(id) {
  const { friends } = getState();
  const f = friends.find(x => x.id === id);
  if (!f) return;
  const snapshot = structuredClone(friends);
  setState({ friends: friends.filter(x => x.id !== id) });
  showToast(`${h(f.name)} entfernt.`, '', () => { setState({ friends: snapshot }); });
  const { error } = await Store.deleteFriend(id);
  if (error) {
    setState({ friends: snapshot });
    showToast('Fehler beim Löschen: ' + error.message, 'error');
  }
}

function showHistory(id) {
  const { friends, events } = getState();
  const f = friends.find(x => x.id === id);
  if (!f) return;
  const evs = events.filter(e => (e.people_ids ?? []).includes(id)).sort((a, b) => b.date.localeCompare(a.date));
  document.getElementById('history-modal-title').textContent = `${f.name} – Verlauf`;
  document.getElementById('history-content').innerHTML = evs.length
    ? evs.map(e => `<div class="log-entry ${e.done ? 'done' : ''} ${e.mode === 'romantic' ? 'romantic' : ''}">
        <div class="log-date">${fmtDate(e.date)}${e.time ? ' · ' + h(e.time) : ''}</div>
        <div class="log-activity">${h(e.activity_name)}${e.mode === 'romantic' ? ' ♥' : ''}</div>
        ${e.note ? `<div class="log-note">${h(e.note)}</div>` : ''}
        ${e.done ? '<span class="tag tag-green">✓</span>' : '<span class="tag tag-yellow">offen</span>'}
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

    if (target.id === 'add-friend-btn')        { openPersonModal(); return; }
    if (target.id === 'empty-add-friend-btn')  { openPersonModal(); return; }

    const filterSel = target.closest('#friend-filter-category');
    if (filterSel) { renderFriendGrid(); return; }

    const editEl = target.closest('[data-action="edit"]');
    if (editEl) { openPersonModal(editEl.dataset.id); return; }

    const deleteEl = target.closest('[data-action="delete"]');
    if (deleteEl) { deletePerson(deleteEl.dataset.id); return; }

    const historyEl = target.closest('[data-action="history"]');
    if (historyEl) { showHistory(historyEl.dataset.id); return; }

    const aiSuggestEl = target.closest('[data-action="ai-suggest"]');
    if (aiSuggestEl) { openAISuggestModal(aiSuggestEl.dataset.id); return; }
  };

  container.addEventListener('click', _delegHandler);

  _changeHandler = e => {
    if (e.target.id === 'friend-filter-category') renderFriendGrid();
  };
  container.addEventListener('change', _changeHandler);

  _saveHandler = () => savePerson();
  document.getElementById('person-save-btn').addEventListener('click', _saveHandler);

  // AI buttons live inside person-modal (global DOM)
  const personModal = document.getElementById('person-modal');
  _modalHandler = e => {
    if (e.target.id === 'p-ai-analyze-btn') { analyzeWithAI(); return; }
    if (e.target.id === 'p-ai-chip-add')    { addChip(); return; }
    const removeEl = e.target.closest('[data-action="remove-chip"]');
    if (removeEl) { removeChip(removeEl.dataset.key, removeEl.dataset.arrVal); return; }
  };
  personModal?.addEventListener('click', _modalHandler);
  // Enter key in chip input adds chip
  document.getElementById('p-ai-chip-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addChip(); }
  });

  // AI suggest modal buttons (global DOM)
  const aiSuggestModal = document.getElementById('ai-suggest-modal');
  _aiModalHandler = e => {
    if (e.target.id === 'ai-suggest-generate-btn') { generateAISuggestion(); return; }
    if (e.target.id === 'ai-suggest-retry-btn')    { generateAISuggestion(); return; }
    if (e.target.id === 'ai-suggest-save-btn')     { saveAISuggestionAsActivity(); return; }
  };
  aiSuggestModal?.addEventListener('click', _aiModalHandler);

  _unsubscribe = subscribe(() => renderFriendGrid());
}

export function cleanup() {
  if (_delegHandler && _container) {
    _container.removeEventListener('click', _delegHandler);
    _delegHandler = null;
  }
  if (_modalHandler) {
    document.getElementById('person-modal')?.removeEventListener('click', _modalHandler);
    _modalHandler = null;
  }
  if (_aiModalHandler) {
    document.getElementById('ai-suggest-modal')?.removeEventListener('click', _aiModalHandler);
    _aiModalHandler = null;
  }
  if (_changeHandler && _container) {
    _container.removeEventListener('change', _changeHandler);
    _changeHandler = null;
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
  _counterCleanups.forEach(fn => fn());
  _counterCleanups = [];
  _container = null;
}
