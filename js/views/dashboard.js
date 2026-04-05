import { getState, subscribe } from '../state.js';
import { showToast } from '../ui/feedback.js';
import { h, ini, avc, dSince, fmtDate, scoreFriend, elab } from '../ui/helpers.js';
import { openCalModal } from '../ui/cal-modal.js';

let _container      = null;
let _unsubscribe    = null;
let _currentMode    = 'social';
let _lastSugg       = null;
let _swapIdx        = null;
let _delegHandler   = null;
let _swapHandler    = null;

// ============================================================
// HOME RENDERING
// ============================================================
function renderHome() {
  const { friends, events, activities } = getState();
  const today = new Date().toISOString().slice(0, 10);

  const scored = friends
    .map(f => ({...f, _score: scoreFriend(f, null, events)}))
    .sort((a,b) => b._score - a._score);

  const dashHome = document.getElementById('dash-home');
  if (!dashHome) return;

  // Stats
  const totalFriends    = friends.length;
  const totalActivities = (activities ?? []).length;
  const upcomingEvents  = events.filter(e => e.date >= today).length;

  const fmtMonthShort = date => new Date(date).toLocaleDateString('de-DE', { month: 'short' });

  // Upcoming events for timeline (not done, date >= today, sorted asc, max 5)
  const upcomingList = [...events]
    .filter(e => e.date >= today && !e.done)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  // Overdue rows
  const overdueRows = scored.length
    ? scored.map(f => {
        const days  = dSince(f.last_seen);
        const cls   = days > 90 ? 'urgent' : days > 30 ? 'warn' : 'ok';
        const label = f.last_seen ? `vor ${days} Tagen` : 'Noch nie';
        const pct   = Math.round(f._score);
        const isRomantic = f.category === 'romantic';
        return `<div class="overdue-row ${cls}">
          <div class="person-avatar ${avc(f.id, f.category)}" style="width:34px;height:34px;font-size:13px;margin:0;flex-shrink:0;">${ini(f.name)}</div>
          <div style="flex:1;min-width:0;">
            <div class="overdue-name">${h(f.name)}${isRomantic ? ' <span class="tag tag-pink" style="font-size:10px;">♥</span>' : ''}</div>
            <div class="score-bar"><div class="score-fill" style="width:${pct}%"></div></div>
          </div>
          <div class="overdue-city">${h(f.city ?? '')}</div>
          <div class="overdue-days ${cls}">${label}</div>
          <button class="btn btn-sm" data-action="quick-plan" data-id="${f.id}">Einladen</button>
        </div>`;
      }).join('')
    : '<div class="empty-state">Noch keine Freunde eingetragen.</div>';

  // Birthday rows
  const now = Date.now();
  const bf = friends.filter(f => f.birthday).map(f => {
    const b    = new Date(f.birthday);
    const next = new Date(new Date().getFullYear(), b.getMonth(), b.getDate());
    if (next < new Date()) next.setFullYear(next.getFullYear() + 1);
    return { ...f, daysUntil: Math.ceil((next - now) / 86400000) };
  }).filter(f => f.daysUntil <= 60).sort((a, b) => a.daysUntil - b.daysUntil);

  const bdayRows = bf.length
    ? bf.map(f => {
        const lbl = f.daysUntil === 0 ? 'Heute!' : f.daysUntil === 1 ? 'Morgen' : `in ${f.daysUntil} Tagen`;
        const cls = f.daysUntil <= 3 ? 'urgent' : f.daysUntil <= 14 ? 'warn' : 'ok';
        return `<div class="overdue-row ${cls}">
          <div class="person-avatar ${avc(f.id, f.category)}" style="width:34px;height:34px;font-size:13px;margin:0;flex-shrink:0;">${ini(f.name)}</div>
          <div class="overdue-name">${h(f.name)}</div>
          <div class="overdue-city">${new Date(f.birthday).toLocaleDateString('de-DE', { day: '2-digit', month: 'long' })}</div>
          <div class="overdue-days ${cls}">${lbl}</div>
        </div>`;
      }).join('')
    : '<div style="font-size:13px;color:var(--muted);padding:6px 0;">Keine Geburtstage in den nächsten 60 Tagen.</div>';

  // Timeline items
  const timelineItems = upcomingList.length
    ? upcomingList.map(e => {
        const dayNum   = new Date(e.date).getDate();
        const monthStr = fmtMonthShort(e.date);
        const isRomantic = e.mode === 'romantic';
        const statusTag  = e.done
          ? '<span class="tag tag-green">✓ Erledigt</span>'
          : '<span class="tag tag-yellow">Offen</span>';
        return `<div class="timeline__item">
          <div class="timeline__date-col">
            <span class="timeline__day">${dayNum}</span>
            <span class="timeline__month">${monthStr}</span>
          </div>
          <div class="timeline__body">
            <div class="timeline__title">${h(e.activityName)}${isRomantic ? ' ♥' : ''}</div>
            <div class="timeline__meta">${h(e.people ?? '–')}${e.note ? ' · ' + h(e.note) : ''}</div>
          </div>
          ${statusTag}
        </div>`;
      }).join('')
    : '<div style="font-size:13px;color:var(--muted);padding:6px 0;">Keine bevorstehenden Treffen.</div>';

  dashHome.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card__icon stat-card__icon--blue"><i data-lucide="users" class="icon icon--lg"></i></div>
        <div class="stat-card__value">${totalFriends}</div>
        <div class="stat-card__label">Freunde</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__icon stat-card__icon--green"><i data-lucide="zap" class="icon icon--lg"></i></div>
        <div class="stat-card__value">${totalActivities}</div>
        <div class="stat-card__label">Aktivitäten</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__icon stat-card__icon--purple"><i data-lucide="calendar-check" class="icon icon--lg"></i></div>
        <div class="stat-card__value">${upcomingEvents}</div>
        <div class="stat-card__label">Bevorstehende Events</div>
      </div>
    </div>

    <div class="section-block">
      <div class="section-block__header">
        <div class="section-block__title">Nächste 5 Events</div>
      </div>
      <div class="timeline">${timelineItems}</div>
    </div>

    <div class="section-block">
      <div class="section-block__header">
        <div class="section-block__title">Lange nicht gesehen</div>
        <button class="section-block__link btn btn-ghost btn-sm" data-route="#/friends">Alle anzeigen</button>
      </div>
      <div class="overdue-list">${overdueRows}</div>
    </div>

    <div class="section-block">
      <div class="section-block__header">
        <div class="section-block__title">Nächste Geburtstage (60 Tage)</div>
      </div>
      <div class="overdue-list">${bdayRows}</div>
    </div>
  `;

  window.lucide?.createIcons();
}

// ============================================================
// SUGGEST RENDERING
// ============================================================
function renderSuggResult() {
  if (!_lastSugg) return;
  const { activity:act, invited } = _lastSugg;
  const resActivity = document.getElementById('res-activity');
  if (resActivity) resActivity.textContent = act.name + (act.mode === 'romantic' ? ' ♥' : '');
  const resLocation = document.getElementById('res-location');
  if (resLocation) resLocation.textContent = act.location ?? '–';
  const resBudget = document.getElementById('res-budget');
  if (resBudget) resBudget.textContent = act.budget ? act.budget + '€ / Person' : '–';
  const resPersons = document.getElementById('res-persons');
  if (resPersons) resPersons.textContent = `${act.min_people ?? 1}–${act.max_people ?? '∞'} Personen`;
  const resEnergy = document.getElementById('res-energy-lbl');
  if (resEnergy) resEnergy.textContent = elab(act.energy);
  const resTodos = document.getElementById('res-todos');
  if (resTodos) resTodos.textContent = act.todos ?? 'Keine Todos';
  const resPeople = document.getElementById('res-people');
  if (resPeople) {
    resPeople.innerHTML = invited.map((f, i) => {
      const d  = dSince(f.last_seen);
      const ut = !f.last_seen ? '<span class="tag tag-red" style="font-size:10px;padding:1px 5px;">Noch nie</span>'
               : d > 90 ? `<span class="tag tag-red" style="font-size:10px;padding:1px 5px;">${d}T.</span>`
               : d > 30 ? `<span class="tag tag-yellow" style="font-size:10px;padding:1px 5px;">${d}T.</span>` : '';
      return `<div class="person-chip" data-action="swap" data-index="${i}" title="Klicken zum Tauschen" style="cursor:pointer;">
        <div class="chip-avatar ${avc(f.id, f.category)}">${ini(f.name)}</div>
        <span>${h(f.name)}</span>${ut}
        <span style="font-size:11px;color:var(--muted);">⇄</span>
      </div>`;
    }).join('');
  }
  const suggestResult = document.getElementById('suggest-result');
  if (suggestResult) suggestResult.style.display = 'block';
}

function generateSuggestion(forceIds) {
  const { activities, friends, events } = getState();
  if (!activities.length) { showToast('Füge zuerst Aktivitäten hinzu.', 'error'); return; }
  if (!friends.length)    { showToast('Füge zuerst Freunde hinzu.', 'error'); return; }

  const energy  = document.getElementById('s-energy')?.value ?? '';
  const budget  = parseFloat(document.getElementById('s-budget')?.value) || Infinity;
  const prio    = document.getElementById('s-prioritize')?.checked ?? true;
  const dateVal = document.getElementById('s-date')?.value ?? '';

  let cands = activities.filter(a => {
    if (_currentMode === 'romantic' && a.mode === 'social') return false;
    if (_currentMode === 'social'   && a.mode === 'romantic') return false;
    if (energy && a.energy !== energy) return false;
    if (a.budget && a.budget > budget) return false;
    return true;
  });
  if (!cands.length) { showToast('Keine Aktivität passt zu den Filtern.', ''); cands = [...activities]; }
  const act = cands[Math.floor(Math.random() * cands.length)];

  let pool = friends.filter(f => {
    if (_currentMode === 'romantic' && f.category !== 'romantic') return false;
    if (_currentMode === 'social'   && f.category === 'romantic') return false;
    return true;
  }).map(f => ({ ...f, _score: scoreFriend(f, dateVal, events) }));

  if (dateVal) {
    const dow      = ['So','Mo','Di','Mi','Do','Fr','Sa'][new Date(dateVal).getDay()];
    const filtered = pool.filter(f => !(f.days ?? []).length || (f.days ?? []).includes(dow));
    if (filtered.length >= (act.min_people ?? 1)) pool = filtered;
  }

  pool = prio
    ? [...pool].sort((a, b) => b._score - a._score)
    : pool.sort(() => Math.random() - .5);

  const minP  = Math.max(act.min_people ?? 1, 1);
  const maxP  = Math.min(act.max_people ?? 99, pool.length);

  if (pool.length < minP) {
    showToast(`Nicht genug Freunde für diese Aktivität (${pool.length} verfügbar, ${minP} nötig).`, 'error');
    return;
  }

  const count = minP + Math.floor(Math.random() * Math.max(1, maxP - minP + 1));

  let invited = [];
  let remaining = [...pool];

  if (forceIds) {
    forceIds.forEach(fid => {
      const f = remaining.find(x => x.id === fid);
      if (f) { invited.push(f); remaining = remaining.filter(x => x.id !== fid); }
    });
  }

  while (invited.length < count && remaining.length > 0) {
    invited.push(remaining.shift());
  }

  _lastSugg = { activity: act, invited: [...invited], date: dateVal, mode: _currentMode };
  renderSuggResult();
}

function openSwap(index) {
  const { friends, events } = getState();
  _swapIdx = index;
  const cur       = _lastSugg.invited[index];
  const alreadyIn = _lastSugg.invited.map(f => f.id);
  const alts      = friends
    .filter(f => f.id !== cur.id && !alreadyIn.includes(f.id))
    .filter(f => _currentMode === 'romantic' ? f.category === 'romantic' : f.category !== 'romantic')
    .map(f => ({ ...f, _score: scoreFriend(f, _lastSugg.date, events) }))
    .sort((a, b) => b._score - a._score);
  if (!alts.length) { showToast('Keine weiteren Personen verfügbar.'); return; }
  document.getElementById('swap-list').innerHTML = `
    <div style="font-size:13px;color:var(--muted);margin-bottom:8px;">Tausche <strong style="font-weight:500;">${h(cur.name)}</strong> gegen:</div>
    ${alts.map(f => {
      const d   = dSince(f.last_seen);
      const cls = !f.last_seen ? 'tag-gray' : d > 90 ? 'tag-red' : d > 30 ? 'tag-yellow' : 'tag-green';
      const lbl = !f.last_seen ? 'Noch nie' : 'vor ' + d + 'T.';
      return `<div class="overdue-row" style="cursor:pointer;" data-action="do-swap" data-id="${f.id}">
        <div class="person-avatar ${avc(f.id, f.category)}" style="width:32px;height:32px;font-size:12px;margin:0;flex-shrink:0;">${ini(f.name)}</div>
        <div style="flex:1;font-size:14px;font-weight:500;">${h(f.name)}</div>
        <div style="font-size:12px;color:var(--muted);">${h(f.city ?? '')}</div>
        <span class="tag ${cls}">${lbl}</span>
      </div>`;
    }).join('')}`;
  document.getElementById('swap-modal').classList.add('open');
}

function doSwap(newId) {
  const { friends } = getState();
  const nf = friends.find(f => f.id === newId);
  if (nf && _swapIdx !== null) {
    _lastSugg.invited[_swapIdx] = nf;
    document.getElementById('swap-modal').classList.remove('open');
    renderSuggResult();
  }
}

function saveToCalendarFromSuggest() {
  if (!_lastSugg) return;
  const { activities, friends } = getState();
  const { activity: act, invited, date } = _lastSugg;
  openCalModal({
    date: date ?? '',
    time: document.getElementById('res-time')?.value ?? '12:00',
    activities,
    friends,
    preCheckedFriendIds: invited.map(f => f.id),
    preSelectedActivityId: act.id,
  });
}

function setCurrentMode(mode) {
  _currentMode = mode;
  const modeSocial   = document.getElementById('mode-social');
  const modeRomantic = document.getElementById('mode-romantic');
  if (modeSocial)   modeSocial.className   = 'mode-btn' + (mode === 'social'   ? ' active-social'   : '');
  if (modeRomantic) modeRomantic.className = 'mode-btn' + (mode === 'romantic' ? ' active-romantic' : '');
  const suggestResult = document.getElementById('suggest-result');
  if (suggestResult) suggestResult.style.display = 'none';
}

// ============================================================
// PUBLIC API
// ============================================================
export function render(container, mode = 'home') {
  _container = container;

  container.innerHTML = `
<div style="padding:24px;max-width:960px;margin:0 auto;">
  <div id="dash-home"></div>
  <div id="dash-suggest" style="display:none;">
    <div class="suggest-hero">
      <h2>Was machen wir heute?</h2>
      <p>Gib ein Datum ein und lass dich überraschen.</p>
    </div>
    <div class="mode-toggle">
      <button class="mode-btn active-social" id="mode-social">Freunde</button>
      <button class="mode-btn" id="mode-romantic">Romantisch</button>
    </div>
    <div class="suggest-form">
      <div class="suggest-form__row">
        <div><label>Datum</label><input type="date" id="s-date"/></div>
        <div><label>Energie</label><select id="s-energy"><option value="">Egal</option><option value="low">Entspannt</option><option value="medium">Aktiv</option><option value="high">Aufwändig</option></select></div>
        <div><label>Budget (max €)</label><input type="number" id="s-budget" placeholder="z.B. 50" style="max-width:120px;"/></div>
        <div style="display:flex;flex-direction:column;justify-content:flex-end;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;text-transform:none;letter-spacing:0;font-size:13px;color:var(--text);">
            <input type="checkbox" id="s-prioritize" style="width:auto;accent-color:var(--accent);" checked>
            Lange nicht gesehen priorisieren
          </label>
        </div>
      </div>
    </div>
    <div style="text-align:center;">
      <button class="btn btn-primary" id="suggest-btn">Vorschlag generieren</button>
    </div>
    <div id="suggest-result" style="display:none;" class="result-box">
      <div id="res-activity" class="result-activity"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
        <div>
          <div class="info-row"><span class="info-label">Ort</span><span id="res-location"></span></div>
          <div class="info-row"><span class="info-label">Budget</span><span id="res-budget"></span></div>
          <div class="info-row"><span class="info-label">Personen</span><span id="res-persons"></span></div>
          <div class="info-row"><span class="info-label">Energie</span><span id="res-energy-lbl"></span></div>
          <div class="info-row"><span class="info-label">Uhrzeit</span><input type="time" id="res-time" value="12:00" style="max-width:100px;padding:4px 8px;font-size:13px;"/></div>
        </div>
        <div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:6px;font-weight:500;letter-spacing:.03em;text-transform:uppercase;">Todos</div>
          <div id="res-todos" style="font-size:13px;line-height:1.8;"></div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div style="font-size:12px;color:var(--muted);font-weight:500;letter-spacing:.03em;text-transform:uppercase;">Einzuladen <span style="font-weight:400;font-size:11px;">— klicken zum Tauschen</span></div>
        <button class="btn btn-ghost btn-sm" id="reroll-btn">↺ Neu würfeln</button>
      </div>
      <div id="res-people" class="result-people"></div>
      <div style="margin-top:16px;display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn btn-sm btn-primary" id="save-to-cal-btn">In Kalender eintragen</button>
      </div>
    </div>
  </div>
</div>`;

  // Set today's date
  const sDate = document.getElementById('s-date');
  if (sDate) sDate.value = new Date().toISOString().slice(0, 10);

  // Event delegation
  _delegHandler = e => {
    const target = e.target;

    // section-block link (route navigation)
    const routeEl = target.closest('[data-route]');
    if (routeEl) {
      window.location.hash = routeEl.dataset.route;
      return;
    }

    // quick-plan
    const quickPlanEl = target.closest('[data-action="quick-plan"]');
    if (quickPlanEl) {
      const fid = quickPlanEl.dataset.id;
      setMode('suggest');
      setTimeout(() => generateSuggestion([fid]), 50);
      return;
    }

    // swap (person chip)
    const swapEl = target.closest('[data-action="swap"]');
    if (swapEl) {
      openSwap(parseInt(swapEl.dataset.index));
      return;
    }

    // suggest btn
    if (target.id === 'suggest-btn' || target.id === 'reroll-btn') {
      generateSuggestion();
      return;
    }

    // save to cal
    if (target.id === 'save-to-cal-btn') {
      saveToCalendarFromSuggest();
      return;
    }

    // mode buttons
    if (target.id === 'mode-social')   { setCurrentMode('social');   return; }
    if (target.id === 'mode-romantic') { setCurrentMode('romantic'); return; }
  };

  container.addEventListener('click', _delegHandler);

  // Swap modal is in global DOM (outside container), needs its own listener
  const swapModal = document.getElementById('swap-modal');
  _swapHandler = e => {
    const doSwapEl = e.target.closest('[data-action="do-swap"]');
    if (doSwapEl) doSwap(doSwapEl.dataset.id);
  };
  swapModal?.addEventListener('click', _swapHandler);

  // Subscribe to state changes
  _unsubscribe = subscribe(state => {
    const dashHome    = document.getElementById('dash-home');
    const dashSuggest = document.getElementById('dash-suggest');
    if (dashHome    && dashHome.style.display    !== 'none') renderHome();
    if (dashSuggest && dashSuggest.style.display !== 'none' && _lastSugg) renderSuggResult();
  });

  setMode(mode);
  window.lucide?.createIcons();
}

export function setMode(mode) {
  const dashHome    = document.getElementById('dash-home');
  const dashSuggest = document.getElementById('dash-suggest');
  if (!dashHome || !dashSuggest) return;

  if (mode === 'home') {
    dashHome.style.display    = '';
    dashSuggest.style.display = 'none';
    renderHome();
  } else if (mode === 'suggest') {
    dashHome.style.display    = 'none';
    dashSuggest.style.display = '';
  }
}

export function cleanup() {
  if (_delegHandler && _container) {
    _container.removeEventListener('click', _delegHandler);
    _delegHandler = null;
  }
  if (_swapHandler) {
    document.getElementById('swap-modal')?.removeEventListener('click', _swapHandler);
    _swapHandler = null;
  }
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  _container = null;
  _lastSugg  = null;
  _swapIdx   = null;
}
