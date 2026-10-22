import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_PROXY_TARGET || 'http://localhost:5000';
  const proxy = {
    '/api': {
      target,
      changeOrigin: true,
    },
  };

  return {
    plugins: [react()],
    // Both dev and preview proxy /api to the backend. That keeps the browser
    // same-origin, avoids CORS surprises and makes a missing backend surface as
    // a clear proxy failure instead of a cross-origin network error.
    server: { proxy },
    preview: { proxy },
  };
});
