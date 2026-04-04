'use strict';

import * as Auth from './auth.js';
import * as Store from './store.js';

// ============================================================
// STATE
// ============================================================
let db = { friends: [], activities: [], events: [] };
let currentMode = 'social';
let lastSugg = null, swapIdx = null;
let currentUser = null;

// ============================================================
// XSS PREVENTION
// ============================================================
const h = str => String(str ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

// ============================================================
// HELPERS
// ============================================================
const AV_COLS = ['av-0','av-1','av-2','av-3','av-4'];
const ini     = name => name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
const avc     = (id, category) => category === 'romantic' ? 'av-romantic' : AV_COLS[String(id).charCodeAt(0) % AV_COLS.length];
const elab    = e => ({low:'Entspannt',medium:'Aktiv',high:'Aufwändig'})[e] ?? e;
const iolab   = v => ({indoor:'Indoor',outdoor:'Outdoor',both:'Indoor/Outdoor'})[v] ?? v;
const modelab = m => ({social:'Freunde',romantic:'Romantisch',both:'Beides'})[m] ?? m;
const catlab  = c => ({friend:'Freund',romantic:'Romantisch',family:'Familie',work:'Arbeit'})[c] ?? c;
const dSince  = d => !d ? 9999 : Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
const fmtDate = d => !d ? 'Nie' : new Date(d).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'});
const pad2    = n => String(n).padStart(2,'0');

// ============================================================
// TOAST
// ============================================================
function toast(msg, type='', undoCb=null, duration=4500) {
  const c  = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' '+type : '');
  el.innerHTML = `<span style="flex:1;">${msg}</span>`;
  if (undoCb) {
    const u = document.createElement('span');
    u.className = 'toast-undo';
    u.textContent = 'Rückgängig';
    u.onclick = () => { undoCb(); el.remove(); };
    el.appendChild(u);
  }
  c.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ============================================================
// AUTH UI
// ============================================================
function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('loading-overlay').classList.add('hidden');
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  if (currentUser) {
    document.getElementById('user-email').textContent = currentUser.email;
  }
}

async function handleLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn      = document.getElementById('login-btn');
  const errEl    = document.getElementById('login-error');
  if (!email || !password) { errEl.textContent = 'Bitte E-Mail und Passwort eingeben.'; return; }
  btn.classList.add('btn-loading');
  errEl.textContent = '';
  const { error } = await Auth.signIn(email, password);
  if (error) {
    errEl.textContent = error.message;
    btn.classList.remove('btn-loading');
  }
  // On success onAuthStateChange handles transition
}

async function handleLogout() {
  await Auth.signOut();
  db = { friends: [], activities: [], events: [] };
}

// ============================================================
// DATA LOADING
// ============================================================
async function loadDB() {
  document.getElementById('loading-overlay').classList.remove('hidden');
  const [fr, ac, ev] = await Promise.all([
    Store.getFriends(),
    Store.getActivities(),
    Store.getEvents(),
  ]);
  if (fr.error || ac.error || ev.error) {
    toast('Verbindung fehlgeschlagen — bitte Seite neu laden.', 'error');
  }
  db.friends    = fr.data ?? [];
  db.activities = ac.data ?? [];
  db.events     = ev.data ?? [];
  document.getElementById('loading-overlay').classList.add('hidden');
  renderHome();
}

// ============================================================
// SCORING ALGORITHM
// ============================================================
function scoreFriend(friend, dateVal) {
  let score = 0;
  const days = dSince(friend.last_seen);
  score += days >= 9999 ? 50 : Math.min(50, Math.log10(days+1) * 20);
  const prefs = friend.days ?? [];
  if (dateVal && prefs.length > 0) {
    const dow = ['So','Mo','Di','Mi','Do','Fr','Sa'][new Date(dateVal).getDay()];
    score += prefs.includes(dow) ? 20 : 0;
  } else { score += 10; }
  const meetCount = db.events.filter(e => (e.peopleIds ?? []).includes(friend.id)).length;
  score += Math.max(0, 20 - meetCount * 4);
  score += Math.random() * 10;
  return Math.min(100, score);
}

// ============================================================
// MODE (social / romantic)
// ============================================================
function setMode(mode) {
  currentMode = mode;
  document.getElementById('mode-social').className   = 'mode-btn' + (mode==='social' ? ' active-social' : '');
  document.getElementById('mode-romantic').className = 'mode-btn' + (mode==='romantic' ? ' active-romantic' : '');
  document.getElementById('suggest-result').style.display = 'none';
}

