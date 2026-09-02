// src/pages/tenants/tabs/TenantFeesTab.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { normalizePageResponse } from '../../../lib/pagination';
import CriticalActionModal from '../../../components/CriticalActionModal';

export default function TenantFeesTab({ companyId, api }) {
  // Protege contra "api undefined" (causa del error .get)
  const safeApi = useMemo(() => api, [api]);

  const [rules, setRules] = useState([]);
  const [err, setErr] = useState('');

  const [form, setForm] = useState({
    type: 'per_freelancer_fee',
    value: 0,
    currency_id: '',
    active: true,
  });

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
      setErr(e?.message || 'No se pudieron cargar las reglas');
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
      setLookupsErr(e?.message || 'No se pudieron cargar las monedas');
    } finally {
      setLookupsLoading(false);
    }
  }

  useEffect(() => {
    // Si api aún no está listo, muestra un error claro y evita crash
    if (!safeApi?.get) {
      setErr('API no inicializada. Verifica que TenantDetailPage esté pasando la prop "api" al tab.');
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
      setErr('Company ID no está definido.');
      return;
    }

    setLoading(true);
    setErr('');
    try {
      // Nota: Enviamos company_id tal cual (sin Number()) para evitar NaN si fuera UUID
      await safeApi.post(`/api/company_fee_rules`, {
        company_id: companyId,
        type: String(form.type || '').trim(),
        value: Number(form.value || 0),
        currency_id: form.currency_id ? Number(form.currency_id) : null,
        active: !!form.active,
      });

      setForm({ type: 'per_freelancer_fee', value: 0, currency_id: '', active: true });
      await loadRules();
    } catch (e2) {
      setErr(e2?.message || 'No se pudo crear la regla');
    } finally {
      setLoading(false);
    }
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
      setErr(e?.message || 'Error ejecutando acción');
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
          No se pudieron cargar las monedas.{' '}
          <button
            type="button"
            onClick={loadCurrencies}
            className="font-semibold underline decoration-amber-400 underline-offset-2"
          >
            Reintentar
          </button>
          <div className="mt-1 text-xs text-amber-800">{lookupsErr}</div>
        </div>
      ) : null}

      <form
        onSubmit={add}
        className="rounded-2xl border border-slate-200 bg-white p-4 grid grid-cols-1 gap-3 md:grid-cols-4"
      >
        <div>
          <label className="text-xs font-semibold text-slate-600">Tipo</label>
          <select
            value={form.type}
            onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
          >
            <option value="platform_fee">Platform fee</option>
            <option value="payroll_fee">Payroll fee</option>
            <option value="invoice_fee">Invoice fee</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600">Valor</label>
          <input
            type="number"
            value={form.value}
            onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600">Moneda</label>
          <div className="relative">
            <select
              value={form.currency_id}
              onChange={(e) => setForm((p) => ({ ...p, currency_id: e.target.value }))}
              disabled={lookupsLoading || !currencies.length}
              className="mt-1 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-10 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand disabled:opacity-60"
            >
              <option value="">
                {lookupsLoading ? 'Cargando monedas…' : currencies.length ? 'Sin moneda (null)' : 'Sin monedas'}
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
            {loading ? 'Guardando…' : 'Agregar regla'}
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-sm bg-white">
          <thead>
            <tr className="text-left text-xs uppercase tracking-widest text-slate-500">
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Moneda</th>
              <th className="px-4 py-3">Activo</th>
              <th className="px-4 py-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rules.map((r) => {
              const cur = r.currency_id ? currenciesById.get(String(r.currency_id)) : null;

              return (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-semibold">{r.type}</td>
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
                      {r.active ? 'Sí' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={loading || !safeApi?.put}
                        onClick={() => openToggle(r)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                      >
                        {r.active ? 'Desactivar' : 'Activar'}
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
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  Sin reglas.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <CriticalActionModal
        open={actionModal.open}
        title={actionModal.type === 'delete' ? 'Eliminar regla' : (actionModal.data?.active ? 'Desactivar regla' : 'Activar regla')}
        message={
          actionModal.type === 'delete' 
            ? `¿Estás seguro de que deseas eliminar la regla de tipo "${actionModal.data?.type}"? Esta acción no se puede deshacer.`
            : `Estás a punto de ${actionModal.data?.active ? 'desactivar' : 'activar'} la regla "${actionModal.data?.type}".`
        }
        danger={actionModal.type === 'delete' || actionModal.data?.active}
        confirmText={actionModal.type === 'delete' ? 'Eliminar' : (actionModal.data?.active ? 'Desactivar' : 'Activar')}
        loading={actionModal.loading}
        requireReason={true}
        onClose={() => setActionModal(prev => ({ ...prev, open: false }))}
        onConfirm={handleActionConfirm}
      />
    </div>
  );
}
