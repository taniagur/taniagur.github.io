export function showToast(message, type='', undoCb=null, duration=4500) {
  const c  = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' '+type : '');
  const msg = document.createElement('span');
  msg.style.flex = '1';
  msg.textContent = message;
  el.appendChild(msg);
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
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.textContent = message;
  container.innerHTML = '';
  container.appendChild(div);
}
