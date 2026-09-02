import React, { useEffect, useMemo, useState } from 'react';
import { createApi } from '../../lib/api';
import { normalizePageResponse } from '../../lib/pagination';
import { useToast } from '../../components/ToastProvider';

export default function AuditLogsPage({ apiUrl, token }) {
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  const toast = useToast();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ page: 1, perPage: 50, total: 0, totalPages: 1 });
  
  const [userId, setUserId] = useState(''); // Filtro opcional

  useEffect(() => {
    load(page);
    // eslint-disable-next-line
  }, [page]);

  async function load(nextPage) {
    setLoading(true);
    setErr('');
    try {
      // GET /audit?page=...&user_id=...
      const params = new URLSearchParams();
      params.set('page', String(nextPage));
      if (userId.trim()) params.set('user_id', userId.trim());

      const res = await api.get(`/api/audit?${params.toString()}`);
      const out = normalizePageResponse(res);
      setLogs(out.items);
      setMeta(out.meta);
    } catch (e) {
      setErr(e.message || 'Error cargando logs de auditoría');
    } finally {
      setLoading(false);
    }
  }

  function handleFilter(e) {
      e.preventDefault();
      setPage(1);
      load(1);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (userId.trim()) params.set('user_id', userId.trim());

      const res = await fetch(`${apiUrl}/api/audit/export?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error('Error al exportar');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Exportación completada');
    } catch (e) {
      toast.error(e.message || 'Error al exportar');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase">Seguridad</div>
        <h1 className="text-xl font-bold">Logs de Auditoría</h1>
        <p className="text-sm text-slate-600">Registro histórico de acciones críticas en el sistema.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <form onSubmit={handleFilter} className="flex gap-2">
              <input 
                  value={userId}
                  onChange={e => setUserId(e.target.value)}
                  placeholder="Filtrar por User ID..."
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-brand/20 focus:border-brand w-64"
              />
              <button 
                  type="submit"
                  disabled={loading}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                  Filtrar
              </button>
          </form>

          <button
            onClick={handleExport}
            disabled={exporting || loading}
            className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-70 transition"
          >
            {exporting ? (
              <>
                <i className="bi bi-arrow-clockwise animate-spin" /> Exportando...
              </>
            ) : (
              <>
                <i className="bi bi-download" /> Exportar CSV
              </>
            )}
          </button>
        </div>

        {loading && <div className="py-10 text-center text-slate-500">Cargando logs...</div>}
        {err && <div className="py-10 text-center text-red-500">{err}</div>}

        {!loading && !err && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-slate-500 border-b border-slate-100">
                  <th className="pb-3 pl-2">Fecha</th>
                  <th className="pb-3">Actor</th>
                  <th className="pb-3">Acción</th>
                  <th className="pb-3">Detalles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/60">
                    <td className="py-3 pl-2 text-slate-500 font-mono text-xs">
                        {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                    </td>
                    <td className="py-3 font-medium text-slate-800">
                        {log.actor_name || log.user?.name || log.user_id || 'Sistema'}
                    </td>
                    <td className="py-3">
                        <span className="inline-flex items-center rounded px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            {log.action}
                        </span>
                    </td>
                    <td className="py-3 text-slate-500 max-w-md truncate" title={JSON.stringify(log.details)}>
                        {log.details ? JSON.stringify(log.details).slice(0, 60) + (JSON.stringify(log.details).length > 60 ? '...' : '') : '—'}
                    </td>
                  </tr>
                ))}
                {!logs.length && (
                    <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-500">
                            No se encontraron registros.
                        </td>
                    </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
          <div className="text-xs text-slate-500">
            Total: <span className="font-semibold text-slate-700">{meta.total}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={loading || meta.page <= 1}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Anterior
            </button>
            <div className="text-sm text-slate-700">
              {meta.page} / {meta.totalPages}
            </div>
            <button
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={loading || meta.page >= meta.totalPages}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
