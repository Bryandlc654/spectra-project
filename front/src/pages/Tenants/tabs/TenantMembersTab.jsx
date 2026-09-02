import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { PLATFORM_ROLES } from '../../../lib/platformRoles';
import { createApi } from '../../../lib/api';
import { useToast } from '../../../components/ToastProvider';
import { normalizePageResponse } from '../../../lib/pagination';
import CriticalActionModal from '../../../components/CriticalActionModal';

export default function TenantMembersTab({ companyId, apiUrl, token, tenant }) {
  const { user } = useAuth();
  const isSupport = user?.platform_role === PLATFORM_ROLES.SUPPORT;
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  const toast = useToast();

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const readOnly = useMemo(() => {
    const c = tenant?.data?.company || tenant?.company;
    return c?.read_only_mode === 1;
  }, [tenant]);

  // Add Member State
  const [openAdd, setOpenAdd] = useState(false);
  const [searchUser, setSearchUser] = useState('');
  const [foundUsers, setFoundUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [adding, setAdding] = useState(false);
  
  // Invite Mode
  const [mode, setMode] = useState('search'); // 'search' | 'invite'
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');

  // Actions State
  const [pendingAction, setPendingAction] = useState(null); // { type, member }
  const [actionLoading, setActionLoading] = useState(false);
  const [openActionMenu, setOpenActionMenu] = useState(null); // memberId

  // Onboarding & Manager State
  const [viewOnboarding, setViewOnboarding] = useState(null); // member
  const [onboardingTasks, setOnboardingTasks] = useState([]);
  const [onboardingLoading, setOnboardingLoading] = useState(false);

  const [assignManager, setAssignManager] = useState(null); // member
  const [managerSearch, setManagerSearch] = useState('');
  const [foundManagers, setFoundManagers] = useState([]);
  const [selectedManager, setSelectedManager] = useState(null);

  useEffect(() => {
    if (companyId) {
        loadMembers();
        loadRoles();
    }
    // eslint-disable-next-line
  }, [companyId]);

  useEffect(() => {
    function closeMenu() { setOpenActionMenu(null); }
    if (openActionMenu) window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [openActionMenu]);

  // Load Onboarding Tasks when viewOnboarding changes
  useEffect(() => {
    if (viewOnboarding?.user_id) {
        setOnboardingLoading(true);
        api.get(`/api/onboarding/tasks/${viewOnboarding.user_id}`)
           .then(data => setOnboardingTasks(data || []))
           .catch(e => toast.error('Error cargando tareas'))
           .finally(() => setOnboardingLoading(false));
    }
  }, [viewOnboarding]);

  // Search Managers
  useEffect(() => {
      const t = setTimeout(() => {
          if (managerSearch && managerSearch.length > 2) {
            api.get(`/api/users?search=${managerSearch}`).then(res => setFoundManagers(res.data || res.items || []));
          }
      }, 500);
      return () => clearTimeout(t);
  }, [managerSearch]);

  async function loadMembers() {
    setLoading(true);
    setErr('');
    try {
      const res = await api.get(`/api/companies/${companyId}/members`);
      const out = normalizePageResponse(res);
      setMembers(out.items || []);
    } catch (e) {
      console.error(e);
      setErr('No se pudieron cargar los miembros. ' + (e.message || ''));
    } finally {
      setLoading(false);
    }
  }

  async function loadRoles() {
    try {
      const res = await api.get(`/api/companies/${companyId}/roles`);
      const out = normalizePageResponse(res);
      setRoles(out.items || []);
    } catch (e) {
      console.error('Error loading roles', e);
    }
  }

  async function searchUsers(q) {
    if (!q || q.length < 3) return;
    try {
        const res = await api.get(`/api/users?search=${q}`);
        setFoundUsers(res.data || res.items || []);
    } catch (e) {
        console.error(e);
    }
  }

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
        if (searchUser) searchUsers(searchUser);
    }, 500);
    return () => clearTimeout(t);
  }, [searchUser]);

  async function addMember(e) {
    e.preventDefault();
    
    if (mode === 'search') {
        if (!selectedUser || !selectedRole) return;
    } else {
        if (!inviteEmail || !selectedRole) return;
    }

    setAdding(true);
    try {
      if (mode === 'search') {
          await api.post(`/api/companies/${companyId}/members`, {
            user_id: selectedUser.id,
            role_id: selectedRole
          });
      } else {
          await api.post(`/api/companies/${companyId}/members/invite`, {
            email: inviteEmail,
            full_name: inviteName,
            role_id: selectedRole
          });
      }

      setOpenAdd(false);
      setSelectedUser(null);
      setSearchUser('');
      setSelectedRole('');
      setInviteEmail('');
      setInviteName('');
      toast.success(mode === 'search' ? 'Usuario agregado correctamente' : 'Invitación enviada correctamente');
      loadMembers();
    } catch (e) {
      toast.error(e.message || 'Error al procesar solicitud');
    } finally {
      setAdding(false);
    }
  }

  function openActionConfirm(type, member) {
    setPendingAction({ type, member });
  }

  async function confirmAction(reason) {
    if (!pendingAction) return;
    const { type, member } = pendingAction;

    setActionLoading(true);
    try {
      if (type === 'remove_member') {
        await api.del(`/api/companies/${companyId}/members/${member.id}`, { reason });
        toast.success('Acceso revocado correctamente');
        loadMembers();
      } else if (type === 'resend_invite') {
        await api.post(`/api/companies/${companyId}/members/${member.id}/resend-invite`);
        toast.success('Invitación reenviada');
      } else if (type === 'toggle_access') {
        await api.post(`/api/companies/${companyId}/members/${member.id}/toggle-access`);
        toast.success('Acceso actualizado');
        loadMembers();
      } else if (type === 'reset_role') {
        await api.post(`/api/companies/${companyId}/members/${member.id}/reset-role`);
        toast.success('Rol reseteado a defaults');
        loadMembers();
      } else if (type === 'force_password') {
        await api.post(`/api/companies/${companyId}/members/${member.id}/force-password-reset`);
        toast.success('Se solicitará cambio de contraseña al usuario');
      }
      setPendingAction(null);
    } catch (e) {
      toast.error(e.message || 'Error al ejecutar acción');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAssignManagerSubmit() {
      if (!assignManager || !selectedManager) return;
      try {
          await api.post('/api/onboarding/assign-manager', {
              user_id: assignManager.user_id,
              manager_id: selectedManager.id
          });
          toast.success('Manager asignado correctamente');
          setAssignManager(null);
          loadMembers(); // Reload to show new manager
      } catch (e) {
          toast.error(e.message || 'Error al asignar manager');
      }
  }

  if (loading && !members.length) return <div className="py-8 text-center text-slate-500">Cargando miembros...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-800">Usuarios con Acceso</h3>
        {!isSupport && (
          <button
              onClick={() => setOpenAdd(true)}
              disabled={readOnly || roles.length === 0}
              className="rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
          >
              + Asignar Usuario
          </button>
        )}
      </div>

      {readOnly && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Modo Solo Lectura activo. No se pueden agregar ni modificar miembros.
        </div>
      )}

      {!readOnly && roles.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          No hay roles definidos. Define roles en la pestaña Roles para poder asignar usuarios.
        </div>
      )}

      {err && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600 border border-red-100">{err}</div>}

      {!members.length && !loading && !err && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
              No hay usuarios asignados a esta empresa.
          </div>
      )}

      {members.length > 0 && (
          <div className="overflow-visible rounded-xl border border-slate-200 shadow-sm bg-white">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                    <tr>
                        <th className="px-4 py-3 text-left font-semibold">Usuario</th>
                        <th className="px-4 py-3 text-left font-semibold">Email</th>
                        <th className="px-4 py-3 text-left font-semibold">Manager</th>
                        <th className="px-4 py-3 text-left font-semibold">Estado</th>
                        <th className="px-4 py-3 text-left font-semibold">Rol Asignado</th>
                        {!isSupport && !readOnly && <th className="px-4 py-3 text-right font-semibold">Acciones</th>}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {members.map(m => (
                        <tr key={m.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-medium text-slate-900">
                                {m.user?.full_name || m.user_name || '—'}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                                {m.user?.email || m.user_email || '—'}
                            </td>
                             <td className="px-4 py-3 text-slate-600">
                                {m.manager_name ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-indigo-50 text-indigo-700 border border-indigo-100">
                                        <i className="bi bi-person-video2 mr-1"></i> {m.manager_name}
                                    </span>
                                ) : (
                                    <span className="text-slate-400 italic text-xs">Sin asignar</span>
                                )}
                            </td>
                            <td className="px-4 py-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${m.active !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                    {m.active !== false ? 'Activo' : 'Desactivado'}
                                </span>
                            </td>
                            <td className="px-4 py-3">
                                <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                                    {m.role?.name || m.role_name || '—'}
                                </span>
                            </td>
                            {!isSupport && !readOnly && (
                                <td className="px-4 py-3 text-right relative">
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenActionMenu(openActionMenu === m.id ? null : m.id);
                                        }}
                                        className="text-slate-400 hover:text-slate-700 transition-colors p-1"
                                    >
                                        <i className="bi bi-three-dots-vertical" />
                                    </button>
                                    
                                    {openActionMenu === m.id && (
                                        <div className="absolute right-8 top-8 z-50 w-56 origin-top-right rounded-xl bg-white shadow-xl ring-1 ring-black/5 focus:outline-none py-1 text-left">
                                            <button onClick={() => setViewOnboarding(m)} className="block w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
                                                <i className="bi bi-list-check mr-2"/> Ver Onboarding
                                            </button>
                                            <button onClick={() => setAssignManager(m)} className="block w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
                                                <i className="bi bi-diagram-3 mr-2"/> Asignar Manager
                                            </button>
                                            <div className="border-t border-slate-100 my-1"></div>
                                            <button onClick={() => openActionConfirm('resend_invite', m)} className="block w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
                                                <i className="bi bi-envelope mr-2"/> Reenviar invitación
                                            </button>
                                            <button onClick={() => openActionConfirm('toggle_access', m)} className="block w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
                                                <i className={`bi bi-${m.active !== false ? 'slash-circle' : 'check-circle'} mr-2`}/> {m.active !== false ? 'Desactivar acceso' : 'Reactivar acceso'}
                                            </button>
                                            <button onClick={() => openActionConfirm('reset_role', m)} className="block w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
                                                <i className="bi bi-arrow-counterclockwise mr-2"/> Resetear rol
                                            </button>
                                            <button onClick={() => openActionConfirm('force_password', m)} className="block w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
                                                <i className="bi bi-key mr-2"/> Forzar cambio pass
                                            </button>
                                            <div className="border-t border-slate-100 my-1"></div>
                                            <button 
                                                onClick={() => openActionConfirm('remove_member', m)}
                                                className="block w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 text-left font-medium"
                                            >
                                                <i className="bi bi-trash mr-2"/> Revocar acceso
                                            </button>
                                        </div>
                                    )}
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
          </div>
      )}

      {/* Modal Add Member */}
      {openAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setOpenAdd(false)} />
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-lg font-bold text-slate-900">Asignar Usuario a Empresa</h3>
              <button onClick={() => setOpenAdd(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
                <i className="bi bi-x-lg" />
              </button>
            </div>
            
            <form onSubmit={addMember} className="p-6 space-y-4">
              
              {/* Mode Switch */}
              <div className="flex gap-6 border-b border-slate-100 mb-2">
                  <button 
                    type="button"
                    onClick={() => setMode('search')} 
                    className={`pb-2 text-sm font-semibold transition-colors ${mode==='search'?'text-brand border-b-2 border-brand':'text-slate-500 hover:text-slate-700'}`}
                  >
                    Buscar Usuario
                  </button>
                  <button 
                    type="button"
                    onClick={() => setMode('invite')} 
                    className={`pb-2 text-sm font-semibold transition-colors ${mode==='invite'?'text-brand border-b-2 border-brand':'text-slate-500 hover:text-slate-700'}`}
                  >
                    Invitar por Email
                  </button>
              </div>

              {/* User Search */}
              {mode === 'search' ? (
                  <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">Buscar Usuario</label>
                      {!selectedUser ? (
                          <div className="relative">
                            <input
                                type="text"
                                value={searchUser}
                                onChange={(e) => setSearchUser(e.target.value)}
                                className="w-full rounded-lg border-slate-300 py-2 pl-10 text-sm focus:border-brand focus:ring-brand"
                                placeholder="Nombre o email..."
                            />
                            <i className="bi bi-search absolute left-3 top-2.5 text-slate-400" />
                            
                            {foundUsers.length > 0 && (
                                <div className="absolute top-full left-0 right-0 z-10 mt-1 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                                    {foundUsers.map(u => (
                                        <button
                                            key={u.id}
                                            type="button"
                                            onClick={() => { setSelectedUser(u); setSearchUser(''); setFoundUsers([]); }}
                                            className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50"
                                        >
                                            <div className="font-medium text-slate-900">{u.full_name}</div>
                                            <div className="text-xs text-slate-500">{u.email}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                          </div>
                      ) : (
                          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <div>
                                  <div className="font-medium text-slate-900">{selectedUser.full_name}</div>
                                  <div className="text-xs text-slate-500">{selectedUser.email}</div>
                              </div>
                              <button type="button" onClick={() => setSelectedUser(null)} className="text-slate-400 hover:text-red-500">
                                  <i className="bi bi-x-lg" />
                              </button>
                          </div>
                      )}
                  </div>
              ) : (
                  <>
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">Email del Usuario</label>
                        <input
                            type="email"
                            required
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            className="w-full rounded-lg border-slate-300 py-2 text-sm focus:border-brand focus:ring-brand"
                            placeholder="colaborador@ejemplo.com"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">Nombre Completo</label>
                        <input
                            type="text"
                            required
                            value={inviteName}
                            onChange={(e) => setInviteName(e.target.value)}
                            className="w-full rounded-lg border-slate-300 py-2 text-sm focus:border-brand focus:ring-brand"
                            placeholder="Juan Pérez"
                        />
                    </div>
                  </>
              )}

              <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Rol en la Empresa</label>
                  <select
                    required
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className="w-full rounded-lg border-slate-300 py-2 text-sm focus:border-brand focus:ring-brand"
                  >
                      <option value="">Seleccionar Rol...</option>
                      {(Array.isArray(roles) ? roles : Array.isArray(roles?.data) ? roles.data : Array.isArray(roles?.items) ? roles.items : []).map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                  </select>
              </div>

              <div className="flex justify-end pt-4">
                  <button
                    type="submit"
                    disabled={adding}
                    className="rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-brand/90 disabled:opacity-50"
                  >
                      {adding ? 'Procesando...' : (mode === 'search' ? 'Asignar Usuario' : 'Enviar Invitación')}
                  </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal View Onboarding */}
      {viewOnboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setViewOnboarding(null)} />
          <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
             <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50">
                <div>
                    <h3 className="text-lg font-bold text-slate-900">Progreso de Onboarding</h3>
                    <p className="text-sm text-slate-500">Empleado: {viewOnboarding.user_name}</p>
                </div>
                <button onClick={() => setViewOnboarding(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600">
                    <i className="bi bi-x-lg" />
                </button>
             </div>
             
             <div className="flex-1 overflow-y-auto p-6">
                {onboardingLoading ? (
                    <div className="text-center py-8 text-slate-500">Cargando tareas...</div>
                ) : onboardingTasks.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
                        Este usuario no tiene tareas de onboarding asignadas.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {onboardingTasks.map(task => (
                            <div key={task.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 bg-white hover:border-slate-200 transition-colors">
                                <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${task.status === 'completed' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                    <i className={`bi bi-${task.status === 'completed' ? 'check-lg' : 'circle'}`} />
                                </div>
                                <div>
                                    <h4 className={`text-sm font-semibold ${task.status === 'completed' ? 'text-slate-900 line-through decoration-slate-300' : 'text-slate-900'}`}>
                                        {task.title}
                                    </h4>
                                    <p className="text-xs text-slate-500 mt-0.5">{task.description}</p>
                                    {task.completed_at && (
                                        <p className="text-[10px] text-emerald-600 mt-1 font-medium">
                                            Completado el {new Date(task.completed_at).toLocaleDateString()}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
             </div>
          </div>
        </div>
      )}

      {/* Modal Assign Manager */}
      {assignManager && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setAssignManager(null)} />
            <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                    <h3 className="text-lg font-bold text-slate-900">Asignar Manager</h3>
                    <button onClick={() => setAssignManager(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
                        <i className="bi bi-x-lg" />
                    </button>
                </div>
                
                <div className="p-6 space-y-4">
                    <p className="text-sm text-slate-600">
                        Asigna un manager a <strong>{assignManager.user_name}</strong> para construir el organigrama.
                    </p>

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">Buscar Manager</label>
                        {!selectedManager ? (
                            <div className="relative">
                                <input
                                    type="text"
                                    value={managerSearch}
                                    onChange={(e) => setManagerSearch(e.target.value)}
                                    className="w-full rounded-lg border-slate-300 py-2 pl-10 text-sm focus:border-brand focus:ring-brand"
                                    placeholder="Nombre del manager..."
                                />
                                <i className="bi bi-search absolute left-3 top-2.5 text-slate-400" />
                                
                                {foundManagers.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 z-10 mt-1 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                                        {foundManagers.map(u => (
                                            <button
                                                key={u.id}
                                                type="button"
                                                onClick={() => { setSelectedManager(u); setManagerSearch(''); setFoundManagers([]); }}
                                                className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50"
                                            >
                                                <div className="font-medium text-slate-900">{u.full_name}</div>
                                                <div className="text-xs text-slate-500">{u.email}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <div>
                                    <div className="font-medium text-slate-900">{selectedManager.full_name}</div>
                                    <div className="text-xs text-slate-500">{selectedManager.email}</div>
                                </div>
                                <button type="button" onClick={() => setSelectedManager(null)} className="text-slate-400 hover:text-red-500">
                                    <i className="bi bi-x-lg" />
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end pt-4">
                        <button
                            onClick={handleAssignManagerSubmit}
                            disabled={!selectedManager}
                            className="rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-brand/90 disabled:opacity-50"
                        >
                            Guardar Asignación
                        </button>
                    </div>
                </div>
            </div>
          </div>
      )}

      <CriticalActionModal 
        isOpen={!!pendingAction}
        onClose={() => setPendingAction(null)}
        onConfirm={confirmAction}
        loading={actionLoading}
        title={
            pendingAction?.type === 'remove_member' ? 'Revocar Acceso' : 
            pendingAction?.type === 'resend_invite' ? 'Reenviar Invitación' :
            pendingAction?.type === 'toggle_access' ? 'Cambiar Acceso' :
            pendingAction?.type === 'reset_role' ? 'Resetear Rol' :
            'Acción Crítica'
        }
        message={
            pendingAction?.type === 'remove_member' ? `¿Estás seguro de eliminar a ${pendingAction?.member.user_name}?` :
            'Confirma que deseas realizar esta acción.'
        }
        requireReason={pendingAction?.type === 'remove_member'}
      />
    </div>
  );
}
