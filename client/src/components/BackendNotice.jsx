import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import api from '../api';

export default function BackendNotice() {
  const [online, setOnline] = useState(true);
  const [checking, setChecking] = useState(false);
  const mounted = useRef(true);

  const check = useCallback(async () => {
    try {
      await api.get('/health', {
        timeout: 15000,
        params: { _: Date.now() },
        headers: { 'Cache-Control': 'no-cache' },
        // Some proxies and Express caching can answer with 304. That still
        // means the backend is reachable, so accept any non-error status.
        validateStatus: (status) => status >= 200 && status < 400,
      });
      if (mounted.current) setOnline(true);
    } catch {
      if (mounted.current) setOnline(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    check();
    const timer = setInterval(check, 30000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [check]);

  async function retry() {
    setChecking(true);
    await check();
    if (mounted.current) setChecking(false);
  }

  if (online) return null;

  return (
    <div className="backend-notice" role="alert">
      <span className="backend-notice-icon">
        <AlertTriangle size={18} />
      </span>
      <span>
        {import.meta.env.DEV ? (
          <>
            Backend not reachable. Start it with <code>npm run dev</code> in the project root, or{' '}
            <code>cd server &amp;&amp; npm run dev</code>. Data and report downloads will fail until
            it is running.
          </>
        ) : (
          <>Cannot reach the server right now. Please retry in a moment.</>
        )}
      </span>
      <button type="button" onClick={retry} disabled={checking}>
        <RefreshCw size={14} className={checking ? 'spin' : ''} />
        {checking ? 'Checking...' : 'Retry'}
      </button>
    </div>
  );
}
