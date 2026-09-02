import React, { useEffect } from 'react';

export default function ConfirmModal({
  open,
  title = 'Confirmar acción',
  message = '¿Estás seguro?',
  confirmText = 'Eliminar',
  cancelText = 'Cancelar',
  danger = true,
  loading = false,
  onConfirm,
  onClose,
  children,
}) {
  useEffect(() => {
    function onKey(e) {
      if (!open) return;
      if (e.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200">
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div
              className={`grid h-10 w-10 place-items-center rounded-2xl ring-1 ${
                danger
                  ? 'bg-rose-600/10 text-rose-700 ring-rose-600/20'
                  : 'bg-slate-900/5 text-slate-700 ring-slate-900/10'
              }`}
            >
              <i className={`bi ${danger ? 'bi-trash3' : 'bi-question-circle'}`} aria-hidden="true" />
            </div>

            <div className="min-w-0">
              <div className="text-base font-extrabold text-slate-900">{title}</div>
              <p className="mt-1 text-sm text-slate-600">{message}</p>
              {children}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="ml-auto rounded-xl p-2 text-slate-500 hover:bg-slate-50"
              aria-label="Cerrar"
            >
              <i className="bi bi-x-lg" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/60 p-4 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-xl px-4 py-2 text-sm font-extrabold text-white disabled:opacity-60 ${
              danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {loading ? 'Procesando…' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