// ============================================================
// NAV
// ============================================================
function switchPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  if (btn) btn.classList.add('active');
  ({ home:renderHome, friends:renderFriends, activities:renderActivities,
     calendar:renderCalendar, log:renderLog })[id]?.();
}

// ============================================================
// HOME
// ============================================================
function renderHome() {
  const scored = db.friends
    .map(f => ({...f, _score: scoreFriend(f, null)}))
    .sort((a,b) => b._score - a._score);

  const overdueEl = document.getElementById('overdue-list');
  overdueEl.innerHTML = scored.length ? scored.map(f => {
    const days  = dSince(f.last_seen);
    const cls   = days > 90 ? 'urgent' : days > 30 ? 'warn' : 'ok';
    const label = f.last_seen ? `vor ${days} Tagen` : 'Noch nie';
    const pct   = Math.round(f._score);
    const isRomantic = f.category === 'romantic';
    return `<div class="overdue-row ${cls}">
      <div class="person-avatar ${avc(f.id, f.category)}" style="width:34px;height:34px;font-size:13px;margin:0;flex-shrink:0;">${ini(f.name)}</div>
      <div style="flex:1;min-width:0;">
        <div class="overdue-name">${h(f.name)}${isRomantic?' <span class="tag tag-pink" style="font-size:10px;">♥</span>':''}</div>
        <div class="score-bar"><div class="score-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="overdue-city">${h(f.city??'')}</div>
      <div class="overdue-days ${cls}">${label}</div>
      <button class="btn btn-sm" onclick="quickPlan('${f.id}')">Einladen</button>
    </div>`;
  }).join('') : '<div class="empty-state">Noch keine Freunde eingetragen.</div>';

  // Birthdays
  const now   = Date.now();
  const bdayEl = document.getElementById('bday-list');
  const bf = db.friends.filter(f=>f.birthday).map(f => {
    const b    = new Date(f.birthday);
    const next = new Date(new Date().getFullYear(), b.getMonth(), b.getDate());
    if (next < new Date()) next.setFullYear(next.getFullYear()+1);
    return {...f, daysUntil: Math.ceil((next-now)/86400000)};
  }).filter(f=>f.daysUntil<=60).sort((a,b)=>a.daysUntil-b.daysUntil);

  bdayEl.innerHTML = bf.length ? bf.map(f => {
    const lbl = f.daysUntil===0?'Heute!':f.daysUntil===1?'Morgen':`in ${f.daysUntil} Tagen`;
    const cls = f.daysUntil<=3?'urgent':f.daysUntil<=14?'warn':'ok';
    return `<div class="overdue-row ${cls}">
      <div class="person-avatar ${avc(f.id, f.category)}" style="width:34px;height:34px;font-size:13px;margin:0;flex-shrink:0;">${ini(f.name)}</div>
      <div class="overdue-name">${h(f.name)}</div>
      <div class="overdue-city">${new Date(f.birthday).toLocaleDateString('de-DE',{day:'2-digit',month:'long'})}</div>
      <div class="overdue-days ${cls}">${lbl}</div>
    </div>`;
  }).join('') : '<div style="font-size:13px;color:var(--muted);padding:6px 0;">Keine Geburtstage in den nächsten 60 Tagen.</div>';

  // Recent events
  const recentEl = document.getElementById('recent-list');
  const recent   = [...db.events].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6);
  recentEl.innerHTML = recent.length ? recent.map(e => `
    <div class="overdue-row">
      <div style="font-size:12px;color:var(--muted);min-width:80px;">${fmtDate(e.date)}</div>
      <div style="flex:1;font-size:14px;font-weight:500;">${h(e.activityName)}${e.mode==='romantic'?' <span class="tag tag-pink" style="font-size:10px;">♥</span>':''}</div>
      <div style="font-size:12px;color:var(--muted);">${h(e.people??'–')}</div>
      ${e.done?'<span class="tag tag-green">✓</span>':'<span class="tag tag-yellow">offen</span>'}
    </div>`).join('')
  : '<div style="font-size:13px;color:var(--muted);padding:6px 0;">Noch keine Treffen eingetragen.</div>';
}

function quickPlan(fid) {
  switchPage('suggest', document.querySelectorAll('nav button')[1]);
  setTimeout(() => generateSuggestion([fid]), 50);
}

