import React, { useEffect } from 'react';

export default function Modal({ open, title, children, onClose, size = 'lg' }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    full: 'max-w-full'
  };
  const maxWidthClass = sizeClasses[size] || sizeClasses.lg;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-4">
        <div className={`w-full ${maxWidthClass} rounded-2xl bg-white shadow-xl border border-slate-200 max-h-[85vh] flex flex-col`}>
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100">
            <div className="text-base font-bold text-slate-900">{title}</div>
            <button
              onClick={onClose}
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl hover:bg-slate-100 grid place-items-center"
              type="button"
              aria-label="Cerrar"
            >
              <i className="bi bi-x-lg" aria-hidden="true" />
            </button>
          </div>

          <div className="p-4 sm:p-5 overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}
