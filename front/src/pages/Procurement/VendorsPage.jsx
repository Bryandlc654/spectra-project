import React, { useEffect, useState } from 'react';
import { useToast } from '../../components/ToastProvider';
import Modal from '../../components/Modal';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext'; // Import useAuth hook

export default function VendorsPage({ apiUrl }) {
  const { token, user } = useAuth(); // Import user from AuthContext
  const toast = useToast();
  
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    tax_id: '',
    contact_name: '',
    email: '',
    phone: '',
    address: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr('');
      try {
        const res = await apiFetch(apiUrl, '/api/procurement/vendors', { token });
        if (!cancelled) setVendors(res.data || []);
      } catch (e) {
        if (!cancelled) setErr(e?.message || 'No se pudieron cargar los proveedores');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [apiUrl, token]);

  const handleEdit = (vendor) => {
    setEditingId(vendor.id);
    setFormData({
      name: vendor.name,
      tax_id: vendor.tax_id || '',
      contact_name: vendor.contact_name || '',
      email: vendor.email || '',
      phone: vendor.phone || '',
      address: vendor.address || ''
    });
    setModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar este proveedor?')) return;
    try {
      await apiFetch(apiUrl, `/api/procurement/vendors/${id}`, {
        token,
        method: 'DELETE'
      });
      toast.success('Proveedor eliminado');
      setVendors(prev => prev.filter(v => v.id !== id));
    } catch (e) {
      toast.error(e?.message || 'Error al eliminar');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Include company_id from user context
      const payload = {
          ...formData,
          company_id: user?.company_id
      };
      
      if (editingId) {
        await apiFetch(apiUrl, `/api/procurement/vendors/${editingId}`, {
            token,
            method: 'PUT',
            body: payload
        });
        toast.success('Proveedor actualizado');
      } else {
        await apiFetch(apiUrl, '/api/procurement/vendors', {
            token,
            method: 'POST',
            body: payload
        });
        toast.success('Proveedor creado');
      }

      setModalOpen(false);
      setEditingId(null);
      
      const res = await apiFetch(apiUrl, '/api/procurement/vendors', { token });
      setVendors(res.data || []);
    } catch (e) {
      toast.error(e?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Proveedores</h1>
          <p className="text-sm text-slate-500">Gestión de proveedores y acreedores</p>
        </div>
        <button
          onClick={() => {
              setEditingId(null);
              setFormData({ name: '', tax_id: '', contact_name: '', email: '', phone: '', address: '' });
              setModalOpen(true);
          }}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand/90"
        >
          <i className="bi bi-plus-lg mr-2" />
          Nuevo Proveedor
        </button>
      </div>

      {loading && <div className="text-center py-12 text-slate-500">Cargando...</div>}
      
      {err && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-900 border border-red-200">
            {err}
        </div>
      )}

      {!loading && !err && vendors.length === 0 && (
          <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-200">
              <i className="bi bi-truck text-4xl text-slate-300 mb-3 block" />
              <p className="text-slate-500">No hay proveedores registrados</p>
          </div>
      )}

      {vendors.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Nombre</th>
                <th className="px-4 py-3 text-left">Tax ID / RUT</th>
                <th className="px-4 py-3 text-left">Contacto</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-right">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vendors.map(v => (
                <tr key={v.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                      {v.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                      {v.tax_id || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                      {v.contact_name || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                      {v.email || '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${v.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {v.status}
                      </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button 
                        onClick={() => handleEdit(v)}
                        className="text-slate-400 hover:text-brand transition-colors"
                        title="Editar"
                    >
                        <i className="bi bi-pencil" />
                    </button>
                    <button 
                        onClick={() => handleDelete(v.id)}
                        className="text-slate-400 hover:text-red-500 transition-colors"
                        title="Eliminar"
                    >
                        <i className="bi bi-trash" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Editar Proveedor" : "Nuevo Proveedor"}>
        <form onSubmit={handleSave} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Comercial <span className="text-red-500">*</span></label>
                <input 
                    type="text" 
                    required
                    className="w-full rounded-xl border-slate-200 focus:border-brand focus:ring-brand"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="Ej. Acme Corp"
                />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tax ID / RUT</label>
                    <input 
                        type="text" 
                        className="w-full rounded-xl border-slate-200 focus:border-brand focus:ring-brand"
                        value={formData.tax_id}
                        onChange={e => setFormData({...formData, tax_id: e.target.value})}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Persona de Contacto</label>
                    <input 
                        type="text" 
                        className="w-full rounded-xl border-slate-200 focus:border-brand focus:ring-brand"
                        value={formData.contact_name}
                        onChange={e => setFormData({...formData, contact_name: e.target.value})}
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                    <input 
                        type="email" 
                        className="w-full rounded-xl border-slate-200 focus:border-brand focus:ring-brand"
                        value={formData.email}
                        onChange={e => setFormData({...formData, email: e.target.value})}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                    <input 
                        type="text" 
                        className="w-full rounded-xl border-slate-200 focus:border-brand focus:ring-brand"
                        value={formData.phone}
                        onChange={e => setFormData({...formData, phone: e.target.value})}
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Dirección</label>
                <textarea 
                    className="w-full rounded-xl border-slate-200 focus:border-brand focus:ring-brand"
                    rows="2"
                    value={formData.address}
                    onChange={e => setFormData({...formData, address: e.target.value})}
                />
            </div>

            <div className="pt-4 flex justify-end gap-2">
                <button 
                    type="button" 
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 text-slate-700 font-semibold hover:bg-slate-100 rounded-lg"
                >
                    Cancelar
                </button>
                <button 
                    type="submit" 
                    disabled={saving}
                    className="px-4 py-2 bg-brand text-white font-bold rounded-lg hover:bg-brand/90 disabled:opacity-50"
                >
                    {saving ? 'Guardando...' : 'Crear Proveedor'}
                </button>
            </div>
        </form>
      </Modal>
    </div>
  );
}