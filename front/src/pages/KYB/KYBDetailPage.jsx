import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { createApi } from '../../lib/api';
import { getStoredSession } from '../../session';
import ConfirmModal from '../../components/ConfirmModal';
import { useToast } from '../../components/ToastProvider';

function RejectModal({ open, onClose, onConfirm, loading }) {
    const [reason, setReason] = useState('');

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
            <div className="relative w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl p-5">
                <h3 className="text-lg font-bold mb-2">Rechazar Solicitud</h3>
                <p className="text-sm text-slate-500 mb-4">Indica el motivo del rechazo para notificar a la empresa.</p>
                
                <textarea 
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Ej: Documentación ilegible..."
                    className="w-full h-24 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500 resize-none"
                />

                <div className="flex justify-end gap-2 mt-4">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 rounded-xl">Cancelar</button>
                    <button 
                        onClick={() => onConfirm(reason)}
                        disabled={!reason.trim() || loading}
                        className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50"
                    >
                        {loading ? 'Rechazando...' : 'Rechazar'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function KYBDetailPage({ apiUrl, token }) {
  const { id } = useParams();
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  const toast = useToast();

  const STATUS_LABELS = {
    not_started: 'No iniciado',
    pending_review: 'Pendiente',
    approved: 'Aprobado',
    rejected: 'Rechazado',
    more_info_required: 'Requiere info'
  };

  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  
  const [showReject, setShowReject] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [id]);

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const data = await api.get(`/api/kyb/${id}`);
      setRequest(data.data || data);
    } catch (e) {
      setErr(e.message || 'Error cargando solicitud');
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
      setActionLoading(true);
      try {
          await api.post(`/api/kyb/${id}/approve`);
          toast.success('Solicitud aprobada correctamente');
          setConfirmApprove(false);
          load();
      } catch (e) {
          toast.error(e.message || 'Error al aprobar');
      } finally {
          setActionLoading(false);
      }
  }

  async function handleReject(reason) {
      setActionLoading(true);
      try {
          await api.post(`/api/kyb/${id}/reject`, { reason });
          toast.success('Solicitud rechazada');
          setShowReject(false);
          load();
      } catch (e) {
          toast.error(e.message || 'Error al rechazar');
      } finally {
          setActionLoading(false);
      }
  }

  async function handleReopen() {
      setActionLoading(true);
      try {
          await api.post(`/api/kyb/${id}/reopen`);
          toast.success('Solicitud reabierta para revisión');
          setConfirmReopen(false);
          load();
      } catch (e) {
          toast.error(e.message || 'Error al reabrir');
      } finally {
          setActionLoading(false);
      }
  }

  async function downloadDoc(doc) {
      const isAttachment = doc?.id && !doc?.url;
      const href = typeof doc === 'string' ? doc : (doc?.url || (isAttachment ? `${apiUrl}/api/kyb/${request.id}/documents/${doc.id}/download` : null));
      if (!href) return;

      if (isAttachment) {
          setDownloading(doc.id);
          try {
              const current = getStoredSession();
              const bearer = current?.token || token;
              const res = await fetch(href, { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} });
              if (!res.ok) throw new Error('Error al descargar el documento');
              const blob = await res.blob();
              const objectUrl = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = objectUrl;
              a.download = doc.file_name || `documento_${doc.id}`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(objectUrl);
          } catch (e) {
              toast.error(e.message || 'Error al descargar el documento');
          } finally {
              setDownloading(null);
          }
      } else {
          window.open(href, '_blank', 'noreferrer');
      }
  }

  if (loading) return <div className="p-10 text-center text-slate-500">Cargando...</div>;
  if (err) return <div className="p-10 text-center text-red-500">{err}</div>;
  if (!request) return <div className="p-10 text-center text-slate-500">Solicitud no encontrada</div>;

  return (
    <div className="space-y-6">
        <div className="flex items-center gap-4">
            <Link to="/dashboard/kyb" className="h-10 w-10 grid place-items-center rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600">
                <i className="bi bi-arrow-left" />
            </Link>
            <div>
                <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase">Detalle KYB</div>
                <h1 className="text-xl font-bold">{request.company_name || request.company?.name || 'Empresa'}</h1>
            </div>
            <div className="ml-auto">
                 <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold border ${
                    request.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    request.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' :
                    'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                    {STATUS_LABELS[request.status] || request.status}
                </span>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
                {/* Info Card */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h2 className="font-bold text-slate-800 mb-4">Información de la Solicitud</h2>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <div className="text-slate-500">ID Solicitud</div>
                            <div className="font-mono text-xs mt-1">{request.id}</div>
                        </div>
                        <div>
                            <div className="text-slate-500">Fecha creación</div>
                            <div className="font-medium mt-1">{new Date(request.created_at).toLocaleString()}</div>
                        </div>
                        {request.approved_at && (
                             <div>
                                <div className="text-slate-500">Fecha aprobación</div>
                                <div className="font-medium mt-1 text-emerald-600">{new Date(request.approved_at).toLocaleString()}</div>
                            </div>
                        )}
                        {request.rejected_at && (
                             <div>
                                <div className="text-slate-500">Fecha rechazo</div>
                                <div className="font-medium mt-1 text-red-600">{new Date(request.rejected_at).toLocaleString()}</div>
                            </div>
                        )}
                         {request.reviewer_name && (
                             <div className="col-span-2">
                                <div className="text-slate-500">Revisado por</div>
                                <div className="font-medium mt-1 flex items-center gap-2">
                                    <div className="h-5 w-5 rounded-full bg-slate-200" />
                                    {request.reviewer_name || 'Admin'}
                                </div>
                            </div>
                        )}
                    </div>

                    {request.rejection_reason && (
                        <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-800">
                            <strong>Motivo rechazo:</strong> {request.rejection_reason}
                        </div>
                    )}
                </div>

                {/* Docs */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                     <h2 className="font-bold text-slate-800 mb-4">Documentos Adjuntos</h2>
                     <div className="space-y-2">
                        {(request.documents || []).length === 0 ? (
                            <div className="text-sm text-slate-500 italic">No hay documentos adjuntos.</div>
                        ) : (
                            (request.documents || []).map((doc, i) => {
                                const isAttachment = doc?.id && !doc?.url;
                                const href = typeof doc === 'string' ? doc : doc?.url;
                                const downloadingThis = downloading === doc?.id;
                                const inner = (
                                    <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition group">
                                        <div className="h-10 w-10 grid place-items-center rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition">
                                            <i className={downloadingThis ? 'bi bi-arrow-clockwise animate-spin' : 'bi bi-file-earmark-text'} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold text-slate-700 truncate">
                                                {doc?.file_name || `Documento ${i + 1}`}
                                            </div>
                                            <div className="text-xs text-slate-500 truncate">
                                                {isAttachment ? 'Descargar documento' : (href ? 'Ver documento' : (doc?.mime_type || 'Documento adjunto'))}
                                            </div>
                                        </div>
                                        {isAttachment && <i className="bi bi-download text-slate-400" />}
                                        {href && !isAttachment && <i className="bi bi-box-arrow-up-right text-slate-400" />}
                                    </div>
                                );
                                return isAttachment ? (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => downloadDoc(doc)}
                                        disabled={!!downloading}
                                        className="w-full text-left cursor-pointer disabled:cursor-wait"
                                    >
                                        {inner}
                                    </button>
                                ) : href ? (
                                    <a key={i} href={href} target="_blank" rel="noreferrer">{inner}</a>
                                ) : (
                                    <div key={i}>{inner}</div>
                                );
                            })
                        )}
                     </div>
                </div>
            </div>

            {/* Actions Panel */}
            <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h2 className="font-bold text-slate-800 mb-4">Acciones</h2>
                    
                    {request.status === 'pending' || request.status === 'pending_review' ? (
                        <div className="space-y-3">
                            <button 
                                onClick={() => setConfirmApprove(true)}
                                disabled={actionLoading}
                                className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 transition shadow-sm disabled:opacity-50"
                            >
                                {actionLoading ? 'Procesando...' : 'Aprobar Solicitud'}
                            </button>
                            <button 
                                onClick={() => setShowReject(true)}
                                disabled={actionLoading}
                                className="w-full rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                            >
                                Rechazar
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {(request.status === 'rejected' || request.status === 'more_info_required') && (
                                <button 
                                    onClick={() => setConfirmReopen(true)}
                                    disabled={actionLoading}
                                    className="w-full rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-sm font-bold text-amber-700 hover:bg-amber-50 transition disabled:opacity-50"
                                >
                                    Reabrir Revisión
                                </button>
                            )}
                            <div className="text-center py-3 text-sm text-slate-500">
                                Esta solicitud ya fue procesada.
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>

        <RejectModal 
            open={showReject} 
            onClose={() => setShowReject(false)}
            onConfirm={handleReject}
            loading={actionLoading}
        />

        <ConfirmModal
            open={confirmApprove}
            title="Aprobar Solicitud KYB"
            message="¿Estás seguro de que deseas aprobar esta solicitud? La empresa será verificada."
            confirmText="Aprobar"
            cancelText="Cancelar"
            danger={false}
            loading={actionLoading}
            onClose={() => setConfirmApprove(false)}
            onConfirm={handleApprove}
        />

        <ConfirmModal
            open={confirmReopen}
            title="Reabrir Revisión KYB"
            message="¿Deseas reabrir esta solicitud para revisión? Volverá a estar pendiente y un revisor podrá evaluarla nuevamente."
            confirmText="Reabrir"
            cancelText="Cancelar"
            danger={false}
            loading={actionLoading}
            onClose={() => setConfirmReopen(false)}
            onConfirm={handleReopen}
        />
    </div>
  );
}
