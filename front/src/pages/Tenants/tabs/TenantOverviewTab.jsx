import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { PLATFORM_ROLES } from '../../../lib/platformRoles';
import { useI18n } from '../../../i18n/I18nContext';

export default function TenantOverviewTab({
  api,
  companyId,
  company,
  settings,
  wallet,
  countriesById,
  currenciesById,
}) {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'es-ES';
  const isSupport = user?.platform_role === PLATFORM_ROLES.SUPPORT;
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId || !api) return;
    loadStats();
  }, [companyId, api]);

  async function loadStats() {
    setLoading(true);
    try {
      const res = await api.get(`/api/tenants/${companyId}/stats`);
      setStats(res.data || res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Helpers para mostrar nombres en vez de IDs
  const getCountryName = (id) => {
    if (!id) return '—';
    if (!countriesById) return id;
    const c = countriesById.get(String(id));
    return c ? `${c.iso2} — ${c.name}` : id;
  };

  const getCurrencyName = (id) => {
    if (!id) return '—';
    if (!currenciesById) return id;
    const c = currenciesById.get(String(id));
    return c ? `${c.code} — ${c.name} ${c.symbol ? `(${c.symbol})` : ''}` : id;
  };

  const getCurrencyCode = (id) => {
    if (!id) return '';
    if (!currenciesById) return id;
    const c = currenciesById.get(String(id));
    return c ? c.code : id;
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase">
              {t('tenants.operations.overview.summary')}
            </div>
            <div className="mt-1 text-lg font-extrabold text-slate-900">
              {t('tenants.operations.overview.title')}
            </div>
            <p className="mt-1 text-sm text-slate-600 max-w-xl">
              {t('tenants.operations.overview.subtitle')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <span className="mr-1.5 h-2 w-2 rounded-full bg-emerald-500" />
              {company?.status
                ? ({ active: t('tenants.common.active'), suspended: t('tenants.common.suspended'), pending: t('tenants.common.pending'), inactive: t('tenants.common.inactive') }[company.status] || company.status)
                : t('tenants.operations.overview.statusUndefined')}
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
              <i className="bi bi-geo-alt text-slate-500 mr-1.5" />
              {getCountryName(company?.country_id)}
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
              <i className="bi bi-cash-stack text-slate-500 mr-1.5" />
              {getCurrencyName(company?.default_currency_id)}
            </span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">{t('tenants.operations.overview.legalName')}</div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">
              {company?.legal_name || '—'}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">{t('tenants.operations.overview.tradeName')}</div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">
              {company?.trade_name || '—'}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">{t('tenants.operations.overview.mainLanguage')}</div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">
              {settings?.default_language || '—'}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">{t('tenants.operations.overview.country')}</div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">
              {getCountryName(company?.country_id)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">{t('tenants.operations.overview.baseCurrency')}</div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">
              {getCurrencyName(company?.default_currency_id)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">{t('tenants.operations.overview.wallet')}</div>
            <div className="mt-2 flex items-baseline justify-between gap-3">
              <div className="text-sm font-extrabold text-slate-900">
                {isSupport ? (
                  <span className="text-slate-500 font-normal italic">
                    {t('tenants.operations.overview.restrictedView')}
                  </span>
                ) : (
                  <>
                    {wallet?.balance ?? '—'}
                    {wallet?.currency_id ? ` ${getCurrencyCode(wallet.currency_id)}` : ''}
                  </>
                )}
              </div>
              {!isSupport && (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {t('tenants.operations.overview.operational')}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-slate-900">{t('tenants.operations.overview.internalMetrics')}</h3>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {t('tenants.operations.overview.lastSnapshot')}
            </span>
          </div>
          {loading && !stats ? (
            <div className="mt-3 text-sm text-slate-500">{t('tenants.operations.overview.loadingMetrics')}</div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
                <div className="text-xs font-semibold text-blue-600 uppercase">
                  {t('tenants.operations.overview.activeUsers')}
                </div>
                <div className="mt-1 text-2xl font-bold text-blue-900">
                  {stats?.active_users ?? 0}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-purple-50 border border-purple-100">
                <div className="text-xs font-semibold text-purple-600 uppercase">
                  {t('tenants.operations.overview.activeProjects')}
                </div>
                <div className="mt-1 text-2xl font-bold text-purple-900">
                  {stats?.active_projects ?? 0}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                <div className="text-xs font-semibold text-emerald-600 uppercase">
                  {t('tenants.operations.overview.pendingApprovals')}
                </div>
                <div className="mt-1 text-2xl font-bold text-emerald-900">
                  {stats?.pending_requisitions ?? 0}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
                <div className="text-xs font-semibold text-amber-600 uppercase">
                  {t('tenants.operations.overview.tickets')}
                </div>
                <div className="mt-1 text-2xl font-bold text-amber-900">—</div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-slate-900">{t('tenants.operations.overview.recentActivity')}</h3>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {t('tenants.operations.overview.latestEvents')}
            </span>
          </div>
          {loading && !stats ? (
            <div className="mt-3 text-sm text-slate-500">{t('tenants.operations.overview.loadingActivity')}</div>
          ) : (
            <div className="mt-4 space-y-4">
              {stats?.recent_activity?.length > 0 ? (
                stats.recent_activity.map((act, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 pb-3 border-b border-slate-100 last:border-0 last:pb-0"
                  >
                    <div className="h-8 w-8 rounded-full bg-slate-100 grid place-items-center text-slate-500 shrink-0">
                      <i className="bi bi-activity" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{act.action}</div>
                      <div className="text-xs text-slate-500">
                        {new Date(act.created_at).toLocaleString(locale)}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500 italic">{t('tenants.operations.overview.noRecentActivity')}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
