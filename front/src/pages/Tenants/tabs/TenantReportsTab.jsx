import React from 'react';

export default function TenantReportsTab({ tenant }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Reportes y Analítica</h2>
          <p className="text-sm text-slate-500">Métricas de desempeño, costos y cumplimiento.</p>
        </div>
        <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
          <i className="bi bi-download mr-2" />
          Exportar CSV
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {['Costos por Proyecto', 'Contrataciones', 'Rotación', 'Cumplimiento Fiscal'].map((metric) => (
          <div key={metric} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <dt className="truncate text-sm font-medium text-slate-500">{metric}</dt>
            <dd className="mt-2 text-3xl font-semibold text-slate-900">--</dd>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-500">Selecciona un rango de fechas para ver el detalle.</p>
      </div>
    </div>
  );
}
