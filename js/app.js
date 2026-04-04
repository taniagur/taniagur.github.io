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

let currentView      = null;
const viewContainer  = document.getElementById('view-container');

// ============================================================
// ROUTER
// ============================================================
function navigate(hash) {
  const route = routes[hash] ?? routes['#/'];
  if (currentView === route.view) {
    // Same view — just switch mode if applicable
    if (route.mode && route.view.setMode) {
      route.view.setMode(route.mode);
    }
  } else {
    // Different view — cleanup old, render new
    if (currentView) currentView.cleanup();
    route.view.render(viewContainer, route.mode);
    currentView = route.view;
  }
  // Update nav active state
  document.querySelectorAll('[data-route]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.route === hash);
  });
}

// ============================================================
// DATA LOADING
// ============================================================
async function loadData() {
  document.getElementById('loading-overlay').classList.remove('hidden');
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
  document.getElementById('loading-overlay').classList.add('hidden');
}

// ============================================================
// GLOBAL EVENT HANDLERS
// ============================================================

// Close modals via data-modal-close attribute
document.addEventListener('click', e => {
  const closeEl = e.target.closest('[data-modal-close]');
  if (closeEl) {
    const modalId = closeEl.dataset.modalClose;
    document.getElementById(modalId)?.classList.remove('open');
    return;
  }
  // Click on modal-bg backdrop closes modal
  if (e.target.classList.contains('modal-bg')) {
    e.target.classList.remove('open');
  }
});

// Escape key closes all open modals
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open'));
  }
});

// Hash-based routing
window.addEventListener('hashchange', () => navigate(location.hash));

// Nav button clicks
document.getElementById('main-nav').addEventListener('click', e => {
  const btn = e.target.closest('[data-route]');
  if (btn) {
    location.hash = btn.dataset.route;
  }
});

// Logout button
document.getElementById('logout-btn').addEventListener('click', async () => {
  await Auth.signOut();
  setState({ friends: [], activities: [], events: [], user: null });
});

// ============================================================
// AUTH STATE
// ============================================================
Auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    const user = session.user;
    setState({ user });
    document.getElementById('user-email').textContent = user.email ?? '';
    document.getElementById('app').style.display         = 'block';
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('loading-overlay').classList.add('hidden');
    LoginView.cleanup();
    loadData().then(() => navigate(location.hash || '#/'));
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
  const { data } = await Auth.getCurrentUser();
  if (data?.user) {
    const user = data.user;
    setState({ user });
    document.getElementById('user-email').textContent = user.email ?? '';
    document.getElementById('app').style.display         = 'block';
    document.getElementById('login-screen').style.display = 'none';
    await loadData();
    navigate(location.hash || '#/');
  } else {
    document.getElementById('loading-overlay').classList.add('hidden');
    LoginView.render();
  }
}

init();
