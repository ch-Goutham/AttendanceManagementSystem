import axios from 'axios';
import { clearAuth, getToken } from './lib/authStorage';

// In development and preview, /api is proxied to the backend by Vite.
// A separately hosted production build should set VITE_API_URL.
export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({ baseURL: API_BASE_URL, timeout: 20000 });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Failed sign-in / reset attempts legitimately return 401 and must not be
// treated as an expired session.
const AUTH_ATTEMPT_PATHS = [
  '/auth/login',
  '/auth/google/',
  '/auth/register-admin',
  '/auth/forgot-password',
  '/auth/reset-password',
];

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = String(error.config?.url || '');
    const isAuthAttempt = AUTH_ATTEMPT_PATHS.some((path) => url.includes(path));

    // A dead/revoked token must never leave the app looking signed in. Drop the
    // session and let App.jsx move the user to the login page for their portal.
    // This also covers a token that expired while the tab was already open,
    // where the request interceptor has already removed it from storage.
    if (status === 401 && !isAuthAttempt) {
      clearAuth();
      window.dispatchEvent(new Event('attendance:auth-expired'));
    }

    return Promise.reject(error);
  }
);

export default api;
