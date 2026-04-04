import * as Auth from '../auth.js';
import { supabase } from '../supabase-client.js';
import { showToast } from '../ui/feedback.js';

const ONBOARDING_KEY = 'sp_onboarding_done';

let _mode              = 'signin';
let _loginHandler      = null;
let _keydownHandler    = null;
let _forgotHandler     = null;
let _onboardingHandler = null;
let _tabHandlers       = [];

// ============================================================
// ONBOARDING
// ============================================================
export function showOnboardingIfNeeded() {
  if (localStorage.getItem(ONBOARDING_KEY)) return;
  const overlay = document.getElementById('onboarding-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function dismissOnboarding() {
  localStorage.setItem(ONBOARDING_KEY, '1');
  const overlay = document.getElementById('onboarding-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ============================================================
// AUTH ACTIONS
// ============================================================
async function handleAuth() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn      = document.getElementById('login-btn');
  const errEl    = document.getElementById('login-error');

  errEl.textContent = '';
  errEl.style.color = '';

  if (!email || !password) {
    errEl.textContent = 'Bitte E-Mail und Passwort eingeben.';
    return;
  }
  if (password.length < 6) {
    errEl.textContent = 'Passwort muss mindestens 6 Zeichen haben.';
    return;
  }

  btn.classList.add('btn-loading');

  if (_mode === 'signup') {
    const { data, error } = await Auth.signUp(email, password);
    btn.classList.remove('btn-loading');
    if (error) {
      errEl.textContent = error.message;
    } else if (data?.user && !data.session) {
      // Email confirmation required — Supabase sent a confirmation mail
      errEl.style.color = 'var(--green)';
      errEl.textContent = '✓ Bestätigungs-E-Mail gesendet. Bitte Postfach prüfen.';
    }
    // If session exists, onAuthStateChange in app.js handles the transition
  } else {
    const { error } = await Auth.signIn(email, password);
    if (error) {
      btn.classList.remove('btn-loading');
      errEl.textContent = _mapError(error.message);
    }
    // On success onAuthStateChange handles transition; btn-loading stays until screen hides
  }
}

async function handleForgot() {
  const email = document.getElementById('login-email').value.trim();
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  errEl.style.color = '';

  if (!email) {
    errEl.textContent = 'Bitte zuerst die E-Mail-Adresse eingeben.';
    return;
  }

  const btn = document.getElementById('login-forgot-btn');
  const orig = btn.textContent;
  btn.textContent = 'Sende…';
  btn.disabled = true;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });

  btn.textContent = orig;
  btn.disabled = false;

  if (error) {
    errEl.textContent = error.message;
  } else {
    errEl.style.color = 'var(--green)';
    errEl.textContent = `✓ Link gesendet an ${email}`;
  }
}

function _mapError(msg) {
  if (/invalid.*credentials/i.test(msg)) return 'E-Mail oder Passwort falsch.';
  if (/email.*not.*confirmed/i.test(msg)) return 'E-Mail noch nicht bestätigt.';
  if (/too.*many.*requests/i.test(msg))   return 'Zu viele Versuche. Bitte kurz warten.';
  return msg;
}

// ============================================================
// TAB SWITCHING
// ============================================================
function setMode(mode) {
  _mode = mode;

  const errEl = document.getElementById('login-error');
  if (errEl) { errEl.textContent = ''; errEl.style.color = ''; }

  const signinTab = document.getElementById('login-tab-signin');
  const signupTab = document.getElementById('login-tab-signup');
  const btn       = document.getElementById('login-btn');
  const forgot    = document.getElementById('login-forgot-btn');
  const pwHint    = document.querySelector('.login-pw-hint');
  const pwInput   = document.getElementById('login-password');

  if (mode === 'signin') {
    signinTab?.classList.add('active');
    signupTab?.classList.remove('active');
    if (btn)    btn.textContent = 'Anmelden';
    if (forgot) forgot.style.display = '';
    if (pwHint) pwHint.style.display = 'none';
    if (pwInput) pwInput.autocomplete = 'current-password';
  } else {
    signinTab?.classList.remove('active');
    signupTab?.classList.add('active');
    if (btn)    btn.textContent = 'Konto erstellen';
    if (forgot) forgot.style.display = 'none';
    if (pwHint) pwHint.style.display = '';
    if (pwInput) pwInput.autocomplete = 'new-password';
  }
}

// ============================================================
// PUBLIC API
// ============================================================
export function render() {
  _mode = 'signin';

  const screen = document.getElementById('login-screen');
  screen.style.display = 'flex';

  // Reset pw hint visibility for signin default
  const pwHint = document.querySelector('.login-pw-hint');
  if (pwHint) pwHint.style.display = 'none';

  _loginHandler   = () => handleAuth();
  _keydownHandler = e => { if (e.key === 'Enter') handleAuth(); };
  _forgotHandler  = () => handleForgot();

  document.getElementById('login-btn').addEventListener('click', _loginHandler);
  document.getElementById('login-password').addEventListener('keydown', _keydownHandler);
  document.getElementById('login-forgot-btn').addEventListener('click', _forgotHandler);

  const signinTab     = document.getElementById('login-tab-signin');
  const signupTab     = document.getElementById('login-tab-signup');
  const signinHandler = () => setMode('signin');
  const signupHandler = () => setMode('signup');
  signinTab?.addEventListener('click', signinHandler);
  signupTab?.addEventListener('click', signupHandler);
  _tabHandlers = [
    { el: signinTab, fn: signinHandler },
    { el: signupTab, fn: signupHandler },
  ];

  _onboardingHandler = () => dismissOnboarding();
  document.getElementById('onboarding-done-btn')?.addEventListener('click', _onboardingHandler);
}

export function cleanup() {
  document.getElementById('login-screen').style.display = 'none';

  const btn = document.getElementById('login-btn');
  if (btn && _loginHandler) btn.removeEventListener('click', _loginHandler);
  _loginHandler = null;

  const pw = document.getElementById('login-password');
  if (pw && _keydownHandler) pw.removeEventListener('keydown', _keydownHandler);
  _keydownHandler = null;

  const forgot = document.getElementById('login-forgot-btn');
  if (forgot && _forgotHandler) forgot.removeEventListener('click', _forgotHandler);
  _forgotHandler = null;

  _tabHandlers.forEach(({ el, fn }) => el?.removeEventListener('click', fn));
  _tabHandlers = [];

  // Don't remove onboarding listener — overlay persists across login/app boundary
}
