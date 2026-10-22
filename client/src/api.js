import axios from 'axios';

// In development and preview, /api is proxied to the backend by Vite.
// A separately hosted production build should set VITE_API_URL.
export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({ baseURL: API_BASE_URL, timeout: 20000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('attendance_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
