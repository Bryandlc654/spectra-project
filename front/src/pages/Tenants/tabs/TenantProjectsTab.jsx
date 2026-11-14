import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { PLATFORM_ROLES } from '../../../lib/platformRoles';
import { useToast } from '../../../components/ToastProvider';
import { useI18n } from '../../../i18n/I18nContext';

export default function TenantProjectsTab({ companyId, api }) {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'es-ES';
  const isSupport = user?.platform_role === PLATFORM_ROLES.SUPPORT;
  const toast = useToast();
  const safeApi = useMemo(() => api, [api]);

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [statusFilter, setStatusFilter] = useState('active');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!safeApi?.get || !companyId) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr('');
      try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        if (statusFilter) params.set('status', statusFilter);
        if (search) params.set('q', search.trim());

        const res = await safeApi.get(`/api/tenants/${companyId}/projects?${params.toString()}`);
        let items = [];
        let pages = 1;

        if (Array.isArray(res)) {
          items = res;
        } else if (Array.isArray(res.items)) {
          items = res.items;
          pages = res.pages || res.meta?.total_pages || 1;
        } else if (Array.isArray(res.data)) {
          items = res.data;
          pages = res.meta?.total_pages || res.pages || 1;
        }

        if (!cancelled) {
          setProjects(items);
          setTotalPages(Math.max(1, Number(pages) || 1));
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e?.message || t('tenants.operations.projects.loadError'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [safeApi, companyId, page, statusFilter, search]);

  const handleReload = () => {
    setPage(1);
  };

  const formatDate = (value) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString(locale);
  };

  const getStatusLabel = (status) => {
    const key = `tenants.operations.projects.status.${status}`;
    const translated = t(key);
    return translated === key ? status : translated;
  };

  const renderStatusBadge = (statusRaw) => {
    if (!statusRaw) return <span className="text-xs text-slate-500">{t('tenants.operations.projects.noStatus')}</span>;
    const status = String(statusRaw).toLowerCase();
    let cls = 'bg-slate-100 text-slate-700';
    if (status === 'draft') cls = 'bg-slate-100 text-slate-700';
    else if (status === 'active') cls = 'bg-emerald-50 text-emerald-700';
    else if (status === 'on_hold') cls = 'bg-amber-50 text-amber-700';
    else if (status === 'completed') cls = 'bg-blue-50 text-blue-700';
    else if (status === 'cancelled') cls = 'bg-red-50 text-red-700';

    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
        {status ? getStatusLabel(status) : t('tenants.common.unknown')}
      </span>
    );
  };

  const handleCopyId = (id) => {
    if (!id || typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(String(id)).then(
      () => toast.success(t('tenants.common.idCopied')),
      () => {}
    );
  };

  if (!safeApi?.get) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {t('tenants.operations.projects.apiNotReady')}
      </div>
    );
  }

  if (loading && !projects.length && !err) {
    return <div className="py-8 text-center text-slate-500">{t('tenants.operations.projects.loadingProjects')}</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{t('tenants.operations.projects.title')}</h3>
          <p className="text-xs text-slate-500">
            {t('tenants.operations.projects.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
          >
            <option value="">{t('tenants.operations.projects.allStatuses')}</option>
            <option value="active">{t('tenants.operations.projects.status.active')}</option>
            <option value="on_hold">{t('tenants.operations.projects.status.on_hold')}</option>
            <option value="completed">{t('tenants.operations.projects.status.completed')}</option>
            <option value="archived">{t('tenants.operations.projects.status.archived')}</option>
          </select>

          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t('tenants.operations.projects.searchPlaceholder')}
            className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand focus:ring-brand"
          />

          <button
            type="button"
            onClick={handleReload}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <i className="bi bi-arrow-repeat" />
            {t('tenants.common.refresh')}
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {err}
        </div>
      )}

      {!projects.length && !loading && !err && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
          {t('tenants.operations.projects.noProjects')}
        </div>
      )}

      {projects.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">{t('tenants.common.name')}</th>
                <th className="px-4 py-3 text-left">{t('tenants.operations.projects.code')}</th>
                <th className="px-4 py-3 text-left">{t('tenants.common.status')}</th>
                <th className="px-4 py-3 text-left">{t('tenants.operations.projects.start')}</th>
                <th className="px-4 py-3 text-left">{t('tenants.operations.projects.end')}</th>
                {!isSupport && <th className="px-4 py-3 text-right">{t('tenants.common.actions')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projects.map((p) => {
                const name = p.name || p.title || p.project_name || p.id;
                const code = p.code || p.key || p.reference || '';
                const start = p.start_date || p.start_at || p.created_at;
                const end = p.end_date || p.due_date || null;
                return (
                  <tr key={p.id || `${name}-${code}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">
                          {name || t('tenants.operations.projects.noName')}
                        </span>
                        {p.id && (
                          <button
                            type="button"
                            onClick={() => handleCopyId(p.id)}
                            className="text-slate-400 hover:text-brand"
                            title={t('tenants.common.copyId')}
                          >
                            <i className="bi bi-clipboard" />
                          </button>
                        )}
                      </div>
                      {p.description && (
                        <div className="text-xs text-slate-500 truncate max-w-xs">
                          {p.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                      {code || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {renderStatusBadge(p.status)}
                    </td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                      {formatDate(start)}
                    </td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                      {end ? formatDate(end) : '—'}
                    </td>
                    {!isSupport && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          title={t('tenants.operations.projects.viewDetailSoon')}
                        >
                          <i className="bi bi-eye" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <i className="bi bi-chevron-left" />
                {t('tenants.common.previous')}
              </button>
              <span>
                {t('tenants.common.pageOf', { page, total: totalPages })}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {t('tenants.common.next')}
                <i className="bi bi-chevron-right" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