// ============================================================
// FRIENDS
// ============================================================
function renderFriends() {
  const grid      = document.getElementById('friends-grid');
  const filterCat = document.getElementById('friend-filter-category').value;
  let list = db.friends;
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
    const ec      = db.events.filter(e=>(e.peopleIds??[]).includes(f.id)).length;
    const score   = Math.round(scoreFriend(f, null));
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
        <button class="btn btn-sm" onclick="openPersonModal('${f.id}')">Bearbeiten</button>
        <button class="btn btn-sm" onclick="showHistory('${f.id}')">Verlauf</button>
        <button class="btn btn-sm btn-danger" onclick="deletePerson('${f.id}')">Entfernen</button>
      </div>
    </div>`;
  }).join('');
}

function showHistory(id) {
  const f = db.friends.find(x=>x.id===id);
  if (!f) return;
  const evs = db.events.filter(e=>(e.peopleIds??[]).includes(id)).sort((a,b)=>b.date.localeCompare(a.date));
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

function openPersonModal(id) {
  const f = id ? db.friends.find(x=>x.id===id) : null;
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
  if (!name) { toast('Name ist Pflichtfeld.', 'error'); return; }
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
    if (id) {
      const { data, error } = await Store.updateFriend(id, payload);
      if (error) throw error;
      db.friends = db.friends.map(f => f.id===id ? data[0] : f);
    } else {
      const { data, error } = await Store.addFriend(payload);
      if (error) throw error;
      db.friends.unshift(data[0]);
    }
    closeModal('person-modal');
    renderFriends();
    toast(`${h(name)} ${id?'aktualisiert':'hinzugefügt'}.`, 'success');
  } catch(err) {
    toast('Fehler: '+err.message, 'error');
  } finally {
    btn.classList.remove('btn-loading');
  }
}

async function deletePerson(id) {
  const f = db.friends.find(x=>x.id===id);
  if (!f) return;
  const snapshot = structuredClone(db.friends);
  db.friends = db.friends.filter(x=>x.id!==id);
  renderFriends();
  toast(`${h(f.name)} entfernt.`, '', () => { db.friends = snapshot; renderFriends(); });
  const { error } = await Store.deleteFriend(id);
  if (error) {
    db.friends = snapshot; renderFriends();
    toast('Fehler beim Löschen: '+error.message, 'error');
  }
}

// ============================================================
// ACTIVITIES
// ============================================================
function renderActivities() {
  const grid       = document.getElementById('activities-grid');
  const filterMode = document.getElementById('activity-filter-mode').value;
  let list = db.activities;
  if (filterMode) list = list.filter(a => a.mode === filterMode || a.mode === 'both');
  if (!list.length) { grid.innerHTML = '<div class="empty-state">Keine Aktivitäten gefunden.</div>'; return; }

  grid.innerHTML = list.map(a => {
    const tags = (a.tags??[]).map(t=>`<span class="tag tag-orange">${h(t)}</span>`).join('');
    const uc   = db.events.filter(e=>e.activityId===a.id).length;
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
        <button class="btn btn-sm" onclick="openActivityModal('${a.id}')">Bearbeiten</button>
        <button class="btn btn-sm btn-danger" onclick="deleteActivity('${a.id}')">Entfernen</button>
      </div>
    </div>`;
  }).join('');
}

function openActivityModal(id) {
  const a = id ? db.activities.find(x=>x.id===id) : null;
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
  if (!name) { toast('Name ist Pflichtfeld.', 'error'); return; }
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
    if (id) {
      const { data, error } = await Store.updateActivity(id, payload);
      if (error) throw error;
      db.activities = db.activities.map(a => a.id===id ? data[0] : a);
    } else {
      const { data, error } = await Store.addActivity(payload);
      if (error) throw error;
      db.activities.unshift(data[0]);
    }
    closeModal('activity-modal');
    renderActivities();
    toast(`${h(name)} ${id?'aktualisiert':'hinzugefügt'}.`, 'success');
  } catch(err) {
    toast('Fehler: '+err.message, 'error');
  } finally {
    btn.classList.remove('btn-loading');
  }
}

async function deleteActivity(id) {
  const a = db.activities.find(x=>x.id===id);
  if (!a) return;
  const snapshot = structuredClone(db.activities);
  db.activities = db.activities.filter(x=>x.id!==id);
  renderActivities();
  toast(`${h(a.name)} gelöscht.`, '', () => { db.activities = snapshot; renderActivities(); });
  const { error } = await Store.deleteActivity(id);
  if (error) {
    db.activities = snapshot; renderActivities();
    toast('Fehler beim Löschen: '+error.message, 'error');
  }
}

