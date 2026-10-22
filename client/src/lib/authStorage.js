const TOKEN_KEY = 'attendance_token';
const USER_KEY = 'attendance_user';

// "Remember me" chooses where the session lives:
// - checked:   localStorage   (survives a browser restart)
// - unchecked: sessionStorage (cleared when the browser closes)
function stores() {
  return [window.localStorage, window.sessionStorage];
}

export function readAuth() {
  for (const store of stores()) {
    try {
      const user = JSON.parse(store.getItem(USER_KEY) || 'null');
      const token = store.getItem(TOKEN_KEY);
      if (user && token) return user;
    } catch {
      /* ignore malformed entries */
    }
  }
  return null;
}

export function getToken() {
  for (const store of stores()) {
    const token = store.getItem(TOKEN_KEY);
    if (token) return token;
  }
  return null;
}

export function saveAuth(data, remember) {
  clearAuth();
  const store = remember ? window.localStorage : window.sessionStorage;
  store.setItem(TOKEN_KEY, data.token);
  store.setItem(USER_KEY, JSON.stringify(data.user));
}

export function clearAuth() {
  for (const store of stores()) {
    store.removeItem(TOKEN_KEY);
    store.removeItem(USER_KEY);
  }
}
