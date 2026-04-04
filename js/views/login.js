import * as Auth from '../auth.js';
import { supabase } from '../supabase-client.js';
import { showToast } from '../ui/feedback.js';

const ONBOARDING_KEY = 'sp_onboarding_done';

let _mode            = 'signin';
let _delegHandler    = null; // single delegated listener on #login-screen

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
  const emailEl = document.getElementById('login-email');
  const passEl  = document.getElementById('login-password');
  const btn     = document.getElementById('login-btn');
  const errEl   = document.getElementById('login-error');

  const email    = emailEl?.value.trim() ?? '';
  const password = passEl?.value ?? '';

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

  btn.disabled = true;
  btn.classList.add('btn-loading');

  try {
    if (_mode === 'signup') {
      const { data, error } = await Auth.signUp(email, password);
      if (error) {
        errEl.textContent = error.message;
      } else if (data?.user && !data.session) {
        // Email confirmation required
        errEl.style.color = 'var(--green)';
        errEl.textContent = '✓ Bestätigungs-E-Mail gesendet. Bitte Postfach prüfen.';
      }
      // If session exists onAuthStateChange handles transition
    } else {
      const { error } = await Auth.signIn(email, password);
      if (error) {
        errEl.textContent = _mapError(error.message);
      }
      // On success onAuthStateChange handles transition; spinner stays until screen hides
      if (!error) return; // leave btn-loading on during transition
    }
  } catch (err) {
    errEl.textContent = 'Unbekannter Fehler. Bitte versuche es erneut.';
  }

  // Re-enable only on error paths
  btn.disabled = false;
  btn.classList.remove('btn-loading');
}

async function handleForgot() {
  const errEl = document.getElementById('login-error');
  const email = document.getElementById('login-email')?.value.trim() ?? '';

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

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    if (error) {
      errEl.textContent = error.message;
    } else {
      errEl.style.color = 'var(--green)';
      errEl.textContent = `✓ Reset-Link gesendet an ${email}`;
    }
  } catch (err) {
    errEl.textContent = 'Fehler beim Senden.';
  }

  btn.textContent = orig;
  btn.disabled = false;
}

function _mapError(msg) {
  if (/invalid.*credentials/i.test(msg))    return 'E-Mail oder Passwort falsch.';
  if (/email.*not.*confirmed/i.test(msg))   return 'E-Mail noch nicht bestätigt.';
  if (/too.*many.*requests/i.test(msg))     return 'Zu viele Versuche — bitte kurz warten.';
  if (/user.*not.*found/i.test(msg))        return 'Kein Konto mit dieser E-Mail gefunden.';
  return msg;
}

// ============================================================
// TAB / MODE SWITCHING
// ============================================================
function setMode(mode) {
  _mode = mode;

  const errEl     = document.getElementById('login-error');
  const signinTab = document.getElementById('login-tab-signin');
  const signupTab = document.getElementById('login-tab-signup');
  const btn       = document.getElementById('login-btn');
  const forgot    = document.getElementById('login-forgot-btn');
  const pwHint    = document.querySelector('.login-pw-hint');
  const pwInput   = document.getElementById('login-password');

  if (errEl)  { errEl.textContent = ''; errEl.style.color = ''; }

  if (mode === 'signin') {
    signinTab?.classList.add('active');
    signupTab?.classList.remove('active');
    if (btn)    { btn.textContent = 'Anmelden'; btn.disabled = false; }
    if (forgot) forgot.style.display = 'block';
    if (pwHint) pwHint.style.display = 'none';
    if (pwInput) pwInput.autocomplete = 'current-password';
  } else {
    signinTab?.classList.remove('active');
    signupTab?.classList.add('active');
    if (btn)    { btn.textContent = 'Konto erstellen'; btn.disabled = false; }
    if (forgot) forgot.style.display = 'none';
    if (pwHint) pwHint.style.display = 'block';
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

  // Set initial state
  const pwHint = document.querySelector('.login-pw-hint');
  if (pwHint) pwHint.style.display = 'none';

  const forgot = document.getElementById('login-forgot-btn');
  if (forgot) forgot.style.display = 'block';

  const btn = document.getElementById('login-btn');
  if (btn) { btn.textContent = 'Anmelden'; btn.disabled = false; btn.classList.remove('btn-loading'); }

  const signinTab = document.getElementById('login-tab-signin');
  const signupTab = document.getElementById('login-tab-signup');
  signinTab?.classList.add('active');
  signupTab?.classList.remove('active');

  // Single delegated listener — handles all clicks inside the login screen
  _delegHandler = e => {
    const t = e.target;

    // Tab switching
    if (t.id === 'login-tab-signin') { setMode('signin'); return; }
    if (t.id === 'login-tab-signup') { setMode('signup'); return; }

    // Submit
    if (t.id === 'login-btn') { handleAuth(); return; }

    // Forgot password
    if (t.id === 'login-forgot-btn') { handleForgot(); return; }

  };

  screen.addEventListener('click', _delegHandler);

  // Enter key on either input submits
  const onKey = e => { if (e.key === 'Enter') handleAuth(); };
  document.getElementById('login-email')?.addEventListener('keydown', onKey);
  document.getElementById('login-password')?.addEventListener('keydown', onKey);
  // Store for cleanup
  _delegHandler._onKey = onKey;
}

export function cleanup() {
  const screen = document.getElementById('login-screen');
  screen.style.display = 'none';

  if (_delegHandler) {
    screen.removeEventListener('click', _delegHandler);
    if (_delegHandler._onKey) {
      document.getElementById('login-email')?.removeEventListener('keydown', _delegHandler._onKey);
      document.getElementById('login-password')?.removeEventListener('keydown', _delegHandler._onKey);
    }
    _delegHandler = null;
  }
}
