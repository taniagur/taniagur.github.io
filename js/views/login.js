import * as Auth from '../auth.js';
import { showToast } from '../ui/feedback.js';

let _loginHandler   = null;
let _keydownHandler = null;

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

export function render() {
  const screen = document.getElementById('login-screen');
  screen.style.display = 'flex';

  _loginHandler = () => handleLogin();
  _keydownHandler = e => { if (e.key === 'Enter') handleLogin(); };

  document.getElementById('login-btn').addEventListener('click', _loginHandler);
  document.getElementById('login-password').addEventListener('keydown', _keydownHandler);
}

export function cleanup() {
  document.getElementById('login-screen').style.display = 'none';
  if (_loginHandler) {
    document.getElementById('login-btn').removeEventListener('click', _loginHandler);
    _loginHandler = null;
  }
  if (_keydownHandler) {
    document.getElementById('login-password').removeEventListener('keydown', _keydownHandler);
    _keydownHandler = null;
  }
}
