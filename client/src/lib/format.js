export const BACKEND_DOWN_MESSAGE =
  'Cannot reach the backend server. Start it with "npm run dev" in the project root, or run "cd server && npm run dev".';

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

export function randomPassword(length = 10) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
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
