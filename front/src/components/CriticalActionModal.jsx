import React, { useState } from 'react';

export default function CriticalActionModal({
  open,
  title,
  message,
  confirmText = 'Confirmar',
  onClose,
  onConfirm,
  loading = false,
  danger = false,
  requireReason = true,
}) {
  const [reason, setReason] = useState('');
  const [doubleConfirm, setDoubleConfirm] = useState(false);

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (requireReason && !reason.trim()) return;
    if (!doubleConfirm) return;
    onConfirm(reason);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" 
        onClick={!loading ? onClose : undefined} 
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 transition-all transform scale-100">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`rounded-full p-3 ${danger ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
              <i className={`bi bi-${danger ? 'exclamation-triangle' : 'shield-exclamation'} text-xl`} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-slate-900 leading-6">
                {title}
              </h3>
              <div className="mt-2 text-sm text-slate-600">
                {message}
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {requireReason && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Motivo de la acción <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Describe por qué estás realizando esta acción..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10 min-h-[80px]"
                />
              </div>
            )}

            <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <input
                id="double-confirm"
                type="checkbox"
                required
                checked={doubleConfirm}
                onChange={(e) => setDoubleConfirm(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
              />
              <label htmlFor="double-confirm" className="text-sm text-slate-700 select-none cursor-pointer">
                Entiendo que esta acción es sensible y quedará registrada en el sistema de auditoría.
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || !doubleConfirm || (requireReason && !reason.trim())}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed
                  ${danger 
                    ? 'bg-red-600 hover:bg-red-500 focus-visible:outline-red-600' 
                    : 'bg-brand hover:bg-brand/90 focus-visible:outline-brand'
                  }`}
              >
                {loading ? (
                  <>
                    <i className="bi bi-arrow-repeat animate-spin mr-2" />
                    Procesando...
                  </>
                ) : (
                  confirmText
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
