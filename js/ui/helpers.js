// XSS prevention
export const h = str => String(str ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

export const AV_COLS = ['av-0','av-1','av-2','av-3','av-4'];
export const ini     = name => name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
export const avc     = (id, category) => category === 'romantic' ? 'av-romantic' : AV_COLS[String(id).charCodeAt(0) % AV_COLS.length];
export const elab    = e => ({low:'Entspannt',medium:'Aktiv',high:'Aufwändig'})[e] ?? e;
export const iolab   = v => ({indoor:'Indoor',outdoor:'Outdoor',both:'Indoor/Outdoor'})[v] ?? v;
export const modelab = m => ({social:'Freunde',romantic:'Romantisch',both:'Beides'})[m] ?? m;
export const catlab  = c => ({friend:'Freund',romantic:'Romantisch',family:'Familie',work:'Arbeit'})[c] ?? c;
export const dSince  = d => !d ? 9999 : Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
export const fmtDate = d => !d ? 'Nie' : new Date(d).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'});
export const pad2    = n => String(n).padStart(2,'0');

export function scoreFriend(friend, dateVal, events) {
  let score = 0;
  const days = dSince(friend.last_seen);
  score += days >= 9999 ? 50 : Math.min(50, Math.log10(days+1) * 20);
  const prefs = friend.days ?? [];
  if (dateVal && prefs.length > 0) {
    const dow = ['So','Mo','Di','Mi','Do','Fr','Sa'][new Date(dateVal).getDay()];
    score += prefs.includes(dow) ? 20 : 0;
  } else { score += 10; }
  const evList = events ?? [];
  const meetCount = evList.filter(e => (e.peopleIds ?? []).includes(friend.id)).length;
  score += Math.max(0, 20 - meetCount * 4);
  score += Math.random() * 10;
  return Math.min(100, score);
}
