import { PASSWORD_MIN_LENGTH } from './password';

export const BACKEND_DOWN_MESSAGE = import.meta.env.DEV
  ? 'Cannot reach the backend server. Start it with "npm run dev" in the project root, or run "cd server && npm run dev".'
  : 'Cannot reach the server right now. Please retry in a moment.';

export function isBackendUnreachable(error) {
  if (!error) return false;
  if (!error.response) {
    return (
      error.code === 'ERR_NETWORK' ||
      error.code === 'ECONNABORTED' ||
      error.code === 'ETIMEDOUT' ||
      error.message === 'Network Error'
    );
  }

  const status = error.response.status;
  const data = error.response.data;
  const text = typeof data === 'string' ? data : '';

  // Vite's proxy returns a 500 when it cannot connect to the backend target.
  if (/proxy error|ECONNREFUSED|ERR_CONNECTION_REFUSED|connect ECONNREFUSED/i.test(text)) return true;
  if ([502, 503, 504].includes(status)) return true;
  if (status === 500 && !text.trim() && !(data && typeof data === 'object')) return true;
  return false;
}

export const errMsg = (error) => {
  if (isBackendUnreachable(error)) return BACKEND_DOWN_MESSAGE;

  const data = error?.response?.data;
  if (data?.message) return data.message;
  if (typeof data === 'string' && data.trim() && !data.trim().startsWith('<')) return data;
  return error?.message || 'Something went wrong. Please try again.';
};

export function randomPassword(length = 12) {
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const symbols = '!@#$%^&*';
  const all = lower + upper + numbers + symbols;
  const size = Math.max(PASSWORD_MIN_LENGTH, length);
  const chars = [
    lower[Math.floor(Math.random() * lower.length)],
    upper[Math.floor(Math.random() * upper.length)],
    numbers[Math.floor(Math.random() * numbers.length)],
    symbols[Math.floor(Math.random() * symbols.length)]
  ];
  while (chars.length < size) chars.push(all[Math.floor(Math.random() * all.length)]);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export const initials = (name) => (name ? name.trim().charAt(0).toUpperCase() : 'E');

export function downloadBlob(data, filename) {
  const url = URL.createObjectURL(new Blob([data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
