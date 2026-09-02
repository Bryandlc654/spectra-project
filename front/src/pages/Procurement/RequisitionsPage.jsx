import React, { useEffect, useState } from 'react';
import { useToast } from '../../components/ToastProvider';
import Modal from '../../components/Modal';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function RequisitionsPage({ apiUrl }) {
  const { token, user } = useAuth();
  const toast = useToast();
  
  const [requisitions, setRequisitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    title: '', 
    description: '', 
    amount: '', 
    currency_id: 1, 
    vendor_id: '', 
    project_id: ''
  });
  const [saving, setSaving] = useState(false);

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedReq, setSelectedReq] = useState(null);
  const [approvalComment, setApprovalComment] = useState('');
  const [approving, setApproving] = useState(false);

  // Lists for dropdowns
  const [vendors, setVendors] = useState([]);
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    loadData();
  }, [apiUrl, token]);

  async function loadData() {
    setLoading(true);
    setErr('');
    try {
      const res = await apiFetch(apiUrl, '/api/procurement/requisitions', { token });
      setRequisitions(res.data || []);
      
      // Load auxiliary data if empty
      if (vendors.length === 0) {
        try {
            const [vRes, pRes] = await Promise.all([
                apiFetch(apiUrl, '/api/procurement/vendors', { token }),
                apiFetch(apiUrl, '/api/projects', { token })
            ]);
            setVendors(vRes.data || []);
            setProjects(pRes.data || []);
        } catch (e) {
            console.warn('Aux load error', e);
        }
      }

    } catch (e) {
      setErr(e?.message || 'No se pudieron cargar las requisiciones');
    } finally {
      setLoading(false);
    }
  }

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
          await apiFetch(apiUrl, `/api/procurement/requisitions/${editingId}`, {
            token,
            method: 'PUT',
            body: formData
          });
          toast.success('Requisición actualizada');
      } else {
          await apiFetch(apiUrl, '/api/procurement/requisitions', {
            token,
            method: 'POST',
            body: formData
          });
          toast.success('Requisición creada');
      }
      setModalOpen(false);
      setEditingId(null);
      loadData();
    } catch (e) {
      toast.error(e?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (req, e) => {
      e.stopPropagation();
      setEditingId(req.id);
      setFormData({
          title: req.title,
          description: req.description || '',
          amount: req.amount,
          currency_id: req.currency_id,
          vendor_id: req.vendor_id || '',
          project_id: req.project_id || ''
      });
      setModalOpen(true);
  };

  const handleDelete = async (req, e) => {
      e.stopPropagation();
      if (!window.confirm('¿Estás seguro de eliminar esta requisición?')) return;
      try {
          await apiFetch(apiUrl, `/api/procurement/requisitions/${req.id}`, {
              token,
              method: 'DELETE'
          });
          toast.success('Requisición eliminada');
          loadData();
      } catch (e) {
          toast.error(e?.message || 'Error al eliminar');
      }
  };

  const openDetail = async (req) => {
      // Fetch full details including approvals
      try {
          const res = await apiFetch(apiUrl, `/api/procurement/requisitions/${req.id}`, { token });
          setSelectedReq({...res, can_approve: req.can_approve}); // Preserve can_approve from list
          setDetailModalOpen(true);
          setApprovalComment('');
      } catch (e) {
          toast.error('Error cargando detalles');
      }
  };

  const handleApprovalAction = async (status) => {
      if (!selectedReq) return;
      setApproving(true);
      try {
          await apiFetch(apiUrl, `/api/procurement/requisitions/${selectedReq.id}/approve`, {
              token,
              method: 'POST',
              body: { status, comments: approvalComment }
          });
          toast.success(`Requisición ${status === 'approved' ? 'aprobada' : 'rechazada'}`);
          setDetailModalOpen(false);
          loadData();
      } catch (e) {
          toast.error(e?.message || 'Error procesando aprobación');
      } finally {
          setApproving(false);
      }
  };

  const renderStatus = (status) => {
    const map = {
        pending: 'bg-yellow-50 text-yellow-700',
        approved: 'bg-emerald-50 text-emerald-700',
        rejected: 'bg-red-50 text-red-700',
        ordered: 'bg-blue-50 text-blue-700',
        received: 'bg-purple-50 text-purple-700'
    };
    return (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${map[status] || 'bg-slate-100'}`}>
            {status}
        </span>
    );
  };

  const handleEmitPO = async () => {
      if (!selectedReq) return;
      try {
          const res = await apiFetch(apiUrl, `/api/procurement/requisitions/${selectedReq.id}/emit-po`, {
              token,
              method: 'POST'
          });
          toast.success(`Orden de Compra emitida: ${res.po_number}`);
          setDetailModalOpen(false);
          loadData();
      } catch (e) {
          toast.error(e?.message || 'Error emitiendo PO');
      }
  };

  const handleConfirmReceipt = async () => {
      if (!selectedReq) return;
      try {
          await apiFetch(apiUrl, `/api/procurement/requisitions/${selectedReq.id}/confirm-receipt`, {
              token,
              method: 'POST'
          });
          toast.success('Recepción confirmada');
          setDetailModalOpen(false);
          loadData();
      } catch (e) {
          toast.error(e?.message || 'Error confirmando recepción');
      }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Requisiciones</h1>
          <p className="text-sm text-slate-500">Solicitudes de compra y gastos con flujo de aprobación</p>
        </div>
        <button
          onClick={() => {
              setFormData({ title: '', description: '', amount: '', currency_id: 1, vendor_id: '', project_id: '' });
              setModalOpen(true);
          }}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand/90"
        >
          <i className="bi bi-plus-lg mr-2" />
          Nueva Solicitud
        </button>
      </div>

      {loading && <div className="text-center py-12 text-slate-500">Cargando...</div>}
      
      {err && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-900 border border-red-200">
            {err}
        </div>
      )}

      {!loading && !err && requisitions.length === 0 && (
          <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-200">
              <i className="bi bi-cart text-4xl text-slate-300 mb-3 block" />
              <p className="text-slate-500">No hay requisiciones registradas</p>
          </div>
      )}

      {requisitions.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Título</th>
                <th className="px-4 py-3 text-left">Solicitante</th>
                <th className="px-4 py-3 text-left">Monto</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-left">Progreso</th>
                <th className="px-4 py-3 text-right">Fecha</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requisitions.map(r => (
                <tr key={r.id} onClick={() => openDetail(r)} className="hover:bg-slate-50 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">
                      {r.title}
                      <div className="text-xs text-slate-500 truncate max-w-xs">{r.description}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                      <div className="text-xs">{r.first_name} {r.last_name}</div>
                      <div className="text-[10px] text-slate-400">{r.email}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-900 font-medium">
                      {Number(r.amount).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                      {renderStatus(r.status)}
                  </td>
                  <td className="px-4 py-3">
                      {r.status === 'pending' && (
                          <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500">{r.pending_steps_count} pasos pendientes</span>
                              {r.can_approve && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title="Requiere tu aprobación"></span>}
                          </div>
                      )}
                      {r.status === 'approved' && <span className="text-xs text-emerald-600"><i className="bi bi-check-all mr-1"/>Completado</span>}
                      {r.status === 'rejected' && <span className="text-xs text-red-600">Cancelado</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">
                      {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                      {r.status === 'pending' && (r.requester_id === user?.id || user?.role === 'admin' || user?.role === 'company_admin' || true) && (
                          <div className="flex justify-end gap-2">
                              <button 
                                  onClick={(e) => handleEdit(r, e)}
                                  className="p-1 text-slate-400 hover:text-blue-600 transition-colors"
                                  title="Editar"
                              >
                                  <i className="bi bi-pencil" />
                              </button>
                              <button 
                                  onClick={(e) => handleDelete(r, e)}
                                  className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                                  title="Eliminar"
                              >
                                  <i className="bi bi-trash" />
                              </button>
                          </div>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Requisition Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nueva Requisición">
        <form onSubmit={handleSave} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Título / Concepto <span className="text-red-500">*</span></label>
                <input 
                    type="text" 
                    required
                    className="w-full rounded-xl border-slate-200 focus:border-brand focus:ring-brand"
                    value={formData.title}
                    onChange={e => setFormData({...formData, title: e.target.value})}
                    placeholder="Ej. Licencias de Software"
                />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Monto Estimado <span className="text-red-500">*</span></label>
                    <input 
                        type="number" 
                        required
                        min="0"
                        step="0.01"
                        className="w-full rounded-xl border-slate-200 focus:border-brand focus:ring-brand"
                        value={formData.amount}
                        onChange={e => setFormData({...formData, amount: e.target.value})}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Moneda</label>
                    <select
                        className="w-full rounded-xl border-slate-200 focus:border-brand focus:ring-brand"
                        value={formData.currency_id}
                        onChange={e => setFormData({...formData, currency_id: e.target.value})}
                    >
                        <option value="1">USD</option>
                        <option value="2">EUR</option>
                        <option value="3">MXN</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Proveedor (Opcional)</label>
                    <select
                        className="w-full rounded-xl border-slate-200 focus:border-brand focus:ring-brand"
                        value={formData.vendor_id}
                        onChange={e => setFormData({...formData, vendor_id: e.target.value})}
                    >
                        <option value="">-- Seleccionar --</option>
                        {vendors.map(v => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Proyecto (Opcional)</label>
                    <select
                        className="w-full rounded-xl border-slate-200 focus:border-brand focus:ring-brand"
                        value={formData.project_id}
                        onChange={e => setFormData({...formData, project_id: e.target.value})}
                    >
                        <option value="">-- Seleccionar --</option>
                        {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción Detallada</label>
                <textarea 
                    className="w-full rounded-xl border-slate-200 focus:border-brand focus:ring-brand"
                    rows="3"
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
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
                    {saving ? 'Guardando...' : 'Crear Solicitud'}
                </button>
            </div>
        </form>
      </Modal>

      {/* Detail / Approval Modal */}
      <Modal open={detailModalOpen} onClose={() => setDetailModalOpen(false)} title="Detalle de Requisición">
        {selectedReq && (
            <div className="space-y-6">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">{selectedReq.title}</h2>
                        <p className="text-slate-500 text-sm mt-1">{selectedReq.description || 'Sin descripción'}</p>
                    </div>
                    {renderStatus(selectedReq.status)}
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="p-3 bg-slate-50 rounded-lg">
                        <div className="text-slate-500 mb-1">Solicitante</div>
                        <div className="font-medium">{selectedReq.first_name} {selectedReq.last_name}</div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                        <div className="text-slate-500 mb-1">Monto</div>
                        <div className="font-medium text-lg">{Number(selectedReq.amount).toLocaleString()} <span className="text-xs text-slate-400">USD</span></div>
                    </div>
                </div>

                {/* Timeline */}
                <div>
                    <h3 className="font-semibold text-slate-900 mb-3">Flujo de Aprobación</h3>
                    <div className="relative border-l-2 border-slate-200 ml-3 space-y-6 pl-6 py-2">
                        {selectedReq.approvals?.map((step, idx) => (
                            <div key={step.id} className="relative">
                                <div className={`absolute -left-[31px] w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] 
                                    ${step.status === 'approved' ? 'bg-emerald-100 border-emerald-500 text-emerald-700' : 
                                      step.status === 'rejected' ? 'bg-red-100 border-red-500 text-red-700' : 
                                      'bg-white border-slate-300 text-slate-500'}`}>
                                    {step.status === 'approved' && <i className="bi bi-check-lg" />}
                                    {step.status === 'rejected' && <i className="bi bi-x-lg" />}
                                    {step.status === 'pending' && <span className="font-bold">{step.step_number}</span>}
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-slate-900">
                                        Paso {step.step_number}: Aprobación {step.role_required}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">
                                        {step.status === 'pending' ? 'Pendiente' : 
                                         `Revisado por ${step.reviewer_first_name || 'Usuario'} ${step.reviewer_last_name || ''} el ${new Date(step.reviewed_at).toLocaleDateString()}`}
                                    </div>
                                    {step.comments && (
                                        <div className="mt-2 text-sm bg-yellow-50 p-2 rounded text-slate-700 italic border border-yellow-100">
                                            "{step.comments}"
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Action Area */}
                {selectedReq.can_approve && selectedReq.status === 'pending' && (
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                        <h3 className="font-semibold text-blue-900 mb-2">Acción Requerida</h3>
                        <p className="text-sm text-blue-700 mb-3">Tienes permisos para aprobar el paso actual.</p>
                        
                        <textarea
                            className="w-full rounded-lg border-blue-200 focus:border-blue-500 focus:ring-blue-500 text-sm mb-3"
                            rows="2"
                            placeholder="Comentarios (opcional para aprobar, requerido para rechazar)..."
                            value={approvalComment}
                            onChange={e => setApprovalComment(e.target.value)}
                        />
                        
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleApprovalAction('approved')}
                                disabled={approving}
                                className="flex-1 bg-emerald-600 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-emerald-700 disabled:opacity-50"
                            >
                                {approving ? 'Procesando...' : 'Aprobar'}
                            </button>
                            <button
                                onClick={() => handleApprovalAction('rejected')}
                                disabled={approving}
                                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-red-700 disabled:opacity-50"
                            >
                                Rechazar
                            </button>
                        </div>
                    </div>
                )}

                {/* PO / GRN Actions */}
                {selectedReq.status === 'approved' && (
                    <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                        <h3 className="font-semibold text-purple-900 mb-2">Emisión de Orden de Compra</h3>
                        <p className="text-sm text-purple-700 mb-3">La requisición ha sido aprobada. Emite la PO para notificar al proveedor.</p>
                        <button
                            onClick={handleEmitPO}
                            className="w-full bg-purple-600 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-purple-700"
                        >
                            Emitir Orden de Compra (PO)
                        </button>
                    </div>
                )}

                {selectedReq.status === 'ordered' && (
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                        <h3 className="font-semibold text-blue-900 mb-2">Confirmación de Recepción</h3>
                        <p className="text-sm text-blue-700 mb-3">Confirma que los bienes o servicios han sido recibidos (GRN).</p>
                        <button
                            onClick={handleConfirmReceipt}
                            className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-blue-700"
                        >
                            Confirmar Recepción (GRN)
                        </button>
                    </div>
                )}
            </div>
        )}
      </Modal>
    </div>
  );
}