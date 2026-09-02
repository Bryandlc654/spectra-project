import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { createApi } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ToastProvider';
import PageLoading from '../../components/PageLoading';
import Modal from '../../components/Modal';
import ConfirmModal from '../../components/ConfirmModal';

export default function FreelancerAreasPage({ apiUrl }) {
    const { token } = useAuth();
    const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
    const toast = useToast();

    const [loading, setLoading] = useState(true);
    const [areas, setAreas] = useState([]);
    
    // Create/Edit Modal
    const [openModal, setOpenModal] = useState(false);
    const [editingArea, setEditingArea] = useState(null);
    const [formData, setFormData] = useState({ name: '' });
    const [saving, setSaving] = useState(false);

    // Delete Modal
    const [deletingArea, setDeletingArea] = useState(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        loadAreas();
    }, []);

    async function loadAreas() {
        try {
            setLoading(true);
            const data = await api.get('/api/freelancer-areas');
            setAreas(data || []);
        } catch (e) {
            toast.error('Error al cargar áreas: ' + e.message);
        } finally {
            setLoading(false);
        }
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
            loadAreas();
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
            loadAreas();
        } catch (e) {
            toast.error(e.message || 'Error al eliminar área');
        } finally {
            setDeleting(false);
        }
    }

    if (loading) return <PageLoading />;

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <div className="mb-6">
                <Link to="/dashboard/freelancers" className="inline-flex items-center text-sm text-slate-500 hover:text-brand mb-4">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Volver a Freelancers
                </Link>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Áreas y Especialidades</h1>
                        <p className="text-slate-500">Gestiona las áreas disponibles para los freelancers.</p>
                    </div>
                    <button
                        onClick={handleOpenCreate}
                        className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-dark"
                    >
                        Nueva Área
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-3 font-semibold text-slate-700">Nombre</th>
                            <th className="px-6 py-3 font-semibold text-slate-700 w-32 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {areas.length === 0 ? (
                            <tr>
                                <td colSpan="2" className="px-6 py-8 text-center text-slate-500 italic">
                                    No hay áreas registradas.
                                </td>
                            </tr>
                        ) : (
                            areas.map(area => (
                                <tr key={area.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-3 font-medium text-slate-900">{area.name}</td>
                                    <td className="px-6 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button 
                                                onClick={() => handleOpenEdit(area)}
                                                className="p-1.5 text-slate-500 hover:text-brand hover:bg-brand/5 rounded transition-colors"
                                                title="Editar"
                                            >
                                                <i className="bi bi-pencil"></i>
                                            </button>
                                            <button 
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

            {/* Create/Edit Modal */}
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

            {/* Delete Confirmation */}
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
