import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../components/ToastProvider';
import { useAuth } from '../../context/AuthContext';
import Modal from '../../components/Modal';
import { apiFetch } from '../../lib/api';
import { useI18n } from '../../i18n/I18nContext';

export default function ProjectDetailPage({ apiUrl, token }) {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useI18n();

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
      toast.error(t('projects.detail.loadError'));
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
        toast.success(t('projects.detail.milestoneUpdated'));
      } else {
        await apiFetch(apiUrl, `/api/projects/${id}/milestones`, {
          token, method: 'POST', body: JSON.stringify(msForm)
        });
        toast.success(t('projects.detail.milestoneCreated'));
      }
      setMsModalOpen(false);
      loadData();
    } catch (err) {
      toast.error(t('projects.detail.milestoneSaveError'));
    }
  }

  async function handleDeleteMs(msId) {
    if (!window.confirm(t('projects.detail.milestoneDeleteConfirm'))) return;
    try {
      await apiFetch(apiUrl, `/api/projects/milestones/${msId}`, { token, method: 'DELETE' });
      toast.success(t('projects.detail.milestoneDeleted'));
      loadData();
    } catch (err) {
      toast.error(t('projects.detail.milestoneDeleteError'));
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
        toast.success(t('projects.detail.deliverableUpdated'));
      } else {
        await apiFetch(apiUrl, `/api/projects/milestones/${activeMsId}/deliverables`, {
          token, method: 'POST', body: JSON.stringify(delForm)
        });
        toast.success(t('projects.detail.deliverableAdded'));
      }
      setDelModalOpen(false);
      loadData();
    } catch (err) {
      toast.error(t('projects.detail.deliverableSaveError'));
    }
  }

  async function handleDeleteDel(delId) {
    if (!window.confirm(t('projects.detail.deliverableDeleteConfirm'))) return;
    try {
      await apiFetch(apiUrl, `/api/projects/deliverables/${delId}`, { token, method: 'DELETE' });
      toast.success(t('projects.detail.deliverableDeleted'));
      loadData();
    } catch (err) {
      toast.error(t('projects.detail.deliverableDeleteError'));
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
      toast.success(t('projects.detail.statusUpdated'));
      setReviewModalOpen(false);
      loadData();
    } catch (err) {
      toast.error(t('projects.detail.statusUpdateError'));
    }
  }

  // --- Render Helpers ---

  function statusLabel(value) {
    const key = `projects.status.${String(value || '').toLowerCase()}`;
    const translated = t(key);
    return translated === key ? String(value || '') : translated;
  }

  function roleLabel(value) {
    const key = `projects.roles.${String(value || '').toLowerCase()}`;
    const translated = t(key);
    return translated === key ? String(value || '') : translated;
  }

  function renderStatusBadge(status) {
    const s = (status || 'pending').toLowerCase();
    let cls = 'bg-slate-100 text-slate-600';
    if (s === 'approved') cls = 'bg-emerald-100 text-emerald-700';
    if (s === 'rejected') cls = 'bg-red-100 text-red-700';
    if (s === 'submitted') cls = 'bg-blue-100 text-blue-700';
    return <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${cls}`}>{statusLabel(s)}</span>;
  }

  if (loading) return <div className="p-8 text-center text-slate-500">{t('projects.detail.loading')}</div>;
  if (!project) return null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => navigate('/projects')} className="text-sm text-slate-500 hover:text-brand mb-2">
            &larr; {t('projects.detail.back')}
          </button>
          <h1 className="text-3xl font-bold text-slate-900">{project.name}</h1>
          <p className="text-slate-500 mt-1">{project.description}</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-slate-500">{t('projects.detail.status')}</div>
          <div className="font-semibold capitalize">{statusLabel(project.status)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Sidebar Info */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <h3 className="font-semibold text-slate-900 mb-3">{t('projects.detail.details')}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('projects.detail.start')}</span>
                <span>{project.start_date || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('projects.detail.end')}</span>
                <span>{project.end_date || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('projects.detail.currency')}</span>
                <span>{project.currency_code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('projects.detail.country')}</span>
                <span>{project.country_name}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <h3 className="font-semibold text-slate-900 mb-3">{t('projects.detail.members')}</h3>
            <div className="space-y-2">
              {project.members && project.members.map(m => (
                <div key={m.company_user_id} className="flex items-center gap-2 text-sm">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                    {m.full_name?.charAt(0)}
                  </div>
                  <div>
                    <div className="font-medium">{m.full_name}</div>
                    <div className="text-xs text-slate-500 capitalize">{roleLabel(m.role_in_project)}</div>
                  </div>
                </div>
              ))}
              {(!project.members || project.members.length === 0) && (
                <div className="text-xs text-slate-400">{t('projects.detail.noMembers')}</div>
              )}
            </div>
          </div>
        </div>

        {/* Main Content: Milestones */}
        <div className="md:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">{t('projects.detail.milestonesTitle')}</h2>
            <button
              onClick={handleAddMs}
              className="px-3 py-1.5 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90"
            >
              {t('projects.detail.newMilestone')}
            </button>
          </div>

          {milestones.length === 0 && (
            <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 border-dashed">
              <p className="text-slate-500">{t('projects.detail.noMilestones')}</p>
            </div>
          )}

          {milestones.map(ms => (
            <div key={ms.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">{ms.title}</h3>
                  <div className="text-xs text-slate-500 flex gap-3 mt-1">
                    {ms.due_date && <span>{t('projects.detail.due', { date: ms.due_date })}</span>}
                    {ms.amount > 0 && <span>{t('projects.detail.amount', { amount: ms.amount })}</span>}
                    <span className="capitalize">{t('projects.detail.statusLine', { status: statusLabel(ms.status) })}</span>
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
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('projects.detail.deliverables')}</h4>
                    <button
                      onClick={() => handleAddDel(ms.id)}
                      className="text-xs text-brand font-semibold hover:underline"
                    >
                      {t('projects.detail.addDeliverable')}
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
                            <i className="bi bi-link-45deg"></i> {t('projects.detail.viewFile')}
                          </a>
                        )}
                        {del.feedback && (
                          <div className="mt-2 text-xs bg-amber-50 text-amber-800 p-2 rounded border border-amber-100">
                            <strong>{t('projects.detail.feedback')}</strong> {del.feedback}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         {(user?.role === 'company_admin' || user?.role === 'admin' || user?.platform_role === 'admin') && (
                           <button
                            onClick={() => openReview(del)}
                            className="px-2 py-1 text-xs font-medium bg-white border border-slate-200 rounded hover:bg-slate-50 text-slate-700 whitespace-nowrap"
                          >
                            {t('projects.detail.reviewStatus')}
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
                    <div className="text-xs text-slate-400 italic">{t('projects.detail.noDeliverables')}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

          {/* Timesheets Section (New) */}
          <div className="space-y-4 pt-6 border-t border-slate-200">
             <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">{t('projects.detail.timesheetsTitle')}</h2>
                <button
                   onClick={() => navigate(`/dashboard/timesheets?project_id=${id}`)}
                   className="text-sm text-brand font-semibold hover:underline"
                >
                   {t('projects.detail.viewAll')}
                </button>
             </div>
             <div className="bg-slate-50 rounded-xl p-6 text-center border border-slate-200 border-dashed">
                <p className="text-slate-500 mb-2">{t('projects.detail.timesheetsDescription')}</p>
                <button
                  onClick={() => navigate(`/dashboard/timesheets?project_id=${id}`)}
                  className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {t('projects.detail.goToTimesheets')}
                </button>
             </div>
          </div>

      </div>

      {/* Member Modal */}
      <Modal open={memberModalOpen} onClose={() => setMemberModalOpen(false)} title={t('projects.detail.manageMembers')}>
        <div className="space-y-4">
           <div>
             <label className="block text-sm font-medium text-slate-700 mb-1">{t('projects.detail.searchUser')}</label>
             <input
               type="text"
               placeholder={t('projects.detail.searchUserPlaceholder')}
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
                         <span className="text-xs text-emerald-600 font-medium px-2 py-1 bg-emerald-50 rounded">{t('projects.detail.assigned')}</span>
                       ) : (
                         <div className="flex items-center gap-2">
                            <select
                              className="text-xs border-slate-200 rounded py-1 pl-2 pr-6"
                              onChange={(e) => setMemberRole(e.target.value)}
                              defaultValue="viewer"
                            >
                               <option value="viewer">{t('projects.roles.viewer')}</option>
                               <option value="editor">{t('projects.roles.editor')}</option>
                               <option value="manager">{t('projects.roles.manager')}</option>
                            </select>
                            <button
                              onClick={() => handleAddMember(u.id)}
                              className="text-xs bg-brand text-white px-2 py-1 rounded hover:bg-brand/90"
                            >
                              {t('projects.detail.assign')}
                            </button>
                         </div>
                       )}
                    </div>
                  );
                })
             }
             {potentialMembers.length === 0 && <p className="text-sm text-slate-400 text-center py-4">{t('projects.detail.noUsers')}</p>}
           </div>
        </div>
      </Modal>

      {/* Milestone Modal */}
      <Modal open={msModalOpen} onClose={() => setMsModalOpen(false)} title={editingMs ? t('projects.detail.editMilestone') : t('projects.detail.newMilestoneTitle')}>
        <form onSubmit={handleSaveMs} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">{t('projects.detail.titleLabel')}</label>
            <input
              type="text" required value={msForm.title} onChange={e => setMsForm({...msForm, title: e.target.value})}
              className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">{t('projects.detail.description')}</label>
            <textarea
              rows="2" value={msForm.description} onChange={e => setMsForm({...msForm, description: e.target.value})}
              className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">{t('projects.detail.dueDate')}</label>
              <input
                type="date" value={msForm.due_date} onChange={e => setMsForm({...msForm, due_date: e.target.value})}
                className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">{t('projects.detail.amountLabel')}</label>
              <input
                type="number" step="0.01" value={msForm.amount} onChange={e => setMsForm({...msForm, amount: e.target.value})}
                className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end pt-4">
             <button type="button" onClick={() => setMsModalOpen(false)} className="mr-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">{t('projects.detail.cancel')}</button>
             <button type="submit" className="px-4 py-2 text-sm bg-brand text-white rounded-lg hover:bg-brand/90">{t('projects.detail.save')}</button>
          </div>
        </form>
      </Modal>

      {/* Deliverable Modal */}
      <Modal open={delModalOpen} onClose={() => setDelModalOpen(false)} title={editingDel ? t('projects.detail.editDeliverable') : t('projects.detail.newDeliverableTitle')}>
        <form onSubmit={handleSaveDel} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">{t('projects.detail.titleLabel')}</label>
            <input
              type="text" required value={delForm.title} onChange={e => setDelForm({...delForm, title: e.target.value})}
              className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">{t('projects.detail.description')}</label>
            <textarea
              rows="2" value={delForm.description} onChange={e => setDelForm({...delForm, description: e.target.value})}
              className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">{t('projects.detail.fileUrl')}</label>
            <input
              type="url" value={delForm.file_url} onChange={e => setDelForm({...delForm, file_url: e.target.value})}
              placeholder="https://..."
              className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm"
            />
          </div>
          <div className="flex justify-end pt-4">
             <button type="button" onClick={() => setDelModalOpen(false)} className="mr-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">{t('projects.detail.cancel')}</button>
             <button type="submit" className="px-4 py-2 text-sm bg-brand text-white rounded-lg hover:bg-brand/90">{t('projects.detail.save')}</button>
          </div>
        </form>
      </Modal>

      {/* Review Modal */}
      <Modal open={reviewModalOpen} onClose={() => setReviewModalOpen(false)} title={t('projects.detail.reviewDeliverable')}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {t('projects.detail.reviewInstructionPrefix')}<strong>{reviewDel?.title}</strong>{t('projects.detail.reviewInstructionSuffix')}
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700">{t('projects.detail.status')}</label>
            <select
              value={reviewData.status} onChange={e => setReviewData({...reviewData, status: e.target.value})}
              className="mt-1 block w-full rounded-lg border-slate-300 focus:border-brand focus:ring-brand sm:text-sm"
            >
              <option value="pending">{t('projects.status.pending')}</option>
              <option value="submitted">{t('projects.status.submitted')}</option>
              {(user?.role === 'company_admin' || user?.role === 'admin') && (
                <>
                  <option value="approved">{t('projects.status.approved')}</option>
                  <option value="rejected">{t('projects.status.rejected')}</option>
                </>
              )}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">{t('projects.detail.feedbackLabel')}</label>
            <textarea
              rows="3" value={reviewData.feedback} onChange={e => setReviewData({...reviewData, feedback: e.target.value})}
              className="mt-1 block w-full rounded-lg border-slate-300 focus:border-brand focus:ring-brand sm:text-sm"
              placeholder={t('projects.detail.feedbackPlaceholder')}
            />
          </div>
          <div className="flex justify-end pt-4">
             <button type="button" onClick={() => setReviewModalOpen(false)} className="mr-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">{t('projects.detail.cancel')}</button>
             <button onClick={saveReview} className="px-4 py-2 text-sm bg-brand text-white rounded-lg hover:bg-brand/90">{t('projects.detail.updateStatus')}</button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
