import React, { useEffect, useMemo, useState } from 'react';
import { Outlet, useParams, useNavigate, useLocation, NavLink } from 'react-router-dom';
import { createApi } from '../../lib/api';
import { normalizePageResponse } from '../../lib/pagination';
import { useI18n } from '../../i18n/I18nContext';

function cx(...a) {
  return a.filter(Boolean).join(' ');
}

export default function TenantLayout({ apiUrl, token }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [tabOffset, setTabOffset] = useState(0);
  const visibleCount = 6;

  // Lookups shared across pages
  const [countries, setCountries] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [timezones, setTimezones] = useState([]);
  
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

  useEffect(() => {
    if (id) {
      loadTenant();
      loadLookups();
    }
  }, [id]);

  async function loadTenant() {
    setLoading(true);
    try {
      const data = await api.get(`/api/tenants/${id}`);
      setTenant(data);
    } catch (e) {
      setErr(e?.message || t('tenants.detail.loadError'));
    } finally {
      setLoading(false);
    }
  }

  async function loadLookups() {
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
      console.error("Error loading lookups", e);
    }
  }

  const company = tenant?.data?.company || tenant?.company;

  const tabs = [
    { to: '', label: t('tenants.detail.tabs.overview'), icon: 'bi bi-grid' },
    { to: 'projects', label: t('tenants.detail.tabs.projects'), icon: 'bi bi-kanban' },
    { to: 'contracts', label: t('tenants.detail.tabs.contracts'), icon: 'bi bi-file-earmark-text' },
    { to: 'contracts/templates', label: t('tenants.detail.tabs.templates'), icon: 'bi bi-file-earmark-code' },
    { to: 'payroll', label: t('tenants.detail.tabs.payroll'), icon: 'bi bi-calendar2-check' },
    { to: 'invoices', label: t('tenants.detail.tabs.invoices'), icon: 'bi bi-receipt' },
    { to: 'wallet', label: t('tenants.detail.tabs.wallet'), icon: 'bi bi-wallet2' },
    { to: 'onboarding-ops', label: t('tenants.detail.tabs.onboardingOps'), icon: 'bi bi-clipboard-check' },
    { to: 'members', label: t('tenants.detail.tabs.members'), icon: 'bi bi-people' },
    { to: 'roles', label: t('tenants.detail.tabs.roles'), icon: 'bi bi-shield-lock' },
    { to: 'settings', label: t('tenants.detail.tabs.settings'), icon: 'bi bi-gear' },
    { to: 'kyb', label: t('tenants.detail.tabs.kyb'), icon: 'bi bi-building-check' },
    { to: 'fees', label: t('tenants.detail.tabs.fees'), icon: 'bi bi-cash-coin' },
    { to: 'contacts', label: t('tenants.detail.tabs.contacts'), icon: 'bi bi-person-lines-fill' },
    { to: 'approvals', label: t('tenants.detail.tabs.approvals'), icon: 'bi bi-check2-square' },
    { to: 'support', label: t('tenants.detail.tabs.support'), icon: 'bi bi-life-preserver' },
    { to: 'reports', label: t('tenants.detail.tabs.reports'), icon: 'bi bi-bar-chart' },
    { to: 'audit', label: t('tenants.detail.tabs.audit'), icon: 'bi bi-clock-history' },
  ];

  const activeTabIndex = useMemo(() => {
    const basePath = `/dashboard/tenants/${id}`;
    const fullPath = location.pathname || '';
    const relative = fullPath.startsWith(basePath)
      ? fullPath.slice(basePath.length).replace(/^\/+/, '')
      : '';
    return tabs.findIndex((t) => {
      if (t.to === '') {
        return relative === '';
      }
      return relative === t.to;
    });
  }, [location.pathname, id]);

  useEffect(() => {
    setTabOffset((prev) => {
      const maxOffset = Math.max(0, tabs.length - visibleCount);
      let next = prev;
      if (activeTabIndex === -1) {
        if (prev > maxOffset) {
          next = maxOffset;
        }
      } else {
        if (activeTabIndex < prev) {
          next = activeTabIndex;
        } else if (activeTabIndex >= prev + visibleCount) {
          next = Math.min(activeTabIndex - visibleCount + 1, maxOffset);
        }
      }
      if (next < 0) next = 0;
      if (next > maxOffset) next = maxOffset;
      return next;
    });
  }, [activeTabIndex]);

  const canPrevTabs = tabOffset > 0;
  const canNextTabs = tabOffset + visibleCount < tabs.length;

  const visibleTabs = tabs.slice(tabOffset, tabOffset + visibleCount);

  const handlePrevTabs = () => {
    setTabOffset((prev) => Math.max(0, prev - visibleCount));
  };

  const handleNextTabs = () => {
    setTabOffset((prev) => {
      const maxOffset = Math.max(0, tabs.length - visibleCount);
      const next = prev + visibleCount;
      return next > maxOffset ? maxOffset : next;
    });
  };

  if (loading && !tenant) {
    return <div className="p-10 text-center text-slate-500">{t('tenants.detail.loadingCompany')}</div>;
  }

  if (err) {
    return (
      <div className="p-10 text-center text-red-500">
        <p className="font-bold">{t('tenants.common.error')}</p>
        <p>{err}</p>
        <button onClick={() => navigate('/dashboard')} className="mt-4 text-blue-600 hover:underline">
          {t('tenants.detail.backToDashboard')}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-10">
       {/* Header */}
       <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div className="flex items-center gap-4">
            {company?.logo_url && (
                <img 
                    src={company.logo_url} 
                    alt={t('tenants.detail.logoAlt')} 
                    className="h-16 w-16 rounded-xl object-contain bg-white border border-slate-200 p-1"
                />
            )}
            <div>
                <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase">
                    {t('tenants.detail.company')}
                </div>
                <h1 className="text-2xl font-extrabold text-slate-900 leading-tight">
                    {company?.legal_name || '—'}
                </h1>
                {company?.trade_name && (
                    <div className="text-sm text-slate-600">{company.trade_name}</div>
                )}
            </div>
        </div>
        
        {/* Global Actions could go here */}
       </div>

       {company?.read_only_mode === 1 || company?.read_only_mode === true || company?.read_only_mode === '1' ? (
         <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-center gap-2">
           <i className="bi bi-lock-fill" aria-hidden="true" />
           <div>
             <span className="font-semibold">{t('tenants.detail.readOnlyTitle')}</span> {t('tenants.detail.readOnlyDescription')}
           </div>
         </div>
       ) : null}

       <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-2 py-2">
         <div className="flex items-center gap-2">
           <button
             type="button"
             onClick={handlePrevTabs}
             disabled={!canPrevTabs}
             className={cx(
               'inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs',
               canPrevTabs
                 ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                 : 'border-slate-200 bg-slate-100 text-slate-300 cursor-not-allowed'
             )}
             aria-label={t('tenants.detail.prevTabs')}
           >
             <i className="bi bi-chevron-left" aria-hidden="true" />
           </button>
           <div className="flex-1">
             <div className="flex gap-2 justify-start">
               {visibleTabs.map((t) => (
                 <NavLink
                   key={t.to}
                   end={t.to === ''}
                   to={t.to}
                   className={({ isActive }) =>
                     cx(
                       'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap border transition',
                       isActive
                         ? 'bg-brand text-white border-brand shadow-sm shadow-brand/20'
                         : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                     )
                   }
                 >
                   <i className={t.icon} aria-hidden="true" />
                   <span>{t.label}</span>
                 </NavLink>
               ))}
             </div>
           </div>
           <button
             type="button"
             onClick={handleNextTabs}
             disabled={!canNextTabs}
             className={cx(
               'inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs',
               canNextTabs
                 ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                 : 'border-slate-200 bg-slate-100 text-slate-300 cursor-not-allowed'
             )}
             aria-label={t('tenants.detail.nextTabs')}
           >
             <i className="bi bi-chevron-right" aria-hidden="true" />
           </button>
         </div>
       </div>

       <Outlet context={{ 
           tenant, 
           loadTenant, 
           api, 
           id, 
           countries, 
           currencies, 
           timezones,
           countriesById, 
           currenciesById, 
           timezonesById,
           apiUrl,
           token
        }} />
    </div>
  );
}
