import { getState, setState, subscribe } from '../state.js';
import * as Store from '../store/index.js';
import { showToast } from '../ui/feedback.js';
import { h, fmtDate, pad2 } from '../ui/helpers.js';
import { openCalModal, saveCalEvent, deleteEvent, exportICS, saveToGoogleCal, getCalData } from '../ui/cal-modal.js';

let _container     = null;
let _unsubscribe   = null;
let _delegHandler  = null;
let _changeHandler = null;
let _calY = new Date().getFullYear();
let _calM = new Date().getMonth();
let _subPage = 'calendar';

// Listeners for modal buttons (need to be removed on cleanup)
let _calSaveHandler  = null;
let _gcalHandler     = null;
let _icsHandler      = null;

// ============================================================
// CALENDAR
// ============================================================
function renderCalendar() {
  const { events } = getState();
  const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const titleEl = document.getElementById('cal-month-title');
  if (titleEl) titleEl.textContent = `${months[_calM]} ${_calY}`;
  const grid  = document.getElementById('cal-grid');
  if (!grid) return;
  const first = new Date(_calY, _calM, 1), last = new Date(_calY, _calM + 1, 0);
  let off     = first.getDay() - 1; if (off < 0) off = 6;
  const tod   = new Date();
  let markup  = '';
  const pl    = new Date(_calY, _calM, 0).getDate();
  for (let i = off - 1; i >= 0; i--)
    markup += `<div class="cal-day other-month"><div class="day-num">${pl - i}</div></div>`;
  for (let d = 1; d <= last.getDate(); d++) {
    const ds  = `${_calY}-${pad2(_calM + 1)}-${pad2(d)}`;
    const isT = tod.getFullYear() === _calY && tod.getMonth() === _calM && tod.getDate() === d;
    const evs = events.filter(e => e.date === ds);
    markup += `<div class="cal-day ${isT ? 'today' : ''} ${evs.length ? 'has-event' : ''}" data-action="select-day" data-date="${ds}">
      <div class="day-num">${d}</div>
      ${evs.map(e => `<div class="cal-event ${e.mode === 'romantic' ? 'romantic' : ''}">${h(e.activityName)}</div>`).join('')}
    </div>`;
  }
  const rem = (off + last.getDate()) % 7;
  for (let i = 1; i <= (rem === 0 ? 0 : 7 - rem); i++)
    markup += `<div class="cal-day other-month"><div class="day-num">${i}</div></div>`;
  grid.innerHTML = markup;
}

