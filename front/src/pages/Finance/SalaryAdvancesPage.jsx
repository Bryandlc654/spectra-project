import React, { useEffect, useState } from 'react';
import { useToast } from '../../components/ToastProvider';
import Modal from '../../components/Modal';
import { apiFetch } from '../../lib/api';

/*
 * Flujo de adelantos de sueldo:
 *   1. El freelancer solicita              -> pending
 *   2. El company admin aprueba / rechaza  -> approved | rejected
 *   3. Spectra gestiona: desembolsa (disbursed), recupera (paid) o marca vencido (overdue)
 */

const STATUS_LABELS = {
  pending: 'Pendiente de aprobación de la empresa',
  approved: 'Aprobado · pendiente de desembolso (Spectra)',
  rejected: 'Rechazado',
  disbursed: 'Desembolsado',
  paid: 'Recuperado',
  overdue: 'Vencido',
  cancelled: 'Cancelado',
};

const STATUS_STYLES = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-blue-50 text-blue-700',
  rejected: 'bg-red-50 text-red-700',
  disbursed: 'bg-indigo-50 text-indigo-700',
  paid: 'bg-emerald-50 text-emerald-700',
  overdue: 'bg-orange-50 text-orange-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const FLOW_STEPS = [
  { key: 'request', label: 'Freelancer solicita' },
  { key: 'company', label: 'Empresa aprueba' },
  { key: 'spectra', label: 'Spectra desembolsa' },
  { key: 'repaid', label: 'Spectra recupera' },
];

function stepIndex(status) {
  switch (status) {
    case 'pending': return 1;
    case 'approved': return 2;
    case 'disbursed':
    case 'overdue': return 3;
    case 'paid': return 4;
    default: return -1;
  }
}

const SPECTRA_MANAGERS = ['super_admin', 'admin', 'finance'];
const SPECTRA_READERS = [...SPECTRA_MANAGERS, 'support'];
const FREELANCER_ROLES = ['freelancer', 'freelance'];

