import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now().toString() + Math.random().toString().slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Object that functions as the hook return value
  // Usage: const toast = useToast(); toast.success('...');
  const toast = useCallback((message) => addToast(message, 'neutral'), [addToast]);
  
  // Attach methods to the function itself so we can do toast.success()
  toast.success = (message) => addToast(message, 'success');
  toast.error = (message) => addToast(message, 'error');
  toast.info = (message) => addToast(message, 'info');

  // We need to pass a stable object to context to avoid re-renders of consumers
  // But since we want the syntax `const toast = useToast(); toast.success(...)`, 
  // we return the `toast` function which has static methods attached.
  // To make `toast` stable, we used useCallback, but we also need to attach properties inside the callback or memoize the object.
  // Actually, the cleanest way in React context is usually returning an object { addToast, ... }. 
  // But for developer experience `toast.success` is nice.
  // Let's just return the `toast` function. Since `addToast` is stable (useCallback), `toast` function will be stable if we construct it carefully.
  // However, attaching properties to a function inside render or callback is tricky for stability.
  // Let's use a simpler pattern: value={ { success: ..., error: ... } } and consumer uses destructuring or object.
  // But I want `toast.success`.
  
  const value = useMemo(() => {
    const fn = (msg) => addToast(msg, 'neutral');
    fn.success = (msg) => addToast(msg, 'success');
    fn.error = (msg) => addToast(msg, 'error');
    fn.info = (msg) => addToast(msg, 'info');
    return fn;
  }, [addToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg transition-all animate-in slide-in-from-right-full fade-in duration-300 ${
              t.type === 'success'
                ? 'bg-emerald-600 text-white'
                : t.type === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-slate-800 text-white'
            }`}
          >
            {t.type === 'success' && <i className="bi bi-check-circle-fill" />}
            {t.type === 'error' && <i className="bi bi-exclamation-triangle-fill" />}
            {t.type === 'info' && <i className="bi bi-info-circle-fill" />}
            <span>{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="ml-2 rounded-lg p-1 hover:bg-white/20"
            >
              <i className="bi bi-x" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Helper hook for useMemo
import { useMemo } from 'react';
