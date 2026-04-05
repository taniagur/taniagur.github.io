import { getState, setState } from '../state.js';
import * as Store from '../store/index.js';
import { showToast } from './feedback.js';
import { h, fmtDate, pad2 } from './helpers.js';

// Open the calendar modal, optionally pre-filling fields.
// options: { date, time, activities, friends, preCheckedFriendIds, preSelectedActivityId }
export function openCalModal(options = {}) {
  const { date='', time='12:00', activities, friends, preCheckedFriendIds=[], preSelectedActivityId=null } = options;
  const { activities: stateActivities, friends: stateFriends } = getState();
  const actList = activities ?? stateActivities;
  const frList  = friends   ?? stateFriends;

  document.getElementById('ce-date').value = date;
  document.getElementById('ce-time').value = time || '12:00';
  document.getElementById('ce-activity').innerHTML = actList.length
    ? actList.map(a => `<option value="${a.id}" ${a.id === preSelectedActivityId ? 'selected' : ''}>${h(a.name)}</option>`).join('')
    : '<option value="">Keine Aktivitäten angelegt</option>';
  document.getElementById('ce-people').innerHTML = frList
    .map(f => `<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
      <input type="checkbox" value="${f.id}" ${preCheckedFriendIds.includes(f.id) ? 'checked' : ''}
        style="width:auto;accent-color:var(--accent);"> ${h(f.name)}
    </label>`).join('');
  document.getElementById('ce-note').value = '';
  document.getElementById('gcal-status').style.display = 'none';
  document.getElementById('cal-modal').classList.add('open');
}

// Read form data from the modal
export function getCalData() {
  const { activities, friends } = getState();
  const date    = document.getElementById('ce-date').value;
  const time    = document.getElementById('ce-time').value;
  const actId   = document.getElementById('ce-activity').value;
  const act     = activities.find(a => a.id === actId) ?? null;
  const checked = [...document.querySelectorAll('#ce-people input:checked')].map(c => c.value);
  const people  = friends.filter(f => checked.includes(f.id)).map(f => f.name);
  const note    = document.getElementById('ce-note').value;
  const mode    = act?.mode === 'romantic' ? 'romantic' : 'social';
  return { date, time, act, actId, people, peopleIds: checked, note, mode };
}

// Save a new event
export async function saveCalEvent() {
  const { date, time, act, actId, people, peopleIds, note, mode } = getCalData();
  if (!date) { showToast('Bitte Datum wählen.', 'error'); return; }
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
    const { events, friends } = getState();
    const newEvents = [data[0], ...events];
    // Update last_seen for all participants
    await Promise.all(peopleIds.map(pid => Store.updateFriend(pid, { last_seen: date })));
    const newFriends = friends.map(f => peopleIds.includes(f.id) ? { ...f, last_seen: date } : f);
    setState({ events: newEvents, friends: newFriends });
    document.getElementById('cal-modal').classList.remove('open');
    showToast(`Treffen eingetragen: ${h(act?.name ?? 'Treffen')} am ${fmtDate(date)}`, 'success');
  } catch(err) {
    showToast('Fehler: ' + err.message, 'error');
  } finally {
    btn.classList.remove('btn-loading');
  }
}

// Delete an event with optimistic update + undo toast
export async function deleteEvent(id, onSuccess) {
  const { events } = getState();
  const e = events.find(x => x.id === id);
  if (!e) return;
  const snapshot = structuredClone(events);
  setState({ events: events.filter(x => x.id !== id) });
  showToast(`${h(e.activityName)} entfernt.`, '', () => {
    setState({ events: snapshot });
    if (onSuccess) onSuccess('undo');
  });
  const { error } = await Store.deleteEvent(id);
  if (error) {
    setState({ events: snapshot });
    showToast('Fehler beim Löschen: ' + error.message, 'error');
  } else {
    if (onSuccess) onSuccess('deleted');
  }
}

// Export current modal data as ICS file
export function exportICS() {
  const { date, time, act, people, note } = getCalData();
  if (!date) { showToast('Bitte Datum wählen.', 'error'); return; }
  if (!act)  { showToast('Bitte Aktivität wählen.', 'error'); return; }
  const [hh, mm] = (time ?? '12:00').split(':').map(Number);
  const endH     = Math.min(hh + Math.floor(act.duration ?? 2), 23);
  const d        = date.replace(/-/g,'');
  const dtStart  = `${d}T${pad2(hh)}${pad2(mm)}00`;
  const dtEnd    = `${d}T${pad2(endH)}${pad2(mm)}00`;
  const desc = [
    people.length ? 'Eingeladen: '+people.join(', ') : '',
    act.location ? 'Ort: '+act.location : '',
    act.todos ? 'Todos: '+act.todos : '',
    note ?? ''
  ].filter(Boolean).join('\\n');
  const ics = [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Sozialplaner//DE','CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE','TZID:Europe/Berlin',
    'BEGIN:STANDARD','DTSTART:19701025T030000','RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10','TZOFFSETFROM:+0200','TZOFFSETTO:+0100','TZNAME:CET','END:STANDARD',
    'BEGIN:DAYLIGHT','DTSTART:19700329T020000','RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3','TZOFFSETFROM:+0100','TZOFFSETTO:+0200','TZNAME:CEST','END:DAYLIGHT',
    'END:VTIMEZONE','BEGIN:VEVENT',
    `UID:${Date.now()}@sozialplaner`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').slice(0,15)}Z`,
    `DTSTART;TZID=Europe/Berlin:${dtStart}`,`DTEND;TZID=Europe/Berlin:${dtEnd}`,
    `SUMMARY:${act.name}${people.length ? ' mit '+people.join(', ') : ''}`,
    `LOCATION:${act.location ?? ''}`,`DESCRIPTION:${desc}`,
    'END:VEVENT','END:VCALENDAR'
  ].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  a.download = act.name.replace(/\s+/g,'-')+'-'+date+'.ics';
  a.click();
  showToast('ICS-Datei exportiert.', 'success');
}

// Save to Google Calendar via Claude API + MCP
export async function saveToGoogleCal() {
  const { date, time, act, people, note } = getCalData();
  if (!date) { showToast('Bitte Datum wählen.', 'error'); return; }
  if (!act)  { showToast('Bitte Aktivität wählen.', 'error'); return; }
  const btn = document.getElementById('cal-gcal-btn');
  const st  = document.getElementById('gcal-status');
  btn.classList.add('btn-loading');
  st.style.display='block'; st.style.background='var(--accent-bg)'; st.style.color='var(--accent)';
  st.textContent = 'Wird in Google Calendar eingetragen…';
  const [hh, mm] = (time ?? '12:00').split(':');
  const endH = pad2(Math.min(parseInt(hh)+Math.floor(act.duration ?? 2), 23));
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
    st.style.background='var(--green-bg)'; st.style.color='var(--green)';
    st.textContent = '✓ In Google Calendar eingetragen!';
    saveCalEvent();
  } catch(err) {
    st.style.background='var(--danger-bg)'; st.style.color='var(--danger)';
    st.textContent = `Fehler: ${err.message}. ICS-Export als Alternative nutzen.`;
  } finally {
    btn.classList.remove('btn-loading');
  }
}