export default function SalaryAdvancesPage({ apiUrl, token, user }) {
  const toast = useToast();
  const [advances, setAdvances] = useState([]);
  const [viewer, setViewer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [reloadKey, setReloadKey] = useState(0);

  const [formData, setFormData] = useState({ amount: '', repayment_date: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Modal genérico de acción: { advance, status, title, needsNotes, withRef, confirmText, danger }
  const [action, setAction] = useState(null);
  const [notes, setNotes] = useState('');
  const [ref, setRef] = useState('');

  const role = user?.platform_role;
  const isFreelancer = FREELANCER_ROLES.includes(role);
  const resolvedViewer = viewer || (SPECTRA_READERS.includes(role) ? 'spectra' : 'requester');
  const canManageSpectra = resolvedViewer === 'spectra' && SPECTRA_MANAGERS.includes(role);
  const isCompanyAdmin = resolvedViewer === 'company_admin';
  const showRequester = resolvedViewer !== 'requester';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr('');
      try {
        const params = new URLSearchParams();
        if (statusFilter !== 'all') params.set('status', statusFilter);
        const res = await apiFetch(apiUrl, `/api/advances?${params.toString()}`, { token });
        if (!cancelled) {
          setAdvances(res.data || []);
          if (res.viewer) setViewer(res.viewer);
        }
      } catch (e) {
        if (!cancelled) setErr(e?.message || 'No se pudieron cargar los adelantos');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [apiUrl, token, statusFilter, user?.id, reloadKey]);

  const formatMoney = (value) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatDate = (value) => (value ? new Date(String(value).length <= 10 ? `${value}T00:00:00` : value.replace(' ', 'T')).toLocaleDateString() : '—');

  const estimatedFee = Number(formData.amount || 0) * 0.02;
  const estimatedTotal = Number(formData.amount || 0) + estimatedFee;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const handleRequest = async (e) => {
    e.preventDefault();
    if (!formData.amount || Number(formData.amount) <= 0) {
      toast.error('Ingresa un monto válido');
      return;
    }
    if (!formData.repayment_date) {
      toast.error('Selecciona la fecha de descuento');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(apiUrl, '/api/advances', {
        token,
        method: 'POST',
        body: JSON.stringify({
          amount: Number(formData.amount),
          repayment_date: formData.repayment_date,
          reason: formData.reason.trim() || null,
        }),
      });
      toast.success('Solicitud enviada. Tu empresa debe aprobarla.');
      setFormData({ amount: '', repayment_date: '', reason: '' });
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast.error(e?.message || 'No se pudo enviar la solicitud');
    } finally {
      setSubmitting(false);
    }
  };

  const openAction = (advance, status) => {
    const who = advance.user_name || advance.user_email || 'el freelancer';
    const amount = formatMoney(advance.amount);
    const configs = {
      approved: { title: 'Aprobar adelanto', message: `¿Aprobar el adelanto de ${who} por ${amount}? Spectra se encargará del desembolso.`, confirmText: 'Aprobar' },
      rejected: { title: 'Rechazar adelanto', message: `Indica el motivo del rechazo para ${who}.`, needsNotes: true, confirmText: 'Rechazar', danger: true },
      disbursed: { title: 'Registrar desembolso', message: `Confirma que Spectra desembolsó ${amount} a ${who}.`, withRef: true, confirmText: 'Marcar desembolsado' },
      paid: { title: 'Registrar recuperación', message: `Confirma que se recuperó el total de ${formatMoney(advance.total_repayment_amount)} (adelanto + comisión).`, withRef: true, confirmText: 'Marcar recuperado' },
      overdue: { title: 'Marcar como vencido', message: `El adelanto de ${who} no fue recuperado en la fecha pactada.`, confirmText: 'Marcar vencido', danger: true },
      cancelled: { title: 'Cancelar solicitud', message: `¿Cancelar tu solicitud de adelanto por ${amount}?`, confirmText: 'Cancelar solicitud', danger: true },
    };
    setNotes('');
    setRef('');
    setAction({ advance, status, ...configs[status] });
  };

  const submitAction = async () => {
    if (!action) return;
    if (action.needsNotes && !notes.trim()) {
      toast.error('Indica el motivo');
      return;
    }
    setSaving(true);
    try {
      const body = { status: action.status, notes: notes.trim() || null };
      if (action.status === 'disbursed') body.disbursement_ref = ref.trim() || null;
      if (action.status === 'paid') body.repayment_ref = ref.trim() || null;
      const res = await apiFetch(apiUrl, `/api/advances/${action.advance.id}`, {
        token,
        method: 'PUT',
        body: JSON.stringify(body),
      });
      toast.success(res?.message || 'Adelanto actualizado');
      setAction(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast.error(e?.message || 'No se pudo actualizar el adelanto');
    } finally {
      setSaving(false);
    }
  };

  const actionsFor = (advance) => {
    const s = advance.status;
    const list = [];
    if (isCompanyAdmin && s === 'pending') {
      list.push({ status: 'approved', icon: 'bi-check-lg', label: 'Aprobar', cls: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' });
      list.push({ status: 'rejected', icon: 'bi-x-lg', label: 'Rechazar', cls: 'bg-red-50 text-red-700 hover:bg-red-100' });
    }
    if (canManageSpectra) {
      if (s === 'approved') {
        list.push({ status: 'disbursed', icon: 'bi-send-check', label: 'Desembolsar', cls: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' });
        list.push({ status: 'rejected', icon: 'bi-x-lg', label: 'Rechazar', cls: 'bg-red-50 text-red-700 hover:bg-red-100' });
      }
      if (s === 'disbursed' || s === 'overdue') {
        list.push({ status: 'paid', icon: 'bi-cash-coin', label: 'Recuperado', cls: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' });
      }
      if (s === 'disbursed') {
        list.push({ status: 'overdue', icon: 'bi-exclamation-triangle', label: 'Vencido', cls: 'bg-orange-50 text-orange-700 hover:bg-orange-100' });
      }
    }
    if (resolvedViewer === 'requester' && s === 'pending') {
      list.push({ status: 'cancelled', icon: 'bi-x-circle', label: 'Cancelar', cls: 'bg-slate-100 text-slate-700 hover:bg-slate-200' });
    }
    return list;
  };

  const filterTabs = [
    { value: 'all', label: 'Todos' },
    { value: 'pending', label: 'Por aprobar (empresa)' },
    { value: 'approved', label: 'Por desembolsar (Spectra)' },
    { value: 'disbursed', label: 'Desembolsados' },
    { value: 'overdue', label: 'Vencidos' },
    { value: 'paid', label: 'Recuperados' },
    { value: 'rejected', label: 'Rechazados' },
  ];

  const subtitle = {
    spectra: 'Gestiona los adelantos aprobados por las empresas: desembolso y recuperación.',
    company_admin: 'Aprueba o rechaza las solicitudes de adelanto de los freelancers de tu empresa. Spectra gestiona el desembolso.',
    requester: 'Solicita un adelanto de tu sueldo. Tu empresa lo aprueba y Spectra realiza el desembolso.',
  }[resolvedViewer];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Adelantos de sueldo</h1>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>

      <ol className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-xs sm:grid-cols-4">
        {FLOW_STEPS.map((step, i) => (
          <li key={step.key} className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 font-bold text-brand">{i + 1}</span>
            <span className="font-medium text-slate-700">{step.label}</span>
          </li>
        ))}
      </ol>

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{err}</div>
      )}

      {resolvedViewer === 'requester' && isFreelancer && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Solicitar adelanto</h2>
          <form onSubmit={handleRequest} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Monto</label>
              <input
                type="number"
                min="1"
                step="0.01"
                required
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="0.00"
                className="w-full rounded-xl border-slate-200 text-sm focus:border-brand focus:ring-brand"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Fecha de descuento</label>
              <input
                type="date"
                required
                min={tomorrow}
                value={formData.repayment_date}
                onChange={(e) => setFormData({ ...formData, repayment_date: e.target.value })}
                className="w-full rounded-xl border-slate-200 text-sm focus:border-brand focus:ring-brand"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Motivo (opcional)</label>
              <input
                type="text"
                maxLength={1000}
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="Motivo del adelanto"
                className="w-full rounded-xl border-slate-200 text-sm focus:border-brand focus:ring-brand"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-50"
              >
                {submitting ? 'Enviando...' : 'Solicitar adelanto'}
              </button>
            </div>
          </form>
          <p className="mt-3 text-xs text-slate-500">
            Comisión estimada del 2%: {formatMoney(estimatedFee)} · Total a descontar: {formatMoney(estimatedTotal)}
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-sm font-bold text-slate-900">{showRequester ? 'Solicitudes' : 'Mis solicitudes'}</h2>
          <div className="flex flex-wrap gap-1">
            {filterTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  statusFilter === tab.value ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">Cargando...</div>
        ) : advances.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <i className="bi bi-cash-coin mb-2 block text-3xl text-slate-300" />
            <p className="text-sm text-slate-500">
              {showRequester ? 'No hay solicitudes de adelanto.' : 'Aún no tienes solicitudes de adelanto.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  {showRequester && <th className="px-4 py-3 text-left">Solicitante</th>}
                  {resolvedViewer === 'spectra' && <th className="px-4 py-3 text-left">Empresa</th>}
                  <th className="px-4 py-3 text-left">Monto</th>
                  <th className="px-4 py-3 text-left">Comisión</th>
                  <th className="px-4 py-3 text-left">Total</th>
                  <th className="px-4 py-3 text-left">Descuento</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {advances.map((advance) => {
                  const idx = stepIndex(advance.status);
                  return (
                    <tr key={advance.id} className="align-top hover:bg-slate-50">
                      {showRequester && (
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{advance.user_name || 'Usuario'}</div>
                          <div className="text-xs text-slate-500">{advance.user_email || ''}</div>
                          {advance.reason && <div className="mt-1 max-w-[220px] truncate text-xs text-slate-400" title={advance.reason}>{advance.reason}</div>}
                        </td>
                      )}
                      {resolvedViewer === 'spectra' && (
                        <td className="px-4 py-3 text-slate-700">{advance.company_name || '—'}</td>
                      )}
                      <td className="px-4 py-3 font-mono text-slate-900">{formatMoney(advance.amount)}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{formatMoney(advance.fee)}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900">{formatMoney(advance.total_repayment_amount)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(advance.repayment_date)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[advance.status] || 'bg-slate-100 text-slate-700'}`}>
                          {STATUS_LABELS[advance.status] || advance.status}
                        </span>
                        {idx > 0 && (
                          <div className="mt-2 flex gap-1" aria-label={`Paso ${idx} de ${FLOW_STEPS.length}`}>
                            {FLOW_STEPS.map((step, i) => (
                              <span key={step.key} title={step.label} className={`h-1.5 w-6 rounded-full ${i < idx ? 'bg-brand' : 'bg-slate-200'}`} />
                            ))}
                          </div>
                        )}
                        <div className="mt-1 space-y-0.5 text-xs text-slate-400">
                          {advance.company_decision_at && (
                            <div>Empresa: {advance.company_decision_by_name || '—'} · {formatDate(advance.company_decision_at)}</div>
                          )}
                          {advance.disbursed_at && (
                            <div>Desembolso: {formatDate(advance.disbursed_at)}{advance.disbursement_ref ? ` · Ref. ${advance.disbursement_ref}` : ''}</div>
                          )}
                          {advance.decision_notes && <div className="max-w-[240px]">{advance.decision_notes}</div>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          {actionsFor(advance).map((a) => (
                            <button
                              key={a.status}
                              type="button"
                              onClick={() => openAction(advance, a.status)}
                              disabled={saving}
                              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold disabled:opacity-50 ${a.cls}`}
                            >
                              <i className={`bi ${a.icon}`} />
                              {a.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={Boolean(action)} onClose={() => setAction(null)} title={action?.title || ''}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">{action?.message}</p>
          {action?.withRef && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                {action?.status === 'disbursed' ? 'Referencia de la transferencia (opcional)' : 'Referencia del cobro / descuento (opcional)'}
              </label>
              <input
                type="text"
                maxLength={100}
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                className="w-full rounded-xl border-slate-200 text-sm focus:border-brand focus:ring-brand"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              {action?.needsNotes ? 'Motivo' : 'Notas (opcional)'}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              className="min-h-[90px] w-full rounded-xl border-slate-200 text-sm focus:border-brand focus:ring-brand"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAction(null)}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Volver
            </button>
            <button
              type="button"
              onClick={submitAction}
              disabled={saving}
              className={`rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${action?.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand hover:bg-brand/90'}`}
            >
              {saving ? 'Guardando...' : action?.confirmText}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
