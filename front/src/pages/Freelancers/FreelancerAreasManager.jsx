import React, { useEffect, useMemo, useState } from 'react';
import { createApi } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ToastProvider';
import Modal from '../../components/Modal';
import ConfirmModal from '../../components/ConfirmModal';

export default function FreelancerAreasManager({ apiUrl, onChanged }) {
  const { token } = useAuth();
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [areas, setAreas] = useState([]);

  // Crear / Editar
  const [openModal, setOpenModal] = useState(false);
  const [editingArea, setEditingArea] = useState(null);
  const [formData, setFormData] = useState({ name: '' });
  const [saving, setSaving] = useState(false);

  // Eliminar
  const [deletingArea, setDeletingArea] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadAreas();
    // eslint-disable-next-line
  }, []);

  async function loadAreas() {
    try {
      setLoading(true);
      const data = await api.get('/api/freelancer-areas');
      setAreas(Array.isArray(data) ? data : (data?.data || []));
    } catch (e) {
      toast.error('Error al cargar áreas: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  function notifyChanged() {
    if (typeof onChanged === 'function') onChanged();
  }

  function handleOpenCreate() {
    setEditingArea(null);
    setFormData({ name: '' });
    setOpenModal(true);
  }

  function handleOpenEdit(area) {
    setEditingArea(area);
    setFormData({ name: area.name });
    setOpenModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formData.name.trim()) return;

    try {
      setSaving(true);
      if (editingArea) {
        await api.put(`/api/freelancer-areas/${editingArea.id}`, formData);
        toast.success('Área actualizada correctamente');
      } else {
        await api.post('/api/freelancer-areas', formData);
        toast.success('Área creada correctamente');
      }
      setOpenModal(false);
      await loadAreas();
      notifyChanged();
    } catch (e) {
      toast.error(e.message || 'Error al guardar área');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deletingArea) return;
    try {
      setDeleting(true);
      await api.delete(`/api/freelancer-areas/${deletingArea.id}`);
      toast.success('Área eliminada correctamente');
      setDeletingArea(null);
      await loadAreas();
      notifyChanged();
    } catch (e) {
      toast.error(e.message || 'Error al eliminar área');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">Gestiona las áreas disponibles para los freelancers.</p>
        <button
          onClick={handleOpenCreate}
          type="button"
          className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-dark"
        >
          Nueva Área
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 font-semibold text-slate-700">Nombre</th>
              <th className="px-4 py-3 font-semibold text-slate-700 w-32 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan="2" className="px-4 py-8 text-center text-slate-500">Cargando áreas...</td>
              </tr>
            ) : areas.length === 0 ? (
              <tr>
                <td colSpan="2" className="px-4 py-8 text-center text-slate-500 italic">No hay áreas registradas.</td>
              </tr>
            ) : (
              areas.map(area => (
                <tr key={area.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{area.name}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(area)}
                        className="p-1.5 text-slate-500 hover:text-brand hover:bg-brand/5 rounded transition-colors"
                        title="Editar"
                      >
                        <i className="bi bi-pencil"></i>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingArea(area)}
                        className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Eliminar"
                      >
                        <i className="bi bi-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        title={editingArea ? 'Editar Área' : 'Nueva Área'}
        size="sm"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
            <input
              type="text"
              required
              autoFocus
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-brand focus:border-brand"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ej. Desarrollo Web"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpenModal(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-dark disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deletingArea}
        onClose={() => setDeletingArea(null)}
        onConfirm={handleDelete}
        title="Eliminar Área"
        message={`¿Estás seguro de que deseas eliminar el área "${deletingArea?.name}"? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        loading={deleting}
        type="danger"
      />
    </div>
  );
}
