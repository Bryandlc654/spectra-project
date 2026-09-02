import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { createApi } from '../lib/api';

export default function FreelancerProjectsPage({ user, apiUrl, token }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);

  useEffect(() => {
    if (!user?.id) return;

    const fetchProjects = async () => {
      try {
        setLoading(true);
        const data = await api.get(`/api/freelancers/${user.id}/projects`);
        setProjects(data || []);
      } catch (err) {
        console.error('Error fetching projects:', err);
        setError('No se pudieron cargar los proyectos.');
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [user?.id, api]);

  if (loading) return <div className="p-8 text-center text-slate-500">Cargando proyectos...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Mis Proyectos</h1>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                <i className="bi bi-kanban text-3xl text-slate-400"></i>
            </div>
            <h3 className="text-lg font-medium text-slate-900">No tienes proyectos asignados</h3>
            <p className="mt-2 text-slate-500">Cuando te asignen a un proyecto, aparecerá aquí.</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link 
                key={project.id} 
                to={`/dashboard/projects/${project.id}`}
                className="group block rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                    <h3 className="font-bold text-slate-900 group-hover:text-indigo-600">{project.name}</h3>
                    <p className="text-sm text-slate-500">{project.company_name}</p>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    project.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 
                    project.status === 'completed' ? 'bg-blue-100 text-blue-800' : 
                    'bg-slate-100 text-slate-800'
                }`}>
                    {project.status === 'active' ? 'Activo' : project.status === 'completed' ? 'Completado' : project.status}
                </span>
              </div>
              
              <p className="mt-4 text-sm text-slate-600 line-clamp-2">
                {project.description || 'Sin descripción'}
              </p>

              <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
                <div className="text-xs text-slate-500">
                    <i className="bi bi-calendar-event me-1"></i>
                    {project.start_date ? new Date(project.start_date).toLocaleDateString() : '—'}
                </div>
                <div className="text-xs font-medium text-indigo-600">
                    Ver detalles <i className="bi bi-arrow-right ms-1"></i>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
