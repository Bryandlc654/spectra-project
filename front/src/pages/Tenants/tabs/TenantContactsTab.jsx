import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../../../components/Modal';
import CriticalActionModal from '../../../components/CriticalActionModal';
import { useToast } from '../../../components/ToastProvider';

const TYPES = [
  { key: 'billing', label: 'Billing' },
  { key: 'operations', label: 'Operaciones' }, // backend: mapear a enum/other según decidas
  { key: 'legal', label: 'Legal' },
];

export default function TenantContactsTab({ companyId, api, tenant }) {
  const toast = useToast();
  const [contacts, setContacts] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [current, setCurrent] = useState(null);
  const [form, setForm] = useState({ type: 'billing', name: '', email: '', phone: '', notes: '' });

  const readOnly = useMemo(() => {
    const c = tenant?.data?.company || tenant?.company;
    return c?.read_only_mode === 1;
  }, [tenant]);

  function resetForm() {
    setForm({ type: 'billing', name: '', email: '', phone: '', notes: '' });
  }

  async function load() {
    setErr('');
    try {
      const d = await api.get(`/api/tenants/${companyId}/contacts`);
      setContacts(d.data || d.contacts || []);
    } catch (e) { setErr(e.message); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId]);

  async function createContact(e) {
    e.preventDefault();
    setWorking(true);
    setErr('');
    try {
      await api.post(`/api/tenants/${companyId}/contacts`, { ...form });
      toast.success('Contacto creado');
      resetForm();
      setCreateOpen(false);
      await load();
    } catch (e2) { setErr(e2.message); toast.error(e2.message || 'Error al crear'); }
    finally { setWorking(false); }
  }

  async function updateContact(e) {
    e.preventDefault();
    if (!current) return;
    setWorking(true);
    setErr('');
    try {
      await api.put(`/api/tenants/${companyId}/contacts/${current.id}`, { ...form });
      toast.success('Contacto actualizado');
      setEditOpen(false);
      setCurrent(null);
      resetForm();
      await load();
    } catch (e2) { setErr(e2.message); toast.error(e2.message || 'Error al actualizar'); }
    finally { setWorking(false); }
  }

  async function removeConfirmed() {
    if (!current) return;
    setWorking(true);
    setErr('');
    try {
      await api.del(`/api/tenants/${companyId}/contacts/${current.id}`);
      toast.success('Contacto eliminado');
      setDeleteOpen(false);
      setCurrent(null);
      await load();
    } catch (e) { setErr(e.message); toast.error(e.message || 'Error al eliminar'); }
    finally { setWorking(false); }
  }

  function openCreate() {
    resetForm();
    setCreateOpen(true);
  }

  function openEdit(contact) {
    setCurrent(contact);
    setForm({
      type: contact.type || 'billing',
      name: contact.name || '',
      email: contact.email || '',
      phone: contact.phone || '',
      notes: contact.notes || '',
    });
    setEditOpen(true);
  }

  function openDelete(contact) {
    setCurrent(contact);
    setDeleteOpen(true);
  }

  return (
    <div className="space-y-4">
      {err ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{err}</div> : null}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Contactos</h2>
          <p className="text-sm text-slate-500">Personas de contacto clave para este tenant</p>
        </div>
        <button
          type="button"
          disabled={readOnly}
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          <i className="bi bi-plus-lg" />
          Agregar contacto
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-sm bg-white">
          <thead>
            <tr className="text-left text-xs uppercase tracking-widest text-slate-500">
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Teléfono</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {contacts.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3 font-semibold">
                  {TYPES.find(t => t.key === c.type)?.label || c.type}
                </td>
                <td className="px-4 py-3">{c.name}</td>
                <td className="px-4 py-3">{c.email || '—'}</td>
                <td className="px-4 py-3">{c.phone || '—'}</td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => openEdit(c)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => openDelete(c)}
                      className="rounded-xl border border-red-200 text-red-600 px-3 py-2 text-sm font-semibold hover:bg-red-50 disabled:opacity-60"
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!contacts.length ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Sin contactos.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Modal open={createOpen} onClose={() => !working && setCreateOpen(false)} title="Agregar contacto" size="md">
        <form onSubmit={createContact} className="grid grid-cols-1 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600">Tipo</label>
            <select
              value={form.type}
              onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
            >
              {TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Nombre</label>
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
              required
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Teléfono</label>
            <input
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Notas</label>
            <input
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
            />
          </div>
          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              disabled={working}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              disabled={working}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-60"
            >
              Guardar
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={editOpen} onClose={() => !working && setEditOpen(false)} title="Editar contacto" size="md">
        <form onSubmit={updateContact} className="grid grid-cols-1 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600">Tipo</label>
            <select
              value={form.type}
              onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
            >
              {TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Nombre</label>
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
              required
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Teléfono</label>
            <input
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Notas</label>
            <input
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
            />
          </div>
          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              disabled={working}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              disabled={working}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              Guardar cambios
            </button>
          </div>
        </form>
      </Modal>

      <CriticalActionModal
        open={deleteOpen}
        onClose={() => !working && setDeleteOpen(false)}
        onConfirm={() => removeConfirmed()}
        title="Eliminar contacto"
        message="Esta acción eliminará el contacto seleccionado."
        confirmText="Eliminar"
        loading={working}
        danger
        requireReason={false}
      />
    </div>
  );
}
