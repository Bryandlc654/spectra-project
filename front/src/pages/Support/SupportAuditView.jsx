import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createApi } from '../../lib/api';
import { useToast } from '../../components/ToastProvider';
import { 
  RefreshCw as ArrowPathIcon, 
  ChevronLeft as ChevronLeftIcon, 
  ChevronRight as ChevronRightIcon,
  Download as ArrowDownTrayIcon 
} from 'lucide-react';

export default function SupportAuditView({ apiUrl, token }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [filters, setFilters] = useState({
    action: '',
    user_id: '',
    company_id: ''
  });
  const toast = useToast();

  const api = useMemo(() => createApi(apiUrl, token), [apiUrl, token]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: 20,
        ...filters
      });
      // Remove empty filters
      ['action', 'user_id', 'company_id'].forEach(key => {
        if (!filters[key]) params.delete(key);
      });

      const res = await api.get(`/api/audit?${params.toString()}`);
      if (res.data) {
        setLogs(res.data);
        if (res.meta) {
          setTotalPages(res.meta.last_page);
          setTotalRecords(res.meta.total);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar logs de auditoría');
    } finally {
      setLoading(false);
    }
  }, [api, page, toast, filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setPage(1); // Reset to first page on filter change
  };

  const handleExport = () => {
    try {
       // Since export is a file download, we use window.open
       // We need to append the token manually if not using cookies, 
       // but typically API expects Authorization header. 
       // If the export endpoint requires Bearer token in header, window.open won't work easily.
       // However, many simple implementations accept token in query string for exports.
       // Let's assume we can pass ?token=... or if it uses cookie session.
       // Since we use Bearer token in this app, we might need a workaround or assume the backend accepts it in query.
       // The backend code I saw earlier:
       // $userId = $_GET['user_id'] ?? null;
       // It doesn't seem to explicitly check token in query for Auth::require unless configured.
       // Auth::require uses `self::bearerToken()`.
       
       // Let's check `Auth::bearerToken()` implementation.
       // Usually it checks headers.
       // If window.open is used, headers are not sent.
       // I might need to use `api.get` with `responseType: 'blob'` and create a download link.
       
       api.get('/api/audit/export', { responseType: 'blob' })
        .then((response) => {
            const url = window.URL.createObjectURL(new Blob([response]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `audit_logs_${new Date().toISOString()}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        })
        .catch(() => {
            toast.error('Error al descargar el archivo');
        });

    } catch (err) {
        toast.error('Error al exportar logs');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-2xl font-bold text-slate-900">Auditoría (Lectura)</h1>
            <p className="text-sm text-slate-500">Logs de actividad relacionados a soporte y accesos básicos.</p>
        </div>
        <div className="flex gap-2">
            <button
                onClick={fetchLogs}
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                title="Recargar"
            >
                <ArrowPathIcon className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
                <ArrowDownTrayIcon className="h-4 w-4" />
                Exportar CSV
            </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Filters */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex gap-4 flex-wrap">
            <input
                type="text"
                name="action"
                placeholder="Filtrar por Acción (ej. login)"
                value={filters.action}
                onChange={handleFilterChange}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
                type="text"
                name="user_id"
                placeholder="ID de Usuario"
                value={filters.user_id}
                onChange={handleFilterChange}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
                type="text"
                name="company_id"
                placeholder="ID de Compañía"
                value={filters.company_id}
                onChange={handleFilterChange}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-xs text-slate-500 uppercase">
                <th className="p-4 font-semibold">Fecha</th>
                <th className="p-4 font-semibold">Actor</th>
                <th className="p-4 font-semibold">Acción</th>
                <th className="p-4 font-semibold">Objeto</th>
                <th className="p-4 font-semibold">IP</th>
                <th className="p-4 font-semibold">Detalles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                    <td colSpan="6" className="p-8 text-center text-slate-500">
                        Cargando logs...
                    </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                    <td colSpan="6" className="p-8 text-center text-slate-500">
                        No se encontraron registros de auditoría.
                    </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50 text-sm">
                    <td className="p-4 text-slate-500 whitespace-nowrap">{log.created_at}</td>
                    <td className="p-4 font-medium text-slate-900">
                        <div className="flex flex-col">
                            <span>{log.actor_name || 'Sistema'}</span>
                            <span className="text-xs text-slate-400">{log.actor_email}</span>
                        </div>
                    </td>
                    <td className="p-4 text-slate-700 font-medium">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                            {log.action}
                        </span>
                    </td>
                    <td className="p-4 text-slate-600">
                        {log.object_type && (
                            <div className="flex flex-col">
                                <span className="uppercase text-xs font-bold text-slate-500">{log.object_type}</span>
                                <span className="font-mono text-xs">{log.object_id}</span>
                            </div>
                        )}
                    </td>
                    <td className="p-4 font-mono text-xs text-slate-500">{log.ip}</td>
                    <td className="p-4 text-slate-600 max-w-xs truncate" title={JSON.stringify(log.metadata, null, 2)}>
                        {log.description || JSON.stringify(log.metadata)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="flex-1 flex justify-between sm:hidden">
                <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                    Anterior
                </button>
                <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                    Siguiente
                </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                    <p className="text-sm text-gray-700">
                        Mostrando página <span className="font-medium">{page}</span> de <span className="font-medium">{totalPages}</span> ({totalRecords} resultados)
                    </p>
                </div>
                <div>
                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                        >
                            <span className="sr-only">Anterior</span>
                            <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
                        </button>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                        >
                            <span className="sr-only">Siguiente</span>
                            <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
                        </button>
                    </nav>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
