import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { PLATFORM_ROLES } from '../../../lib/platformRoles';

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
              Resumen
            </div>
            <div className="mt-1 text-lg font-extrabold text-slate-900">
              Información general del tenant
            </div>
            <p className="mt-1 text-sm text-slate-600 max-w-xl">
              Visión rápida de la empresa, su configuración principal y estado operativo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <span className="mr-1.5 h-2 w-2 rounded-full bg-emerald-500" />
              {company?.status || 'Estado no definido'}
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
            <div className="text-xs font-semibold text-slate-500">Razón social</div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">
              {company?.legal_name || '—'}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">Nombre comercial</div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">
              {company?.trade_name || '—'}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">Idioma principal</div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">
              {settings?.default_language || '—'}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">País</div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">
              {getCountryName(company?.country_id)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">Moneda base</div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">
              {getCurrencyName(company?.default_currency_id)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">Wallet</div>
            <div className="mt-2 flex items-baseline justify-between gap-3">
              <div className="text-sm font-extrabold text-slate-900">
                {isSupport ? (
                  <span className="text-slate-500 font-normal italic">
                    Vista restringida (Rol Support)
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
                  Operativa
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-slate-900">Métricas internas</h3>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Última captura
            </span>
          </div>
          {loading && !stats ? (
            <div className="mt-3 text-sm text-slate-500">Cargando métricas...</div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
                <div className="text-xs font-semibold text-blue-600 uppercase">
                  Usuarios activos
                </div>
                <div className="mt-1 text-2xl font-bold text-blue-900">
                  {stats?.active_users ?? 0}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-purple-50 border border-purple-100">
                <div className="text-xs font-semibold text-purple-600 uppercase">
                  Proyectos activos
                </div>
                <div className="mt-1 text-2xl font-bold text-purple-900">
                  {stats?.active_projects ?? 0}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                <div className="text-xs font-semibold text-emerald-600 uppercase">
                  Aprobaciones pendientes
                </div>
                <div className="mt-1 text-2xl font-bold text-emerald-900">
                  {stats?.pending_requisitions ?? 0}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
                <div className="text-xs font-semibold text-amber-600 uppercase">
                  Tickets
                </div>
                <div className="mt-1 text-2xl font-bold text-amber-900">—</div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-slate-900">Actividad reciente</h3>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Últimos eventos
            </span>
          </div>
          {loading && !stats ? (
            <div className="mt-3 text-sm text-slate-500">Cargando actividad...</div>
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
                        {new Date(act.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500 italic">No hay actividad reciente.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
