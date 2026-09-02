import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { createApi } from '../../lib/api';
import { useToast } from '../../components/ToastProvider';

export default function SupportUsersView({ apiUrl, token }) {
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  const toast = useToast();
  
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: 20,
        search
      });
      const res = await api.get(`/api/users/support-view?${params.toString()}`); 
      if (res.data) {
        setUsers(res.data);
        setTotalPages(res.meta?.last_page || 1);
      }
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  }, [api, page, search, toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = (e) => {
    if (e.key === 'Enter') {
        setPage(1);
        fetchUsers(); // Trigger fetch immediately on enter
    }
  };

  const handleResendInvite = async (userId) => {
    if (!confirm('¿Reenviar invitación a este usuario?')) return;
    try {
      await api.post(`/api/users/${userId}/send-password-reset`); // Using send-password-reset as invite mechanism for now or verify correct endpoint
      toast.success('Invitación reenviada');
    } catch (e) {
      toast.error('Error al reenviar invitación');
    }
  };

  const handleResetPassword = async (userId) => {
    if (!confirm('¿Forzar reset de contraseña para este usuario?')) return;
    try {
      await api.post(`/api/users/${userId}/send-password-reset`);
      toast.success('Solicitud de reset de contraseña enviada');
    } catch (e) {
      toast.error('Error al solicitar reset de contraseña');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Vista de Usuarios (Soporte)</h1>
        <p className="text-sm text-slate-500">Consulta estado y accesos de usuarios. Acciones limitadas.</p>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearch}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Usuario</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Rol</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Estado</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Acceso</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="5" className="p-8 text-center text-slate-500">Cargando usuarios...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan="5" className="p-8 text-center text-slate-500">No se encontraron usuarios</td></tr>
              ) : (
                users.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <div className="font-medium text-slate-900">{user.full_name}</div>
                      <div className="text-xs text-slate-500">{user.email}</div>
                    </td>
                    <td className="p-4">
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600">
                        {user.platform_role}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        user.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {user.status === 'active' ? 'Activo' : 'Bloqueado'}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="text-sm text-slate-600 capitalize">{user.auth_method}</div>
                      <div className="text-xs text-slate-400">
                        Último: {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : 'Nunca'}
                      </div>
                    </td>
                    <td className="p-4 text-right space-x-2">
                      <button 
                        onClick={() => handleResendInvite(user.id)}
                        className="text-xs font-medium text-brand hover:text-brand-dark px-2 py-1 rounded border border-brand/20 hover:bg-brand/5 transition"
                        title="Reenviar invitación"
                      >
                        Reenviar Inv.
                      </button>
                      <button 
                        onClick={() => handleResetPassword(user.id)}
                        className="text-xs font-medium text-amber-600 hover:text-amber-700 px-2 py-1 rounded border border-amber-200 hover:bg-amber-50 transition"
                        title="Reset contraseña"
                      >
                        Reset Pass
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
            <div className="flex flex-1 justify-between sm:hidden">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="relative inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Anterior</button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="relative ml-3 inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Siguiente</button>
            </div>
            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                    <p className="text-sm text-slate-700">
                        Página <span className="font-medium">{page}</span> de <span className="font-medium">{totalPages}</span>
                    </p>
                </div>
                <div>
                    <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                         <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="relative inline-flex items-center rounded-l-md px-2 py-2 text-slate-400 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50">
                            <span className="sr-only">Anterior</span>
                            <i className="bi bi-chevron-left h-5 w-5" aria-hidden="true"></i>
                        </button>
                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="relative inline-flex items-center rounded-r-md px-2 py-2 text-slate-400 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50">
                            <span className="sr-only">Siguiente</span>
                            <i className="bi bi-chevron-right h-5 w-5" aria-hidden="true"></i>
                        </button>
                    </nav>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}