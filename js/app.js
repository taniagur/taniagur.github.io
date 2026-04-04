import * as Auth from './auth.js';
import { getState, setState } from './state.js';
import { showToast } from './ui/feedback.js';
import * as LoginView from './views/login.js';
import * as DashboardView from './views/dashboard.js';
import * as FriendsView from './views/friends.js';
import * as ActivitiesView from './views/activities.js';
import * as EventsView from './views/events.js';
import * as Store from './store/index.js';

// ============================================================
// ROUTES
// ============================================================
const routes = {
  '#/':           { view: DashboardView,  mode: 'home' },
  '#/suggest':    { view: DashboardView,  mode: 'suggest' },
  '#/friends':    { view: FriendsView,    mode: null },
  '#/activities': { view: ActivitiesView, mode: null },
  '#/events':     { view: EventsView,     mode: 'calendar' },
  '#/log':        { view: EventsView,     mode: 'log' },
};

let currentView     = null;
const viewContainer = document.getElementById('view-container');

// ============================================================
// ROUTER
// ============================================================
function navigate(hash) {
  const route = routes[hash] ?? routes['#/'];

  if (currentView === route.view) {
    if (route.mode && route.view.setMode) {
      route.view.setMode(route.mode);
    }
  } else {
    if (currentView) currentView.cleanup();
    route.view.render(viewContainer, route.mode);
    currentView = route.view;
  }

  // Update sidebar active state
  document.querySelectorAll('.sidebar__item[data-route]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.route === hash);
  });

  // Close sidebar on mobile after navigation
  closeSidebar();
}

// ============================================================
// DATA LOADING
// ============================================================
async function loadData() {
  document.getElementById('loading-overlay').classList.remove('hidden');
  try {
    const [fr, ac, ev] = await Promise.all([
      Store.getFriends(),
      Store.getActivities(),
      Store.getEvents(),
    ]);
    if (fr.error || ac.error || ev.error) {
      showToast('Verbindung fehlgeschlagen — bitte Seite neu laden.', 'error');
    }
    setState({
      friends:    fr.data ?? [],
      activities: ac.data ?? [],
      events:     ev.data ?? [],
    });
  } finally {
    document.getElementById('loading-overlay').classList.add('hidden');
  }
}

// ============================================================
// SIDEBAR (mobile)
// ============================================================
const sidebar        = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const hamburgerBtn   = document.getElementById('hamburger-btn');

function openSidebar() {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('open');
  hamburgerBtn.classList.add('open');
  hamburgerBtn.setAttribute('aria-label', 'Menü schließen');
  hamburgerBtn.setAttribute('aria-expanded', 'true');
}

function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('open');
  hamburgerBtn.classList.remove('open');
  hamburgerBtn.setAttribute('aria-label', 'Menü öffnen');
  hamburgerBtn.setAttribute('aria-expanded', 'false');
}

hamburgerBtn.addEventListener('click', () => {
  sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
});

sidebarOverlay.addEventListener('click', closeSidebar);

// ============================================================
// GLOBAL EVENT HANDLERS
// ============================================================

// Close modals via data-modal-close attribute
document.addEventListener('click', e => {
  // Onboarding dismiss — overlay is outside #login-screen, so handled globally
  if (e.target.id === 'onboarding-done-btn') {
    localStorage.setItem('sp_onboarding_done', '1');
    document.getElementById('onboarding-overlay').style.display = 'none';
    return;
  }
  const closeEl = e.target.closest('[data-modal-close]');
  if (closeEl) {
    document.getElementById(closeEl.dataset.modalClose)?.classList.remove('open');
    return;
  }
  // Click on modal-bg backdrop closes modal
  if (e.target.classList.contains('modal-bg')) {
    e.target.classList.remove('open');
  }
});

// ============================================================
// FOCUS TRAP & MODAL FOCUS MANAGEMENT
// ============================================================
const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([type="hidden"]):not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

let _modalOpener = null;

// Watch for .modal-bg gaining/losing .open — manage focus accordingly
const _modalObserver = new MutationObserver(mutations => {
  for (const { target, oldValue } of mutations) {
    const wasOpen = (oldValue ?? '').split(' ').includes('open');
    const isOpen  = target.classList.contains('open');
    if (!wasOpen && isOpen) {
      _modalOpener = document.activeElement;
      const first = target.querySelector(FOCUSABLE);
      if (first) setTimeout(() => first.focus(), 0);
    } else if (wasOpen && !isOpen) {
      if (_modalOpener) { _modalOpener.focus(); _modalOpener = null; }
    }
  }
});
document.querySelectorAll('.modal-bg').forEach(m =>
  _modalObserver.observe(m, { attributes: true, attributeOldValue: true, attributeFilter: ['class'] })
);

// Escape closes modals/sidebar; Tab is trapped inside open modals
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open'));
    closeSidebar();
    return;
  }
  if (e.key === 'Tab') {
    const openModal = document.querySelector('.modal-bg.open');
    if (!openModal) return;
    const focusable = [...openModal.querySelectorAll(FOCUSABLE)];
    if (!focusable.length) return;
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
    }
  }
});

// Hash-based routing
window.addEventListener('hashchange', () => navigate(location.hash));

// Sidebar nav clicks
document.getElementById('main-nav').addEventListener('click', e => {
  const btn = e.target.closest('[data-route]');
  if (btn) location.hash = btn.dataset.route;
});

// Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
  await Auth.signOut();
  setState({ friends: [], activities: [], events: [], user: null });
});

// ============================================================
// USER INFO
// ============================================================
function setUserInfo(user) {
  const email = user.email ?? '';
  document.getElementById('user-email').textContent = email;
  // Set avatar initials from email
  const initials = email.slice(0, 2).toUpperCase();
  const avatarEl = document.getElementById('user-avatar');
  if (avatarEl) avatarEl.textContent = initials;
}

// ============================================================
// AUTH STATE
// ============================================================
Auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    const user = session.user;
    setState({ user });
    setUserInfo(user);
    document.getElementById('app').style.display          = '';
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('loading-overlay').classList.add('hidden');
    LoginView.cleanup();
    loadData().then(() => {
      navigate(location.hash || '#/');
      LoginView.showOnboardingIfNeeded();
    });
  } else if (event === 'SIGNED_OUT') {
    setState({ friends: [], activities: [], events: [], user: null });
    document.getElementById('app').style.display          = 'none';
    document.getElementById('login-screen').style.display = 'none';
    if (currentView) { currentView.cleanup(); currentView = null; }
    LoginView.render();
  }
});

// ============================================================
// INIT
// ============================================================
async function init() {
  try {
    const { data } = await Auth.getCurrentUser();
    if (data?.user) {
      const user = data.user;
      setState({ user });
      setUserInfo(user);
      document.getElementById('app').style.display          = '';
      document.getElementById('login-screen').style.display = 'none';
      await loadData();
      navigate(location.hash || '#/');
      LoginView.showOnboardingIfNeeded();
    } else {
      document.getElementById('loading-overlay').classList.add('hidden');
      LoginView.render();
    }
  } catch (err) {
    // Always dismiss loading overlay so the user isn't stuck
    document.getElementById('loading-overlay').classList.add('hidden');
    LoginView.render();
    console.error('Init error:', err);
  }
}

init();
