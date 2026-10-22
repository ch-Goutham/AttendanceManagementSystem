import { useEffect, useRef, useState } from 'react';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let scriptPromise;

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error('Could not load Google sign-in.'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6.1C12.3 13.6 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-2.8-.4-4.1H24v8.4h12.5c-.3 2.1-1.6 5.2-4.6 7.3l7.6 5.9c4.5-4.2 6.6-10.3 6.6-17.5z" />
      <path fill="#FBBC05" d="M10.4 28.6a14.5 14.5 0 0 1 0-9.2l-7.8-6.1a24 24 0 0 0 0 21.4l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.5-5.9l-7.6-5.9c-2 1.4-4.7 2.4-7.9 2.4-6.4 0-11.7-4.1-13.6-9.9l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/**
 * Renders the official Google Identity Services button when a client ID is
 * configured, and a matching placeholder otherwise.
 */
export default function GoogleSignInButton({ onCredential, onError, disabled = false }) {
  const containerRef = useRef(null);
  const credentialRef = useRef(onCredential);
  const [failed, setFailed] = useState(false);
  credentialRef.current = onCredential;

  useEffect(() => {
    if (!CLIENT_ID || disabled) return undefined;
    let alive = true;
    let observer;

    loadGoogleScript()
      .then(() => {
        if (!alive || !containerRef.current) return;
        const render = () => {
          const node = containerRef.current;
          if (!node) return;
          const width = Math.max(200, Math.floor(node.getBoundingClientRect().width || 320));
          node.innerHTML = '';
          window.google.accounts.id.initialize({
            client_id: CLIENT_ID,
            callback: (response) => {
              if (response?.credential) credentialRef.current(response.credential);
              else onError?.('Google sign-in was cancelled.');
            }
          });
          window.google.accounts.id.renderButton(node, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'continue_with',
            shape: 'rectangular',
            logo_alignment: 'left',
            width
          });
        };

        render();
        if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
          observer = new ResizeObserver(render);
          observer.observe(containerRef.current);
        }
      })
      .catch(() => {
        if (alive) setFailed(true);
      });

    return () => {
      alive = false;
      observer?.disconnect();
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
    // onError is only used for the "cancelled" message, so it is kept out of
    // the dependency list to avoid re-rendering the Google iframe constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const unavailableMessage =
    'Google sign-in is not configured yet. Add VITE_GOOGLE_CLIENT_ID to the client environment.';

  if (!CLIENT_ID || failed || disabled) {
    return (
      <button
        type="button"
        className="google-btn"
        disabled={disabled}
        title={disabled ? 'Agree to the Terms & Conditions to continue' : undefined}
        onClick={() => onError?.(failed ? 'Could not load Google sign-in. Please try again.' : unavailableMessage)}
      >
        <GoogleMark />
        Continue with Google
      </button>
    );
  }

  return <div className="google-btn-slot" ref={containerRef} />;
}
