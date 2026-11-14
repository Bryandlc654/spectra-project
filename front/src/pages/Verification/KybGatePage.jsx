import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createApi } from '../../lib/api';
import LanguageSelector from '../../components/LanguageSelector';
import { useI18n } from '../../i18n/I18nContext';
import TenantKYBTab from '../Tenants/tabs/TenantKYBTab';

function StatusPill({ status, t }) {
  const statusKey = `tenants.verification.status.${status}`;
  const label = t(statusKey);
  const translated = label === statusKey ? status : label;

  let classes = 'bg-slate-100 text-slate-700';
  if (status === 'approved') classes = 'bg-emerald-100 text-emerald-700';
  else if (status === 'pending' || status === 'pending_review') classes = 'bg-amber-100 text-amber-800';
  else if (status === 'rejected') classes = 'bg-red-100 text-red-700';
  else if (status === 'more_info_required') classes = 'bg-amber-100 text-amber-800';

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${classes}`}>
      {translated}
    </span>
  );
}

export default function KybGatePage({ user, token, apiUrl, onLogout }) {
  const { t } = useI18n();
  const companyId = user?.company_id;
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);

  const [state, setState] = useState({
    loading: true,
    required: true,
    status: 'not_started',
    companyName: '',
    rejectionReason: null,
    error: '',
  });

  const load = useCallback(async () => {
    if (!companyId) {
      setState((prev) => ({ ...prev, loading: false, error: t('tenants.verification.loading') }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const res = await api.get(`/api/tenants/${companyId}/kyb`);
      setState({
        loading: false,
        required: !!res?.required,
        status: res?.request?.status || 'not_started',
        companyName: res?.company_name || '',
        rejectionReason: res?.request?.rejection_reason || null,
        error: '',
      });
    } catch (e) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: e?.message || t('tenants.admin.kyb.loadError'),
      }));
    }
  }, [api, companyId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const needsVerification = state.required && state.status !== 'approved';

  let title = t('tenants.verification.missingTitle');
  let description = t('tenants.verification.missingDescription');
  if (state.status === 'pending' || state.status === 'pending_review') {
    title = t('tenants.verification.pendingTitle');
    description = t('tenants.verification.pendingDescription');
  } else if (state.status === 'rejected') {
    title = t('tenants.verification.rejectedTitle');
    description = t('tenants.verification.rejectedDescription');
  } else if (state.status === 'more_info_required') {
    title = t('tenants.verification.moreInfoTitle');
    description = t('tenants.verification.moreInfoDescription');
  }

  const headerTitle = state.status === 'approved'
    ? t('tenants.verification.status.approved')
    : (!state.required ? t('tenants.verification.notRequiredHint') : t('tenants.verification.title'));
  const headerDescription = state.status === 'approved' || !state.required
    ? ''
    : t('tenants.verification.subtitle');

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <img src="/logo-spectra.webp" alt="Grupo Spectra" className="h-9 w-auto max-w-[170px] object-contain" />
          <div className="flex items-center gap-2">
            <LanguageSelector />
            <button
              type="button"
              onClick={onLogout}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {t('common.logout')}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-brand">
            <i className="bi bi-shield-lock text-2xl" />
          </div>
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            {t('tenants.verification.eyebrow')}
          </div>
          <h1 className="mt-2 text-2xl font-extrabold text-slate-900">{headerTitle}</h1>
          {headerDescription && (
            <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">{headerDescription}</p>
          )}
        </div>

        <div className="mx-auto max-w-3xl space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {t('tenants.verification.companyLabel')}
                </div>
                <div className="text-lg font-bold text-slate-900">
                  {state.companyName || '—'}
                </div>
              </div>
              <div className="sm:text-right">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {t('tenants.verification.statusLabel')}
                </div>
                <div className="mt-1">
                  <StatusPill status={state.status} t={t} />
                </div>
              </div>
            </div>

            {needsVerification && (
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">{title}</p>
                <p className="mt-1 text-sm text-slate-600">{description}</p>
                {state.rejectionReason && (
                  <p className="mt-2 text-sm text-red-700">
                    <span className="font-semibold">{t('tenants.verification.rejectionReason')}: </span>
                    {state.rejectionReason}
                  </p>
                )}
              </div>
            )}

            {!needsVerification && (
              <div className="mt-5 flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-emerald-800">
                  {state.required
                    ? t('tenants.verification.status.approved')
                    : t('tenants.verification.notRequiredHint')}
                </p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  {t('tenants.verification.refreshStatus')}
                </button>
              </div>
            )}

            {state.error && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {state.error}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <p className="text-xs text-slate-500">{t('tenants.verification.supportHint')}</p>
              <button
                type="button"
                onClick={load}
                disabled={state.loading}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <i className={`bi bi-arrow-repeat ${state.loading ? 'animate-spin' : ''}`} />
                {state.loading ? t('tenants.verification.refreshing') : t('tenants.verification.refreshStatus')}
              </button>
            </div>
          </div>

          {state.loading && !state.companyName ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              {t('tenants.verification.loading')}
            </div>
          ) : needsVerification ? (
            <TenantKYBTab
              companyId={companyId}
              api={api}
              onStatusChange={(status) => setState((prev) => ({ ...prev, status }))}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
