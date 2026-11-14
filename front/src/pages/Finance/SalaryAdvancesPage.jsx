import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../components/ToastProvider';
import Modal from '../../components/Modal';
import { apiFetch } from '../../lib/api';
import { PLATFORM_ROLES } from '../../lib/platformRoles';

const STATUS_LABELS = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  paid: 'Pagado',
  overdue: 'Vencido',
};

const STATUS_STYLES = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-blue-50 text-blue-700',
  rejected: 'bg-red-50 text-red-700',
  paid: 'bg-emerald-50 text-emerald-700',
  overdue: 'bg-orange-50 text-orange-700',
};

export default function SalaryAdvancesPage({ apiUrl, token, user }) {
  const toast = useToast();
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [reloadKey, setReloadKey] = useState(0);

  const [formData, setFormData] = useState({
    amount: '',
    repayment_date: '',
    reason: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [savingDecision, setSavingDecision] = useState(false);

  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const tenantRoles = useMemo(() => (
    Array.isArray(user?.roles)
      ? user.roles.map((role) => (typeof role === 'string' ? role : role?.name)).filter(Boolean)
      : []
  ), [user?.roles]);

  const isPlatformManager = ['super_admin', 'admin', 'finance', 'support'].includes(user?.platform_role);
  const isTenantAdmin = user?.platform_role === PLATFORM_ROLES.COMPANY_ADMIN
    || tenantRoles.some((role) => ['admin', 'company admin', 'company_admin'].includes(String(role).toLowerCase()));
  const isManager = isPlatformManager || isTenantAdmin;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr('');
      try {
        const params = new URLSearchParams();
        if (statusFilter !== 'all') params.set('status', statusFilter);

        const res = await apiFetch(apiUrl, `/api/advances?${params.toString()}`, { token });
        if (!cancelled) setAdvances(res.data || []);
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

  const estimatedFee = Number(formData.amount || 0) * 0.02;
  const estimatedTotal = Number(formData.amount || 0) + estimatedFee;

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
      toast.success('Solicitud de adelanto enviada');
      setFormData({ amount: '', repayment_date: '', reason: '' });
      setReloadKey((key) => key + 1);
    } catch (e) {
      toast.error(e?.message || 'No se pudo enviar la solicitud');
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (advance, status, decisionNotes = null) => {
    setSavingDecision(true);
    try {
      await apiFetch(apiUrl, `/api/advances/${advance.id}`, {
        token,
        method: 'PUT',
        body: JSON.stringify({ status, decision_notes: decisionNotes }),
      });
      toast.success(
        status === 'approved' ? 'Adelanto aprobado'
          : status === 'rejected' ? 'Adelanto rechazado'
            : 'Adelanto actualizado'
      );
      setRejectTarget(null);
      setRejectReason('');
      setReloadKey((key) => key + 1);
    } catch (e) {
      toast.error(e?.message || 'No se pudo actualizar el adelanto');
    } finally {
      setSavingDecision(false);
    }
  };

  const handleApprove = (advance) => {
    if (!window.confirm(`¿Aprobar el adelanto de ${advance.user_name || advance.user_email || 'este usuario'} por ${formatMoney(advance.amount)}?`)) return;
    updateStatus(advance, 'approved');
  };

  const handleReject = () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      toast.error('Indica el motivo del rechazo');
      return;
    }
    updateStatus(rejectTarget, 'rejected', rejectReason.trim());
  };

  const filterTabs = [
    { value: 'all', label: 'Todos' },
    { value: 'pending', label: 'Pendientes' },
    { value: 'approved', label: 'Aprobados' },
    { value: 'rejected', label: 'Rechazados' },
    { value: 'paid', label: 'Pagados' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Adelantos de sueldo</h1>
          <p className="text-sm text-slate-500">
            {isManager
              ? 'Solicitudes de adelanto de los freelancers de tu empresa'
              : 'Solicita un adelanto de tu sueldo y revisa el estado de tus solicitudes'}
          </p>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {err}
        </div>
      )}

      {!isManager && (
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
                value={formData.repayment_date}
                onChange={(e) => setFormData({ ...formData, repayment_date: e.target.value })}
                className="w-full rounded-xl border-slate-200 text-sm focus:border-brand focus:ring-brand"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Motivo (opcional)</label>
              <input
                type="text"
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
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-bold text-slate-900">
            {isManager ? 'Solicitudes' : 'Mis solicitudes'}
          </h2>
          <div className="flex flex-wrap gap-1">
            {filterTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  statusFilter === tab.value
                    ? 'bg-brand text-white'
                    : 'text-slate-600 hover:bg-slate-50'
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
              {isManager ? 'No hay solicitudes de adelanto registradas.' : 'Aún no tienes solicitudes de adelanto.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  {isManager && <th className="px-4 py-3 text-left">Solicitante</th>}
                  <th className="px-4 py-3 text-left">Monto</th>
                  <th className="px-4 py-3 text-left">Comisión</th>
                  <th className="px-4 py-3 text-left">Total</th>
                  <th className="px-4 py-3 text-left">Vencimiento</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {advances.map((advance) => (
                  <tr key={advance.id} className="hover:bg-slate-50">
                    {isManager && (
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{advance.user_name || 'Usuario'}</div>
                        <div className="text-xs text-slate-500">{advance.user_email || ''}</div>
                        {advance.reason && <div className="mt-1 max-w-[220px] truncate text-xs text-slate-400">{advance.reason}</div>}
                      </td>
                    )}
                    <td className="px-4 py-3 font-mono text-slate-900">{formatMoney(advance.amount)}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{formatMoney(advance.fee)}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-slate-900">{formatMoney(advance.total_repayment_amount)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {advance.repayment_date ? new Date(`${advance.repayment_date}T00:00:00`).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[advance.status] || 'bg-slate-100 text-slate-700'}`}>
                        {STATUS_LABELS[advance.status] || advance.status}
                      </span>
                      {advance.decision_notes && (
                        <div className="mt-1 max-w-[200px] text-xs text-slate-400">{advance.decision_notes}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {isManager && advance.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleApprove(advance)}
                              disabled={savingDecision}
                              className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                              title="Aprobar"
                            >
                              <i className="bi bi-check-lg" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectTarget(advance);
                                setRejectReason('');
                              }}
                              disabled={savingDecision}
                              className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                              title="Rechazar"
                            >
                              <i className="bi bi-x-lg" />
                            </button>
                          </>
                        )}
                        {isManager && advance.status === 'approved' && (
                          <button
                            type="button"
                            onClick={() => updateStatus(advance, 'paid')}
                            disabled={savingDecision}
                            className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                            title="Marcar como pagado"
                          >
                            <i className="bi bi-cash-coin" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="Rechazar adelanto"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Indica el motivo del rechazo para {rejectTarget?.user_name || rejectTarget?.user_email || 'el solicitante'}.
          </p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Motivo del rechazo..."
            className="min-h-[100px] w-full rounded-xl border-slate-200 text-sm focus:border-brand focus:ring-brand"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRejectTarget(null)}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={savingDecision}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {savingDecision ? 'Rechazando...' : 'Rechazar adelanto'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
