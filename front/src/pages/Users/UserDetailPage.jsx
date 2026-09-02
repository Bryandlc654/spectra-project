import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { createApi } from '../../lib/api';
import ConfirmModal from '../../components/ConfirmModal';
import { useToast } from '../../components/ToastProvider';

function AddMembershipModal({ open, onClose, onAdd, apiUrl, token }) {
  const [loading, setLoading] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [form, setForm] = useState({ company_id: '', department: '', job_title: '' });
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  const toast = useToast();

  useEffect(() => {
    if (open && !tenants.length) {
      api.get('/api/tenants?per_page=100').then((res) => {
        const items = res.data?.data || res.data || [];
        setTenants(Array.isArray(items) ? items : []);
      }).catch(console.error);
    }
  }, [open, api, tenants.length]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await onAdd(form);
      onClose();
      setForm({ company_id: '', department: '', job_title: '' });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl p-5">
        <h3 className="text-lg font-bold mb-4">Agregar a empresa</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-slate-700">Empresa</label>
            <select
              required
              value={form.company_id}
              onChange={(e) => setForm({ ...form, company_id: e.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none"
            >
              <option value="">Selecciona una empresa</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.legal_name || t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700">Cargo (Job Title)</label>
            <input
              value={form.job_title}
              onChange={(e) => setForm({ ...form, job_title: e.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none"
              placeholder="Ej. Gerente de Ventas"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700">Departamento</label>
            <input
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none"
              placeholder="Ej. Comercial"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 rounded-xl">Cancelar</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-semibold text-white bg-brand hover:bg-brand/90 rounded-xl">Agregar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UserDetailPage({ apiUrl, token, defaultRole, roleScope }) {
  const { id } = useParams();
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  const toast = useToast();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  
  // Modals
  const [showAddMember, setShowAddMember] = useState(false);
  const [confirmInvalidate, setConfirmInvalidate] = useState(false);
  const [membershipToRemove, setMembershipToRemove] = useState(null);

  const [permissionsList, setPermissionsList] = useState(null);
  const [editingPermissions, setEditingPermissions] = useState(false);
  const [tempPermissions, setTempPermissions] = useState([]);

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const [userRes, permsRes] = await Promise.all([
        api.get(`/api/users/${id}`),
        api.get('/api/permissions')
      ]);

      const data = userRes.data || userRes;
      const permsData = permsRes.data || permsRes;
      setPermissionsList(permsData);

      // Normalizar respuesta si viene anidada { user: {...}, memberships: [], ... }
      if (data.user && typeof data.user === 'object') {
        setUser({
          ...data.user,
          memberships: data.memberships || [],
          active_sessions: data.active_sessions || [],
          identities: data.identities || [],
          recent_failed_logins: data.recent_failed_logins || [],
          // Helpers calculados
          active_sessions_count: data.active_sessions?.length || 0,
          failed_login_attempts: data.recent_failed_logins?.length || 0,
          global_permissions: data.user.global_permissions || []
        });
      } else {
        setUser({
            ...data,
            global_permissions: data.global_permissions || []
        });
      }
    } catch (e) {
      setErr(e.message || 'Error cargando usuario');
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePermissions() {
      try {
          await api.put(`/api/users/${id}`, {
              global_permissions: tempPermissions
          });
          toast.success('Permisos globales actualizados');
          setEditingPermissions(false);
          load();
      } catch (e) {
          toast.error(e.message || 'Error guardando permisos');
      }
  }

  function togglePermission(code) {
      if (tempPermissions.includes(code)) {
          setTempPermissions(tempPermissions.filter(p => p !== code));
      } else {
          setTempPermissions([...tempPermissions, code]);
      }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [id]);

  async function handleInvalidateSessions() {
    try {
      await api.post(`/api/users/${id}/invalidate-sessions`);
      toast.success('Sesiones invalidadas');
      setConfirmInvalidate(false);
      load(); // Reload to update active sessions count if API returns it
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function handleAddMembership(formData) {
    // POST /api/users/{uuid}/memberships
    // Body: { company_id, role, area }
    await api.post(`/api/users/${id}/memberships`, formData);
    await load();
  }

  async function handleRemoveMembership() {
    if (!membershipToRemove) return;
    
    try {
        // DELETE /api/users/{userId}/memberships/{membershipId}
        await api.del(`/api/users/${id}/memberships/${membershipToRemove}`);
        await load();
        toast.success('Usuario removido de la empresa');
        setMembershipToRemove(null);
    } catch (e) {
        toast.error('No se pudo remover: ' + (e.message || 'Error desconocido'));
    }
  }

  if (loading) return <div className="p-10 text-center text-slate-500">Cargando usuario...</div>;
  if (err) return <div className="p-10 text-center text-red-500">{err}</div>;
  if (!user) return <div className="p-10 text-center text-slate-500">Usuario no encontrado</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to={`/dashboard/${roleScope === 'internal' ? 'admins' : defaultRole === 'user' ? 'company-users' : 'users'}`} className="h-10 w-10 grid place-items-center rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600">
          <i className="bi bi-arrow-left" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">{user.full_name || user.name || 'Sin nombre'}</h1>
          <div className="text-sm text-slate-500">{user.email}</div>
        </div>
        <div className="ml-auto">
             <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold border ${
                user.status === 'active'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : user.status === 'locked'
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
            >
                {user.status}
            </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Info Card */}
        <div className="md:col-span-2 space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="font-bold text-slate-800 mb-4">Información Personal</h2>
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <div className="text-slate-500">Nombre</div>
                        <div className="font-medium">{user.full_name || user.name || '—'}</div>
                    </div>
                    <div>
                        <div className="text-slate-500">Email</div>
                        <div className="font-medium">{user.email}</div>
                    </div>
                    <div>
                        <div className="text-slate-500">Teléfono</div>
                        <div className="font-medium">{user.phone || '—'}</div>
                    </div>
                    <div>
                        <div className="text-slate-500">Rol de Plataforma</div>
                        <div className="font-medium">
                            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 capitalize">
                                {user.platform_role ? user.platform_role.replace('_', ' ') : 'User'}
                            </span>
                        </div>
                    </div>
                    <div>
                        <div className="text-slate-500">Creado el</div>
                        <div className="font-medium">{user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</div>
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold text-slate-800">Empresas vinculadas</h2>
                    <button 
                        onClick={() => setShowAddMember(true)}
                        className="text-xs font-bold text-brand hover:underline"
                    >
                        + Agregar a empresa
                    </button>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs uppercase tracking-widest text-slate-500 border-b border-slate-100">
                                <th className="pb-2">Empresa</th>
                                <th className="pb-2">Cargo / Dept</th>
                                <th className="pb-2">Permisos</th>
                                <th className="pb-2 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {(user.memberships || []).map(m => (
                                <tr key={m.id || m.company_id}>
                                    <td className="py-3 font-medium">{m.company?.legal_name || m.company?.name || m.company_name || 'Empresa desconocida'}</td>
                                    <td className="py-3">
                                        <div className="font-medium text-slate-700">{m.job_title || '—'}</div>
                                        <div className="text-xs text-slate-500">{m.department || '—'}</div>
                                    </td>
                                    <td className="py-3">
                                        {(m.roles || []).length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {m.roles.map(r => (
                                                    <span key={r.id} className="inline-flex items-center rounded-md bg-blue-50 text-blue-700 px-2 py-1 text-xs font-medium">
                                                        {r.name}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-slate-400 text-xs">—</span>
                                        )}
                                    </td>
                                    <td className="py-3 text-right">
                                        <button 
                                            onClick={() => {
                                                setMembershipToRemove(m.membership_id || m.id); // Ensure we grab the membership ID
                                            }}
                                            className="text-red-600 hover:text-red-800 text-xs font-semibold"
                                        >
                                            Remover
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {!(user.memberships || []).length && (
                                <tr>
                                    <td colSpan={4} className="py-4 text-center text-slate-500">No pertenece a ninguna empresa.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Global Overrides */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold text-slate-800">Overrides Globales (Permisos)</h2>
                    {!editingPermissions ? (
                         <button 
                            onClick={() => {
                                setTempPermissions(user.global_permissions || []);
                                setEditingPermissions(true);
                            }}
                            className="text-xs font-bold text-brand hover:underline"
                        >
                            Editar
                        </button>
                    ) : (
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => setEditingPermissions(false)}
                                className="text-xs font-bold text-slate-500 hover:underline"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleSavePermissions}
                                className="text-xs font-bold text-brand hover:underline"
                            >
                                Guardar
                            </button>
                        </div>
                    )}
                </div>

                {!permissionsList ? (
                    <div className="text-slate-500 text-sm">Cargando permisos...</div>
                ) : (
                    <div className="space-y-4">
                        {Object.entries(permissionsList).map(([module, perms]) => (
                            <div key={module}>
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{module}</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {perms.map(p => {
                                        const isGranted = editingPermissions 
                                            ? tempPermissions.includes(p.code)
                                            : (user.global_permissions || []).includes(p.code);
                                        
                                        return (
                                            <div 
                                                key={p.code} 
                                                className={`
                                                    flex items-start gap-2 p-2 rounded-lg border text-sm transition-colors
                                                    ${isGranted ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100'}
                                                    ${editingPermissions ? 'cursor-pointer hover:border-brand/50' : ''}
                                                `}
                                                onClick={() => editingPermissions && togglePermission(p.code)}
                                            >
                                                <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isGranted ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-300'}`}>
                                                    {isGranted && <i className="bi bi-check text-white text-xs" />}
                                                </div>
                                                <div>
                                                    <div className={`font-medium ${isGranted ? 'text-emerald-900' : 'text-slate-700'}`}>{p.code}</div>
                                                    <div className="text-xs text-slate-500">{p.description}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                         {Object.keys(permissionsList).length === 0 && (
                            <div className="text-slate-500 text-sm">No hay permisos definidos en el sistema.</div>
                        )}
                    </div>
                )}
            </div>
        </div>

        {/* Security Side Panel */}
        <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="font-bold text-slate-800 mb-4">Seguridad</h2>
                
                <div className="space-y-4">
                    <div>
                        <div className="text-xs text-slate-500 uppercase tracking-wider">Método de Auth</div>
                        <div className="mt-1 font-medium flex items-center gap-2">
                             {(user.identities && user.identities.length > 0) ? (
                               user.identities.map((id, idx) => (
                                 <span key={idx} className="flex items-center gap-1">
                                    {id.provider === 'google' && <i className="bi bi-google" />}
                                    {id.provider === 'microsoft' && <i className="bi bi-microsoft" />}
                                    <span className="capitalize">{id.provider}</span>
                                 </span>
                               ))
                             ) : user.has_password ? (
                               <span className="flex items-center gap-1">
                                 <i className="bi bi-key" />
                                 <span>Contraseña</span>
                               </span>
                             ) : (
                               <span>—</span>
                             )}
                        </div>
                    </div>

                    <div>
                        <div className="text-xs text-slate-500 uppercase tracking-wider">Intentos fallidos</div>
                        <div className="mt-1 font-medium text-red-600">
                            {user.failed_login_attempts || 0}
                        </div>
                    </div>

                    <div>
                         <div className="text-xs text-slate-500 uppercase tracking-wider">Sesiones Activas</div>
                         <div className="mt-1 font-medium">
                            {/* Assuming API returns active_sessions_count or similar */}
                            {user.active_sessions_count ?? '—'}
                         </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100">
                        <button 
                            onClick={() => setConfirmInvalidate(true)}
                            className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-100 transition"
                        >
                            Invalidar Sesiones
                        </button>
                    </div>
                </div>
            </div>
        </div>
      </div>

      <AddMembershipModal 
        open={showAddMember} 
        onClose={() => setShowAddMember(false)} 
        onAdd={handleAddMembership}
        apiUrl={apiUrl}
        token={token}
      />

      <ConfirmModal
        open={confirmInvalidate}
        title="Invalidar sesiones"
        message="¿Estás seguro de que deseas cerrar todas las sesiones activas de este usuario? Tendrá que volver a iniciar sesión."
        confirmText="Invalidar"
        onClose={() => setConfirmInvalidate(false)}
        onConfirm={handleInvalidateSessions}
        danger
      />

      <ConfirmModal
        open={!!membershipToRemove}
        title="Remover de empresa"
        message="¿Estás seguro de que deseas quitar al usuario de esta empresa? Perderá el acceso asociado."
        confirmText="Remover"
        onClose={() => setMembershipToRemove(null)}
        onConfirm={handleRemoveMembership}
        danger
      />
    </div>
  );
}
