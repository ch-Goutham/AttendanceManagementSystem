import React, { useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

const ToastContext = React.createContext(() => {});
export const useToast = () => React.useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const remove = (id) => setToasts((list) => list.filter((toast) => toast.id !== id));

  const notify = (type, message) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, type, message }]);
    setTimeout(() => remove(id), 4500);
  };

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`} onClick={() => remove(toast.id)}>
            <span className="toast-icon">
              {toast.type === 'success' ? (
                <CheckCircle2 size={17} />
              ) : toast.type === 'error' ? (
                <XCircle size={17} />
              ) : (
                <AlertCircle size={17} />
              )}
            </span>
            <span className="toast-msg">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