// ============================================================
// SUGGEST
// ============================================================
function generateSuggestion(forceIds) {
  if (!db.activities.length) { toast('Füge zuerst Aktivitäten hinzu.', 'error'); return; }
  if (!db.friends.length)    { toast('Füge zuerst Freunde hinzu.', 'error'); return; }

  const energy  = document.getElementById('s-energy').value;
  const budget  = parseFloat(document.getElementById('s-budget').value)||Infinity;
  const prio    = document.getElementById('s-prioritize').checked;
  const dateVal = document.getElementById('s-date').value;

  let cands = db.activities.filter(a => {
    if (currentMode === 'romantic' && a.mode === 'social') return false;
    if (currentMode === 'social'   && a.mode === 'romantic') return false;
    if (energy && a.energy !== energy) return false;
    if (a.budget && a.budget > budget) return false;
    return true;
  });
  if (!cands.length) { toast('Keine Aktivität passt zu den Filtern.', ''); cands = [...db.activities]; }
  const act = cands[Math.floor(Math.random() * cands.length)];

  let pool = db.friends.filter(f => {
    if (currentMode === 'romantic' && f.category !== 'romantic') return false;
    if (currentMode === 'social'   && f.category === 'romantic') return false;
    return true;
  }).map(f => ({...f, _score: scoreFriend(f, dateVal)}));

  if (dateVal) {
    const dow      = ['So','Mo','Di','Mi','Do','Fr','Sa'][new Date(dateVal).getDay()];
    const filtered = pool.filter(f => !(f.days??[]).length || (f.days??[]).includes(dow));
    if (filtered.length >= Math.max(1, (act.min??1)-1)) pool = filtered;
  }

  pool = prio
    ? [...pool].sort((a,b) => b._score - a._score)
    : pool.sort(() => Math.random() - .5);

  const maxP  = Math.min((act.max??99)-1, pool.length);
  const minP  = Math.max((act.min??1)-1, 1);
  const count = minP + Math.floor(Math.random() * Math.max(1, maxP-minP+1));

  let invited = [];
  if (forceIds) {
    forceIds.forEach(fid => { const f = db.friends.find(x=>x.id===fid); if (f) invited.push(f); });
    pool = pool.filter(f => !forceIds.includes(f.id));
  }
  for (let i = invited.length; i < Math.min(count, invited.length+pool.length); i++) {
    invited.push(pool[i-invited.length]);
  }

  lastSugg = { activity:act, invited:[...invited], date:dateVal, mode:currentMode };
  renderSuggResult();
}

function renderSuggResult() {
  const { activity:act, invited } = lastSugg;
  document.getElementById('res-activity').textContent   = act.name + (act.mode==='romantic' ? ' ♥' : '');
  document.getElementById('res-location').textContent   = act.location ?? '–';
  document.getElementById('res-budget').textContent     = act.budget ? act.budget+'€ / Person' : '–';
  document.getElementById('res-persons').textContent    = `${act.min??1}–${act.max??'∞'} Personen`;
  document.getElementById('res-energy-lbl').textContent = elab(act.energy);
  document.getElementById('res-todos').textContent      = act.todos ?? 'Keine Todos';
  document.getElementById('res-people').innerHTML = invited.map((f,i) => {
    const d  = dSince(f.last_seen);
    const ut = d>90 ? `<span class="tag tag-red" style="font-size:10px;padding:1px 5px;">${d}T.</span>`
             : d>30 ? `<span class="tag tag-yellow" style="font-size:10px;padding:1px 5px;">${d}T.</span>` : '';
    return `<div class="person-chip" onclick="openSwap(${i})" title="Klicken zum Tauschen">
      <div class="chip-avatar ${avc(f.id, f.category)}">${ini(f.name)}</div>
      <span>${h(f.name)}</span>${ut}
      <span style="font-size:11px;color:var(--muted);">⇄</span>
    </div>`;
  }).join('');
  document.getElementById('suggest-result').style.display = 'block';
}

