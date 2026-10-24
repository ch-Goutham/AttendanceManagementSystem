// Each portal keeps its own session slot. That is what lets an admin stay
// signed in on /admin while an employee is signed in on /employee in another
// tab: logging into one portal no longer overwrites the other.
const SESSION_KEYS = {
  admin: 'attendance_session_admin_v3',
  employee: 'attendance_session_employee_v3',
};
const LEGACY_SESSION_KEY = 'attendance_session_v2';
const LEGACY_TOKEN_KEY = 'attendance_token';
const LEGACY_USER_KEY = 'attendance_user';

function stores() {
  const list = [];
  try {
    list.push(window.localStorage);
  } catch {
    /* storage can be unavailable (private mode, blocked cookies) */
  }
  try {
    list.push(window.sessionStorage);
  } catch {
    /* ignore */
  }
  return list;
}

function removeKey(store, key) {
  try {
    store.removeItem(key);
  } catch {
    /* ignore */
  }
}

function readKey(store, key) {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(store, key, value) {
  try {
    store.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function pickStore(remember) {
  try {
    return remember ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

// Older builds saved the token and the user in two separate keys and never
// checked whether the token was still valid. That is what allowed an expired
// admin session to keep rendering the admin screen. Legacy keys are removed on
// load so a stale session can never be revived.
function purgeLegacyKeys() {
  for (const store of stores()) {
    removeKey(store, LEGACY_TOKEN_KEY);
    removeKey(store, LEGACY_USER_KEY);
  }
}

function isValidUser(user) {
  return Boolean(
    user &&
      typeof user === 'object' &&
      user.id &&
      (user.role === 'admin' || user.role === 'employee')
  );
}

// Read (but never trust for authorization) the JWT expiry so an obviously dead
// session is discarded without a pointless round trip.
function isExpiredToken(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
  } catch {
    return false;
  }
}

function hasStoredSession(role) {
  return stores().some((store) => Boolean(readKey(store, SESSION_KEYS[role])));
}

// A single-session build may already have someone signed in. Move that session
// into its per-portal slot instead of forcing a fresh login after the upgrade.
function migrateLegacySession() {
  for (const store of stores()) {
    const raw = readKey(store, LEGACY_SESSION_KEY);
    if (!raw) continue;

    try {
      const session = JSON.parse(raw);
      const role = session?.user?.role;
      if (
        SESSION_KEYS[role] &&
        session?.token &&
        isValidUser(session.user) &&
        session.portal === role &&
        !isExpiredToken(session.token) &&
        !hasStoredSession(role)
      ) {
        writeKey(
          store,
          SESSION_KEYS[role],
          JSON.stringify({ ...session, portal: role })
        );
      }
    } catch {
      /* malformed entry, drop it below */
    }
    removeKey(store, LEGACY_SESSION_KEY);
  }
}

purgeLegacyKeys();
migrateLegacySession();

/**
 * The portal a URL belongs to. Workspace tabs always follow their own route,
 * so the admin console uses the admin token and the employee workspace uses the
 * employee token even when both exist in the same browser.
 */
export function portalForPath(pathname = window.location.pathname) {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin';
  if (pathname === '/admin-login' || pathname === '/admin-signup') return 'admin';
  if (pathname === '/employee' || pathname.startsWith('/employee/')) return 'employee';
  if (
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password'
  ) {
    return 'employee';
  }
  return null;
}

export function currentPortal() {
  return portalForPath(window.location.pathname);
}

export function getSessionKey(portal) {
  return SESSION_KEYS[portal] || null;
}

/**
 * Returns this portal's stored session ({ token, user, portal }) or null.
 * The server is still asked to confirm the session before a workspace renders.
 */
export function readAuth(portal = currentPortal()) {
  if (!SESSION_KEYS[portal]) return null;
  const key = SESSION_KEYS[portal];

  for (const store of stores()) {
    const raw = readKey(store, key);
    if (!raw) continue;

    try {
      const session = JSON.parse(raw);
      if (
        session?.token &&
        isValidUser(session.user) &&
        session.user.role === portal &&
        session.portal === portal &&
        !isExpiredToken(session.token)
      ) {
        return session;
      }
    } catch {
      /* malformed entry, fall through to removal */
    }
    removeKey(store, key);
  }
  return null;
}

export function getToken() {
  return readAuth()?.token || null;
}

// "Remember me" chooses where the session lives:
// - checked:   localStorage   (survives a browser restart)
// - unchecked: sessionStorage (cleared when the browser closes)
// Only this portal's slot is replaced; the other portal keeps its session.
export function saveAuth(data, remember = true) {
  if (!data?.token || !isValidUser(data.user)) return;
  const role = data.user.role;
  clearAuth(role);
  const store = pickStore(remember);
  if (!store) return;
  writeKey(
    store,
    SESSION_KEYS[role],
    JSON.stringify({
      token: data.token,
      user: data.user,
      portal: role,
      savedAt: Date.now(),
    })
  );
}

/** Replace the cached profile with the server's authoritative copy. */
export function updateAuthUser(user) {
  if (!isValidUser(user)) return;
  const key = SESSION_KEYS[user.role];

  for (const store of stores()) {
    const raw = readKey(store, key);
    if (!raw) continue;
    try {
      const session = JSON.parse(raw);
      writeKey(store, key, JSON.stringify({ ...session, user, portal: user.role }));
    } catch {
      /* ignore malformed entries */
    }
    return;
  }
}

/** Clear one portal's session. The other portal stays signed in. */
export function clearAuth(role = currentPortal()) {
  if (!SESSION_KEYS[role]) return;
  for (const store of stores()) removeKey(store, SESSION_KEYS[role]);
}
