import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../components/ToastProvider';
import Modal from '../../components/Modal';
import { apiFetch } from '../../lib/api';

export default function ProjectsPage({ apiUrl, token }) {
  const toast = useToast();
  
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');

  // Create/Edit Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'active',
    start_date: '',
    end_date: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr('');
      try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        if (search) params.set('q', search.trim());

        const res = await apiFetch(apiUrl, `/api/projects?${params.toString()}`, { token });
        
        let items = [];
        let pages = 1;

        if (Array.isArray(res)) {
          items = res;
        } else if (Array.isArray(res.items)) {
          items = res.items;
          pages = res.pages || res.meta?.total_pages || 1;
        } else if (Array.isArray(res.data)) {
          items = res.data;
          pages = res.meta?.total_pages || res.pages || 1;
        }

        if (!cancelled) {
          setProjects(items);
          setTotalPages(Math.max(1, Number(pages) || 1));
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e?.message || 'No se pudieron cargar los proyectos');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [apiUrl, token, page, search]);

  const handleReload = () => {
    setPage(1);
    // Trigger reload via effect
    setSearch(prev => prev); 
  };

  const handleCreate = () => {
    setEditingProject(null);
    setFormData({
      name: '',
      description: '',
      status: 'active',
      start_date: '',
      end_date: ''
    });
    setModalOpen(true);
  };

  const handleEdit = (project) => {
    setEditingProject(project);
    setFormData({
      name: project.name || '',
      description: project.description || '',
      status: project.status || 'active',
      start_date: project.start_date ? project.start_date.substring(0, 10) : '',
      end_date: project.end_date ? project.end_date.substring(0, 10) : ''
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingProject 
        ? `/api/projects/${editingProject.id}`
        : '/api/projects';
      
      const method = editingProject ? 'PUT' : 'POST';

      await apiFetch(apiUrl, url, {
        token,
        method,
        body: JSON.stringify(formData)
      });

      toast.success(editingProject ? 'Proyecto actualizado' : 'Proyecto creado');
      setModalOpen(false);
      handleReload();
    } catch (e) {
      toast.error(e?.message || 'Error al guardar proyecto');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar este proyecto?')) return;
    try {
      await apiFetch(apiUrl, `/api/projects/${id}`, { token, method: 'DELETE' });
      toast.success('Proyecto eliminado');
      handleReload();
    } catch (e) {
      toast.error(e?.message || 'Error al eliminar proyecto');
    }
  };

  const formatDate = (value) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString();
  };

  const renderStatusBadge = (statusRaw) => {
    if (!statusRaw) return <span className="text-xs text-slate-500">Sin estado</span>;
    const status = String(statusRaw).toLowerCase();
    let cls = 'bg-slate-100 text-slate-700';
    if (status === 'active') cls = 'bg-emerald-50 text-emerald-700';
    else if (status === 'completed') cls = 'bg-blue-50 text-blue-700';
    else if (status === 'archived') cls = 'bg-slate-100 text-slate-700';
    else if (status === 'on_hold') cls = 'bg-amber-50 text-amber-700';

    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Proyectos</h1>
          <p className="text-sm text-slate-500">Gestión de proyectos y asignaciones</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar proyectos..."
            className="w-64 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand focus:ring-brand"
          />
          <button
            type="button"
            onClick={handleCreate}
            className="inline-flex items-center gap-1 rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90"
          >
            <i className="bi bi-plus-lg" />
            Nuevo Proyecto
          </button>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingProject ? 'Editar Proyecto' : 'Nuevo Proyecto'}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Nombre del Proyecto</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:ring-brand"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Descripción</label>
            <textarea
              rows="3"
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:ring-brand"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Fecha Inicio</label>
              <input
                type="date"
                value={formData.start_date}
                onChange={e => setFormData({...formData, start_date: e.target.value})}
                className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Fecha Fin</label>
              <input
                type="date"
                value={formData.end_date}
                onChange={e => setFormData({...formData, end_date: e.target.value})}
                className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:ring-brand"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Estado</label>
            <select
              value={formData.status}
              onChange={e => setFormData({...formData, status: e.target.value})}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:ring-brand"
            >
              <option value="active">Activo</option>
              <option value="on_hold">En Espera</option>
              <option value="completed">Completado</option>
              <option value="archived">Archivado</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>

      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {err}
        </div>
      )}

      {!projects.length && !loading && !err && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-12 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-white shadow-sm text-slate-300">
            <i className="bi bi-kanban text-3xl" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No hay proyectos</h3>
          <p className="mt-2 text-slate-500">
            No se encontraron proyectos registrados.
          </p>
          <button
            onClick={handleCreate}
            className="mt-4 inline-flex items-center gap-1 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
          >
            Crear primer proyecto
          </button>
        </div>
      )}

      {projects.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Nombre</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-left">Inicio</th>
                <th className="px-4 py-3 text-left">Fin</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projects.map((proj) => (
                <tr key={proj.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{proj.name}</div>
                    <div className="text-xs text-slate-500 truncate max-w-xs">{proj.description}</div>
                  </td>
                  <td className="px-4 py-3">
                    {renderStatusBadge(proj.status)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatDate(proj.start_date)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatDate(proj.end_date)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        to={`/dashboard/projects/${proj.id}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand"
                        title="Ver Detalles"
                      >
                        <i className="bi bi-eye" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleEdit(proj)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        title="Editar"
                      >
                        <i className="bi bi-pencil" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(proj.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="Eliminar"
                      >
                        <i className="bi bi-trash" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
           {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <i className="bi bi-chevron-left" />
                Anterior
              </button>
              <span>
                Página {page} de {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Siguiente
                <i className="bi bi-chevron-right" />
              </button>
            </div>
           )}
        </div>
      )}
    </div>
  );
}
