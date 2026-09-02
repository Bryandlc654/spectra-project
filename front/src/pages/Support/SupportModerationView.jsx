import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createApi } from '../../lib/api';
import { useToast } from '../../components/ToastProvider';

export default function SupportModerationView({ apiUrl, token }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const toast = useToast();

  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: 20,
        status: statusFilter
      });
      const res = await api.get(`/api/moderation?${params.toString()}`);
      if (res.data) {
        setReports(res.data);
        setTotalPages(res.meta?.last_page || 1);
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar reportes de moderación');
    } finally {
      setLoading(false);
    }
  }, [api, page, statusFilter, toast]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleAction = async (action, reportId) => {
    // For now, we use prompt for reason/notes. In a real app, we'd use a modal.
    const notes = prompt(`Notas para ${action}:`);
    if (notes === null) return; // Cancelled

    let actionKey = null;
    let status = 'resolved';

    if (action === 'Flag') {
      actionKey = 'flagged';
      status = 'investigating';
    } else if (action === 'Bloqueo Temporal') {
      actionKey = 'block_user'; // or block_company depending on context, but simplistic for now
    } else if (action === 'Escalar') {
      actionKey = 'escalated';
      status = 'investigating';
    } else if (action === 'Dismiss') {
      status = 'dismissed';
      actionKey = 'dismissed';
    }

    try {
      await api.put(`/api/moderation/${reportId}`, {
        status,
        action_taken: actionKey,
        admin_notes: notes
      });
      toast.success('Acción aplicada correctamente');
      fetchReports();
    } catch (err) {
      console.error(err);
      toast.error('Error al aplicar acción');
    }
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'open': return 'bg-red-50 text-red-700';
      case 'investigating': return 'bg-amber-50 text-amber-700';
      case 'resolved': return 'bg-emerald-50 text-emerald-700';
      case 'dismissed': return 'bg-slate-100 text-slate-500';
      default: return 'bg-slate-50 text-slate-600';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Moderación Básica</h1>
          <p className="text-sm text-slate-500">Gestión de reportes, flags y bloqueos temporales.</p>
        </div>
        <div className="flex gap-2">
           <select 
             className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
             value={statusFilter}
             onChange={(e) => setStatusFilter(e.target.value)}
           >
             <option value="">Todos los estados</option>
             <option value="open">Abiertos</option>
             <option value="investigating">Investigando</option>
             <option value="resolved">Resueltos</option>
             <option value="dismissed">Descartados</option>
           </select>
           <button onClick={fetchReports} className="p-2 text-slate-500 hover:text-brand">
             <i className="bi bi-arrow-clockwise"></i>
           </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 font-medium text-slate-900 flex justify-between">
            <span>Reportes Recientes</span>
            {loading && <span className="text-xs text-slate-400">Cargando...</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-xs text-slate-500 uppercase">
                <th className="p-4 font-semibold">Objetivo</th>
                <th className="p-4 font-semibold">Motivo</th>
                <th className="p-4 font-semibold">Reportado Por</th>
                <th className="p-4 font-semibold">Estado</th>
                <th className="p-4 font-semibold">Notas Admin</th>
                <th className="p-4 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.length === 0 && !loading ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-500">No hay reportes encontrados.</td>
                </tr>
              ) : (
                reports.map(report => (
                  <tr key={report.id} className="hover:bg-slate-50">
                    <td className="p-4 font-medium text-slate-900">
                      <div>{report.target_name || report.target_id}</div>
                      <div className="text-xs text-slate-500 uppercase">{report.target_type}</div>
                    </td>
                    <td className="p-4 text-slate-600 max-w-xs truncate" title={report.reason}>
                        {report.reason}
                    </td>
                    <td className="p-4 text-sm text-slate-500">
                        {report.reporter_name || 'Anónimo'}
                        <div className="text-xs text-slate-400">{new Date(report.created_at).toLocaleDateString()}</div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(report.status)}`}>
                        {report.status}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-slate-500 max-w-xs truncate">
                        {report.admin_notes}
                    </td>
                    <td className="p-4 text-right space-x-2">
                      {report.status !== 'resolved' && report.status !== 'dismissed' && (
                        <>
                            <button 
                                onClick={() => handleAction('Flag', report.id)}
                                className="text-xs font-medium text-amber-600 hover:bg-amber-50 px-3 py-1.5 rounded border border-amber-200 transition"
                                title="Marcar como investigando"
                            >
                                <i className="bi bi-flag"></i>
                            </button>
                            <button 
                                onClick={() => handleAction('Bloqueo Temporal', report.id)}
                                className="text-xs font-medium text-slate-600 hover:bg-slate-100 px-3 py-1.5 rounded border border-slate-200 transition"
                                title="Bloquear usuario/empresa"
                            >
                                <i className="bi bi-slash-circle"></i>
                            </button>
                            <button 
                                onClick={() => handleAction('Escalar', report.id)}
                                className="text-xs font-medium text-brand hover:bg-brand/5 px-3 py-1.5 rounded border border-brand/20 transition"
                                title="Escalar a legal/superior"
                            >
                                <i className="bi bi-box-arrow-up-right"></i>
                            </button>
                             <button 
                                onClick={() => handleAction('Dismiss', report.id)}
                                className="text-xs font-medium text-slate-400 hover:bg-slate-50 px-3 py-1.5 rounded border border-slate-200 transition"
                                title="Descartar reporte"
                            >
                                <i className="bi bi-x-lg"></i>
                            </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
         {/* Pagination */}
         {totalPages > 1 && (
            <div className="flex justify-center p-4 border-t border-slate-100">
                <button 
                    disabled={page === 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="px-3 py-1 text-sm text-slate-600 disabled:opacity-50"
                >
                    Anterior
                </button>
                <span className="px-3 py-1 text-sm text-slate-600">
                    Página {page} de {totalPages}
                </span>
                <button 
                    disabled={page === totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    className="px-3 py-1 text-sm text-slate-600 disabled:opacity-50"
                >
                    Siguiente
                </button>
            </div>
        )}
      </div>
    </div>
  );
}