function openSwap(index) {
  swapIdx = index;
  const cur       = lastSugg.invited[index];
  const alreadyIn = lastSugg.invited.map(f=>f.id);
  const alts      = db.friends
    .filter(f => f.id !== cur.id && !alreadyIn.includes(f.id))
    .filter(f => currentMode === 'romantic' ? f.category === 'romantic' : f.category !== 'romantic')
    .map(f => ({...f, _score: scoreFriend(f, lastSugg.date)}))
    .sort((a,b) => b._score - a._score);
  if (!alts.length) { toast('Keine weiteren Personen verfügbar.'); return; }
  document.getElementById('swap-list').innerHTML = `
    <div style="font-size:13px;color:var(--muted);margin-bottom:8px;">Tausche <strong style="font-weight:500;">${h(cur.name)}</strong> gegen:</div>
    ${alts.map(f => {
      const d   = dSince(f.last_seen);
      const cls = d>90?'tag-red':d>30?'tag-yellow':'tag-green';
      return `<div class="overdue-row" style="cursor:pointer;" onclick="doSwap('${f.id}')">
        <div class="person-avatar ${avc(f.id, f.category)}" style="width:32px;height:32px;font-size:12px;margin:0;flex-shrink:0;">${ini(f.name)}</div>
        <div style="flex:1;font-size:14px;font-weight:500;">${h(f.name)}</div>
        <div style="font-size:12px;color:var(--muted);">${h(f.city??'')}</div>
        <span class="tag ${cls}">${f.last_seen?'vor '+d+'T.':'Nie'}</span>
      </div>`;
    }).join('')}`;
  document.getElementById('swap-modal').classList.add('open');
}

function doSwap(newId) {
  const nf = db.friends.find(f=>f.id===newId);
  if (nf && swapIdx !== null) { lastSugg.invited[swapIdx] = nf; closeModal('swap-modal'); renderSuggResult(); }
}

function saveToCalendar() {
  if (!lastSugg) return;
  const { activity:act, invited, date } = lastSugg;
  document.getElementById('ce-date').value = date ?? '';
  document.getElementById('ce-time').value = document.getElementById('res-time').value ?? '12:00';
  document.getElementById('ce-activity').innerHTML = db.activities
    .map(a=>`<option value="${a.id}" ${a.id===act.id?'selected':''}>${h(a.name)}</option>`).join('');
  document.getElementById('ce-people').innerHTML = db.friends
    .map(f=>`<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
      <input type="checkbox" value="${f.id}" ${invited.some(x=>x.id===f.id)?'checked':''}
        style="width:auto;accent-color:var(--accent);"> ${h(f.name)}
    </label>`).join('');
  document.getElementById('ce-note').value = '';
  document.getElementById('gcal-status').style.display = 'none';
  document.getElementById('cal-modal').classList.add('open');
}

// ============================================================
// CALENDAR
// ============================================================
let calY = new Date().getFullYear(), calM = new Date().getMonth();

function renderCalendar() {
  const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  document.getElementById('cal-month-title').textContent = `${months[calM]} ${calY}`;
  const grid  = document.getElementById('cal-grid');
  const first = new Date(calY, calM, 1), last = new Date(calY, calM+1, 0);
  let off     = first.getDay()-1; if (off<0) off=6;
  const tod   = new Date();
  let markup  = '';
  const pl    = new Date(calY, calM, 0).getDate();
  for (let i=off-1; i>=0; i--)
    markup += `<div class="cal-day other-month"><div class="day-num">${pl-i}</div></div>`;
  for (let d=1; d<=last.getDate(); d++) {
    const ds  = `${calY}-${pad2(calM+1)}-${pad2(d)}`;
    const isT = tod.getFullYear()===calY && tod.getMonth()===calM && tod.getDate()===d;
    const evs = db.events.filter(e=>e.date===ds);
    markup += `<div class="cal-day ${isT?'today':''} ${evs.length?'has-event':''}" onclick="selectDay('${ds}')">
      <div class="day-num">${d}</div>
      ${evs.map(e=>`<div class="cal-event ${e.mode==='romantic'?'romantic':''}">${h(e.activityName)}</div>`).join('')}
    </div>`;
  }
  const rem = (off+last.getDate())%7;
  for (let i=1; i<=(rem===0?0:7-rem); i++)
    markup += `<div class="cal-day other-month"><div class="day-num">${i}</div></div>`;
  grid.innerHTML = markup;
}

