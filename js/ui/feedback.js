export function showToast(message, type='', undoCb=null, duration=4500) {
  const c  = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' '+type : '');
  el.innerHTML = `<span style="flex:1;">${message}</span>`;
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

export function showLoading(container) {
  container.innerHTML = '<div class="loading-spinner" style="margin:32px auto;"></div>';
}

export function showEmpty(container, message='Keine Einträge gefunden.') {
  container.innerHTML = `<div class="empty-state">${message}</div>`;
}
