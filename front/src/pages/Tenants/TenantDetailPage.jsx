// src/pages/tenants/TenantDetailPage.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, NavLink, Routes, Route } from 'react-router-dom';

import { createApi } from '../../lib/api';
import { normalizePageResponse } from '../../lib/pagination';
import ConfirmModal from '../../components/ConfirmModal';

// Tabs
import TenantOverviewTab from './tabs/TenantOverviewTab';
import TenantSettingsTab from './tabs/TenantSettingsTab';
import TenantFeesTab from './tabs/TenantFeesTab';
import TenantContactsTab from './tabs/TenantContactsTab';
import TenantWalletTab from './tabs/TenantWalletTab';
import TenantInvoicesTab from './tabs/TenantInvoicesTab';
import TenantPayrollTab from './tabs/TenantPayrollTab';
import TenantProjectsTab from './tabs/TenantProjectsTab';
import TenantContractsTab from './tabs/TenantContractsTab';
import TenantContractTemplatesTab from './tabs/TenantContractTemplatesTab';
import TenantRolesTab from './tabs/TenantRolesTab';
import TenantMembersTab from './tabs/TenantMembersTab';
import TenantAuditTab from './tabs/TenantAuditTab';
import TenantKYBTab from './tabs/TenantKYBTab';
import TenantIntegrationTab from './tabs/TenantIntegrationTab';
import TenantSupportTab from './tabs/TenantSupportTab';

// Force update for missing tabs


function cx(...a) {
  return a.filter(Boolean).join(' ');
}

