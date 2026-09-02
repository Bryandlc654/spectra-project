import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { createApi } from '../../lib/api';
import { useToast } from '../../components/ToastProvider';
import ConfirmModal from '../../components/ConfirmModal';
import Modal from '../../components/Modal';

export default function CompanyUsersPage({ apiUrl, token }) {
  const { user } = useAuth();
  const companyId = user?.company_id;
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  const toast = useToast();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState([]);

  // Invite/Create state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    full_name: '',
    role: '' // Internal role key
  });
  const [inviting, setInviting] = useState(false);

  // Actions state
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'block' | 'resend' | 'remove', user: ... }
  const [actionLoading, setActionLoading] = useState(false);

  // Edit Role state
  const [editingUser, setEditingUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [updatingRole, setUpdatingRole] = useState(false);

  // Internal roles mapping based on requirements
  // We'll try to map these to backend roles if possible, or use them as tags/permissions
  const INTERNAL_ROLES = [
    { key: 'hr', label: 'HR (Recursos Humanos)' },
    { key: 'finance', label: 'Finanzas' },
    { key: 'procurement', label: 'Compras' },
    { key: 'supervisor', label: 'Supervisor' }
  ];

  // Helper to get roles to display
  // If backend roles are loaded, use them. Otherwise fallback to static list.
  const displayRoles = roles.length > 0 
    ? roles.map(r => ({ key: r.id, label: r.name || r.label || r.id })) 
    : INTERNAL_ROLES;

  useEffect(() => {
    if (companyId) {
      loadUsers();
      loadRoles();
    }
  }, [companyId]);

  async function loadRoles() {
    try {
      // Fetch roles available for this tenant
      const res = await api.get(`/api/companies/${companyId}/roles`);
      setRoles(Array.isArray(res) ? res : res.data || []);
    } catch (e) {
      console.error('Error loading roles', e);
      // Fallback to static roles if API fails or not implemented
      setRoles([]);
    }
  }

  async function loadUsers() {
    setLoading(true);
    try {
      // Fetch users for this tenant
      const res = await api.get(`/api/companies/${companyId}/members`);
      setUsers(Array.isArray(res) ? res : res.data || []);
    } catch (e) {
      console.error(e);
      toast.error('Error cargando usuarios');
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite(e) {
    e.preventDefault();
    if (!inviteForm.email || !inviteForm.full_name || !inviteForm.role) {
      toast.error('Todos los campos son obligatorios');
      return;
    }

    setInviting(true);
    try {
      // Use the invite endpoint
      await api.post(`/api/companies/${companyId}/members/invite`, {
        email: inviteForm.email,
        full_name: inviteForm.full_name,
        role_id: inviteForm.role
      });
      
      toast.success('Invitación enviada correctamente');
      setShowInviteModal(false);
      setInviteForm({ email: '', full_name: '', role: '' });
      loadUsers();
    } catch (e) {
      toast.error(e.message || 'Error al enviar invitación');
    } finally {
      setInviting(false);
    }
  }

  async function toggleStatus(user) {
    setActionLoading(true);
    try {
      // Use company-scoped endpoint for better security and logic isolation
      // Endpoint logic: /api/companies/{id}/members/{memberId}/toggle-access
      await api.post(`/api/companies/${companyId}/members/${user.id}/toggle-access`);
      
      toast.success('Estado de acceso actualizado correctamente');
      setConfirmAction(null);
      loadUsers();
    } catch (e) {
      toast.error(e.message || 'Error cambiando estado');
    } finally {
      setActionLoading(false);
    }
  }

  async function resendInvite(user) {
    setActionLoading(true);
    try {
      // Use company-scoped endpoint
      await api.post(`/api/companies/${companyId}/members/${user.id}/resend-invite`);
      toast.success('Invitación reenviada');
      setConfirmAction(null);
    } catch (e) {
      toast.error(e.message || 'Error reenviando invitación');
    } finally {
      setActionLoading(false);
    }
  }

  async function removeMember(user) {
    setActionLoading(true);
    try {
      await api.del(`/api/companies/${companyId}/members/${user.id}`);
      toast.success('Usuario eliminado de la empresa');
      setConfirmAction(null);
      loadUsers();
    } catch (e) {
      toast.error(e.message || 'Error eliminando usuario');
    } finally {
      setActionLoading(false);
    }
  }

  async function updateRole() {
    if (!editingUser || !selectedRole) return;
    setUpdatingRole(true);
    try {
      // Update member role using PUT on members endpoint usually expects role_id
      // Some APIs might use specific endpoint, but let's try standard REST update first or check if there is a specific one
      // TenantMembersTab doesn't show a direct role update, but let's assume standard REST or adapt if needed.
      // Actually, TenantMembersTab uses specific actions. Let's try to stick to what we had but with /companies/ prefix
      // If that fails, we might need a specific endpoint like /change-role
      await api.put(`/api/companies/${companyId}/members/${editingUser.id}`, {
        role_id: selectedRole
      });
      toast.success('Rol actualizado');
      setEditingUser(null);
      loadUsers();
    } catch (e) {
      toast.error(e.message || 'Error actualizando rol');
    } finally {
      setUpdatingRole(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gestión de Usuarios Internos</h1>
          <p className="text-sm text-slate-600">Administra los accesos y roles de tu equipo (Gobierno Corporativo).</p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand/90 shadow-sm shadow-brand-500/20 transition-all"
        >
          <i className="bi bi-person-plus" />
          Invitar Usuario
        </button>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-6 py-4">Usuario</th>
                <th className="px-6 py-4">Rol Interno</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4">Actividad</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-slate-500">
                    Cargando usuarios...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-slate-500">
                    No hay usuarios registrados.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  // Normalize user object (handle nested user property from backend)
                  const userInfo = u.user || u;
                  const isActive = u.active !== false && userInfo.status !== 'blocked';
                  
                  return (
                  <tr key={u.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold">
                          {userInfo.full_name?.charAt(0) || userInfo.email?.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-slate-900">{userInfo.full_name || 'Sin nombre'}</div>
                          <div className="text-xs text-slate-500">{userInfo.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                        {displayRoles.find(r => r.key === u.role_id || r.key === u.role || r.key === u.tenant_role)?.label || u.role?.name || u.role || u.tenant_role || 'Sin rol'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' 
                          : 'bg-red-50 text-red-700 ring-red-600/20'
                      }`}>
                        {isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-slate-500">
                        {userInfo.last_login_at ? new Date(userInfo.last_login_at).toLocaleDateString() : 'Nunca'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => { setEditingUser(u); setSelectedRole(u.role_id || u.role || ''); }}
                          className="p-1.5 text-slate-400 hover:text-brand transition"
                          title="Editar Rol"
                        >
                          <i className="bi bi-pencil-square" />
                        </button>
                        <button
                          onClick={() => setConfirmAction({ type: 'resend', user: u })}
                          className="p-1.5 text-slate-400 hover:text-blue-600 transition"
                          title="Reenviar invitación"
                        >
                          <i className="bi bi-envelope-paper" />
                        </button>
                        <button
                          onClick={() => setConfirmAction({ type: 'status', user: u })}
                          className={`p-1.5 transition ${
                            isActive ? 'text-slate-400 hover:text-red-600' : 'text-slate-400 hover:text-emerald-600'
                          }`}
                          title={isActive ? 'Desactivar acceso' : 'Activar acceso'}
                        >
                          <i className={`bi ${isActive ? 'bi-ban' : 'bi-check-circle'}`} />
                        </button>
                        <button
                          onClick={() => setConfirmAction({ type: 'remove', user: u })}
                          className="p-1.5 text-slate-400 hover:text-red-600 transition"
                          title="Eliminar usuario"
                        >
                          <i className="bi bi-trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )})
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal */}
      <Modal
        open={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        title="Invitar Nuevo Usuario"
        size="md"
      >
        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Nombre Completo</label>
            <input
              type="text"
              required
              className="mt-1 block w-full rounded-xl border-slate-200 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
              value={inviteForm.full_name}
              onChange={e => setInviteForm({ ...inviteForm, full_name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Email Corporativo</label>
            <input
              type="email"
              required
              className="mt-1 block w-full rounded-xl border-slate-200 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
              value={inviteForm.email}
              onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Rol Interno</label>
            <select
              required
              className="mt-1 block w-full rounded-xl border-slate-200 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
              value={inviteForm.role}
              onChange={e => setInviteForm({ ...inviteForm, role: e.target.value })}
            >
              <option value="">Seleccionar rol...</option>
              {displayRoles.map(role => (
                <option key={role.key} value={role.key}>{role.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Asigna permisos específicos para el gobierno corporativo.
            </p>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowInviteModal(false)}
              className="rounded-xl px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={inviting}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-70"
            >
              {inviting ? 'Enviando...' : 'Enviar Invitación'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Role Modal */}
      <Modal
        open={!!editingUser}
        onClose={() => setEditingUser(null)}
        title={`Editar Rol: ${editingUser?.full_name}`}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Rol Interno</label>
            <select
              className="mt-1 block w-full rounded-xl border-slate-200 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
              value={selectedRole}
              onChange={e => setSelectedRole(e.target.value)}
            >
              {displayRoles.map(role => (
                <option key={role.key} value={role.key}>{role.label}</option>
              ))}
            </select>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={() => setEditingUser(null)}
              className="rounded-xl px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={updateRole}
              disabled={updatingRole}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-70"
            >
              {updatingRole ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirm Status Change */}
      {confirmAction?.type === 'status' && (() => {
        const u = confirmAction.user;
        const userInfo = u.user || u;
        const isActive = u.active !== false && userInfo.status !== 'blocked';
        return (
          <ConfirmModal
            open={true}
            title={isActive ? 'Desactivar Usuario' : 'Activar Usuario'}
            message={`¿Estás seguro de que deseas ${isActive ? 'desactivar' : 'activar'} a ${userInfo.full_name}?`}
            confirmText={isActive ? 'Desactivar' : 'Activar'}
            onConfirm={() => toggleStatus(u)}
            onClose={() => setConfirmAction(null)}
            loading={actionLoading}
            danger={isActive}
          />
        );
      })()}

      {/* Confirm Resend Invite */}
      <ConfirmModal
        open={confirmAction?.type === 'resend'}
        title="Reenviar Invitación"
        message={`¿Deseas reenviar el correo de invitación a ${confirmAction?.user?.user?.full_name || confirmAction?.user?.full_name}? Esto restablecerá su acceso si ya estaba registrado.`}
        confirmText="Reenviar"
        onConfirm={() => resendInvite(confirmAction.user)}
        onClose={() => setConfirmAction(null)}
        loading={actionLoading}
      />

      {/* Confirm Remove Member */}
      <ConfirmModal
        open={confirmAction?.type === 'remove'}
        title="Eliminar Usuario"
        message={`¿Estás seguro de que deseas eliminar a ${confirmAction?.user?.user?.full_name || confirmAction?.user?.full_name} de la empresa? Esta acción revocará su acceso permanentemente.`}
        confirmText="Eliminar"
        onConfirm={() => removeMember(confirmAction.user)}
        onClose={() => setConfirmAction(null)}
        loading={actionLoading}
        danger
      />
    </div>
  );
}
