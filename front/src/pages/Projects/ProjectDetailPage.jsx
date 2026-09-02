import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../components/ToastProvider';
import { useAuth } from '../../context/AuthContext';
import Modal from '../../components/Modal';
import { apiFetch } from '../../lib/api';

export default function ProjectDetailPage({ apiUrl, token }) {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [project, setProject] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modals
  const [msModalOpen, setMsModalOpen] = useState(false);
  const [msForm, setMsForm] = useState({ title: '', description: '', due_date: '', amount: '' });
  const [editingMs, setEditingMs] = useState(null);

  const [delModalOpen, setDelModalOpen] = useState(false);
  const [delForm, setDelForm] = useState({ title: '', description: '', file_url: '' });
  const [activeMsId, setActiveMsId] = useState(null); // Which milestone we are adding to
  const [editingDel, setEditingDel] = useState(null);

  // Status/Feedback Modal
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewData, setReviewData] = useState({ status: '', feedback: '' });
  const [reviewDel, setReviewDel] = useState(null);

  // Member Management State
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [potentialMembers, setPotentialMembers] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberRole, setMemberRole] = useState('viewer');

  useEffect(() => {
    loadData();
  }, [id, apiUrl, token]);

  async function loadData() {
    setLoading(true);
    try {
      // 1. Get Project
      const pRes = await apiFetch(apiUrl, `/api/projects/${id}`, { token });
      setProject(pRes);

      // 2. Get Milestones (nested)
      const mRes = await apiFetch(apiUrl, `/api/projects/${id}/milestones`, { token });
      setMilestones(mRes || []);

    } catch (e) {
      toast.error('Error cargando detalles del proyecto');
      navigate('/projects');
    } finally {
      setLoading(false);
    }
  }

  // --- Milestones ---

  function handleAddMs() {
    setEditingMs(null);
    setMsForm({ title: '', description: '', due_date: '', amount: '' });
    setMsModalOpen(true);
  }

  function handleEditMs(ms) {
    setEditingMs(ms);
    setMsForm({
      title: ms.title,
      description: ms.description || '',
      due_date: ms.due_date || '',
      amount: ms.amount || ''
    });
    setMsModalOpen(true);
  }

  async function handleSaveMs(e) {
    e.preventDefault();
    try {
      if (editingMs) {
        await apiFetch(apiUrl, `/api/projects/milestones/${editingMs.id}`, {
          token, method: 'PUT', body: JSON.stringify(msForm)
        });
        toast.success('Hito actualizado');
      } else {
        await apiFetch(apiUrl, `/api/projects/${id}/milestones`, {
          token, method: 'POST', body: JSON.stringify(msForm)
        });
        toast.success('Hito creado');
      }
      setMsModalOpen(false);
      loadData();
    } catch (err) {
      toast.error('Error guardando hito');
    }
  }

  async function handleDeleteMs(msId) {
    if (!window.confirm('¿Eliminar este hito?')) return;
    try {
      await apiFetch(apiUrl, `/api/projects/milestones/${msId}`, { token, method: 'DELETE' });
      toast.success('Hito eliminado');
      loadData();
    } catch (err) {
      toast.error('Error eliminando hito');
    }
  }

  // --- Deliverables ---

  function handleAddDel(msId) {
    setActiveMsId(msId);
    setEditingDel(null);
    setDelForm({ title: '', description: '', file_url: '' });
    setDelModalOpen(true);
  }

  function handleEditDel(del) {
    setEditingDel(del);
    setDelForm({
      title: del.title,
      description: del.description || '',
      file_url: del.file_url || ''
    });
    setDelModalOpen(true);
  }

  async function handleSaveDel(e) {
    e.preventDefault();
    try {
      if (editingDel) {
        await apiFetch(apiUrl, `/api/projects/deliverables/${editingDel.id}`, {
          token, method: 'PUT', body: JSON.stringify(delForm)
        });
        toast.success('Entregable actualizado');
      } else {
        await apiFetch(apiUrl, `/api/projects/milestones/${activeMsId}/deliverables`, {
          token, method: 'POST', body: JSON.stringify(delForm)
        });
        toast.success('Entregable agregado');
      }
      setDelModalOpen(false);
      loadData();
    } catch (err) {
      toast.error('Error guardando entregable');
    }
  }

  async function handleDeleteDel(delId) {
    if (!window.confirm('¿Eliminar entregable?')) return;
    try {
      await apiFetch(apiUrl, `/api/projects/deliverables/${delId}`, { token, method: 'DELETE' });
      toast.success('Entregable eliminado');
      loadData();
    } catch (err) {
      toast.error('Error eliminando entregable');
    }
  }

  // --- Approval / Status ---

  function openReview(del) {
    setReviewDel(del);
    setReviewData({ status: del.status, feedback: del.feedback || '' });
    setReviewModalOpen(true);
  }

  async function saveReview() {
    try {
      await apiFetch(apiUrl, `/api/projects/deliverables/${reviewDel.id}`, {
        token, method: 'PUT', body: JSON.stringify(reviewData)
      });
      toast.success('Estado actualizado');
      setReviewModalOpen(false);
      loadData();
    } catch (err) {
      toast.error('Error actualizando estado');
    }
  }

  // --- Render Helpers ---

  function renderStatusBadge(status) {
    const s = (status || 'pending').toLowerCase();
    let cls = 'bg-slate-100 text-slate-600';
    if (s === 'approved') cls = 'bg-emerald-100 text-emerald-700';
    if (s === 'rejected') cls = 'bg-red-100 text-red-700';
    if (s === 'submitted') cls = 'bg-blue-100 text-blue-700';
    return <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${cls}`}>{s}</span>;
  }

  if (loading) return <div className="p-8 text-center text-slate-500">Cargando proyecto...</div>;
  if (!project) return null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => navigate('/projects')} className="text-sm text-slate-500 hover:text-brand mb-2">
            &larr; Volver a Proyectos
          </button>
          <h1 className="text-3xl font-bold text-slate-900">{project.name}</h1>
          <p className="text-slate-500 mt-1">{project.description}</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-slate-500">Estado</div>
          <div className="font-semibold capitalize">{project.status}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Sidebar Info */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <h3 className="font-semibold text-slate-900 mb-3">Detalles</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Inicio:</span>
                <span>{project.start_date || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Fin:</span>
                <span>{project.end_date || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Moneda:</span>
                <span>{project.currency_code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">País:</span>
                <span>{project.country_name}</span>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <h3 className="font-semibold text-slate-900 mb-3">Miembros</h3>
            <div className="space-y-2">
              {project.members && project.members.map(m => (
                <div key={m.company_user_id} className="flex items-center gap-2 text-sm">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                    {m.full_name?.charAt(0)}
                  </div>
                  <div>
                    <div className="font-medium">{m.full_name}</div>
                    <div className="text-xs text-slate-500 capitalize">{m.role_in_project}</div>
                  </div>
                </div>
              ))}
              {(!project.members || project.members.length === 0) && (
                <div className="text-xs text-slate-400">Sin miembros asignados</div>
              )}
            </div>
          </div>
        </div>

        {/* Main Content: Milestones */}
        <div className="md:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">Hitos y Entregables</h2>
            <button 
              onClick={handleAddMs}
              className="px-3 py-1.5 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90"
            >
              + Nuevo Hito
            </button>
          </div>

          {milestones.length === 0 && (
            <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 border-dashed">
              <p className="text-slate-500">No hay hitos definidos para este proyecto.</p>
            </div>
          )}

          {milestones.map(ms => (
            <div key={ms.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">{ms.title}</h3>
                  <div className="text-xs text-slate-500 flex gap-3 mt-1">
                    {ms.due_date && <span>Vence: {ms.due_date}</span>}
                    {ms.amount > 0 && <span>Monto: {ms.amount}</span>}
                    <span className="capitalize">Estado: {ms.status}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => handleEditMs(ms)} className="p-1.5 text-slate-400 hover:text-brand"><i className="bi bi-pencil"></i></button>
                  <button onClick={() => handleDeleteMs(ms.id)} className="p-1.5 text-slate-400 hover:text-red-600"><i className="bi bi-trash"></i></button>
                </div>
              </div>
              
              <div className="p-4">
                {ms.description && <p className="text-sm text-slate-600 mb-4">{ms.description}</p>}

                {/* Deliverables List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Entregables</h4>
                    <button 
                      onClick={() => handleAddDel(ms.id)}
                      className="text-xs text-brand font-semibold hover:underline"
                    >
                      + Agregar Entregable
                    </button>
                  </div>

                  {ms.deliverables && ms.deliverables.map(del => (
                    <div key={del.id} className="group flex items-start justify-between p-3 rounded-lg border border-slate-100 hover:border-slate-300 transition-colors bg-slate-50/50">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm text-slate-900">{del.title}</span>
                          {renderStatusBadge(del.status)}
                        </div>
                        {del.description && <p className="text-xs text-slate-500 mb-1">{del.description}</p>}
                        {del.file_url && (
                          <a href={del.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline inline-flex items-center gap-1">
                            <i className="bi bi-link-45deg"></i> Ver Archivo
                          </a>
                        )}
                        {del.feedback && (
                          <div className="mt-2 text-xs bg-amber-50 text-amber-800 p-2 rounded border border-amber-100">
                            <strong>Feedback:</strong> {del.feedback}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         {(user?.role === 'company_admin' || user?.role === 'admin' || user?.platform_role === 'admin') && (
                           <button 
                            onClick={() => openReview(del)}
                            className="px-2 py-1 text-xs font-medium bg-white border border-slate-200 rounded hover:bg-slate-50 text-slate-700 whitespace-nowrap"
                          >
                            Revisar / Estado
                          </button>
                         )}
                        <div className="flex justify-end gap-1">
                          <button onClick={() => handleEditDel(del)} className="p-1 text-slate-400 hover:text-brand"><i className="bi bi-pencil"></i></button>
                          <button onClick={() => handleDeleteDel(del.id)} className="p-1 text-slate-400 hover:text-red-600"><i className="bi bi-trash"></i></button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!ms.deliverables || ms.deliverables.length === 0) && (
                    <div className="text-xs text-slate-400 italic">Sin entregables.</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

          {/* Timesheets Section (New) */}
          <div className="space-y-4 pt-6 border-t border-slate-200">
             <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">Hojas de Tiempo (Timesheets)</h2>
                <button 
                   onClick={() => navigate(`/dashboard/timesheets?project_id=${id}`)}
                   className="text-sm text-brand font-semibold hover:underline"
                >
                   Ver todas &rarr;
                </button>
             </div>
             <div className="bg-slate-50 rounded-xl p-6 text-center border border-slate-200 border-dashed">
                <p className="text-slate-500 mb-2">Gestiona y valida los tiempos registrados en este proyecto.</p>
                <button 
                  onClick={() => navigate(`/dashboard/timesheets?project_id=${id}`)}
                  className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Ir a Validación de Timesheets
                </button>
             </div>
          </div>

      </div>

      {/* Member Modal */}
      <Modal open={memberModalOpen} onClose={() => setMemberModalOpen(false)} title="Gestionar Miembros del Proyecto">
        <div className="space-y-4">
           <div>
             <label className="block text-sm font-medium text-slate-700 mb-1">Buscar Usuario / Freelancer</label>
             <input 
               type="text" 
               placeholder="Nombre o email..." 
               value={memberSearch}
               onChange={(e) => setMemberSearch(e.target.value)}
               className="w-full rounded-lg border-slate-300 focus:border-brand focus:ring-brand sm:text-sm"
             />
           </div>
           
           <div className="max-h-60 overflow-y-auto space-y-2 border border-slate-100 rounded-lg p-2">
             {potentialMembers
                .filter(u => u.full_name.toLowerCase().includes(memberSearch.toLowerCase()) || u.email.toLowerCase().includes(memberSearch.toLowerCase()))
                .map(u => {
                  const isMember = project?.members?.some(m => m.company_user_id === u.id);
                  return (
                    <div key={u.id} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded">
                       <div>
                         <div className="text-sm font-medium text-slate-900">{u.full_name}</div>
                         <div className="text-xs text-slate-500">{u.email}</div>
                       </div>
                       {isMember ? (
                         <span className="text-xs text-emerald-600 font-medium px-2 py-1 bg-emerald-50 rounded">Asignado</span>
                       ) : (
                         <div className="flex items-center gap-2">
                            <select 
                              className="text-xs border-slate-200 rounded py-1 pl-2 pr-6"
                              onChange={(e) => setMemberRole(e.target.value)}
                              defaultValue="viewer"
                            >
                               <option value="viewer">Viewer</option>
                               <option value="editor">Editor</option>
                               <option value="manager">Manager</option>
                            </select>
                            <button 
                              onClick={() => handleAddMember(u.id)}
                              className="text-xs bg-brand text-white px-2 py-1 rounded hover:bg-brand/90"
                            >
                              Asignar
                            </button>
                         </div>
                       )}
                    </div>
                  );
                })
             }
             {potentialMembers.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No se encontraron usuarios.</p>}
           </div>
        </div>
      </Modal>

      {/* Milestone Modal */}
      <Modal open={msModalOpen} onClose={() => setMsModalOpen(false)} title={editingMs ? 'Editar Hito' : 'Nuevo Hito'}>
        <form onSubmit={handleSaveMs} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Título</label>
            <input 
              type="text" required value={msForm.title} onChange={e => setMsForm({...msForm, title: e.target.value})}
              className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Descripción</label>
            <textarea 
              rows="2" value={msForm.description} onChange={e => setMsForm({...msForm, description: e.target.value})}
              className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Fecha Límite</label>
              <input 
                type="date" value={msForm.due_date} onChange={e => setMsForm({...msForm, due_date: e.target.value})}
                className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Monto ($)</label>
              <input 
                type="number" step="0.01" value={msForm.amount} onChange={e => setMsForm({...msForm, amount: e.target.value})}
                className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end pt-4">
             <button type="button" onClick={() => setMsModalOpen(false)} className="mr-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">Cancelar</button>
             <button type="submit" className="px-4 py-2 text-sm bg-brand text-white rounded-lg hover:bg-brand/90">Guardar</button>
          </div>
        </form>
      </Modal>

      {/* Deliverable Modal */}
      <Modal open={delModalOpen} onClose={() => setDelModalOpen(false)} title={editingDel ? 'Editar Entregable' : 'Nuevo Entregable'}>
        <form onSubmit={handleSaveDel} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Título</label>
            <input 
              type="text" required value={delForm.title} onChange={e => setDelForm({...delForm, title: e.target.value})}
              className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Descripción</label>
            <textarea 
              rows="2" value={delForm.description} onChange={e => setDelForm({...delForm, description: e.target.value})}
              className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">URL del Archivo / Link</label>
            <input 
              type="url" value={delForm.file_url} onChange={e => setDelForm({...delForm, file_url: e.target.value})}
              placeholder="https://..."
              className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
            />
          </div>
          <div className="flex justify-end pt-4">
             <button type="button" onClick={() => setDelModalOpen(false)} className="mr-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">Cancelar</button>
             <button type="submit" className="px-4 py-2 text-sm bg-brand text-white rounded-lg hover:bg-brand/90">Guardar</button>
          </div>
        </form>
      </Modal>

      {/* Review Modal */}
      <Modal open={reviewModalOpen} onClose={() => setReviewModalOpen(false)} title="Revisar Entregable">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Actualiza el estado del entregable <strong>{reviewDel?.title}</strong>.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700">Estado</label>
            <select 
              value={reviewData.status} onChange={e => setReviewData({...reviewData, status: e.target.value})}
              className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
            >
              <option value="pending">Pendiente</option>
              <option value="submitted">Enviado (Submitted)</option>
              {(user?.role === 'company_admin' || user?.role === 'admin') && (
                <>
                  <option value="approved">Aprobado</option>
                  <option value="rejected">Rechazado</option>
                </>
              )}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Feedback / Comentarios</label>
            <textarea 
              rows="3" value={reviewData.feedback} onChange={e => setReviewData({...reviewData, feedback: e.target.value})}
              className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
              placeholder="Razón del rechazo o comentarios de aprobación..."
            />
          </div>
          <div className="flex justify-end pt-4">
             <button type="button" onClick={() => setReviewModalOpen(false)} className="mr-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">Cancelar</button>
             <button onClick={saveReview} className="px-4 py-2 text-sm bg-brand text-white rounded-lg hover:bg-brand/90">Actualizar Estado</button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
