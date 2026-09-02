import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../../components/ToastProvider';

export default function TenantSupportTab({ companyId, api }) {
  const toast = useToast();
  const safeApi = useMemo(() => api, [api]);

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!safeApi?.get || !companyId) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr('');
      try {
        // Try to fetch tickets for this tenant
        // Assuming endpoint exists or using global tickets with filter
        // If this endpoint 404s, we might need to adjust backend or use different approach
        const res = await safeApi.get(`/api/tenants/${companyId}/tickets`);
        
        if (!cancelled) {
          setTickets(Array.isArray(res) ? res : (res.data || []));
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('Could not load tenant tickets', e);
          setErr('No se pudo cargar el historial de incidencias.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [safeApi, companyId]);

  const formatDate = (value) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleDateString();
    } catch {
      return value;
    }
  };

  const renderStatusBadge = (status) => {
    const s = String(status || '').toLowerCase();
    let cls = 'bg-slate-100 text-slate-700';
    if (s === 'open') cls = 'bg-blue-50 text-blue-700';
    else if (s === 'closed') cls = 'bg-slate-100 text-slate-500';
    else if (s === 'resolved') cls = 'bg-emerald-50 text-emerald-700';
    else if (s === 'pending') cls = 'bg-amber-50 text-amber-700';
    
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
        {status || 'Desconocido'}
      </span>
    );
  };

  if (!safeApi?.get) return null;

  if (loading && !tickets.length && !err) {
    return <div className="py-8 text-center text-slate-500">Cargando incidencias...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Historial de Incidencias</h3>
          <p className="text-xs text-slate-500">Tickets de soporte asociados a esta empresa.</p>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {err}
        </div>
      )}

      {!tickets.length && !loading && !err && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
          No hay incidencias registradas.
        </div>
      )}

      {tickets.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Asunto</th>
                <th className="px-4 py-3 text-left">Prioridad</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-left">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{t.subject || t.title}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{t.priority || 'Normal'}</td>
                  <td className="px-4 py-3">{renderStatusBadge(t.status)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
