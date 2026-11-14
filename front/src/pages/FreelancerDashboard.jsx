import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { createApi } from '../lib/api';
import { isProjectActive } from '../lib/projectStatus';
import { useToast } from '../components/ToastProvider';
import { useI18n } from '../i18n/I18nContext';

function tenureLabel(createdAt, t) {
  if (!createdAt) return null;
  const start = new Date(createdAt);
  if (Number.isNaN(start.getTime())) return null;
  const months = Math.max(
    0,
    Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44))
  );
  if (months < 1) return t('dashboard.freelancer.tenureLessThanMonth');
  if (months === 1) return t('dashboard.freelancer.tenureMonthSingular', { count: months });
  if (months < 12) return t('dashboard.freelancer.tenureMonthPlural', { count: months });
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (!rest) return t(years > 1 ? 'dashboard.freelancer.tenureYearPlural' : 'dashboard.freelancer.tenureYearSingular', { count: years });
  const yearsPart = t(years > 1 ? 'dashboard.freelancer.tenureYearPlural' : 'dashboard.freelancer.tenureYearSingular', { count: years });
  const monthsPart = t(rest > 1 ? 'dashboard.freelancer.tenureMonthPlural' : 'dashboard.freelancer.tenureMonthSingular', { count: rest });
  return t('dashboard.freelancer.tenureYearsMonths', { years: yearsPart, months: monthsPart });
}

export default function FreelancerDashboard({ user, apiUrl, token }) {
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'es-ES';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingContracts, setPendingContracts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectsError, setProjectsError] = useState(false);

  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  const toast = useToast();

  const fetchContracts = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/global-contracts?freelancer_id=${user.id}&status=pending&per_page=100`);
      setPendingContracts(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      // Sin estado de error el usuario veía "no tienes contratos pendientes"
      // cuando en realidad la petición había fallado.
      setError(err?.message || t('dashboard.freelancer.loadContractsError'));
    } finally {
      setLoading(false);
    }
  }, [api, user?.id, t]);

  const fetchProjects = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await api.get(`/api/freelancers/${user.id}/projects`);
      setProjects(Array.isArray(res) ? res : []);
      setProjectsError(false);
    } catch (err) {
      setProjects([]);
      setProjectsError(true);
    }
  }, [api, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      // Sin id no hay nada que pedir: se cierra el loader para no dejar el
      // "Cargando..." colgado indefinidamente.
      setLoading(false);
      return;
    }
    fetchContracts();
    fetchProjects();
  }, [user?.id, fetchContracts, fetchProjects]);

  const handleSign = async (contract) => {
    if (!contract.envelope_db_id) {
      toast.error(t('dashboard.freelancer.noEnvelope'));
      return;
    }

    try {
      const res = await api.post(`/api/envelopes/${contract.envelope_db_id}?action=view`);
      if (res.token) {
        window.location.href = `${window.location.origin}/sign/${res.token}`;
      } else if (res.url) {
        window.location.href = res.url;
      } else if (res.status === 'completed' && res.pdf_url) {
        window.open(res.pdf_url, '_blank', 'noopener');
      } else {
        toast.error(res.message || t('dashboard.freelancer.signatureLinkError'));
      }
    } catch (err) {
      toast.error(err?.message || t('dashboard.freelancer.openContractError'));
    }
  };

  // `in_progress` no pertenece al enum de projects.status ('active','on_hold','closed'),
  // asi que nunca se cumplia. Un proyecto cuenta como en curso solo si esta activo;
  // los que estan en pausa se ven, pero no como trabajo en curso.
  const activeProjects = projects.filter(p => isProjectActive(p.status)).length;
  const tenure = tenureLabel(user?.created_at, t);

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="rounded-3xl bg-gradient-to-br from-indigo-900 to-indigo-800 p-8 text-white shadow-xl shadow-indigo-200">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold">
            {t('dashboard.freelancer.greeting', { name: user?.full_name || t('dashboard.freelancer.defaultUser') })}
          </h1>
          <p className="mt-2 text-indigo-200">
            {t('dashboard.freelancer.welcome')}
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/dashboard/projects" className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">{t('dashboard.freelancer.myProjects')}</p>
              <h3 className="mt-1 text-2xl font-bold text-slate-900 group-hover:text-indigo-600">
                {projectsError ? '—' : projects.length}
              </h3>
            </div>
            <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600">
              <i className="bi bi-kanban text-xl" aria-hidden="true"></i>
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs font-medium text-slate-500">
            <span>{projectsError ? t('dashboard.freelancer.couldNotLoad') : t('dashboard.freelancer.inProgress', { count: activeProjects })}</span>
          </div>
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">{t('dashboard.freelancer.contracts')}</p>
              <h3 className="mt-1 text-2xl font-bold text-slate-900">
                {error ? '—' : pendingContracts.length}
              </h3>
            </div>
            <div className="rounded-xl bg-amber-50 p-2 text-amber-600">
              <i className="bi bi-file-earmark-text text-xl" aria-hidden="true"></i>
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs font-medium text-slate-500">
            <span>{error ? t('dashboard.freelancer.couldNotLoad') : t('dashboard.freelancer.pendingSignature')}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">{t('dashboard.freelancer.tenure')}</p>
              <h3 className="mt-1 text-2xl font-bold text-slate-900">
                {tenure || '—'}
              </h3>
            </div>
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
              <i className="bi bi-person-check text-xl" aria-hidden="true"></i>
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs font-medium text-slate-500">
            <span>{t('dashboard.freelancer.atSpectra')}</span>
          </div>
        </div>
      </div>

      {/* Recent Activity / Pending Contracts */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-4">{t('dashboard.freelancer.pendingContracts')}</h3>

        {loading ? (
          <div className="text-center py-8 text-slate-500">
            <div className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand" aria-hidden="true" />
              {t('dashboard.freelancer.loading')}
            </div>
          </div>
        ) : error ? (
          <div role="alert" className="text-center py-8">
            <i className="bi bi-exclamation-triangle text-amber-500 text-2xl" aria-hidden="true"></i>
            <p className="mt-2 text-sm text-slate-700">{error}</p>
            <button
              type="button"
              onClick={fetchContracts}
              className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              {t('dashboard.freelancer.retry')}
            </button>
          </div>
        ) : pendingContracts.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            {t('dashboard.freelancer.noPendingContracts')}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pendingContracts.map(contract => (
              <div key={contract.id} className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <h4 className="font-medium text-slate-900 truncate">{contract.title}</h4>
                  <p className="text-xs text-slate-500">
                    {contract.company_name} • {new Date(contract.created_at).toLocaleDateString(locale)}
                  </p>
                  {contract.envelope_provider === 'spectra_sign' && (
                    <span className="mt-1 inline-flex items-center rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      {t('dashboard.freelancer.electronicSignature')}
                    </span>
                  )}
                  {contract.envelope_provider === 'local' && (
                    <span className="mt-1 inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {t('dashboard.freelancer.localSignature')}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleSign(contract)}
                  className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200"
                >
                  {t('dashboard.freelancer.signNow')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
