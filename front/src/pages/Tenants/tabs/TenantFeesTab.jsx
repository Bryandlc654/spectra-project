// src/pages/tenants/tabs/TenantFeesTab.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { normalizePageResponse } from '../../../lib/pagination';
import CriticalActionModal from '../../../components/CriticalActionModal';
import { useI18n } from '../../../i18n/I18nContext';

export default function TenantFeesTab({ companyId, api }) {
  const { t } = useI18n();
  // Protege contra "api undefined" (causa del error .get)
  const safeApi = useMemo(() => api, [api]);

  const [rules, setRules] = useState([]);
  const [err, setErr] = useState('');

  const [form, setForm] = useState({
    type: 'contract_fee',
    position: '',
    area: '',
    min_collaborators: 0,
    max_collaborators: '',
    priority: 0,
    value: 0,
    currency_id: '',
    active: true,
  });
  const [editingId, setEditingId] = useState(null);

  const [loading, setLoading] = useState(false);
  
  // Modal de acción crítica
  const [actionModal, setActionModal] = useState({
    open: false,
    type: null, // 'delete' | 'toggle'
    data: null,
    loading: false
  });

  // Lookups (monedas) para no mostrar solo IDs
  const [currencies, setCurrencies] = useState([]);
  const [lookupsLoading, setLookupsLoading] = useState(false);
  const [lookupsErr, setLookupsErr] = useState('');

  const feeTypeLabelKeys = {
    contract_fee: 'tenants.operations.fees.feeTypeContract',
    per_freelancer_fee: 'tenants.operations.fees.feeTypePerFreelancer',
    platform_fee: 'tenants.operations.fees.feeTypePlatform',
    payroll_fee: 'tenants.operations.fees.feeTypePayroll',
    invoice_fee: 'tenants.operations.fees.feeTypeInvoice',
  };

  const getFeeTypeLabel = (type) => {
    const key = feeTypeLabelKeys[type];
    const label = key ? t(key) : null;
    return label && label !== key ? label : type;
  };

  const currenciesById = useMemo(() => {
    const m = new Map();
    for (const c of currencies) m.set(String(c.id), c);
    return m;
  }, [currencies]);

  async function loadRules() {
    if (!safeApi?.get) return;
    if (!companyId) return;

    setErr('');
    try {
      // Intentamos filtrar por company_id si el backend lo soporta
      const d = await safeApi.get(`/api/company_fee_rules?company_id=${companyId}`);
      const items = d?.data || d?.rules || d || [];
      // Si la API devuelve todo sin filtrar, filtramos en el cliente (safety check)
      const filtered = Array.isArray(items) ? items.filter(i => String(i.company_id) === String(companyId)) : [];
      setRules(filtered);
    } catch (e) {
      setErr(e?.message || t('tenants.operations.fees.loadRulesError'));
    }
  }

  async function loadCurrencies() {
    if (!safeApi?.get) return;

    setLookupsLoading(true);
    setLookupsErr('');
    try {
      const res = await safeApi.get('/api/currencies?page=1&per_page=500');
      const out = normalizePageResponse(res);
      setCurrencies(out.items || []);
    } catch (e) {
      setLookupsErr(e?.message || t('tenants.operations.fees.currenciesLoadError'));
    } finally {
      setLookupsLoading(false);
    }
  }

  useEffect(() => {
    // Si api aún no está listo, muestra un error claro y evita crash
    if (!safeApi?.get) {
      setErr(t('tenants.operations.fees.apiNotReady'));
      return;
    }
    loadCurrencies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeApi]);

  useEffect(() => {
    if (!safeApi?.get) return;
    loadRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, safeApi]);

  async function add(e) {
    e.preventDefault();
    if (!safeApi?.post) return;
    if (!companyId) {
      setErr(t('tenants.operations.fees.companyIdMissing'));
      return;
    }

    setLoading(true);
    setErr('');
    try {
      const payload = {
        company_id: companyId,
        type: String(form.type || '').trim(),
        position: form.type === 'contract_fee' ? String(form.position || '').trim() : null,
        area: form.type === 'contract_fee' ? (String(form.area || '').trim() || null) : null,
        min_collaborators: form.type === 'contract_fee' ? Number(form.min_collaborators || 0) : 0,
        max_collaborators: form.type === 'contract_fee' && form.max_collaborators !== '' ? Number(form.max_collaborators) : null,
        priority: form.type === 'contract_fee' ? Number(form.priority || 0) : 0,
        value: Number(form.value || 0),
        currency_id: form.currency_id ? Number(form.currency_id) : null,
        active: !!form.active,
      };

      if (editingId) {
        await safeApi.put(`/api/company_fee_rules/${editingId}`, payload);
      } else {
        await safeApi.post(`/api/company_fee_rules`, payload);
      }

      setForm({
        type: 'contract_fee',
        position: '',
        area: '',
        min_collaborators: 0,
        max_collaborators: '',
        priority: 0,
        value: 0,
        currency_id: '',
        active: true,
      });
      setEditingId(null);
      await loadRules();
    } catch (e2) {
      setErr(e2?.message || t('tenants.operations.fees.saveRuleError'));
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(rule) {
    setEditingId(rule.id);
    setForm({
      type: rule.type || 'contract_fee',
      position: rule.position || '',
      area: rule.area || '',
      min_collaborators: rule.min_collaborators ?? 0,
      max_collaborators: rule.max_collaborators ?? '',
      priority: rule.priority ?? 0,
      value: rule.value ?? 0,
      currency_id: rule.currency_id ? String(rule.currency_id) : '',
      active: !!rule.active,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({
      type: 'contract_fee',
      position: '',
      area: '',
      min_collaborators: 0,
      max_collaborators: '',
      priority: 0,
      value: 0,
      currency_id: '',
      active: true,
    });
  }

  function openToggle(rule) {
    setActionModal({
      open: true,
      type: 'toggle',
      data: rule,
      loading: false
    });
  }

  function openDelete(rule) {
    setActionModal({
      open: true,
      type: 'delete',
      data: rule,
      loading: false
    });
  }

  async function handleActionConfirm(reason) {
    if (!safeApi) return;
    
    setActionModal(prev => ({ ...prev, loading: true }));
    setErr('');
    const { type, data } = actionModal;

    try {
      if (type === 'delete') {
        await safeApi.del(`/api/company_fee_rules/${data.id}`, { reason });
        await loadRules();
      } else if (type === 'toggle') {
        await safeApi.put(`/api/company_fee_rules/${data.id}`, {
          company_id: companyId,
          active: !data.active,
          reason
        });
        await loadRules();
      }
      setActionModal(prev => ({ ...prev, open: false }));
    } catch (e) {
      setErr(e?.message || t('tenants.operations.fees.actionError'));
      setActionModal(prev => ({ ...prev, loading: false }));
    }
  }

  return (
    <div className="space-y-4">
      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{err}</div>
      ) : null}

      {lookupsErr ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('tenants.operations.fees.currenciesLoadError')}.{' '}
          <button
            type="button"
            onClick={loadCurrencies}
            className="font-semibold underline decoration-amber-400 underline-offset-2"
          >
            {t('tenants.operations.fees.retry')}
          </button>
          <div className="mt-1 text-xs text-amber-800">{lookupsErr}</div>
        </div>
      ) : null}

      <form
        onSubmit={add}
        className="rounded-2xl border border-slate-200 bg-white p-4 grid grid-cols-1 gap-3 md:grid-cols-4"
      >
        {editingId && (
          <div className="md:col-span-4 flex items-center justify-between rounded-xl border border-brand/20 bg-brand/5 px-3 py-2">
            <span className="text-xs font-semibold text-brand">{t('tenants.operations.fees.editingRule')}</span>
            <button type="button" onClick={cancelEdit} className="text-xs font-semibold text-slate-600 underline">
              {t('tenants.operations.fees.cancelEdit')}
            </button>
          </div>
        )}
        <div>
          <label className="text-xs font-semibold text-slate-600">{t('tenants.common.type')}</label>
          <select
            value={form.type}
            onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
          >
            <option value="contract_fee">{t('tenants.operations.fees.feeTypeContract')}</option>
            <option value="per_freelancer_fee">{t('tenants.operations.fees.feeTypePerFreelancer')}</option>
            <option value="platform_fee">{t('tenants.operations.fees.feeTypePlatform')}</option>
            <option value="payroll_fee">{t('tenants.operations.fees.feeTypePayroll')}</option>
            <option value="invoice_fee">{t('tenants.operations.fees.feeTypeInvoice')}</option>
          </select>
        </div>

        {form.type === 'contract_fee' && (
          <>
            <div>
              <label className="text-xs font-semibold text-slate-600">{t('tenants.operations.fees.position')}</label>
              <input
                type="text"
                value={form.position || ''}
                onChange={(e) => setForm((p) => ({ ...p, position: e.target.value }))}
                placeholder={t('tenants.common.allPositions')}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">{t('tenants.operations.fees.area')}</label>
              <input
                type="text"
                value={form.area || ''}
                onChange={(e) => setForm((p) => ({ ...p, area: e.target.value }))}
                placeholder={t('tenants.common.allAreas')}
                maxLength={150}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">{t('tenants.operations.fees.minCollaborators')}</label>
              <input
                type="number"
                min="0"
                value={form.min_collaborators}
                onChange={(e) => setForm((p) => ({ ...p, min_collaborators: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">{t('tenants.operations.fees.maxCollaborators')}</label>
              <input
                type="number"
                min="0"
                value={form.max_collaborators}
                onChange={(e) => setForm((p) => ({ ...p, max_collaborators: e.target.value }))}
                placeholder={t('tenants.common.unlimited')}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">{t('tenants.operations.fees.priority')}</label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
              />
            </div>
          </>
        )}

        <div>
          <label className="text-xs font-semibold text-slate-600">{t('tenants.operations.fees.value')}</label>
          <input
            type="number"
            value={form.value}
            onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600">{t('tenants.common.currency')}</label>
          <div className="relative">
            <select
              value={form.currency_id}
              onChange={(e) => setForm((p) => ({ ...p, currency_id: e.target.value }))}
              disabled={lookupsLoading || !currencies.length}
              className="mt-1 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-10 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand disabled:opacity-60"
            >
              <option value="">
                {lookupsLoading ? t('tenants.operations.fees.loadingCurrencies') : currencies.length ? t('tenants.operations.fees.noCurrencyNull') : t('tenants.operations.fees.noCurrencies')}
              </option>
              {currencies.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.code} — {c.name}
                  {c.symbol ? ` (${c.symbol})` : ''}
                </option>
              ))}
            </select>
            <i
              className="bi bi-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
          </div>
        </div>

        <div className="flex items-end">
          <button
            disabled={loading || !safeApi?.post}
            className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-60"
            type="submit"
          >
            {loading ? t('tenants.common.saving') : (editingId ? t('tenants.operations.fees.updateRule') : t('tenants.operations.fees.addRule'))}
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-sm bg-white">
          <thead>
            <tr className="text-left text-xs uppercase tracking-widest text-slate-500">
              <th className="px-4 py-3">{t('tenants.common.type')}</th>
              <th className="px-4 py-3">{t('tenants.operations.fees.position')}</th>
              <th className="px-4 py-3">{t('tenants.operations.fees.area')}</th>
              <th className="px-4 py-3">{t('tenants.operations.fees.collaboratorRange')}</th>
              <th className="px-4 py-3">{t('tenants.operations.fees.value')}</th>
              <th className="px-4 py-3">{t('tenants.common.currency')}</th>
              <th className="px-4 py-3">{t('tenants.common.active')}</th>
              <th className="px-4 py-3 text-right">{t('tenants.common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rules.map((r) => {
              const cur = r.currency_id ? currenciesById.get(String(r.currency_id)) : null;

              return (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-semibold">{getFeeTypeLabel(r.type)}</td>
                  <td className="px-4 py-3">{r.position || t('tenants.common.all')}</td>
                  <td className="px-4 py-3">{r.type === 'contract_fee' ? (r.area || t('tenants.common.allAreas')) : '—'}</td>
                  <td className="px-4 py-3">
                    {r.type === 'contract_fee'
                      ? `${r.min_collaborators ?? 0} - ${r.max_collaborators ?? '∞'}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">{r.value}</td>
                  <td className="px-4 py-3">
                    {cur ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
                          {cur.code}
                        </span>
                        <span className="text-slate-700">
                          {cur.name}
                          {cur.symbol ? <span className="text-slate-500"> ({cur.symbol})</span> : null}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-500">{r.currency_id ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${r.active
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-50 text-slate-700 border border-slate-200'
                        }`}
                    >
                      {r.active ? t('tenants.common.yes') : t('tenants.common.no')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={loading || !safeApi?.put}
                        onClick={() => handleEdit(r)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                      >
                        {t('tenants.common.edit')}
                      </button>
                      <button
                        type="button"
                        disabled={loading || !safeApi?.put}
                        onClick={() => openToggle(r)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                      >
                        {r.active ? t('tenants.common.disable') : t('tenants.common.enable')}
                      </button>
                      <button
                        type="button"
                        disabled={loading || !safeApi?.del}
                        onClick={() => openDelete(r)}
                        className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        <i className="bi bi-trash" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {!rules.length ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  {t('tenants.operations.fees.noRules')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <CriticalActionModal
        open={actionModal.open}
        title={actionModal.type === 'delete' ? t('tenants.operations.fees.deleteRuleTitle') : (actionModal.data?.active ? t('tenants.operations.fees.disableRuleTitle') : t('tenants.operations.fees.enableRuleTitle'))}
        message={
          actionModal.type === 'delete' 
            ? t('tenants.operations.fees.deleteRuleMessage', { type: getFeeTypeLabel(actionModal.data?.type) })
            : t(actionModal.data?.active ? 'tenants.operations.fees.deactivateRuleMessage' : 'tenants.operations.fees.activateRuleMessage', { type: getFeeTypeLabel(actionModal.data?.type) })
        }
        danger={actionModal.type === 'delete' || actionModal.data?.active}
        confirmText={actionModal.type === 'delete' ? t('tenants.common.delete') : (actionModal.data?.active ? t('tenants.common.disable') : t('tenants.common.enable'))}
        loading={actionModal.loading}
        requireReason={true}
        onClose={() => setActionModal(prev => ({ ...prev, open: false }))}
        onConfirm={handleActionConfirm}
      />
    </div>
  );
}
