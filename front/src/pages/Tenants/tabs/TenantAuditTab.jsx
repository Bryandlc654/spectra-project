import React, { useState, useEffect } from 'react';
import { useToast } from '../../../components/ToastProvider';

export default function TenantAuditTab({ api, companyId }) {
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, [companyId]);

  async function fetchLogs() {
    try {
      setLoading(true);
      const data = await api.get(`/api/tenants/${companyId}/logs`);
      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching logs:', error);
      toast.error('Error al cargar el registro de auditoría');
    } finally {
      setLoading(false);
    }
  }

  const handleExport = () => {
    if (!logs.length) return;
    
    const headers = ['Fecha', 'Acción', 'Usuario', 'Email', 'Descripción', 'IP'];
    const csvContent = [
      headers.join(','),
      ...logs.map(log => [
        `"${new Date(log.created_at).toLocaleString()}"`,
        `"${log.action}"`,
        `"${log.actor_name || 'Sistema'}"`,
        `"${log.actor_email || ''}"`,
        `"${(log.description || '').replace(/"/g, '""')}"`,
        `"${log.ip || ''}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `auditoria_${companyId}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Cargando registros...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-bold text-slate-800">Registro de Auditoría</h3>
            <div className="flex gap-2">
                <input type="text" placeholder="Filtrar logs..." className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-brand" />
                <button 
                  onClick={handleExport}
                  disabled={logs.length === 0}
                  className="text-sm font-semibold text-brand hover:underline disabled:text-slate-400 disabled:no-underline"
                >
                  Exportar
                </button>
            </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-semibold">
              <tr>
                <th className="px-6 py-3">Fecha</th>
                <th className="px-6 py-3">Acción</th>
                <th className="px-6 py-3">Usuario</th>
                <th className="px-6 py-3">Descripción</th>
                <th className="px-6 py-3">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-slate-500">
                    No hay registros de auditoría disponibles
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 font-medium text-slate-900">{log.action}</td>
                    <td className="px-6 py-3 text-slate-600">
                      {log.actor_name ? (
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900">{log.actor_name}</span>
                          <span className="text-xs text-slate-500">{log.actor_email}</span>
                        </div>
                      ) : (
                        <span className="italic text-slate-400">Sistema</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-slate-600">{log.description || '-'}</td>
                    <td className="px-6 py-3 text-slate-400 font-mono text-xs">{log.ip || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
