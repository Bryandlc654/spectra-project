import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createApi } from '../../lib/api';

export default function KYBRequestsPage({ apiUrl, token }) {
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);

  const STATUS_LABELS = {
    not_started: 'No iniciado',
    pending_review: 'Pendiente',
    approved: 'Aprobado',
    rejected: 'Rechazado',
    more_info_required: 'Requiere info'
  };

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending_review'); // default to pending as it's most actionable

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [statusFilter]);

  async function load() {
    setLoading(true);
    setErr('');
    try {
      // GET /kyb?status=...
      const res = await api.get(`/api/kyb?status=${statusFilter}`);
      const data = res.data || res || [];
      setRequests(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e.message || 'Error cargando solicitudes KYB');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase">Verificación</div>
          <h1 className="text-xl font-bold">Solicitudes KYB</h1>
          <p className="text-sm text-slate-600">Gestión de verificaciones de empresas (Know Your Business).</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex gap-2">
            {['pending_review', 'approved', 'rejected', ''].map(s => (
                <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                        statusFilter === s 
                        ? 'bg-brand text-white shadow-sm' 
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                >
                    {s === '' ? 'Todos' : (s === 'pending_review' ? 'Pendientes' : s.charAt(0).toUpperCase() + s.slice(1))}
                </button>
            ))}
        </div>

        {loading && <div className="py-10 text-center text-slate-500">Cargando...</div>}
        {err && <div className="py-10 text-center text-red-500">{err}</div>}

        {!loading && !err && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-slate-500 border-b border-slate-100">
                  <th className="pb-3 pl-2">Empresa</th>
                  <th className="pb-3">Estado</th>
                  <th className="pb-3">Fecha</th>
                  <th className="pb-3 text-right pr-2">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="py-3 pl-2 font-medium text-slate-800">
                        {r.company_name || r.company?.name || 'Empresa desconocida'}
                    </td>
                    <td className="py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold border ${
                            r.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            r.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' :
                            'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                            {STATUS_LABELS[r.status] || r.status}
                        </span>
                    </td>
                    <td className="py-3 text-slate-500">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-3 text-right pr-2">
                      <Link
                        to={`/dashboard/kyb/${r.id}`}
                        className="inline-flex items-center gap-1 text-brand font-semibold hover:underline"
                      >
                        Ver detalle
                        <i className="bi bi-arrow-right" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {!requests.length && (
                    <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-500">
                            No hay solicitudes {statusFilter ? `en estado "${statusFilter}"` : ''}.
                        </td>
                    </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
