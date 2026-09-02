import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { hasAccess, PLATFORM_ROLES } from '../lib/platformRoles';

export default function CompanyDashboard({ user, apiUrl, token }) {
  const [stats, setStats] = useState({
    active_users: 0,
    active_projects: 0,
    active_vendors: 0,
    pending_requisitions: 0,
    recent_activity: []
  });
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.company_id) {
      setLoading(false);
      return;
    }

    async function loadData() {
      try {
        // Load stats
        const resStats = await apiFetch(apiUrl, `/api/tenants/${user.company_id}/stats`, { token });
        if (resStats && resStats.data) {
          setStats(resStats.data);
        }

        // Load company info
        const resCompany = await apiFetch(apiUrl, `/api/tenants/${user.company_id}`, { token });
        if (resCompany) {
            setCompany(resCompany.data || resCompany);
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [user, apiUrl, token]);

  const role = user?.platform_role;
  const companyId = user?.company_id;
  const companyInfo = company?.company || company || {};

  const statCards = [
    { id: 'users', module: 'company_internal_users', label: 'Miembros', value: stats.active_users, icon: 'bi-people-fill', color: 'text-blue-600', bg: 'bg-blue-50', desc: 'Gestiona tu equipo' },
    { id: 'freelancers', module: 'company_talent', label: 'Freelancers', value: stats.active_freelancers || 0, icon: 'bi-person-workspace', color: 'text-purple-600', bg: 'bg-purple-50', desc: 'Talento activo' },
    { id: 'contracts', module: 'company_contracts', label: 'Contratos', value: stats.active_contracts || 0, icon: 'bi-file-earmark-text', color: 'text-pink-600', bg: 'bg-pink-50', desc: 'Vigentes' },
    { id: 'projects', module: 'company_projects', label: 'Proyectos', value: stats.active_projects, icon: 'bi-briefcase-fill', color: 'text-teal-600', bg: 'bg-teal-50', desc: 'En curso' },
    { id: 'vendors', module: 'company_procurement', label: 'Proveedores', value: stats.active_vendors, icon: 'bi-shop', color: 'text-cyan-600', bg: 'bg-cyan-50', desc: 'Activos actualmente' },
    { id: 'requisitions', module: 'company_procurement', label: 'Solicitudes', value: stats.pending_requisitions, icon: 'bi-basket', color: 'text-red-600', bg: 'bg-red-50', desc: 'Pendientes de aprobación' },
    { id: 'invoices', module: 'company_billing', label: 'Facturas', value: stats.unpaid_invoices || 0, icon: 'bi-receipt', color: 'text-emerald-600', bg: 'bg-emerald-50', desc: 'Por pagar/cobrar' },
    { id: 'onboarding', module: 'company_onboarding', label: 'Onboarding', value: stats.pending_onboarding || 0, icon: 'bi-clipboard-check', color: 'text-orange-600', bg: 'bg-orange-50', desc: 'Pendientes' }
  ];

  const availableStats = statCards.filter(stat => hasAccess(role, stat.module));

  return (
    <div className="space-y-8">
      {/* Welcome Section with Company Info */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-white shadow-xl shadow-slate-200">
        <div className="grid gap-6 md:grid-cols-2 items-center">
            <div className="max-w-2xl">
            <h1 className="text-3xl font-bold">
                Hola, {user?.full_name || 'Administrador'}
            </h1>
            <p className="mt-2 text-slate-300">
                Bienvenido a tu panel de gestión empresarial.
            </p>
            </div>
            {companyInfo && companyInfo.name && (
                <div className="md:text-right border-t md:border-t-0 md:border-l border-slate-700 pt-4 md:pt-0 md:pl-6">
                    <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">Empresa Asignada</p>
                    <h2 className="text-2xl font-bold text-white">{companyInfo.name}</h2>
                    <p className="text-sm text-slate-300 mt-1">
                        {companyInfo.tax_id && <span className="mr-3">ID: {companyInfo.tax_id}</span>}
                        {companyInfo.country && <span>{companyInfo.country}</span>}
                    </p>
                </div>
            )}
        </div>
      </div>

      {/* Modules Grid - Removed per request */}
      {/* <div>...</div> */}

      {/* Stats Grid */}
      <div>
        <h3 className="text-lg font-bold text-slate-900 mb-4">Resumen Operativo</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {availableStats.map((stat) => (
            <div key={stat.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                  <h3 className="mt-1 text-2xl font-bold text-slate-900">
                    {loading ? '...' : stat.value}
                  </h3>
                </div>
                <div className={`rounded-xl ${stat.bg} p-2 ${stat.color}`}>
                  <i className={`bi ${stat.icon} text-xl`}></i>
                </div>
              </div>
              <div className="mt-4 flex items-center text-xs font-medium text-slate-500">
                <span>{stat.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-4">Actividad Reciente</h3>
        {loading ? (
          <div className="text-center py-8 text-slate-500">Cargando actividad...</div>
        ) : stats.recent_activity && stats.recent_activity.length > 0 ? (
          <div className="flow-root">
            <ul className="-mb-8">
              {stats.recent_activity.map((activity, activityIdx) => (
                <li key={activity.id}>
                  <div className="relative pb-8">
                    {activityIdx !== stats.recent_activity.length - 1 ? (
                      <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-slate-200" aria-hidden="true" />
                    ) : null}
                    <div className="relative flex space-x-3">
                      <div>
                        <span className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center ring-8 ring-white">
                          <i className="bi bi-clock text-slate-500"></i>
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                        <div>
                          <p className="text-sm text-slate-500">
                            {activity.description} <span className="font-medium text-slate-900">({activity.action})</span>
                          </p>
                        </div>
                        <div className="whitespace-nowrap text-right text-sm text-slate-500">
                          <time dateTime={activity.created_at}>{new Date(activity.created_at).toLocaleDateString()}</time>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            No hay actividad reciente para mostrar.
          </div>
        )}
      </div>
    </div>
  );
}
