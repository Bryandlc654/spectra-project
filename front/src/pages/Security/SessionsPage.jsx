import React, { useEffect, useState, useMemo } from 'react';
import { createApi } from '../../lib/api';

export default function SessionsPage({ apiUrl, token, currentUser }) {
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [revokingId, setRevokingId] = useState(null);

  const canRevokeGlobal = ['super_admin', 'security', 'admin'].includes(currentUser?.platform_role);

  // Pagination state
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [meta, setMeta] = useState({ total: 0, last_page: 1 });

  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line
  }, [page]);

  async function loadSessions() {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/security/sessions?page=${page}&per_page=${perPage}`);
      const data = res.data || res || {};
      
      if (data.data && Array.isArray(data.data)) {
        setSessions(data.data);
        setMeta(data.meta || { total: data.data.length, last_page: 1 });
      } else if (Array.isArray(data)) {
        setSessions(data);
        setMeta({ total: data.length, last_page: 1 });
      } else {
        setSessions([]);
      }
    } catch (e) {
      setError(e.message || 'Error cargando sesiones');
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(id) {
    if (!confirm('¿Estás seguro de que deseas revocar esta sesión? El usuario será desconectado.')) return;
    
    setRevokingId(id);
    try {
      await api.post(`/api/security/sessions/${id}/revoke`);
      // Reload or update local state
      setSessions(prev => prev.map(s => s.id === id ? { ...s, is_active: 0 } : s));
    } catch (e) {
      alert('Error revocando sesión: ' + e.message);
    } finally {
      setRevokingId(null);
    }
  }

  async function handleRevokeAll() {
    if (!confirm('¿ATENCIÓN: Estás seguro de que deseas revocar TODAS las sesiones activas del sistema? Todos los usuarios serán desconectados.')) return;
    
    try {
      setLoading(true);
      await api.post(`/api/security/sessions/revoke-all`);
      alert('Todas las sesiones han sido revocadas.');
      loadSessions();
    } catch (e) {
      alert('Error revocando sesiones: ' + e.message);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
            <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase">Seguridad</div>
            <h1 className="text-xl font-bold">Sesiones Activas</h1>
            <p className="text-sm text-slate-600">Monitoreo y control de sesiones de usuarios en la plataforma.</p>
        </div>
        {canRevokeGlobal && (
            <button 
                onClick={handleRevokeAll}
                className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors border border-red-100"
            >
                <i className="bi bi-radioactive"></i>
                Revocar Todo
            </button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500">
                    <tr>
                        <th className="px-6 py-3">Usuario</th>
                        <th className="px-6 py-3">IP / Dispositivo</th>
                        <th className="px-6 py-3">Última Actividad</th>
                        <th className="px-6 py-3">Estado</th>
                        <th className="px-6 py-3 text-right">Acciones</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {loading && (
                        <tr>
                            <td colSpan="5" className="px-6 py-10 text-center text-slate-500">
                                <div className="flex flex-col items-center gap-2">
                                    <div className="w-6 h-6 border-2 border-slate-200 border-t-brand rounded-full animate-spin"></div>
                                    <span className="text-sm">Cargando sesiones...</span>
                                </div>
                            </td>
                        </tr>
                    )}
                    
                    {!loading && error && (
                        <tr>
                            <td colSpan="5" className="px-6 py-10 text-center text-red-500">
                                <i className="bi bi-exclamation-triangle mr-2"></i>
                                {error}
                            </td>
                        </tr>
                    )}

                    {!loading && !error && sessions.length === 0 && (
                        <tr>
                            <td colSpan="5" className="px-6 py-10 text-center text-slate-500">
                                <div className="flex flex-col items-center gap-2">
                                    <i className="bi bi-shield-check text-2xl text-slate-300"></i>
                                    <span>No se encontraron sesiones activas.</span>
                                </div>
                            </td>
                        </tr>
                    )}
                    
                    {!loading && sessions.map(session => (
                        <tr key={session.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="px-6 py-4">
                                <div className="font-medium text-slate-900">{session.user_name || 'Desconocido'}</div>
                                <div className="text-xs text-slate-500">{session.user_email}</div>
                            </td>
                            <td className="px-6 py-4">
                                <div className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded w-fit mb-1">
                                    {session.ip_address || 'IP Oculta'}
                                </div>
                                <div className="text-xs text-slate-500 truncate max-w-[200px]" title={session.user_agent}>
                                    {session.user_agent || 'N/A'}
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <div className="text-sm text-slate-700">
                                    {session.last_activity ? new Date(session.last_activity).toLocaleString() : '—'}
                                </div>
                                <div className="text-xs text-slate-400">
                                    Creada: {new Date(session.created_at).toLocaleDateString()}
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                                    session.is_active == 1 
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                        : 'bg-slate-50 text-slate-600 border-slate-200'
                                }`}>
                                    {session.is_active == 1 ? 'Activa' : 'Revocada'}
                                </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                                {(canRevokeGlobal || session.user_id === currentUser?.id) && session.is_active == 1 && (
                                    <button
                                        onClick={() => handleRevoke(session.id)}
                                        disabled={revokingId === session.id}
                                        className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50 transition-colors"
                                    >
                                        {revokingId === session.id ? 'Revocando...' : 'Revocar'}
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
        
        {/* Pagination */}
        {meta.last_page > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
                <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                >
                    Anterior
                </button>
                <span className="text-sm text-slate-600">
                    Página <span className="font-semibold text-slate-900">{page}</span> de <span className="font-semibold text-slate-900">{meta.last_page}</span>
                </span>
                <button
                    onClick={() => setPage(p => Math.min(meta.last_page, p + 1))}
                    disabled={page === meta.last_page}
                    className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                >
                    Siguiente
                </button>
            </div>
        )}
      </div>
    </div>
  );
}
