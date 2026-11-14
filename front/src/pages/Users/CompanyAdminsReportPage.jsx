import React, { useEffect, useMemo, useState } from 'react';
import { createApi, downloadFile } from '../../lib/api';
import { useToast } from '../../components/ToastProvider';
import Modal from '../../components/Modal';
import ConfirmModal from '../../components/ConfirmModal';

export default function CompanyAdminsReportPage({ apiUrl, token }) {
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  const toast = useToast();

  const [q, setQ] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [passwordUser, setPasswordUser] = useState(null);
  const [password1, setPassword1] = useState('');
  const [password2, setPassword2] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // Nuevo Admin Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [creating, setCreating] = useState(false);

  // Buscador de empresas
  const [companySearch, setCompanySearch] = useState('');
  const [companyResults, setCompanyResults] = useState([]);
  const [searchingCompanies, setSearchingCompanies] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (companyId.trim()) params.set('company_id', companyId.trim());
      const res = await api.get(`/api/users/company-admins?${params.toString()}`);
      const data = res?.data || [];
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e.message || 'Error cargando reporte');
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (companyId.trim()) params.set('company_id', companyId.trim());
    downloadFile(apiUrl, `/api/users/company-admins/export?${params.toString()}`, 'company-admins.csv')
      .catch((e) => toast.error(e.message || 'Error al exportar'));
  }

  async function savePassword(e) {
    e.preventDefault();
    if (!passwordUser) return;

    const p1 = password1.trim();
    const p2 = password2.trim();

    if (p1.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (p1 !== p2) {
      toast.error('Las contraseñas no coinciden');
      return;
    }

    setSavingPassword(true);
    try {
      await api.post(`/api/users/${passwordUser.user_id}/set-password`, { password: p1 });
      toast.success('Contraseña actualizada. Se invalidaron las sesiones activas.');
      setPasswordUser(null);
      setPassword1('');
      setPassword2('');
    } catch (e2) {
      toast.error(e2.message || 'Error al actualizar contraseña');
    } finally {
      setSavingPassword(false);
    }
  }

  // Edit Admin
  const [editUser, setEditUser] = useState(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editing, setEditing] = useState(false);

  async function handleEdit(e) {
    e.preventDefault();
    if (!editUser) return;
    setEditing(true);
    try {
      await api.put(`/api/users/${editUser.user_id}`, {
        full_name: editName.trim(),
        email: editEmail.trim(),
      });
      toast.success('Usuario actualizado correctamente');
      setEditUser(null);
      load();
    } catch (err) {
      toast.error(err.message || 'Error al actualizar');
    } finally {
      setEditing(false);
    }
  }

  // Confirmación con el modal de la app (antes window.confirm nativo)
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  function handleDelete(r) {
    setDeleteTarget(r);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/users/${deleteTarget.user_id}`);
      toast.success('Usuario eliminado');
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err.message || 'Error al eliminar');
    } finally {
      setDeleting(false);
    }
  }

  async function handleResend(r) {
    try {
      await api.post(`/api/users/${r.user_id}/send-password-reset`);
      toast.success('Invitación reenviada correctamente');
    } catch (err) {
      toast.error(err.message || 'Error al reenviar invitación');
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim() || !selectedCompany) {
      toast.error('Todos los campos son requeridos, incluyendo la empresa');
      return;
    }
    setCreating(true);
    try {
      // Contraseña temporal aleatoria (el admin define la suya con el enlace de invitación)
      const bytes = new Uint8Array(12);
      crypto.getRandomValues(bytes);
      const tempPassword = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') + 'A1!';

      // 1. Crear el usuario con rol company_admin
      const resUser = await api.post('/api/users', {
        full_name: newName.trim(),
        email: newEmail.trim(),
        password: tempPassword,
        platform_role: 'company_admin'
      });
      // La API responde { message, data: { id, ... } }
      const newUserId = resUser?.data?.id ?? resUser?.data?.data?.id;
      if (!newUserId) throw new Error('No se recibió el ID del usuario creado');

      try {
        // 2. Asignarlo a la empresa
        await api.post(`/api/users/${newUserId}/memberships`, {
          company_id: selectedCompany.id,
          job_title: 'Company Admin'
        });
      } catch (stepErr) {
        // Sin empresa el usuario quedaría huérfano: se revierte el alta
        await api.delete(`/api/users/${newUserId}`).catch(() => {});
        throw stepErr;
      }

      // 3. Enviar correo de invitación / set-password por SMTP (si falla, el admin ya existe y puede reenviarse)
      try {
        await api.post(`/api/users/${newUserId}/send-password-reset`);
      } catch (mailErr) {
        toast.error('Admin creado, pero no se pudo enviar la invitación. Usa "Reenviar Invitación".');
      }

      toast.success('Admin creado. Se ha enviado un correo de invitación para configurar su contraseña.');
      setShowAddModal(false);
      setNewName('');
      setNewEmail('');
      setSelectedCompany(null);
      setCompanySearch('');
      load();
    } catch (e2) {
      toast.error(e2.message || 'Error al crear el Company Admin');
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (!showAddModal) {
      setCompanySearch('');
      setCompanyResults([]);
      setSelectedCompany(null);
      return;
    }
    const timer = setTimeout(() => {
      searchCompanies(companySearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [companySearch, showAddModal]);

  // Solo se aplica la respuesta de la búsqueda más reciente
  const companySearchSeq = React.useRef(0);

  async function searchCompanies(query) {
    const seq = ++companySearchSeq.current;
    setSearchingCompanies(true);
    try {
      const res = await api.get(`/api/companies?q=${encodeURIComponent(query)}&per_page=20`);
      if (seq !== companySearchSeq.current) return;
      // La API responde { data: [...], meta: {...} }
      const list = Array.isArray(res?.data) ? res.data : (res?.data?.data || []);
      setCompanyResults(list);
    } catch (e) {
      console.error(e);
    } finally {
      if (seq === companySearchSeq.current) setSearchingCompanies(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Company Admins por empresa</h1>
          <p className="mt-1 text-sm text-slate-500">Lista de usuarios con rol company_admin y su empresa asignada.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand/90 transition-all shadow-sm"
            type="button"
          >
            <i className="bi bi-plus-lg" />
            Nuevo Admin Tenant
          </button>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all"
            type="button"
          >
            <i className="bi bi-download" />
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-1 gap-3 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <label htmlFor="ca-search" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Buscar</label>
              <input
                id="ca-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
                placeholder="Nombre, email o empresa..."
              />
            </div>
            <div className="w-full md:w-64">
              <label htmlFor="ca-company-id" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Company ID</label>
              <input
                id="ca-company-id"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
                placeholder="Filtrar por ID de empresa"
              />
            </div>
          </div>

          <button
            onClick={() => {
              load().catch(() => toast.error('Error al aplicar filtros'));
            }}
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
                <th className="py-3 px-2">Email</th>
                <th className="py-3 px-2">Empresa</th>
                <th className="py-3 px-2">Estado</th>
                <th className="py-3 px-2">Asignación</th>
                <th className="py-3 px-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={`${r.user_id}-${r.company_id}`} className="hover:bg-slate-50/60">
                  <td className="py-3 px-2">
                    <div className="font-semibold text-slate-900">{r.full_name || '—'}</div>
                    <div className="text-xs text-slate-500">{r.user_id}</div>
                  </td>
                  <td className="py-3 px-2 text-slate-700">{r.email || '—'}</td>
                  <td className="py-3 px-2">
                    <div className="font-semibold text-slate-900">{r.trade_name || r.legal_name || '—'}</div>
                    <div className="text-xs text-slate-500">{r.company_id}</div>
                  </td>
                  <td className="py-3 px-2">
                    <div className="inline-flex flex-col gap-1">
                      <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold border bg-slate-50 text-slate-700 border-slate-200">
                        Usuario: {r.user_status || '—'}
                      </span>
                      <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold border bg-slate-50 text-slate-700 border-slate-200">
                        Empresa: {r.company_status || '—'}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-2 text-slate-700">
                    <div className="text-xs text-slate-500">Status: {r.membership_status || '—'}</div>
                    <div className="text-xs text-slate-500">Desde: {r.membership_created_at || '—'}</div>
                  </td>
                  <td className="py-3 px-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleResend(r)}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-brand transition-colors"
                        title="Reenviar Invitación"
                        aria-label="Reenviar Invitación"
                      >
                        <i className="bi bi-envelope-paper" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditUser(r);
                          setEditName(r.full_name || '');
                          setEditEmail(r.email || '');
                        }}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-brand transition-colors"
                        title="Editar"
                        aria-label="Editar"
                      >
                        <i className="bi bi-pencil" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(r)}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                        title="Eliminar"
                        aria-label="Eliminar"
                      >
                        <i className="bi bi-trash" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPasswordUser(r);
                          setPassword1('');
                          setPassword2('');
                        }}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
                        title="Cambiar contraseña"
                        aria-label="Cambiar contraseña"
                      >
                        <i className="bi bi-key" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!rows.length && !loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    No se encontraron company_admins.
                  </td>
                </tr>
              ) : null}

              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    Cargando...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={!!passwordUser}
        title="Cambiar contraseña"
        onClose={() => {
          if (savingPassword) return;
          setPasswordUser(null);
          setPassword1('');
          setPassword2('');
        }}
        size="md"
      >
        <form onSubmit={savePassword} className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">{passwordUser?.full_name || '—'}</div>
            <div className="text-xs text-slate-600">{passwordUser?.email || '—'}</div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">Nueva contraseña</label>
            <input
              type="password"
              value={password1}
              onChange={(e) => setPassword1(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
              placeholder="••••••••"
              minLength={8}
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">Confirmar contraseña</label>
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
              placeholder="••••••••"
              minLength={8}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                if (savingPassword) return;
                setPasswordUser(null);
                setPassword1('');
                setPassword2('');
              }}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              disabled={savingPassword}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingPassword}
              className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-70"
            >
              {savingPassword ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={showAddModal}
        title="Crear Nuevo Admin de Empresa"
        onClose={() => {
          if (creating) return;
          setShowAddModal(false);
          setNewName('');
          setNewEmail('');
          setSelectedCompany(null);
          setCompanySearch('');
        }}
        size="md"
      >
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label htmlFor="na-name" className="text-sm font-semibold text-slate-700">Nombre Completo</label>
            <input
              type="text"
              id="na-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
              placeholder="Ej. Juan Pérez"
              required
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="na-email" className="text-sm font-semibold text-slate-700">Correo Electrónico</label>
            <input
              type="email"
              id="na-email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
              placeholder="admin@empresa.com"
              required
            />
          </div>
          <div>
            <label htmlFor="na-company" className="text-sm font-semibold text-slate-700">Empresa</label>
            {selectedCompany ? (
              <div className="mt-1 flex items-center justify-between rounded-xl border border-brand bg-brand/5 px-3 py-2.5">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{selectedCompany.trade_name || selectedCompany.legal_name}</div>
                  <div className="text-xs text-slate-500">{selectedCompany.id}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCompany(null)}
                  className="text-brand hover:text-brand/80"
                >
                  <i className="bi bi-x-circle-fill" />
                </button>
              </div>
            ) : (
              <div className="relative mt-1">
                <input
                  type="text"
                  id="na-company"
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
                  placeholder="Buscar empresa por nombre..."
                />
                {searchingCompanies && (
                  <div className="absolute right-3 top-3">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                  </div>
                )}
                {companyResults.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                    {companyResults.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCompany(c)}
                        className="w-full border-b border-slate-50 px-3 py-2 text-left hover:bg-slate-50 last:border-0"
                      >
                        <div className="text-sm font-semibold text-slate-900">{c.trade_name || c.legal_name}</div>
                        <div className="text-xs text-slate-500">{c.id}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                if (creating) return;
                setShowAddModal(false);
              }}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              disabled={creating}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={creating}
              className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-70"
            >
              {creating ? 'Creando...' : 'Crear Admin de Empresa'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Editar */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Eliminar administrador"
        message={`Se eliminará la cuenta de ${deleteTarget?.full_name || deleteTarget?.email || ''} y perderá el acceso a la plataforma.`}
        confirmText="Eliminar"
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => !deleting && setDeleteTarget(null)}
      />

      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Editar Administrador">
        <form onSubmit={handleEdit} className="space-y-4 p-2">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre Completo</label>
            <input
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Correo Electrónico</label>
            <input
              required
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 transition-all"
            />
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={() => setEditUser(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={editing}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50 transition-all shadow-sm"
            >
              {editing ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
