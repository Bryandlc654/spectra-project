import React from 'react';

export default function StatusMessage({ tone = 'info', message }) {
  if (!message) return null;

  const map = {
    info: { cls: 'border-blue-200 bg-blue-50 text-blue-900', icon: 'bi-info-circle' },
    success: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: 'bi-check-circle' },
    error: { cls: 'border-red-200 bg-red-50 text-red-900', icon: 'bi-exclamation-triangle' },
  };

  const cfg = map[tone] || map.info;

  return (
    <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${cfg.cls}`} role="alert">
      <i className={`bi ${cfg.icon} mt-0.5`} aria-hidden="true" />
      <div className="leading-relaxed">{message}</div>
    </div>
  );
}