function selectDay(ds) {
  const { events } = getState();
  const evs = events.filter(e => e.date === ds);
  const lbl = new Date(ds).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  let markup = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
    <strong style="font-size:15px;">${lbl}</strong>
    <button class="btn btn-sm btn-primary" data-action="open-cal-day" data-date="${ds}">+ Treffen</button>
  </div>`;
  if (!evs.length) { markup += '<div style="font-size:13px;color:var(--muted);">Keine Treffen.</div>'; }
  else markup += evs.map(e => `<div class="log-entry ${e.done ? 'done' : ''} ${e.mode === 'romantic' ? 'romantic' : ''}">
    <div class="log-activity">${h(e.activityName)}${e.mode === 'romantic' ? ' ♥' : ''}${e.time ? ' · ' + h(e.time) : ''}</div>
    <div class="log-people">${h(e.people ?? '–')}</div>
    ${e.note ? `<div class="log-note">${h(e.note)}</div>` : ''}
    <div class="log-actions">
      <input type="checkbox" class="check-done" ${e.done ? 'checked' : ''} data-action="toggle-done" data-id="${e.id}" data-val="${e.done ? 'false' : 'true'}">
      <span style="font-size:12px;color:var(--muted);">${e.done ? 'Abgehakt' : 'Als erledigt markieren'}</span>
      <button class="btn btn-sm btn-danger" style="margin-left:auto;" data-action="delete-event" data-id="${e.id}" data-date="${ds}">Entfernen</button>
    </div>
  </div>`).join('');
  const ddContent = document.getElementById('day-detail-content');
  const dd        = document.getElementById('day-detail');
  if (ddContent) ddContent.innerHTML = markup;
  if (dd) dd.style.display = 'block';
}

function calPrev() {
  _calM--; if (_calM < 0) { _calM = 11; _calY--; }
  renderCalendar();
  const dd = document.getElementById('day-detail');
  if (dd) dd.style.display = 'none';
}

function calNext() {
  _calM++; if (_calM > 11) { _calM = 0; _calY++; }
  renderCalendar();
  const dd = document.getElementById('day-detail');
  if (dd) dd.style.display = 'none';
}

// ============================================================
// LOG
// ============================================================
function renderLog() {
  const { friends, activities, events } = getState();
  const fp = document.getElementById('log-filter-person');
  const fa = document.getElementById('log-filter-activity');
  if (!fp || !fa) return;
  const sp = fp.value, sa = fa.value;
  const sm = document.getElementById('log-filter-mode')?.value ?? '';
  const sd = document.getElementById('log-filter-done')?.value ?? '';
  fp.innerHTML = '<option value="">Alle Personen</option>' + friends.map(f => `<option value="${f.id}" ${sp === f.id ? 'selected' : ''}>${h(f.name)}</option>`).join('');
  fa.innerHTML = '<option value="">Alle Aktivitäten</option>' + activities.map(a => `<option value="${a.id}" ${sa === a.id ? 'selected' : ''}>${h(a.name)}</option>`).join('');
  let evs = [...events].sort((a, b) => b.date.localeCompare(a.date));
  if (sp) evs = evs.filter(e => (e.peopleIds ?? []).includes(sp));
  if (sa) evs = evs.filter(e => e.activityId === sa);
  if (sm) evs = evs.filter(e => e.mode === sm);
  if (sd === 'open') evs = evs.filter(e => !e.done);
  if (sd === 'done') evs = evs.filter(e => e.done);
  const list = document.getElementById('log-list');
  if (!list) return;

  if (!evs.length) {
    list.innerHTML = `
      <div class="empty-state--cta">
        <div class="empty-state__icon"><i data-lucide="calendar" class="icon icon--xl"></i></div>
        <div class="empty-state__title">Keine Treffen gefunden</div>
        <div class="empty-state__desc">Nutze den Kalender, um Treffen einzutragen, oder passe die Filter an.</div>
        <button class="btn btn-primary" id="empty-add-event-btn">+ Treffen eintragen</button>
      </div>`;
    window.lucide?.createIcons();
    return;
  }

  list.innerHTML = evs.map(e => {
    const dayNum   = new Date(e.date).getDate();
    const monthStr = new Date(e.date).toLocaleDateString('de-DE', { month: 'short' });
    const isRomantic = e.mode === 'romantic';
    return `<div class="log-entry ${e.done ? 'done' : ''} ${isRomantic ? 'romantic' : ''}">
  <div class="log-entry__header">
    <div class="log-entry__date-col">
      <span class="log-entry__day">${dayNum}</span>
      <span class="log-entry__month">${monthStr}</span>
    </div>
    <div class="log-entry__body">
      <div class="log-entry__title">
        ${h(e.activityName)}${isRomantic ? ' ♥' : ''}${e.time ? `<span style="font-size:12px;font-weight:400;color:var(--muted);margin-left:6px;">${h(e.time)}</span>` : ''}
      </div>
      <div class="log-entry__people">${h(e.people ?? '–')}</div>
      ${e.note ? `<div class="log-note">${h(e.note)}</div>` : ''}
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">
      ${e.done ? '<span class="tag tag-green">✓ Erledigt</span>' : '<span class="tag tag-yellow">Offen</span>'}
    </div>
  </div>
  <div class="log-actions">
    <input type="checkbox" class="check-done" ${e.done ? 'checked' : ''} data-action="toggle-done" data-id="${e.id}" data-val="${!e.done}">
    <span style="font-size:12px;color:var(--muted);">${e.done ? 'Abhaken rückgängig' : 'Als erledigt markieren'}</span>
    <button class="btn btn-sm btn-danger" style="margin-left:auto;" data-action="delete-event" data-id="${e.id}" data-date="">Entfernen</button>
  </div>
</div>`;
  }).join('');

  window.lucide?.createIcons();
}

async function toggleDone(id, val) {
  const boolVal = val === 'true' || val === true;
  const { data, error } = await Store.updateEvent(id, { done: boolVal });
  if (error) { showToast('Fehler: ' + error.message, 'error'); return; }
  const { events } = getState();
  setState({ events: events.map(e => e.id === id ? data[0] : e) });
}

// ============================================================
// SUB-NAV
// ============================================================
export function setMode(mode) {
  _subPage = mode;
  const calEl  = document.getElementById('events-calendar');
  const logEl  = document.getElementById('events-log');
  const tabCal = document.getElementById('btn-calendar-tab');
  const tabLog = document.getElementById('btn-log-tab');
  if (!calEl || !logEl) return;

  if (mode === 'calendar') {
    calEl.style.display = '';
    logEl.style.display = 'none';
    if (tabCal) tabCal.classList.add('active');
    if (tabLog) tabLog.classList.remove('active');
    renderCalendar();
  } else {
    calEl.style.display = 'none';
    logEl.style.display = '';
    if (tabCal) tabCal.classList.remove('active');
    if (tabLog) tabLog.classList.add('active');
    renderLog();
  }
}

// ============================================================
// PUBLIC API
// ============================================================
export function render(container, mode = 'calendar') {
  _container = container;
  _subPage   = mode;

  container.innerHTML = `
<div style="padding:24px;max-width:960px;margin:0 auto;">
  <div id="events-subnav" style="display:flex;gap:8px;margin-bottom:16px;">
    <button id="btn-calendar-tab" class="btn btn-sm">Kalender</button>
    <button id="btn-log-tab" class="btn btn-sm">Verlauf</button>
  </div>
  <div id="events-calendar">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <button class="btn btn-sm" data-action="cal-prev">← Zurück</button>
      <div class="section-title" id="cal-month-title"></div>
      <button class="btn btn-sm" data-action="cal-next">Weiter →</button>
    </div>
    <div class="card">
      <div class="cal-grid">
        <div class="cal-day-name">Mo</div><div class="cal-day-name">Di</div><div class="cal-day-name">Mi</div>
        <div class="cal-day-name">Do</div><div class="cal-day-name">Fr</div><div class="cal-day-name">Sa</div><div class="cal-day-name">So</div>
      </div>
      <div class="cal-grid" id="cal-grid" style="margin-top:6px;"></div>
    </div>
    <div id="day-detail" style="display:none;margin-top:16px;" class="card"><div id="day-detail-content"></div></div>
  </div>
  <div id="events-log" style="display:none;">
    <div class="section-header">
      <div><div class="section-title">Verlauf</div><div class="section-sub">Alle Treffen.</div></div>
      <button class="btn btn-primary" id="add-event-btn">+ Treffen eintragen</button>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
      <select id="log-filter-person" style="max-width:180px;"><option value="">Alle Personen</option></select>
      <select id="log-filter-activity" style="max-width:180px;"><option value="">Alle Aktivitäten</option></select>
      <select id="log-filter-mode" style="max-width:160px;"><option value="">Alle Modi</option><option value="social">Freunde</option><option value="romantic">Romantisch</option></select>
      <select id="log-filter-done" style="max-width:160px;"><option value="">Alle Status</option><option value="open">Offen</option><option value="done">Abgehakt</option></select>
    </div>
    <div id="log-list"></div>
  </div>
</div>`;

  // Event delegation
  _delegHandler = e => {
    const target = e.target;

    // Sub-nav tabs
    if (target.id === 'btn-calendar-tab') { setMode('calendar'); return; }
    if (target.id === 'btn-log-tab')      { setMode('log'); return; }

    // Cal nav
    if (target.closest('[data-action="cal-prev"]')) { calPrev(); return; }
    if (target.closest('[data-action="cal-next"]')) { calNext(); return; }

    // Select day
    const dayEl = target.closest('[data-action="select-day"]');
    if (dayEl) { selectDay(dayEl.dataset.date); return; }

    // Open cal modal for a specific day
    const openDayEl = target.closest('[data-action="open-cal-day"]');
    if (openDayEl) { openCalModal({ date: openDayEl.dataset.date }); return; }

    // Add event btn
    if (target.id === 'add-event-btn')       { openCalModal({ date: '' }); return; }
    if (target.id === 'empty-add-event-btn') { openCalModal({ date: '' }); return; }

    // Toggle done handled via change event below

    // Delete event
    const deleteEl = target.closest('[data-action="delete-event"]');
    if (deleteEl) {
      const ds = deleteEl.dataset.date;
      deleteEvent(deleteEl.dataset.id, () => {
        if (_subPage === 'calendar') {
          renderCalendar();
          if (ds) selectDay(ds);
        } else {
          renderLog();
        }
      });
      return;
    }
  };

  _changeHandler = e => {
    const target = e.target;
    const id = target.id;
    if (['log-filter-person','log-filter-activity','log-filter-mode','log-filter-done'].includes(id)) {
      renderLog();
      return;
    }
    // Toggle done (checkbox change event)
    const toggleEl = target.closest('[data-action="toggle-done"]');
    if (toggleEl) {
      toggleDone(toggleEl.dataset.id, target.checked);
    }
  };

  container.addEventListener('click', _delegHandler);
  container.addEventListener('change', _changeHandler);

  // Modal button listeners
  _calSaveHandler = () => saveCalEvent();
  _gcalHandler    = () => saveToGoogleCal();
  _icsHandler     = () => exportICS();

  document.getElementById('cal-save-btn').addEventListener('click', _calSaveHandler);
  document.getElementById('cal-gcal-btn').addEventListener('click', _gcalHandler);
  document.getElementById('cal-ics-btn').addEventListener('click', _icsHandler);

  // Subscribe to state
  _unsubscribe = subscribe(() => {
    if (_subPage === 'calendar') {
      renderCalendar();
    } else {
      renderLog();
    }
  });

  setMode(mode);
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
  if (_calSaveHandler) {
    const btn = document.getElementById('cal-save-btn');
    if (btn) btn.removeEventListener('click', _calSaveHandler);
    _calSaveHandler = null;
  }
  if (_gcalHandler) {
    const btn = document.getElementById('cal-gcal-btn');
    if (btn) btn.removeEventListener('click', _gcalHandler);
    _gcalHandler = null;
  }
  if (_icsHandler) {
    const btn = document.getElementById('cal-ics-btn');
    if (btn) btn.removeEventListener('click', _icsHandler);
    _icsHandler = null;
  }
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  _container = null;
}