function selectDay(ds) {
  const evs = db.events.filter(e=>e.date===ds);
  const lbl = new Date(ds).toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  let markup = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
    <strong style="font-size:15px;">${lbl}</strong>
    <button class="btn btn-sm btn-primary" onclick="openCalModalForDate('${ds}')">+ Treffen</button>
  </div>`;
  if (!evs.length) { markup += '<div style="font-size:13px;color:var(--muted);">Keine Treffen.</div>'; }
  else markup += evs.map(e=>`<div class="log-entry ${e.done?'done':''} ${e.mode==='romantic'?'romantic':''}">
    <div class="log-activity">${h(e.activityName)}${e.mode==='romantic'?' ♥':''}${e.time?' · '+h(e.time):''}</div>
    <div class="log-people">${h(e.people??'–')}</div>
    ${e.note?`<div class="log-note">${h(e.note)}</div>`:''}
    <div class="log-actions">
      <input type="checkbox" class="check-done" ${e.done?'checked':''} onchange="toggleDone('${e.id}',this.checked)">
      <span style="font-size:12px;color:var(--muted);">${e.done?'Abgehakt':'Als erledigt markieren'}</span>
      <button class="btn btn-sm btn-danger" style="margin-left:auto;" onclick="deleteEvent('${e.id}','${ds}')">Entfernen</button>
    </div>
  </div>`).join('');
  document.getElementById('day-detail-content').innerHTML = markup;
  document.getElementById('day-detail').style.display = 'block';
}

function calPrev() { calM--; if(calM<0){calM=11;calY--;} renderCalendar(); document.getElementById('day-detail').style.display='none'; }
function calNext() { calM++; if(calM>11){calM=0;calY++;} renderCalendar(); document.getElementById('day-detail').style.display='none'; }

// ============================================================
// LOG
// ============================================================
function renderLog() {
  const fp = document.getElementById('log-filter-person');
  const fa = document.getElementById('log-filter-activity');
  const sp=fp.value, sa=fa.value, sm=document.getElementById('log-filter-mode').value, sd=document.getElementById('log-filter-done').value;
  fp.innerHTML = '<option value="">Alle Personen</option>'+db.friends.map(f=>`<option value="${f.id}" ${sp===f.id?'selected':''}>${h(f.name)}</option>`).join('');
  fa.innerHTML = '<option value="">Alle Aktivitäten</option>'+db.activities.map(a=>`<option value="${a.id}" ${sa===a.id?'selected':''}>${h(a.name)}</option>`).join('');
  let evs = [...db.events].sort((a,b)=>b.date.localeCompare(a.date));
  if (sp) evs = evs.filter(e=>(e.peopleIds??[]).includes(sp));
  if (sa) evs = evs.filter(e=>e.activityId===sa);
  if (sm) evs = evs.filter(e=>e.mode===sm);
  if (sd==='open') evs = evs.filter(e=>!e.done);
  if (sd==='done') evs = evs.filter(e=>e.done);
  const list = document.getElementById('log-list');
  if (!evs.length) { list.innerHTML='<div class="empty-state">Keine Treffen gefunden.</div>'; return; }
  list.innerHTML = evs.map(e=>`<div class="log-entry ${e.done?'done':''} ${e.mode==='romantic'?'romantic':''}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div class="log-date">${fmtDate(e.date)}${e.time?' · '+h(e.time):''}</div>
        <div class="log-activity">${h(e.activityName)}${e.mode==='romantic'?' ♥':''}</div>
        <div class="log-people">${h(e.people??'–')}</div>
        ${e.note?`<div class="log-note">${h(e.note)}</div>`:''}
      </div>
      ${e.done?'<span class="tag tag-green">✓</span>':'<span class="tag tag-yellow">offen</span>'}
    </div>
    <div class="log-actions">
      <input type="checkbox" class="check-done" ${e.done?'checked':''} onchange="toggleDone('${e.id}',this.checked)">
      <span style="font-size:12px;color:var(--muted);">${e.done?'Abgehakt':'Abhaken'}</span>
      <button class="btn btn-sm btn-danger" style="margin-left:auto;" onclick="deleteEvent('${e.id}','')">Entfernen</button>
    </div>
  </div>`).join('');
}

async function toggleDone(id, val) {
  const { data, error } = await Store.updateEvent(id, { done: val });
  if (error) { toast('Fehler: '+error.message, 'error'); return; }
  db.events = db.events.map(e => e.id===id ? data[0] : e);
}

// ============================================================
// CALENDAR MODAL
// ============================================================
function openCalModalForDate(ds) {
  document.getElementById('ce-date').value = ds;
  document.getElementById('ce-time').value = '12:00';
  document.getElementById('ce-activity').innerHTML = db.activities.length
    ? db.activities.map(a=>`<option value="${a.id}">${h(a.name)}</option>`).join('')
    : '<option value="">Keine Aktivitäten angelegt</option>';
  document.getElementById('ce-people').innerHTML = db.friends
    .map(f=>`<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
      <input type="checkbox" value="${f.id}" style="width:auto;accent-color:var(--accent);"> ${h(f.name)}
    </label>`).join('');
  document.getElementById('ce-note').value = '';
  document.getElementById('gcal-status').style.display = 'none';
  document.getElementById('cal-modal').classList.add('open');
}

function getCalData() {
  const date    = document.getElementById('ce-date').value;
  const time    = document.getElementById('ce-time').value;
  const actId   = document.getElementById('ce-activity').value;
  const act     = db.activities.find(a=>a.id===actId) ?? null;
  const checked = [...document.querySelectorAll('#ce-people input:checked')].map(c=>c.value);
  const people  = db.friends.filter(f=>checked.includes(f.id)).map(f=>f.name);
  const note    = document.getElementById('ce-note').value;
  const mode    = act?.mode === 'romantic' ? 'romantic' : 'social';
  return { date, time, act, actId, people, peopleIds:checked, note, mode };
}

async function saveCalEvent() {
  const { date, time, act, actId, people, peopleIds, note, mode } = getCalData();
  if (!date) { toast('Bitte Datum wählen.', 'error'); return; }
  const btn = document.getElementById('cal-save-btn');
  btn.classList.add('btn-loading');
  const payload = {
    date, time,
    activityId:   actId,
    activityName: act?.name ?? 'Treffen',
    peopleIds, people: people.join(', '), note, done: false, mode,
  };
  try {
    const { data, error } = await Store.addEvent(payload);
    if (error) throw error;
    db.events.unshift(data[0]);
    // Update last_seen for all participants
    await Promise.all(peopleIds.map(pid => Store.updateFriend(pid, { last_seen: date })));
    db.friends = db.friends.map(f => peopleIds.includes(f.id) ? {...f, last_seen: date} : f);
    closeModal('cal-modal');
    renderCalendar();
    if (document.getElementById('day-detail').style.display!=='none') selectDay(date);
    renderLog();
    toast(`Treffen eingetragen: ${h(act?.name??'Treffen')} am ${fmtDate(date)}`, 'success');
  } catch(err) {
    toast('Fehler: '+err.message, 'error');
  } finally {
    btn.classList.remove('btn-loading');
  }
}

async function deleteEvent(id, ds) {
  const e = db.events.find(x=>x.id===id);
  if (!e) return;
  const snapshot = structuredClone(db.events);
  db.events = db.events.filter(x=>x.id!==id);
  renderCalendar(); renderLog();
  if (ds) selectDay(ds);
  toast(`${h(e.activityName)} entfernt.`, '', () => {
    db.events = snapshot; renderCalendar(); renderLog();
    if (ds) selectDay(ds);
  });
  const { error } = await Store.deleteEvent(id);
  if (error) {
    db.events = snapshot; renderCalendar(); renderLog();
    toast('Fehler beim Löschen: '+error.message, 'error');
  }
}

// ============================================================
// ICS EXPORT
// ============================================================
function exportICS() {
  const { date, time, act, people, note } = getCalData();
  if (!date) { toast('Bitte Datum wählen.', 'error'); return; }
  if (!act)  { toast('Bitte Aktivität wählen.', 'error'); return; }
  const [hh, mm] = (time ?? '12:00').split(':').map(Number);
  const endH     = Math.min(hh + Math.floor(act.duration ?? 2), 23);
  const d        = date.replace(/-/g,'');
  const dtStart  = `${d}T${pad2(hh)}${pad2(mm)}00`;
  const dtEnd    = `${d}T${pad2(endH)}${pad2(mm)}00`;
  const desc = [people.length?'Eingeladen: '+people.join(', '):'', act.location?'Ort: '+act.location:'', act.todos?'Todos: '+act.todos:'', note??''].filter(Boolean).join('\\n');
  const ics = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Sozialplaner//DE','CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE','TZID:Europe/Berlin',
    'BEGIN:STANDARD','DTSTART:19701025T030000','RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10','TZOFFSETFROM:+0200','TZOFFSETTO:+0100','TZNAME:CET','END:STANDARD',
    'BEGIN:DAYLIGHT','DTSTART:19700329T020000','RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3','TZOFFSETFROM:+0100','TZOFFSETTO:+0200','TZNAME:CEST','END:DAYLIGHT',
    'END:VTIMEZONE','BEGIN:VEVENT',
    `UID:${Date.now()}@sozialplaner`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').slice(0,15)}Z`,
    `DTSTART;TZID=Europe/Berlin:${dtStart}`,`DTEND;TZID=Europe/Berlin:${dtEnd}`,
    `SUMMARY:${act.name}${people.length?' mit '+people.join(', '):''}`,
    `LOCATION:${act.location??''}`,`DESCRIPTION:${desc}`,
    'END:VEVENT','END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics],{type:'text/calendar;charset=utf-8'}));
  a.download = act.name.replace(/\s+/g,'-')+'-'+date+'.ics';
  a.click();
  toast('ICS-Datei exportiert.', 'success');
}