function Modal({ open, title, onClose, children, maxWidth = 'max-w-xl' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className={cx('relative w-full rounded-2xl bg-white border border-slate-200 shadow-xl', maxWidth)}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="text-sm font-extrabold text-slate-900">{title}</div>
          <button onClick={onClose} className="h-9 w-9 rounded-xl hover:bg-slate-100" type="button">
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function StatusMessage({ tone = 'info', message }) {
  if (!message) return null;
  const cls =
    tone === 'error'
      ? 'border-red-200 bg-red-50 text-red-900'
      : tone === 'success'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
        : 'border-slate-200 bg-slate-50 text-slate-900';
  return <div className={cx('rounded-2xl border px-4 py-3 text-sm', cls)}>{message}</div>;
}

export default function TenantDetailPage({ apiUrl, token }) {
  const { id } = useParams();
  const navigate = useNavigate();

  // API instance (IMPORTANTE: se pasa a las tabs)
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState(null);

  const [tenant, setTenant] = useState(null);

  // Lookups
  const [countries, setCountries] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [timezones, setTimezones] = useState([]);
  const [lookupsLoading, setLookupsLoading] = useState(false);
  const [lookupsErr, setLookupsErr] = useState('');

  const countriesById = useMemo(() => {
    const m = new Map();
    for (const c of countries) m.set(String(c.id), c);
    return m;
  }, [countries]);

  const currenciesById = useMemo(() => {
    const m = new Map();
    for (const c of currencies) m.set(String(c.id), c);
    return m;
  }, [currencies]);

  const timezonesById = useMemo(() => {
    const m = new Map();
    for (const t of timezones) m.set(String(t.id), t);
    return m;
  }, [timezones]);

  // tenant shape tolerante
  const company = tenant?.data?.company || tenant?.company || null;
  const settings = tenant?.data?.settings || tenant?.settings || null;
  const wallet = tenant?.data?.wallet || tenant?.wallet || null;

  const companyStatus = String(company?.status || '').toLowerCase();
  const isSuspended = companyStatus === 'suspended';

  // -----------------------------
  // Loaders
  // -----------------------------
  async function loadTenant() {
    if (!id) return;
    setLoading(true);
    setErr('');
    setStatus(null);
    try {
      const data = await api.get(`/api/tenants/${id}`);
      setTenant(data);
    } catch (e) {
      setErr(e?.message || 'No se pudo cargar el tenant');
    } finally {
      setLoading(false);
    }
  }

  async function loadLookups() {
    setLookupsLoading(true);
    setLookupsErr('');
    try {
      const [c1, c2, c3] = await Promise.all([
        api.get('/api/countries?page=1&per_page=500'),
        api.get('/api/currencies?page=1&per_page=500'),
        api.get('/api/timezones?page=1&per_page=2000'),
      ]);

      const outCountries = normalizePageResponse(c1);
      const outCurrencies = normalizePageResponse(c2);
      const outTimezones = normalizePageResponse(c3);

      setCountries(outCountries.items || []);
      setCurrencies(outCurrencies.items || []);
      setTimezones(outTimezones.items || []);
    } catch (e) {
      setLookupsErr(e?.message || 'No se pudieron cargar los catálogos');
    } finally {
      setLookupsLoading(false);
    }
  }

  useEffect(() => {
    loadTenant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    loadLookups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------
  // UI helpers (labels)
  // -----------------------------
  const countryObj = company?.country_id ? countriesById.get(String(company.country_id)) : null;
  const currencyObj = company?.default_currency_id ? currenciesById.get(String(company.default_currency_id)) : null;
  const tzObj = company?.timezone_id ? timezonesById.get(String(company.timezone_id)) : null;

  // -----------------------------
  // Modals: Edit company
  // -----------------------------
  const [openEdit, setOpenEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    legal_name: '',
    trade_name: '',
    country_id: '',
    default_currency_id: '',
    timezone_id: '',
  });

  function openEditModal() {
    setStatus(null);
    setErr('');
    setEditForm({
      legal_name: company?.legal_name || '',
      trade_name: company?.trade_name || '',
      country_id: company?.country_id ? String(company.country_id) : '',
      default_currency_id: company?.default_currency_id ? String(company.default_currency_id) : '',
      timezone_id: company?.timezone_id ? String(company.timezone_id) : '',
    });
    setOpenEdit(true);
  }

  async function submitEdit(e) {
    e.preventDefault();
    setStatus(null);
    setErr('');
    try {
      await api.put(`/api/tenants/${id}`, {
        legal_name: editForm.legal_name,
        trade_name: editForm.trade_name,
        country_id: Number(editForm.country_id),
        default_currency_id: Number(editForm.default_currency_id),
        timezone_id: Number(editForm.timezone_id),
      });
      setOpenEdit(false);
      setStatus({ tone: 'success', message: 'Tenant actualizado' });
      await loadTenant();
    } catch (e2) {
      setStatus({ tone: 'error', message: e2?.message || 'No se pudo actualizar' });
    }
  }

  // -----------------------------
  // Modals: Suspend / Activate
  // -----------------------------
  const [openSuspend, setOpenSuspend] = useState(false);
  const [openActivate, setOpenActivate] = useState(false);
  const [reason, setReason] = useState('');

  async function doSuspend(e) {
    e.preventDefault();
    setStatus(null);
    try {
      await api.post(`/api/tenants/${id}/suspend`, { reason: reason.trim() });
      setOpenSuspend(false);
      setReason('');
      setStatus({ tone: 'success', message: 'Tenant suspendido' });
      await loadTenant();
    } catch (e2) {
      setStatus({ tone: 'error', message: e2?.message || 'No se pudo suspender' });
    }
  }

  async function doActivate(e) {
    e.preventDefault();
    setStatus(null);
    try {
      await api.post(`/api/tenants/${id}/activate`, { reason: reason.trim() || null });
      setOpenActivate(false);
      setReason('');
      setStatus({ tone: 'success', message: 'Tenant activado' });
      await loadTenant();
    } catch (e2) {
      setStatus({ tone: 'error', message: e2?.message || 'No se pudo activar' });
    }
  }

  async function doDelete() {
    setStatus(null);
    try {
      await api.del(`/api/tenants/${id}`);
      navigate('/dashboard/tenants');
    } catch (e2) {
      setStatus({ tone: 'error', message: e2?.message || 'No se pudo eliminar el tenant' });
      setOpenDelete(false);
    }
  }

  // -----------------------------
  // Tabs config
  // -----------------------------
  const tabs = useMemo(() => {
    const all = [
      { to: '', label: 'Resumen', icon: 'bi bi-grid' },
      { to: 'settings', label: 'Configuración', icon: 'bi bi-gear' },
      { to: 'fees', label: 'Tarifas', icon: 'bi bi-cash-coin' },
      { to: 'contacts', label: 'Contactos', icon: 'bi bi-people' },
      { to: 'wallet', label: 'Billetera', icon: 'bi bi-wallet2' },
      { to: 'invoices', label: 'Facturas', icon: 'bi bi-receipt' },
      { to: 'payroll', label: 'Nómina', icon: 'bi bi-calendar2-check' },
      { to: 'projects', label: 'Proyectos', icon: 'bi bi-kanban' },
      { to: 'contracts', label: 'Contratos', icon: 'bi bi-file-earmark-text' },
      { to: 'contracts/templates', label: 'Plantillas', icon: 'bi bi-file-earmark-code' },
      { to: 'roles', label: 'Roles', icon: 'bi bi-shield-lock' },
      { to: 'members', label: 'Miembros', icon: 'bi bi-people' },
      { to: 'audit', label: 'Auditoría', icon: 'bi bi-clock-history' },
      { to: 'kyb', label: 'KYB', icon: 'bi bi-building-check' },
      { to: 'integration', label: 'Integraciones', icon: 'bi bi-plug' },
      { to: 'support', label: 'Incidencias', icon: 'bi bi-life-preserver' },
    ];

    if (isSupport) {
      // Support View: Strict subset
      const allowed = ['Resumen', 'Miembros', 'Proyectos', 'Facturas', 'Incidencias'];
      return all.filter(t => allowed.includes(t.label));
    }

    if (role === PLATFORM_ROLES.COMPANY_ADMIN) {
      // Company Admin: Hide Integraciones
      return all.filter(t => t.label !== 'Integraciones');
    }

    return all;
  }, [isSupport, role]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => navigate('/dashboard/tenants')}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            <i className="bi bi-arrow-left" aria-hidden="true" />
            Volver a Tenants
          </button>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div>
              <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase">Tenant</div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight">
                {company?.legal_name || '—'}
              </h1>
              <div className="text-sm text-slate-600">
                {company?.trade_name ? (
                  <span>{company.trade_name}</span>
                ) : (
                  <span className="text-slate-400">Sin nombre comercial</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={cx(
                  'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-extrabold',
                  isSuspended
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                )}
              >
                {companyStatus || '—'}
              </span>

              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                ID: <span className="ml-1 font-mono">{id}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {!isSupport && (
            <>
              <button
                type="button"
                onClick={openEditModal}
                disabled={!company}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
              >
                <i className="bi bi-pencil" aria-hidden="true" />
                Editar
              </button>

              {isSuspended ? (
                <button
                  type="button"
                  onClick={() => {
                    setReason('');
                    setOpenActivate(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-emerald-700"
                >
                  <i className="bi bi-play-fill" aria-hidden="true" />
                  Activar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setReason('');
                    setOpenSuspend(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-amber-600"
                >
                  <i className="bi bi-pause-fill" aria-hidden="true" />
                  Suspender
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Status / Errors */}
      {err ? <StatusMessage tone="error" message={err} /> : null}
      {status?.message ? <StatusMessage tone={status.tone} message={status.message} /> : null}

      {/* Summary strip */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">País</div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">
              {countryObj ? `${countryObj.iso2} — ${countryObj.name}` : company?.country_id ?? '—'}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Moneda</div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">
              {currencyObj
                ? `${currencyObj.code} — ${currencyObj.name}${currencyObj.symbol ? ` (${currencyObj.symbol})` : ''}`
                : company?.default_currency_id ?? '—'}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Zona horaria</div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">
              {tzObj ? tzObj.name : company?.timezone_id ?? '—'}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Wallet</div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">
              {wallet?.balance ?? '—'} {wallet?.currency_id ? `(#${wallet.currency_id})` : ''}
            </div>
          </div>
        </div>

        {lookupsErr ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            No se pudieron cargar catálogos (Países/Monedas/Zonas horarias).{' '}
            <button
              type="button"
              onClick={loadLookups}
              className="font-semibold underline decoration-amber-400 underline-offset-2"
            >
              Reintentar
            </button>
            <div className="mt-1 text-xs text-amber-800">{lookupsErr}</div>
          </div>
        ) : null}
      </div>

      {/* Tabs */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap gap-2 border-b border-slate-200 p-3">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              end={t.to === ''}
              to={t.to === '' ? '.' : t.to}
              className={({ isActive }) =>
                cx(
                  'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-extrabold transition',
                  isActive ? 'bg-brand text-white' : 'text-slate-700 hover:bg-slate-50'
                )
              }
            >
              <i className={t.icon} aria-hidden="true" />
              {t.label}
            </NavLink>
          ))}
        </div>

        <div className="p-4">
          {loading && !tenant ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
              Cargando tenant…
            </div>
          ) : null}

          {!loading && tenant ? (
            <Routes>
              <Route
                index
                element={
                  <TenantOverviewTab
                    apiUrl={apiUrl}
                    token={token}
                    api={api}                 // ✅ FIX: pasar api
                    tenantId={id}             // ✅ útil para tabs
                    companyId={id}            // ✅ por compatibilidad
                    tenant={tenant}
                    company={company}
                    settings={settings}
                    wallet={wallet}
                    countriesById={countriesById}
                    currenciesById={currenciesById}
                    timezonesById={timezonesById}
                    reloadTenant={loadTenant}
                  />
                }
              />
              <Route
                path="settings"
                element={
                  <TenantSettingsTab
                    apiUrl={apiUrl}
                    token={token}
                    api={api}                // ✅ FIX: pasar api
                    tenantId={id}
                    companyId={id}           // ✅ FIX: tabs viejas suelen usar companyId+api
                    tenant={tenant}
                    company={company}
                    settings={settings}
                    countries={countries}
                    currencies={currencies}
                    timezones={timezones}
                    lookupsLoading={lookupsLoading}
                    reloadTenant={loadTenant}
                    reloadLookups={loadLookups}
                  />
                }
              />
              <Route path="fees" element={<TenantFeesTab apiUrl={apiUrl} token={token} api={api} tenantId={id} companyId={id} tenant={tenant} />} />
              <Route path="contacts" element={<TenantContactsTab apiUrl={apiUrl} token={token} api={api} tenantId={id} companyId={id} tenant={tenant} />} />
              <Route path="wallet" element={<TenantWalletTab apiUrl={apiUrl} token={token} api={api} tenantId={id} companyId={id} tenant={tenant} />} />
              <Route
                path="invoices"
                element={
                  <TenantInvoicesTab
                    apiUrl={apiUrl}
                    token={token}
                    api={api}
                    tenantId={id}
                    companyId={id}
                    tenant={tenant}
                    currencies={currencies}
                    currenciesById={currenciesById}
                  />
                }
              />
              <Route
                path="payroll"
                element={
                  <TenantPayrollTab 
                    companyId={id} 
                    api={api}
                  />
                }
              />
              <Route path="projects" element={<TenantProjectsTab apiUrl={apiUrl} token={token} api={api} tenantId={id} companyId={id} tenant={tenant} />} />
              <Route path="contracts" element={<TenantContractsTab apiUrl={apiUrl} token={token} api={api} tenantId={id} companyId={id} tenant={tenant} />} />
              <Route path="contracts/templates" element={<TenantContractTemplatesTab apiUrl={apiUrl} token={token} api={api} tenantId={id} companyId={id} tenant={tenant} countries={countries} />} />
              <Route path="roles" element={<TenantRolesTab apiUrl={apiUrl} token={token} api={api} tenantId={id} companyId={id} tenant={tenant} />} />
              <Route path="members" element={<TenantMembersTab apiUrl={apiUrl} token={token} api={api} tenantId={id} companyId={id} tenant={tenant} />} />
              <Route path="audit" element={<TenantAuditTab apiUrl={apiUrl} token={token} api={api} tenantId={id} companyId={id} tenant={tenant} />} />
              <Route path="kyb" element={<TenantKYBTab apiUrl={apiUrl} token={token} api={api} tenantId={id} companyId={id} tenant={tenant} />} />
              {role !== PLATFORM_ROLES.COMPANY_ADMIN && (
                <Route path="integration" element={<TenantIntegrationTab apiUrl={apiUrl} token={token} api={api} tenantId={id} companyId={id} tenant={tenant} />} />
              )}
              <Route path="support" element={<TenantSupportTab api={api} companyId={id} />} />
              <Route
                path="*"
                element={
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
                    Ruta no encontrada.
                  </div>
                }
              />
            </Routes>
          ) : null}
        </div>
      </div>

      {/* Edit modal */}
      <Modal open={openEdit} title="Editar tenant" onClose={() => setOpenEdit(false)} maxWidth="max-w-2xl">
        <form onSubmit={submitEdit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-700">Razón social</label>
              <input
                required
                value={editForm.legal_name}
                onChange={(e) => setEditForm((p) => ({ ...p, legal_name: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700">Nombre comercial</label>
              <input
                value={editForm.trade_name}
                onChange={(e) => setEditForm((p) => ({ ...p, trade_name: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="text-sm font-semibold text-slate-700">País</label>
              <div className="relative">
                <select
                  required
                  value={editForm.country_id}
                  onChange={(e) => setEditForm((p) => ({ ...p, country_id: e.target.value }))}
                  disabled={lookupsLoading || !countries.length}
                  className="mt-1 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-10 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand disabled:opacity-60"
                >
                  <option value="">
                    {lookupsLoading ? 'Cargando…' : countries.length ? 'Selecciona' : 'Sin países'}
                  </option>
                  {countries.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.iso2} — {c.name}
                    </option>
                  ))}
                </select>
                <i
                  className="bi bi-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700">Moneda</label>
              <div className="relative">
                <select
                  required
                  value={editForm.default_currency_id}
                  onChange={(e) => setEditForm((p) => ({ ...p, default_currency_id: e.target.value }))}
                  disabled={lookupsLoading || !currencies.length}
                  className="mt-1 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-10 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand disabled:opacity-60"
                >
                  <option value="">
                    {lookupsLoading ? 'Cargando…' : currencies.length ? 'Selecciona' : 'Sin monedas'}
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

            <div>
              <label className="text-sm font-semibold text-slate-700">Zona horaria</label>
              <div className="relative">
                <select
                  required
                  value={editForm.timezone_id}
                  onChange={(e) => setEditForm((p) => ({ ...p, timezone_id: e.target.value }))}
                  disabled={lookupsLoading || !timezones.length}
                  className="mt-1 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-10 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand disabled:opacity-60"
                >
                  <option value="">
                    {lookupsLoading ? 'Cargando…' : timezones.length ? 'Selecciona' : 'Sin zonas'}
                  </option>
                  {timezones.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <i
                  className="bi bi-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpenEdit(false)}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              disabled={lookupsLoading}
              className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-60"
              type="submit"
            >
              Guardar cambios
            </button>
          </div>
        </form>
      </Modal>

      {/* Suspend modal */}
      <Modal open={openSuspend} title="Suspender tenant" onClose={() => setOpenSuspend(false)}>
        <form onSubmit={doSuspend} className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Esta acción pondrá el tenant en estado <span className="font-extrabold">suspended</span>.
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">Motivo</label>
            <textarea
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
              placeholder="Describe el motivo de la suspensión…"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpenSuspend(false)}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600"
              type="submit"
            >
              Confirmar suspensión
            </button>
          </div>
        </form>
      </Modal>

      {/* Activate modal */}
      <Modal open={openActivate} title="Activar tenant" onClose={() => setOpenActivate(false)}>
        <form onSubmit={doActivate} className="space-y-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Esta acción pondrá el tenant en estado <span className="font-extrabold">active</span>.
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">Motivo (opcional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand"
              placeholder="Describe el motivo de la activación… (opcional)"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpenActivate(false)}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              type="submit"
            >
              Confirmar activación
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
