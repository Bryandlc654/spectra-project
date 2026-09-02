import React from 'react';

export default function SessionExpiredModal({ open, onConfirm }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />

      {/* Modal Content */}
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-900/5 transition-all">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
            <i className="bi bi-exclamation-triangle text-3xl text-amber-500" />
          </div>
          
          <h3 className="text-lg font-bold text-slate-900">
            Sesión Expirada
          </h3>
          
          <p className="mt-2 text-sm text-slate-500">
            Tu sesión ha caducado por seguridad. Por favor, inicia sesión nuevamente para continuar.
          </p>

          <button
            type="button"
            onClick={onConfirm}
            className="mt-6 w-full inline-flex justify-center items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand/90 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:ring-offset-2 transition-all cursor-pointer"
          >
            <i className="bi bi-box-arrow-in-right" />
            Iniciar Sesión
          </button>
        </div>
      </div>
    </div>
  );
}