// ============================================================
// GOOGLE CALENDAR
// ============================================================
async function saveToGoogleCal() {
  const { date, time, act, people, note } = getCalData();
  if (!date) { toast('Bitte Datum wählen.', 'error'); return; }
  if (!act)  { toast('Bitte Aktivität wählen.', 'error'); return; }
  const btn = document.getElementById('gcal-btn');
  const st  = document.getElementById('gcal-status');
  btn.classList.add('btn-loading');
  st.style.display='block'; st.style.background='rgba(74,133,244,.08)'; st.style.color='#1a3a8a';
  st.textContent = 'Wird in Google Calendar eingetragen…';
  const [hh, mm] = (time??'12:00').split(':');
  const endH = pad2(Math.min(parseInt(hh)+Math.floor(act.duration??2), 23));
  const prompt = `Erstelle einen Google Calendar Termin:\n- Titel: ${act.name}${people.length?' mit '+people.join(', '):''}\n- Start: ${date}T${hh}:${mm}:00 (Europe/Berlin)\n- Ende: ${date}T${endH}:${mm}:00 (Europe/Berlin)\n- Ort: ${act.location??''}\n- Beschreibung: ${[people.length?'Eingeladen: '+people.join(', '):'', act.todos?'Todos: '+act.todos:'', note].filter(Boolean).join('\\n')}\nBitte direkt eintragen.`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:1000,
        messages:[{role:'user',content:prompt}],
        mcp_servers:[{type:'url',url:'https://gcal.mcp.claude.com/mcp',name:'google-calendar'}] }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    st.style.background='rgba(60,140,80,.08)'; st.style.color='#1a6a2a';
    st.textContent = '✓ In Google Calendar eingetragen!';
    saveCalEvent();
  } catch(err) {
    st.style.background='rgba(180,60,60,.08)'; st.style.color='#8a1a1a';
    st.textContent = `Fehler: ${err.message}. ICS-Export als Alternative nutzen.`;
  } finally {
    btn.classList.remove('btn-loading');
  }
}

