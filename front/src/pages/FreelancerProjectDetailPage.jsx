import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { createApi } from '../lib/api';

export default function FreelancerProjectDetailPage({ user, apiUrl, token }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);

  useEffect(() => {
    if (!user?.id || !id) return;

    const fetchProject = async () => {
      try {
        setLoading(true);
        const data = await api.get(`/api/freelancers/${user.id}/projects/${id}`);
        setProject(data);
      } catch (err) {
        console.error('Error fetching project details:', err);
        setError('No se pudo cargar el proyecto o no tienes acceso.');
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [user?.id, id, api]);

  function handleContactSupervisors() {
    if (!project?.responsibles?.length) return;
    const emails = project.responsibles.map(r => r.email).filter(Boolean).join(',');
    const subject = `Consulta sobre proyecto: ${project.name}`;
    window.location.href = `mailto:${emails}?subject=${encodeURIComponent(subject)}`;
  }

  if (loading) return <div className="p-8 text-center text-slate-500">Cargando detalles...</div>;
  if (error) return (
    <div className="p-8 text-center">
        <div className="text-red-500 mb-4">{error}</div>
        <button onClick={() => navigate('/dashboard/projects')} className="text-indigo-600 hover:underline">
            Volver a mis proyectos
        </button>
    </div>
  );
  if (!project) return null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link to="/dashboard/projects" className="mb-4 inline-flex items-center text-sm text-slate-500 hover:text-slate-900">
            <i className="bi bi-arrow-left me-2"></i> Volver a mis proyectos
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
                <h1 className="text-3xl font-bold text-slate-900">{project.name}</h1>
                <p className="mt-1 text-lg text-slate-600">{project.company_name}</p>
            </div>
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                project.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 
                project.status === 'completed' ? 'bg-blue-100 text-blue-800' : 
                'bg-slate-100 text-slate-800'
            }`}>
                {project.status === 'active' ? 'Activo' : project.status === 'completed' ? 'Completado' : project.status}
            </span>
        </div>
      </div>

      {/* Description & Responsibles */}
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900 mb-4">Descripción y Alcance</h2>
                <div className="prose prose-slate max-w-none text-slate-600">
                    {project.description || 'Sin descripción detallada.'}
                </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900 mb-4">Hitos y Entregables</h2>
                {(!project.milestones || project.milestones.length === 0) ? (
                    <p className="text-slate-500 italic">No hay hitos definidos.</p>
                ) : (
                    <div className="space-y-6">
                        {project.milestones.map((milestone) => (
                            <div key={milestone.id} className="relative border-l-2 border-slate-200 pl-6 pb-2">
                                <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full bg-indigo-100 ring-4 ring-white border-2 border-indigo-500"></div>
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start">
                                    <h3 className="font-semibold text-slate-900">{milestone.title}</h3>
                                    {milestone.due_date && (
                                        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">
                                            Vence: {new Date(milestone.due_date).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>
                                {milestone.description && <p className="mt-1 text-sm text-slate-600">{milestone.description}</p>}
                                
                                {milestone.deliverables && milestone.deliverables.length > 0 && (
                                    <div className="mt-4 rounded-xl bg-slate-50 p-4">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Entregables Requeridos</h4>
                                        <ul className="space-y-2">
                                            {milestone.deliverables.map(d => (
                                                <li key={d.id} className="flex items-start gap-2 text-sm text-slate-700">
                                                    <i className="bi bi-check-circle text-indigo-500 mt-0.5"></i>
                                                    <span>{d.title}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>

        <div className="space-y-8">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900 mb-4">Supervisores</h2>
                {(!project.responsibles || project.responsibles.length === 0) ? (
                    <p className="text-slate-500 italic">No hay supervisores asignados.</p>
                ) : (
                    <div className="space-y-4">
                        {project.responsibles.map((resp, idx) => (
                            <div key={idx} className="flex items-center gap-3">
                                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-bold">
                                    {resp.full_name.charAt(0)}
                                </div>
                                <div>
                                    <p className="font-medium text-slate-900">{resp.full_name}</p>
                                    <a href={`mailto:${resp.email}`} className="text-xs text-indigo-600 hover:underline">
                                        {resp.email}
                                    </a>
                                    <div className="text-xs text-slate-500 capitalize">{resp.role_in_project}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                <div className="mt-6 pt-4 border-t border-slate-100">
                    <button 
                        onClick={handleContactSupervisors}
                        disabled={!project.responsibles || project.responsibles.length === 0}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <i className="bi bi-envelope me-2"></i> Contactar Supervisores
                    </button>
                </div>
            </section>
            
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900 mb-4">Fechas Clave</h2>
                <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Inicio</span>
                        <span className="font-medium text-slate-900">
                            {project.start_date ? new Date(project.start_date).toLocaleDateString() : '—'}
                        </span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Fin Estimado</span>
                        <span className="font-medium text-slate-900">
                            {project.end_date ? new Date(project.end_date).toLocaleDateString() : '—'}
                        </span>
                    </div>
                </div>
            </section>
        </div>
      </div>
    </div>
  );
}
