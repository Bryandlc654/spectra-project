import React, { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { createApi, downloadFile } from '../../lib/api';
import { normalizePageResponse } from '../../lib/pagination';
import { useAuth } from "../../context/AuthContext";
import { PLATFORM_ROLES } from '../../lib/platformRoles';
import ConfirmModal from '../../components/ConfirmModal';
import Modal from '../../components/Modal';
import { useToast } from '../../components/ToastProvider';
import { useI18n } from '../../i18n/I18nContext';
import TenantImportModal from './TenantImportModal';

function ActionMenu({ tenant, onAction }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const close = () => setOpen(false);
    if (open) {
      window.addEventListener('click', close);
      window.addEventListener('resize', close);
      window.addEventListener('scroll', close, true);
    }
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  const toggle = (e) => {
    e.stopPropagation();
    if (!open) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.right - 224 // w-56 = 224px
      });
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const { user } = useAuth();
  const isSupport = user?.platform_role === PLATFORM_ROLES.SUPPORT;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggle}
        className={`h-8 w-8 rounded-lg transition flex items-center justify-center ${
          open ? 'bg-slate-100 text-slate-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
        }`}
      >
        <i className="bi bi-three-dots-vertical" />
      </button>

      {open && createPortal(
        <div
          className="fixed z-[100] w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
          style={{ top: position.top, left: position.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <Link
            to={`/dashboard/tenants/${tenant.id}`}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition"
          >
            <i className="bi bi-eye" /> {t('tenants.common.viewDetail')}
          </Link>
          <Link
            to={`/dashboard/tenants/${tenant.id}/members`}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition"
          >
            <i className="bi bi-people" /> {t('tenants.list.members')}
          </Link>
          <Link
            to={`/dashboard/audit?company_id=${tenant.id}`}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition"
          >
            <i className="bi bi-clock-history" /> {t('tenants.list.audit')}
          </Link>
          
          {!isSupport && (
            <>
              <div className="my-1 border-t border-slate-100" />
              <button
                onClick={() => {
                  setOpen(false);
                  onAction('edit', tenant);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition"
              >
                <i className="bi bi-pencil" /> {t('tenants.common.edit')}
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  onAction('toggle_status', tenant);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                  tenant.status === 'active'
                    ? 'text-amber-600 hover:bg-amber-50'
                    : 'text-emerald-600 hover:bg-emerald-50'
                }`}
              >
                {tenant.status === 'active' ? (
                  <>
                    <i className="bi bi-pause-circle" /> {t('tenants.list.suspend')}
                  </>
                ) : (
                  <>
                    <i className="bi bi-play-circle" /> {t('tenants.list.reactivate')}
                  </>
                )}
              </button>
              
              <button
                onClick={() => {
                  setOpen(false);
                  onAction('delete', tenant);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition"
              >
                <i className="bi bi-trash" /> {t('tenants.common.delete')}
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

export default function TenantsListPage({ apiUrl, token }) {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'es-ES';
  const isSupport = user?.platform_role === PLATFORM_ROLES.SUPPORT;
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  const toast = useToast();
  const navigate = useNavigate();

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [countryId, setCountryId] = useState('');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 10;

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, perPage, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // Action states
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'suspend'|'activate', tenant: ... }
  const [actionLoading, setActionLoading] = useState(null);
  const [reason, setReason] = useState('');
  
  // Edit state
  const [openImport, setOpenImport] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    id: '',
    legal_name: '',
    trade_name: '',
    country_id: '',
    default_currency_id: '',
    timezone_id: ''
  });

  // ---- Lookups (countries/currencies/timezones)
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
    for (const tz of timezones) m.set(String(tz.id), tz);
    return m;
  }, [timezones]);

  // Cada carga recibe un número; solo se aplica la respuesta de la más reciente,
  // para que una petición lenta anterior no pise el resultado de un filtro nuevo.
  const loadSeq = useRef(0);

  async function load(nextPage = page) {
    const seq = ++loadSeq.current;
    setLoading(true);
    setErr('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(nextPage));
      params.set('per_page', String(perPage));
      if (q.trim()) params.set('q', q.trim());
      if (status) params.set('status', status);
      if (countryId) params.set('country_id', countryId);
      if (date) params.set('date', date);

      const data = await api.get(`/api/tenants?${params.toString()}`);
      if (seq !== loadSeq.current) return; // respuesta obsoleta
      const out = normalizePageResponse(data);
      setRows(out.items);
      setMeta(out.meta);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setErr(e.message);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }

  async function loadLookups() {
    setLookupsLoading(true);
    setLookupsErr('');
    try {
      const [c1, c2, c3] = await Promise.all([
        api.get('/api/countries?page=1&per_page=200'),
        api.get('/api/currencies?page=1&per_page=200'),
        api.get('/api/timezones?page=1&per_page=200'),
      ]);

      const outCountries = normalizePageResponse(c1);
      const outCurrencies = normalizePageResponse(c2);
      const outTimezones = normalizePageResponse(c3);

      setCountries(outCountries.items || []);
      setCurrencies(outCurrencies.items || []);
      setTimezones(outTimezones.items || []);
    } catch (e) {
      setLookupsErr(e.message);
    } finally {
      setLookupsLoading(false);
    }
  }

  useEffect(() => {
    load(page);
    // eslint-disable-next-line
  }, [page]);

  useEffect(() => {
    loadLookups();
    // eslint-disable-next-line
  }, []);

  function applyFilters() {
    if (page !== 1) {
      setPage(1); // el efecto de [page] dispara la carga
    } else {
      load(1);
    }
  }

  async function handleAction(type, tenant) {
    if (type === 'toggle_status') {
      setReason('');
      setConfirmAction({
        type: tenant.status === 'active' ? 'suspend' : 'activate',
        tenant,
      });
    }
    if (type === 'edit') {
      setEditForm({
        id: tenant.id,
        legal_name: tenant.legal_name,
        trade_name: tenant.trade_name || '',
        country_id: tenant.country_id,
        default_currency_id: tenant.default_currency_id,
        timezone_id: tenant.timezone_id || tenant.timezoneId || '',
      });
      setOpenEdit(true);
    }
    if (type === 'delete') {
      setReason('');
      setConfirmAction({
        type: 'delete',
        tenant,
      });
    }
  }

  async function submitEdit(e) {
    e.preventDefault();
    setActionLoading(editForm.id);
    try {
      await api.put(`/api/tenants/${editForm.id}`, editForm);
      toast.success(t('tenants.list.updateSuccess'));
      setOpenEdit(false);
      load();
    } catch (err) {
      toast.error(err.message || t('tenants.list.updateError'));
    } finally {
      setActionLoading(null);
    }
  }

  async function executeStatusChange() {
    if (!confirmAction?.tenant) return;
    const { type, tenant } = confirmAction;
    
    if (type === 'suspend' && !reason.trim()) {
      toast.error(t('tenants.list.suspendReasonRequired'));
      return;
    }
    if (type === 'delete' && reason.trim() !== String(tenant.legal_name || '').trim()) {
      toast.error(t('tenants.list.deleteConfirmMismatch'));
      return;
    }

    setActionLoading(tenant.id);
    try {
      if (type === 'delete') {
        await api.del(`/api/tenants/${tenant.id}`);
        toast.success(t('tenants.list.deleteSuccess'));
      } else {
        const endpoint = type === 'suspend' ? 'suspend' : 'activate'; 
        await api.post(`/api/tenants/${tenant.id}/${endpoint}`, { reason });
        toast.success(t(type === 'suspend' ? 'tenants.list.suspendSuccess' : 'tenants.list.activateSuccess'));
      }
      
      setConfirmAction(null);
      await load();
    } catch (e) {
      toast.error(e.message || t('tenants.list.actionError'));
    } finally {
      setActionLoading(null);
    }
  }

  function handleExport() {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (status) params.set('status', status);
    if (countryId) params.set('country_id', countryId);
    if (date) params.set('date', date);
    
    downloadFile(apiUrl, `/api/tenants/export?${params.toString()}`, 'empresas.csv')
      .catch((e) => toast.error(e.message || t('tenants.list.actionError')));
  }

  function statusLabel(value) {
    if (value === 'active') return t('tenants.common.active');
    if (value === 'suspended') return t('tenants.common.suspended');
    if (value === 'pending') return t('tenants.common.pending');
    if (value === 'inactive') return t('tenants.common.inactive');
    return value || t('tenants.common.notAvailable');
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase">{t('tenants.list.eyebrow')}</div>
          <h1 className="text-xl font-bold">{t('tenants.list.title')}</h1>
          <p className="text-sm text-slate-600">{t('tenants.list.subtitle')}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-5 items-end">
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">{t('tenants.common.search')}</label>
            <div className="relative mt-1">
              <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('tenants.list.searchPlaceholder')}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition"
              />
            </div>
          </div>
          
          <div>
            <label className="text-xs font-semibold text-slate-600">{t('tenants.common.status')}</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition"
            >
              <option value="">{t('tenants.common.all')}</option>
              <option value="active">{t('tenants.common.active')}</option>
              <option value="suspended">{t('tenants.common.suspended')}</option>
              <option value="pending">{t('tenants.common.pending')}</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">{t('tenants.list.country')}</label>
            <select
              value={countryId}
              onChange={(e) => setCountryId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition"
            >
              <option value="">{t('tenants.common.all')}</option>
              {countries.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">{t('tenants.list.createdDate')}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition"
            />
          </div>

          <div className="flex gap-2 items-end">
            <button
              onClick={applyFilters}
              disabled={loading}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60 transition shadow-sm"
              type="button"
            >
              {t('tenants.common.filter')}
            </button>
            
            {!isSupport && (
            <button
              onClick={() => setOpenImport(true)}
              disabled={loading}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60 transition shadow-sm"
              type="button"
              title={t('tenants.list.importCsv')}
              aria-label={t('tenants.list.importCsv')}
            >
              <i className="bi bi-upload" />
            </button>
            )}

            <button
              onClick={handleExport}
              disabled={loading}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60 transition shadow-sm"
              type="button"
              title={t('tenants.list.exportCsv')}
              aria-label={t('tenants.list.exportCsv')}
            >
              <i className="bi bi-download" />
            </button>
          </div>
        </div>

        {err ? (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 flex items-center gap-2">
            <i className="bi bi-exclamation-triangle-fill" /> {err}
          </div>
        ) : null}

        {/* Mobile Card View */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:hidden">
          {rows.map((r) => {
            const country = countriesById.get(String(r.country_id));
            const tzId = r.timezone_id ?? r.timezoneId ?? null;
            const tz = tzId ? timezonesById.get(String(tzId)) : null;

            return (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <Link to={`/dashboard/tenants/${r.id}`} className="font-bold text-slate-900 hover:text-brand hover:underline">{r.legal_name}</Link>
                    <div className="text-xs text-slate-500">{r.trade_name || '—'}</div>
                  </div>
                  <ActionMenu tenant={r} onAction={handleAction} />
                </div>
                
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-xs font-semibold text-slate-500 block">{t('tenants.list.location')}</span>
                    <div className="flex items-center gap-1 mt-1">
                      {country && <span className="text-slate-700">{country.iso2}</span>}
                      {tz && <span className="text-xs text-slate-400">({tz.name})</span>}
                    </div>
                  </div>
                  
                  <div>
                    <span className="text-xs font-semibold text-slate-500 block">{t('tenants.common.status')}</span>
                    <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold mt-1 border ${
                          r.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : r.status === 'suspended'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        {statusLabel(r.status)}
                      </span>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-500 block">{t('tenants.list.users')}</span>
                    <div className="flex items-center gap-1 mt-1 text-slate-700">
                       <i className="bi bi-people-fill text-slate-400" /> {r.stats?.users_count ?? 0}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-500 block">{t('tenants.list.freelancers')}</span>
                    <div className="flex items-center gap-1 mt-1 text-slate-700">
                       <i className="bi bi-briefcase-fill text-slate-400" /> {r.stats?.freelancers_count ?? 0}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                    <span>{t('tenants.list.createdLabel', { date: r.created_at ? new Date(r.created_at).toLocaleDateString(locale) : '—' })}</span>
                    <span>{t('tenants.list.activityLabel', { date: r.last_activity_at ? new Date(r.last_activity_at).toLocaleDateString(locale) : '—' })}</span>
                </div>
              </div>
            );
          })}
          
          {!rows.length && !loading && (
             <div className="text-center py-10 text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                {t('tenants.list.emptyMobile')}
             </div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="mt-6 overflow-x-auto hidden md:block">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500 bg-slate-50/50">
                <th className="py-3 px-3 font-semibold rounded-tl-xl">{t('tenants.list.companyContact')}</th>
                <th className="py-3 px-3 font-semibold">{t('tenants.list.location')}</th>
                <th className="py-3 px-3 font-semibold">{t('tenants.list.stats')}</th>
                <th className="py-3 px-3 font-semibold">{t('tenants.common.status')}</th>
                <th className="py-3 px-3 font-semibold">{t('tenants.common.createdAt')}</th>
                <th className="py-3 px-3 font-semibold text-right rounded-tr-xl">{t('tenants.common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const country = countriesById.get(String(r.country_id));
                const tzId = r.timezone_id ?? r.timezoneId ?? null;
                const tz = tzId ? timezonesById.get(String(tzId)) : null;

                return (
                  <tr key={r.id} className="group hover:bg-slate-50/80 transition">
                    <td className="py-3 px-3">
                      <Link to={`/dashboard/tenants/${r.id}`} className="font-bold text-slate-900 hover:text-brand hover:underline">{r.legal_name}</Link>
                      <div className="text-xs text-slate-500">{r.trade_name || '—'}</div>
                      {/* Placeholder for owner if available */}
                      {r.owner && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                          <i className="bi bi-person" /> {r.owner.name}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex flex-col gap-1">
                        {country && (
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <span className="text-xs">{country.iso2}</span>
                            <span className="truncate max-w-[120px]" title={country.name}>{country.name}</span>
                          </div>
                        )}
                        {tz && (
                          <div className="text-xs text-slate-400 flex items-center gap-1">
                            <i className="bi bi-clock" /> {tz.name}
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex gap-3 text-xs">
                        <div className="text-slate-600" title={t('tenants.list.internalUsers')}>
                          <i className="bi bi-people-fill mr-1 text-slate-400" />
                          <span className="font-semibold">{r.stats?.users_count ?? '—'}</span>
                        </div>
                        <div className="text-slate-600" title={t('tenants.list.activeFreelancers')}>
                          <i className="bi bi-briefcase-fill mr-1 text-slate-400" />
                          <span className="font-semibold">{r.stats?.freelancers_count ?? '—'}</span>
                        </div>
                      </div>
                      {/* Last activity placeholder */}
                      <div className="mt-1 text-[10px] text-slate-400">
                        {t('tenants.list.activityLabel', { date: r.last_activity_at ? new Date(r.last_activity_at).toLocaleDateString(locale) : '—' })}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold border ${
                          r.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : r.status === 'suspended'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        {statusLabel(r.status)}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-xs text-slate-500">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString(locale) : '—'}
                    </td>

                    <td className="py-3 px-3 text-right relative">
                      <ActionMenu tenant={r} onAction={handleAction} />
                    </td>
                  </tr>
                );
              })}

              {!rows.length && loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500" role="status" aria-live="polite">
                    <span className="inline-block w-4 h-4 mr-2 align-middle border-2 border-slate-300 border-t-brand rounded-full animate-spin" />
                    {t('tenants.common.loading')}
                  </td>
                </tr>
              ) : null}

              {!rows.length && !loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <div className="mx-auto h-12 w-12 rounded-full bg-slate-50 flex items-center justify-center mb-3 text-slate-400 text-xl">
                      <i className="bi bi-search" />
                    </div>
                    {t('tenants.list.emptyFiltered')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
          <div className="text-xs text-slate-500">
            {loading ? t('tenants.common.loading') : t('tenants.common.showing', { count: rows.length, total: meta.total })}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={loading || meta.page <= 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
              type="button"
            >
              {t('tenants.common.previous')}
            </button>
            <div className="text-sm font-medium text-slate-700 min-w-[3rem] text-center">
              {t('tenants.common.pageOf', { page: meta.page, total: meta.totalPages })}
            </div>
            <button
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={loading || meta.page >= meta.totalPages}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
              type="button"
            >
              {t('tenants.common.next')}
            </button>
          </div>
        </div>
      </div>

      <Modal
        open={openEdit}
        title={t('tenants.list.editTitle')}
        onClose={() => setOpenEdit(false)}
      >
        <form onSubmit={submitEdit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700">{t('tenants.list.legalName')}</label>
            <input
              required
              className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
              value={editForm.legal_name}
              onChange={(e) => setEditForm({ ...editForm, legal_name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700">{t('tenants.list.tradeName')}</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
              value={editForm.trade_name}
              onChange={(e) => setEditForm({ ...editForm, trade_name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700">{t('tenants.list.country')}</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                value={editForm.country_id}
                onChange={(e) => setEditForm({ ...editForm, country_id: e.target.value })}
              >
                <option value="">{t('tenants.common.select')}</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700">{t('tenants.common.currency')}</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                value={editForm.default_currency_id}
                onChange={(e) => setEditForm({ ...editForm, default_currency_id: e.target.value })}
              >
                <option value="">{t('tenants.common.select')}</option>
                {currencies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700">{t('tenants.list.timezone')}</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
              value={editForm.timezone_id}
              onChange={(e) => setEditForm({ ...editForm, timezone_id: e.target.value })}
            >
              <option value="">{t('tenants.common.select')}</option>
              {timezones.map((tz) => (
                <option key={tz.id} value={tz.id}>
                  {tz.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setOpenEdit(false)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {t('tenants.common.cancel')}
            </button>
            <button
              type="submit"
              disabled={actionLoading === editForm.id}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-70"
            >
              {actionLoading === editForm.id ? t('tenants.common.saving') : t('tenants.list.saveChanges')}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!confirmAction}
        title={
          confirmAction?.type === 'delete' ? t('tenants.list.deleteTitle') :
          confirmAction?.type === 'suspend' ? t('tenants.list.suspendTitle') : t('tenants.list.activateTitle')
        }
        message={
          confirmAction?.type === 'delete'
            ? t('tenants.list.deleteMessage', { name: confirmAction?.tenant?.legal_name }) :
          confirmAction?.type === 'suspend'
            ? t('tenants.list.suspendMessage', { name: confirmAction?.tenant?.legal_name })
            : t('tenants.list.activateMessage', { name: confirmAction?.tenant?.legal_name })
        }
        confirmText={
          confirmAction?.type === 'delete' ? t('tenants.common.delete') :
          confirmAction?.type === 'suspend' ? t('tenants.list.suspend') : t('tenants.list.reactivate')
        }
        onClose={() => setConfirmAction(null)}
        onConfirm={executeStatusChange}
        loading={actionLoading === confirmAction?.tenant?.id}
        danger={confirmAction?.type === 'suspend' || confirmAction?.type === 'delete'}
      >
        {confirmAction?.type === 'suspend' && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('tenants.list.suspendReasonLabel')} <span className="text-red-600">*</span></label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-slate-300 shadow-sm focus:border-brand focus:ring-brand/10 p-2.5 text-sm"
              placeholder={t('tenants.list.suspendReasonPlaceholder')}
              rows={3}
              required
            />
          </div>
        )}
        {confirmAction?.type === 'delete' && (
          <div className="mt-4">
            <label htmlFor="tenant-delete-confirm" className="block text-sm font-medium text-slate-700 mb-1">
              {t('tenants.list.deleteConfirmLabel', { name: confirmAction?.tenant?.legal_name })} <span className="text-red-600">*</span>
            </label>
            <input
              id="tenant-delete-confirm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoComplete="off"
              className="w-full rounded-xl border border-slate-300 shadow-sm focus:border-red-500 focus:ring-red-500/10 p-2.5 text-sm"
              placeholder={confirmAction?.tenant?.legal_name}
            />
          </div>
        )}
        {confirmAction?.type === 'activate' && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('tenants.list.reasonOptional')}</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-slate-300 shadow-sm focus:border-brand focus:ring-brand/10 p-2.5 text-sm"
              placeholder={t('tenants.list.activateReasonPlaceholder')}
              rows={2}
            />
          </div>
        )}
      </ConfirmModal>

      <TenantImportModal
        open={openImport}
        onClose={() => setOpenImport(false)}
        api={api}
        countries={countries}
        currencies={currencies}
        timezones={timezones}
        onSuccess={() => {
            load();
        }}
      />
    </div>
  );
}