// ============================================================
// MODAL HELPERS
// ============================================================
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.modal-bg').forEach(m => {
  m.addEventListener('click', e => { if (e.target===m) m.classList.remove('open'); });
});
document.addEventListener('keydown', e => {
  if (e.key==='Escape') document.querySelectorAll('.modal-bg.open').forEach(m=>m.classList.remove('open'));
});
document.getElementById('login-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleLogin();
});

// ============================================================
// AUTH STATE LISTENER
// ============================================================
Auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    currentUser = session.user;
    showApp();
    loadDB();
  } else if (event === 'SIGNED_OUT') {
    currentUser = null;
    db = { friends: [], activities: [], events: [] };
    showLogin();
  }
});

// ============================================================
// INIT
// ============================================================
document.getElementById('s-date').value = new Date().toISOString().slice(0,10);

async function init() {
  const { data } = await Auth.getCurrentUser();
  if (data?.user) {
    currentUser = data.user;
    showApp();
    await loadDB();
  } else {
    showLogin();
  }
}
init();

// Expose functions for inline HTML handlers
Object.assign(window, {
  switchPage, setMode, generateSuggestion, openSwap, doSwap, saveToCalendar,
  openPersonModal, savePerson, deletePerson, showHistory,
  openActivityModal, saveActivity, deleteActivity,
  calPrev, calNext, selectDay, openCalModalForDate,
  saveCalEvent, deleteEvent, toggleDone, exportICS, saveToGoogleCal,
  closeModal, handleLogin, handleLogout, quickPlan,
  renderFriends, renderActivities, renderLog,
});
