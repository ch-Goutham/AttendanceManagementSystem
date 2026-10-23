const SESSION_KEY = 'attendance_session_v2';
const LEGACY_TOKEN_KEY = 'attendance_token';
const LEGACY_USER_KEY = 'attendance_user';

// Older builds saved the token and the user in two separate keys and never
// checked whether the token was still valid. That is what allowed an expired
// admin session to keep rendering the admin screen. Legacy keys are removed on
// load so a stale session can never be revived.
function stores() {
  return [window.localStorage, window.sessionStorage];
}

function removeKey(store, key) {
  try {
    store.removeItem(key);
  } catch {
    /* storage can be unavailable (private mode, blocked cookies) */
  }
}

function purgeLegacyKeys() {
  for (const store of stores()) {
    removeKey(store, LEGACY_TOKEN_KEY);
    removeKey(store, LEGACY_USER_KEY);
  }
}

purgeLegacyKeys();

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

/**
 * Returns the stored session ({ token, user, portal }) or null.
 * The server is still asked to confirm the session before a workspace renders.
 */
export function readAuth() {
  for (const store of stores()) {
    let raw = null;
    try {
      raw = store.getItem(SESSION_KEY);
    } catch {
      raw = null;
    }
    if (!raw) continue;

    try {
      const session = JSON.parse(raw);
      if (
        session?.token &&
        isValidUser(session.user) &&
        session.portal === session.user.role &&
        !isExpiredToken(session.token)
      ) {
        return session;
      }
    } catch {
      /* malformed entry, fall through to removal */
    }
    removeKey(store, SESSION_KEY);
  }
  return null;
}

export function getToken() {
  return readAuth()?.token || null;
}

// "Remember me" chooses where the session lives:
// - checked:   localStorage   (survives a browser restart)
// - unchecked: sessionStorage (cleared when the browser closes)
export function saveAuth(data, remember = true) {
  if (!data?.token || !isValidUser(data.user)) return;
  clearAuth();
  const store = remember ? window.localStorage : window.sessionStorage;
  store.setItem(
    SESSION_KEY,
    JSON.stringify({
      token: data.token,
      user: data.user,
      portal: data.user.role,
      savedAt: Date.now(),
    })
  );
}

/** Replace the cached profile with the server's authoritative copy. */
export function updateAuthUser(user) {
  if (!isValidUser(user)) return;
  for (const store of stores()) {
    let raw = null;
    try {
      raw = store.getItem(SESSION_KEY);
    } catch {
      raw = null;
    }
    if (!raw) continue;
    try {
      const session = JSON.parse(raw);
      store.setItem(
        SESSION_KEY,
        JSON.stringify({ ...session, user, portal: user.role })
      );
    } catch {
      /* ignore malformed entries */
    }
    return;
  }
}

export function clearAuth() {
  for (const store of stores()) {
    removeKey(store, SESSION_KEY);
    removeKey(store, LEGACY_TOKEN_KEY);
    removeKey(store, LEGACY_USER_KEY);
  }
}
