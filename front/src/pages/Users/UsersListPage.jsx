import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createApi } from '../../lib/api';
import { normalizePageResponse } from '../../lib/pagination';
import { useToast } from '../../components/ToastProvider';
import ConfirmModal from '../../components/ConfirmModal';
import { PLATFORM_ROLES, ROLE_LABELS } from '../../lib/platformRoles';

export default function UsersListPage({ apiUrl, token, defaultRole, roleScope }) {
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 10;

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, perPage, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // Create User
  const [openCreate, setOpenCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    full_name: '',
    email: '',
    password: '',
    platform_role: defaultRole || (roleScope === 'internal' ? PLATFORM_ROLES.ADMIN : 'user'),
  });
  const [creating, setCreating] = useState(false);

  // Acciones rápidas
  const [actionLoading, setActionLoading] = useState(null); // ID del usuario siendo procesado
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'block' | 'reset', user: ... }

  useEffect(() => {
    if (defaultRole) {
      setCreateForm(prev => ({ ...prev, platform_role: defaultRole }));
    }
  }, [defaultRole]);

  async function load(nextPage = page) {
    setLoading(true);
    setErr('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(nextPage));
      params.set('per_page', String(perPage));
      if (search.trim()) params.set('q', search.trim());
      if (status) params.set('status', status);
      if (type) params.set('auth_method', type);
      if (defaultRole) {
        params.set('platform_role', defaultRole);
      }
      if (roleScope) {
        params.set('role_scope', roleScope);
      }

      const data = await api.get(`/api/users?${params.toString()}`);
      const out = normalizePageResponse(data);
      
      // Client-side filtering if needed (though backend handles role_scope now)
      let filteredItems = out.items;
      if (defaultRole) {
        filteredItems = filteredItems.filter(u => u.platform_role === defaultRole);
      }
      
      setRows(filteredItems);
      setMeta(out.meta);
    } catch (e) {
      setErr(e.message || 'Error cargando usuarios');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(page);
    // eslint-disable-next-line
  }, [page, defaultRole, roleScope]);

  function applyFilters() {
    setPage(1);
    load(1);
  }

  function handleExport() {
    const params = new URLSearchParams();
    if (search.trim()) params.set('q', search.trim());
    if (status) params.set('status', status);
    if (type) params.set('auth_method', type);
    if (defaultRole) params.set('platform_role', defaultRole);
    if (roleScope) params.set('role_scope', roleScope);
    
    const url = `${apiUrl}/api/users/export?${params.toString()}`;
    window.open(url, '_blank');
  }

  function handleExportCompanyAdmins() {
    const params = new URLSearchParams();
    if (search.trim()) params.set('q', search.trim());
    const url = `${apiUrl}/api/users/company-admins/export?${params.toString()}`;
    window.open(url, '_blank');
  }

  async function toggleBlock() {
    if (!confirmAction?.user) return;
    const user = confirmAction.user;

    setActionLoading(user.id);
    try {
      if (user.status === 'locked') {
         await api.post(`/api/users/${user.id}/unblock`); 
      } else {
         await api.post(`/api/users/${user.id}/block`);
      }
      await load();
      toast.success(`Usuario ${user.status === 'locked' ? 'desbloqueado' : 'bloqueado'} correctamente`);
      setConfirmAction(null);
    } catch (e) {
      toast.error(e.message || 'Error al actualizar estado');
    } finally {
      setActionLoading(null);
    }
  }

  async function resetSessions() {
    if (!confirmAction?.user) return;
    const user = confirmAction.user;

    setActionLoading(user.id);
    try {
      await api.post(`/api/users/${user.id}/invalidate-sessions`);
      toast.success('Sesiones invalidadas correctamente');
      await load();
      setConfirmAction(null);
    } catch (e) {
      toast.error(e.message || 'Error al invalidar sesiones');
    } finally {
      setActionLoading(null);
    }
  }

  async function sendPasswordReset() {
    if (!confirmAction?.user) return;
    const user = confirmAction.user;

    setActionLoading(user.id);
    try {
      await api.post(`/api/users/${user.id}/send-password-reset`);
      toast.success('Correo de restablecimiento enviado correctamente');
      setConfirmAction(null);
    } catch (e) {
      toast.error(e.message || 'Error al enviar correo');
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteUser() {
    if (!confirmAction?.user) return;
    const user = confirmAction.user;

    setActionLoading(user.id);
    try {
      await api.delete(`/api/users/${user.id}`);
      toast.success('Usuario eliminado correctamente');
      await load();
      setConfirmAction(null);
    } catch (e) {
      toast.error(e.message || 'Error al eliminar usuario');
    } finally {
      setActionLoading(null);
    }
  }

  async function createUser(e) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post('/api/users', createForm);
      setOpenCreate(false);
      setCreateForm({ 
        full_name: '', 
        email: '', 
        password: '', 
        platform_role: defaultRole || (roleScope === 'internal' ? PLATFORM_ROLES.ADMIN : 'user') 
      });
      toast.success('Usuario creado correctamente');
      load(1);
    } catch (e) {
      toast.error(e.message || 'Error creando usuario');
    } finally {
      setCreating(false);
    }
  }

  const getPageTitle = () => {
    if (defaultRole === 'admin') return 'Administradores';
    if (defaultRole === 'user') return 'Usuarios de Empresa';
    if (roleScope === 'internal') return 'Usuarios de Plataforma';
    return 'Usuarios Globales';
  };

  const getCreateButtonText = () => {
    if (defaultRole === 'admin') return 'Nuevo Administrador';
    if (defaultRole === 'user') return 'Nuevo Usuario';
    if (roleScope === 'internal') return 'Nuevo Usuario Interno';
    return 'Nuevo Usuario';
  };

  const internalRoles = [
    PLATFORM_ROLES.SUPER_ADMIN,
    PLATFORM_ROLES.ADMIN,
    PLATFORM_ROLES.SUPPORT,
    PLATFORM_ROLES.FINANCE,
    PLATFORM_ROLES.LEGAL,
    PLATFORM_ROLES.SECURITY,
    PLATFORM_ROLES.COMPANY_ADMIN
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{getPageTitle()}</h1>
        <div className="flex items-center gap-3">
          {roleScope === 'internal' && (
            <button
              onClick={handleExportCompanyAdmins}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all"
            >
              <i className="bi bi-people" />
              Exportar Company Admins
            </button>
          )}
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all"
          >
            <i className="bi bi-download" />
            Exportar
          </button>
          <button
            onClick={() => setOpenCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand/90 shadow-sm shadow-brand-500/20 transition-all"
          >
            <i className="bi bi-plus-lg" />
            {getCreateButtonText()}
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-1 gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-semibold text-slate-600">Buscar</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre o email"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
              />
            </div>
            <div className="w-40">
              <label className="text-xs font-semibold text-slate-600">Estado</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
              >
                <option value="">Todos</option>
                <option value="active">Activo</option>
                <option value="locked">Bloqueado</option>
                <option value="suspended">Suspendido</option>
              </select>
            </div>
            <div className="w-40">
              <label className="text-xs font-semibold text-slate-600">Tipo Auth</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
              >
                <option value="">Todos</option>
                <option value="password">Password</option>
                <option value="sso">SSO</option>
              </select>
            </div>
          </div>

          <button
            onClick={applyFilters}
            disabled={loading}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            type="button"
          >
            Aplicar
          </button>
        </div>

        {err ? (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {err}
          </div>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-slate-500">
                <th className="py-3 px-2">Usuario</th>
                <th className="py-3 px-2">Estado</th>
                <th className="py-3 px-2">Rol</th>
                <th className="py-3 px-2">Auth</th>
                {roleScope !== 'internal' && <th className="py-3 px-2 text-center">Empresas</th>}
                <th className="py-3 px-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="py-3 px-2">
                    <div className="font-semibold text-slate-900">{r.name}</div>
                    <div className="text-xs text-slate-500">{r.email}</div>
                  </td>
                  <td className="py-3 px-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold border ${
                        r.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : r.status === 'locked'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="py-3 px-2">
                     <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                       {ROLE_LABELS[r.platform_role] || r.platform_role}
                     </span>
                  </td>
                  <td className="py-3 px-2">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                      {r.auth_method === 'google' && <i className="bi bi-google" />}
                      {r.auth_method === 'microsoft' && <i className="bi bi-microsoft" />}
                      {r.auth_method === 'password' && <i className="bi bi-key" />}
                      {r.auth_method || '—'}
                    </span>
                  </td>
                  {roleScope !== 'internal' && (
                    <td className="py-3 px-2 text-center font-medium text-slate-700">
                      {r.companies_count ?? r.memberships_count ?? '—'}
                    </td>
                  )}
                  <td className="py-3 px-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/dashboard/${roleScope === 'internal' ? 'admins' : defaultRole === 'user' ? 'company-users' : 'users'}/${r.id}`}
                        className="p-2 text-slate-500 hover:text-brand hover:bg-brand/10 rounded-lg transition"
                        title="Ver detalle"
                      >
                        <i className="bi bi-eye" />
                      </Link>
                      
                      <button
                        onClick={() => setConfirmAction({ type: 'block', user: r })}
                        disabled={actionLoading === r.id}
                        className={`p-2 rounded-lg transition ${
                          r.status === 'locked' 
                            ? 'text-emerald-600 hover:bg-emerald-50' 
                            : 'text-amber-600 hover:bg-amber-50'
                        }`}
                        title={r.status === 'locked' ? 'Desbloquear' : 'Bloquear'}
                      >
                        <i className={`bi ${r.status === 'locked' ? 'bi-unlock' : 'bi-lock'}`} />
                      </button>

                      <button
                        onClick={() => setConfirmAction({ type: 'reset_password', user: r })}
                        disabled={actionLoading === r.id}
                        className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition"
                        title="Enviar reset password"
                      >
                        <i className="bi bi-envelope" />
                      </button>

                      <button
                        onClick={() => setConfirmAction({ type: 'reset', user: r })}
                        disabled={actionLoading === r.id}
                        className="p-2 text-orange-500 hover:bg-orange-50 rounded-lg transition"
                        title="Cerrar sesiones"
                      >
                        <i className="bi bi-power" />
                      </button>

                      <button
                        onClick={() => setConfirmAction({ type: 'delete', user: r })}
                        disabled={actionLoading === r.id}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
                        title="Eliminar usuario"
                      >
                        <i className="bi bi-trash" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!rows.length && !loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    No se encontraron usuarios.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Total: <span className="font-semibold text-slate-700">{meta.total}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={loading || meta.page <= 1}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              type="button"
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
              type="button"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
      {/* Modal Crear Usuario */}
      {openCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setOpenCreate(false)} />
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-lg font-bold text-slate-900">{getCreateButtonText()}</h3>
              <button onClick={() => setOpenCreate(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
                <i className="bi bi-x-lg" />
              </button>
            </div>
            
            <form onSubmit={createUser} className="p-6 space-y-4">
              <div>
                <label className="text-sm font-semibold text-slate-700">Nombre Completo</label>
                <input
                  required
                  value={createForm.full_name}
                  onChange={e => setCreateForm(p => ({ ...p, full_name: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
                  placeholder="Ej. Juan Pérez"
                />
              </div>
              
              <div>
                <label className="text-sm font-semibold text-slate-700">Correo Electrónico</label>
                <input
                  required
                  type="email"
                  value={createForm.email}
                  onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
                  placeholder="usuario@empresa.com"
                />
              </div>
              
              <div>
                <label className="text-sm font-semibold text-slate-700">Contraseña Temporal</label>
                <input
                  required
                  type="password"
                  value={createForm.password}
                  onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
                  placeholder="••••••••"
                  minLength={8}
                />
                <p className="mt-1 text-xs text-slate-500">Mínimo 8 caracteres, incluye mayúsculas y números.</p>
              </div>

              {/* Show Role Selector if !defaultRole OR roleScope === 'internal' */}
              {(!defaultRole || roleScope === 'internal') && (
                <div>
                  <label className="text-sm font-semibold text-slate-700">Rol de Plataforma</label>
                  <select
                    value={createForm.platform_role}
                    onChange={e => setCreateForm(p => ({ ...p, platform_role: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
                  >
                    {roleScope === 'internal' ? (
                       internalRoles.map(role => (
                          <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                       ))
                    ) : (
                      <>
                        <option value="user">Usuario (Estándar)</option>
                        <option value="admin">Administrador (SaaS)</option>
                        <option value="company_admin">Admin Empresa</option>
                        <option value="freelancer">Freelancer</option>
                      </>
                    )}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    {roleScope === 'internal' 
                      ? 'Asigna un rol de gestión de plataforma.' 
                      : '"Administrador" tiene acceso total a la gestión de tenants. "Usuario" solo ve sus empresas asignadas.'}
                  </p>
                </div>
              )}

              <div className="pt-2">
                <button
                  disabled={creating}
                  className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white hover:bg-brand/90 disabled:opacity-70 transition-all shadow-sm shadow-brand-500/20"
                >
                  {creating ? 'Creando...' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ConfirmModal
        open={confirmAction?.type === 'block'}
        title={confirmAction?.user?.status === 'locked' ? 'Desbloquear Usuario' : 'Bloquear Usuario'}
        message={`¿Estás seguro de que deseas ${confirmAction?.user?.status === 'locked' ? 'desbloquear' : 'bloquear'} a ${confirmAction?.user?.name}?`}
        confirmText={confirmAction?.user?.status === 'locked' ? 'Desbloquear' : 'Bloquear'}
        onClose={() => setConfirmAction(null)}
        onConfirm={toggleBlock}
        loading={actionLoading === confirmAction?.user?.id}
        danger={confirmAction?.user?.status !== 'locked'}
      />

      <ConfirmModal
        open={confirmAction?.type === 'reset'}
        title="Cerrar sesiones"
        message={`¿Estás seguro de cerrar todas las sesiones activas de ${confirmAction?.user?.name}?`}
        confirmText="Cerrar sesiones"
        onClose={() => setConfirmAction(null)}
        onConfirm={resetSessions}
        loading={actionLoading === confirmAction?.user?.id}
        danger
      />

      <ConfirmModal
        open={confirmAction?.type === 'reset_password'}
        title="Enviar Reset Password"
        message={`¿Enviar correo de restablecimiento de contraseña a ${confirmAction?.user?.name}?`}
        confirmText="Enviar Correo"
        onClose={() => setConfirmAction(null)}
        onConfirm={sendPasswordReset}
        loading={actionLoading === confirmAction?.user?.id}
      />

      <ConfirmModal
        open={confirmAction?.type === 'delete'}
        title="Eliminar Usuario"
        message={`¿Estás seguro de que deseas eliminar a ${confirmAction?.user?.name}? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        onClose={() => setConfirmAction(null)}
        onConfirm={deleteUser}
        loading={actionLoading === confirmAction?.user?.id}
        danger
      />
    </div>
  );
}
