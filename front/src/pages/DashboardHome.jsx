import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createApi } from '../lib/api';
import { normalizePageResponse } from '../lib/pagination';
import FreelancerDashboard from './FreelancerDashboard';
import CompanyDashboard from './CompanyDashboard';
import { PLATFORM_ROLES } from '../lib/platformRoles';
import { useI18n } from '../i18n/I18nContext';

export default function DashboardHome({ user, apiUrl, token }) {
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'es-ES';

  if (user?.role === 'freelancer' || user?.platform_role === 'freelancer' || user?.platform_role === 'freelance') {
      return <FreelancerDashboard user={user} apiUrl={apiUrl} token={token} />;
  }

  if (user?.platform_role === PLATFORM_ROLES.COMPANY_ADMIN || user?.role === 'company_admin') {
      return <CompanyDashboard user={user} apiUrl={apiUrl} token={token} />;
  }

  const [stats, setStats] = useState({
    tenants: 0,
    users: 0,
    kybPending: 0,
    freelancers: 0,
    contracts: 0,
    invoices: 0,
    invoicesOverdue: 0,
    requisitionsPending: 0,
    auditEvents: 0,
    compliancePending: 0,
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [activityExpanded, setActivityExpanded] = useState(false);

  useEffect(() => {
    if (!token) return;

    let mounted = true;

    (async () => {
      setLoading(true);
      try {
        const [
          tenantsRes,
          usersRes,
          kybRes,
          freelancersRes,
          contractsRes,
          invoicesRes,
          invoicesOverdueRes,
          reqPendingRes,
          auditRes,
          compliancePendingRes
        ] = await Promise.all([
          api.get('/api/tenants?per_page=1'),
          api.get('/api/users?status=active&per_page=1'),
          api.get('/api/kyb?status=pending_review&limit=1').catch(() => ({ data: [], meta: { total: 0 } })),
          api.get('/api/freelancers?per_page=1').catch(() => ({ data: [], meta: { total: 0 } })),
          api.get('/api/global-contracts?per_page=1').catch(() => ({ data: [], meta: { total: 0 } })),
          api.get('/api/finance/invoices?per_page=1').catch(() => ({ data: [], meta: { total: 0 } })),
          api.get('/api/finance/invoices?status=overdue&per_page=1').catch(() => ({ data: [], meta: { total: 0 } })),
          api.get('/api/procurement/requisitions?status=pending&per_page=1').catch(() => ({ data: [], meta: { total: 0 } })),
          api.get('/api/audit_logs?per_page=200').catch(() => ({ data: [] })),
          api.get('/api/compliance/documents?status=pending&per_page=1').catch(() => ({ data: [], meta: { total: 0 } })),
        ]);

        if (!mounted) return;

        const tenantsMeta = normalizePageResponse(tenantsRes).meta;
        const usersMeta = normalizePageResponse(usersRes).meta;
        const kybMeta = normalizePageResponse(kybRes).meta;
        const freelancersMeta = normalizePageResponse(freelancersRes).meta;
        const contractsMeta = normalizePageResponse(contractsRes).meta;
        const invoicesMeta = normalizePageResponse(invoicesRes).meta;
        const invoicesOverdueMeta = normalizePageResponse(invoicesOverdueRes).meta;
        const reqPendingMeta = normalizePageResponse(reqPendingRes).meta;
        const auditItems = normalizePageResponse(auditRes).items;
        const compliancePendingMeta = normalizePageResponse(compliancePendingRes).meta;

        setStats({
          tenants: tenantsMeta.total || 0,
          users: usersMeta.total || 0,
          kybPending: kybMeta.total || 0,
          freelancers: freelancersMeta.total || 0,
          contracts: contractsMeta.total || 0,
          invoices: invoicesMeta.total || 0,
          invoicesOverdue: invoicesOverdueMeta.total || 0,
          requisitionsPending: reqPendingMeta.total || 0,
          auditEvents: Array.isArray(auditItems) ? auditItems.length : 0,
          compliancePending: compliancePendingMeta.total || 0,
        });
        setRecentActivity(auditItems || []);
      } catch (e) {
        console.error(e);
        if (mounted) setErr(t('dashboard.home.loadError'));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [api, token, t]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-bold tracking-widest text-slate-500 uppercase">
              {t('dashboard.home.eyebrow')}
            </div>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">
              {t('dashboard.home.greeting', { name: user?.full_name || t('dashboard.home.defaultUser') })}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {t('dashboard.home.welcome')}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              to="/dashboard/tenants"
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 shadow-sm shadow-brand-500/20 transition-all"
            >
              <i className="bi bi-plus-lg" />
              {t('dashboard.home.newCompany')}
            </Link>
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xs font-bold tracking-widest text-slate-500 uppercase">{t('dashboard.home.summary')}</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          label={t('dashboard.home.companies')}
          value={loading ? '...' : stats.tenants}
          icon="bi-building"
          color="blue"
          to="/dashboard/tenants"
        />
        <StatsCard
          label={t('dashboard.home.totalUsers')}
          value={loading ? '...' : stats.users}
          icon="bi-people"
          color="indigo"
          to="/dashboard/users"
        />
        <StatsCard
          label={t('dashboard.home.freelancers')}
          value={loading ? '...' : stats.freelancers}
          icon="bi-people-fill"
          color="indigo"
          to="/dashboard/freelancers"
        />
        <StatsCard
          label={t('dashboard.home.invoices')}
          value={loading ? '...' : stats.invoices}
          icon="bi-receipt"
          color="slate"
          to="/dashboard/finance/invoices"
          subtext={stats.invoicesOverdue > 0 ? t('dashboard.home.overdueCount', { count: stats.invoicesOverdue }) : t('dashboard.home.noOverdue')}
          highlight={stats.invoicesOverdue > 0}
        />
      </div>

      {/* Visualizaciones y actividad */}
      <div className="flex items-center justify-between mt-2">
        <h2 className="text-xs font-bold tracking-widest text-slate-500 uppercase">{t('dashboard.home.overview')}</h2>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Charts */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:col-span-2">
          {/* Actividad últimos 7 días */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">{t('dashboard.home.last7Days')}</h3>
              <span className="text-xs text-slate-400">{t('dashboard.home.events')}</span>
            </div>
            <div className="mt-4">
              <SevenDayActivityBars items={recentActivity} loading={loading} locale={locale} />
            </div>
          </div>
          {/* Estado de facturas */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">{t('dashboard.home.invoiceStatus')}</h3>
              <Link to="/dashboard/finance/invoices" className="text-xs text-brand hover:text-brand-700">{t('dashboard.home.viewDetails')}</Link>
            </div>
            <div className="mt-4 flex items-center gap-6">
              <InvoiceDonut total={stats.invoices} overdue={stats.invoicesOverdue} loading={loading} />
              <div className="space-y-2">
                <LegendItem color="stroke-amber-500" label={t('dashboard.home.overdue')} value={stats.invoicesOverdue} loading={loading} />
                <LegendItem color="stroke-emerald-500" label={t('dashboard.home.notOverdue')} value={Math.max(0, stats.invoices - stats.invoicesOverdue)} loading={loading} />
                <p className="text-xs text-slate-500 pt-1">
                  {loading ? '...' : t('dashboard.home.overduePercent', { percent: stats.invoices ? Math.round((stats.invoicesOverdue / Math.max(1, stats.invoices)) * 100) : 0 })}
                </p>
              </div>
            </div>
          </div>
          {/* Distribución de usuarios */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">{t('dashboard.home.userDistribution')}</h3>
              <Link to="/dashboard/users" className="text-xs text-brand hover:text-brand-700">{t('dashboard.home.viewUsers')}</Link>
            </div>
            <div className="mt-4">
              <UsersDistribution totalUsers={stats.users} freelancers={stats.freelancers} loading={loading} />
            </div>
          </div>
        </div>
        {/* Right column: Recent Activity + Quick Links */}
        <div className="xl:col-span-1 space-y-6">
          {/* Recent Activity Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">{t('dashboard.home.recentActivity')}</h3>
              <div className="flex items-center gap-2">
                {recentActivity.length > 6 && (
                  <button
                    onClick={() => setActivityExpanded(!activityExpanded)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {activityExpanded ? t('dashboard.home.showLess') : t('dashboard.home.showMore')}
                  </button>
                )}
                <Link to="/dashboard/audit" className="text-xs font-medium text-brand-600 hover:text-brand-700">{t('dashboard.home.viewAll')}</Link>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center text-slate-500">{t('dashboard.home.loadingActivity')}</div>
              ) : recentActivity.length === 0 ? (
                <div className="p-8 text-center text-slate-500">{t('dashboard.home.noRecentActivity')}</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {(activityExpanded ? recentActivity.slice(0, 20) : recentActivity.slice(0, 8)).map((log) => (
                    <div key={log.id} className="flex items-start gap-4 py-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        <i className={`bi ${getEventIcon(log.event)} text-base`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">
                          {log.event}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {log.auditable_type} #{log.auditable_id} · IP: {log.ip_address}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {new Date(log.created_at).toLocaleString(locale)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Links Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">{t('dashboard.home.quickLinks')}</h3>
            <div className="grid grid-cols-1 gap-3">
              <QuickLink
                to="/dashboard/tenants"
                icon="bi-building-add"
                title={t('dashboard.home.manageCompanies')}
                desc={t('dashboard.home.manageCompaniesDesc')}
              />
              <QuickLink
                to="/dashboard/users"
                icon="bi-person-plus"
                title={t('dashboard.home.manageUsers')}
                desc={t('dashboard.home.manageUsersDesc')}
              />
              <QuickLink
                to="/dashboard/rbac/roles"
                icon="bi-shield-lock"
                title={t('dashboard.home.rolesPermissions')}
                desc={t('dashboard.home.rolesPermissionsDesc')}
              />
              <QuickLink
                to="/dashboard/settings/countries"
                icon="bi-globe"
                title={t('dashboard.home.globalSettings')}
                desc={t('dashboard.home.globalSettingsDesc')}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatsCard({ label, value, icon, color, to, subtext, highlight }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    slate: 'bg-slate-50 text-slate-600',
  };

  return (
    <Link to={to} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:shadow-md hover:border-slate-300">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
          {subtext && (
            <p className={`mt-1 text-xs font-medium ${highlight ? 'text-amber-600' : 'text-slate-400'}`}>
              {subtext}
            </p>
          )}
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${colors[color] || colors.slate} transition-transform group-hover:scale-110`}>
          <i className={`bi ${icon} text-xl`} />
        </div>
      </div>
    </Link>
  );
}

function SevenDayActivityBars({ items, loading, locale }) {
  const today = new Date();
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    return { date: d, key, count: 0 };
  });

  if (!loading && Array.isArray(items)) {
    for (const it of items) {
      const ts = it.created_at ? new Date(it.created_at) : null;
      if (!ts || isNaN(ts.getTime())) continue;
      const key = ts.toISOString().slice(0, 10);
      const day = days.find(d => d.key === key);
      if (day) day.count += 1;
    }
  }

  const max = Math.max(1, ...days.map(d => d.count));

  return (
    <div className="grid grid-cols-7 gap-2 h-28 items-end">
      {days.map((d, idx) => {
        const pct = Math.round((d.count / max) * 100);
        const label = d.date.toLocaleDateString(locale, { weekday: 'short' });
        return (
          <div key={idx} className="flex flex-col items-center gap-1">
            <div className="w-full rounded-md bg-slate-100 h-24 overflow-hidden">
              <div
                className={`h-full w-full origin-bottom bg-gradient-to-t from-brand/80 to-brand/50 transition-all`}
                style={{ transform: `scaleY(${pct / 100})` }}
                title={`${label}: ${d.count}`}
              />
            </div>
            <span className="text-[10px] text-slate-500">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function InvoiceDonut({ total, overdue, loading }) {
  const t = Math.max(0, Number(total || 0));
  const o = Math.max(0, Math.min(t, Number(overdue || 0)));
  const radius = 36;
  const circ = 2 * Math.PI * radius;
  const frac = t ? o / t : 0;
  const dash = Math.max(0, Math.min(1, frac)) * circ;
  const rest = circ - dash;

  return (
    <svg width="100" height="100" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={radius} className="stroke-slate-200" strokeWidth="12" fill="none" />
      <circle
        cx="50"
        cy="50"
        r={radius}
        className="stroke-amber-500"
        strokeWidth="12"
        fill="none"
        strokeDasharray={`${dash} ${rest}`}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="fill-slate-900 font-bold">
        {loading ? '...' : `${t ? Math.round(frac * 100) : 0}%`}
      </text>
    </svg>
  );
}

function LegendItem({ color, label, value, loading }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${color.replace('stroke', 'bg')}`} />
      <span className="text-slate-600">{label}</span>
      <span className="ml-auto font-semibold text-slate-900">{loading ? '...' : value}</span>
    </div>
  );
}

function UsersDistribution({ totalUsers, freelancers, loading }) {
  const { t } = useI18n();
  const total = Math.max(0, Number(totalUsers || 0));
  const free = Math.max(0, Math.min(total, Number(freelancers || 0)));
  const internal = Math.max(0, total - free);
  const freePct = total ? (free / total) * 100 : 0;
  const internalPct = 100 - freePct;

  return (
    <div className="space-y-3">
      <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full bg-indigo-500" style={{ width: `${internalPct}%` }} title={t('dashboard.home.internalTooltip', { count: internal })} />
        <div className="h-full -mt-3 bg-emerald-500" style={{ width: `${freePct}%` }} title={t('dashboard.home.freelancersTooltip', { count: free })} />
      </div>
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-indigo-500" />
          <span className="text-slate-600">{t('dashboard.home.internal')}</span>
        </div>
        <span className="font-semibold text-slate-900">{loading ? '...' : internal}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span className="text-slate-600">{t('dashboard.home.freelancers')}</span>
        </div>
        <span className="font-semibold text-slate-900">{loading ? '...' : free}</span>
      </div>
      <p className="text-xs text-slate-500">
        {loading ? t('dashboard.home.loadingShort') : t('dashboard.home.totalUsersCount', { count: total })}
      </p>
    </div>
  );
}

function QuickLink({ to, icon, title, desc }) {
  return (
    <Link to={to} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-all hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
        <i className={`bi ${icon}`} />
      </div>
      <div>
        <div className="text-sm font-bold text-slate-900">{title}</div>
        <div className="text-xs text-slate-500">{desc}</div>
      </div>
      <i className="bi bi-chevron-right ml-auto text-slate-400" />
    </Link>
  );
}

function getEventIcon(event) {
  if (!event) return 'bi-activity';
  const e = event.toLowerCase();
  if (e.includes('create')) return 'bi-plus-circle text-emerald-500';
  if (e.includes('update')) return 'bi-pencil text-blue-500';
  if (e.includes('delete')) return 'bi-trash text-red-500';
  if (e.includes('login')) return 'bi-box-arrow-in-right text-indigo-500';
  return 'bi-activity';
}
