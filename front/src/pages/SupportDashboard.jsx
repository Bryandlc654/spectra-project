import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createApi } from '../lib/api';
import { normalizePageResponse } from '../lib/pagination';

function StatsCard({ label, value, icon, color, to }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    purple: 'bg-purple-50 text-purple-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <Link to={to} className="block rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
        </div>
        <div className={`rounded-xl p-3 ${colorClasses[color] || 'bg-slate-100 text-slate-600'}`}>
          <i className={`bi ${icon} text-xl`} />
        </div>
      </div>
    </Link>
  );
}

export default function SupportDashboard({ user, apiUrl, token }) {
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);

  const [stats, setStats] = useState({
    tenants: 0,
    users: 0,
    openTickets: 0,
    closedTickets: 0,
  });
  const [recentTickets, setRecentTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;

    let mounted = true;

    (async () => {
      setLoading(true);
      try {
        const [tenantsRes, usersRes, ticketsRes, contractsRes] = await Promise.all([
          api.get('/api/tenants/support-view?limit=1'),
          api.get('/api/users/support-view?limit=1'),
          api.get('/api/support-tickets'),
          api.get('/api/global-contracts/support-view?limit=1'),
        ]);

        if (!mounted) return;

        const tenantsMeta = normalizePageResponse(tenantsRes).meta;
        const usersMeta = normalizePageResponse(usersRes).meta;
        const contractsMeta = normalizePageResponse(contractsRes).meta;
        const tickets = ticketsRes.data?.data || [];

        setStats({
          tenants: tenantsMeta.total || 0,
          users: usersMeta.total || 0,
          contracts: contractsMeta.total || 0,
          openTickets: tickets.filter(t => t.status === 'open').length,
          closedTickets: tickets.filter(t => t.status === 'closed').length,
        });

        setRecentTickets(tickets.slice(0, 5));
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [api, token]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-bold tracking-widest text-slate-500 uppercase">
              Soporte / Customer Success
            </div>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">
              Hola, {user?.full_name || 'Agente'} 👋
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Panel de gestión de soporte y éxito del cliente.
            </p>
          </div>
          <div className="flex gap-2">
             <Link
              to="/dashboard/support/empresas"
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 shadow-sm shadow-brand-500/20 transition-all"
            >
              <i className="bi bi-search" />
              Buscar Empresa
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          label="Empresas (Soporte)"
          value={stats.tenants}
          icon="bi-building"
          color="blue"
          to="/dashboard/support/empresas"
        />
        <StatsCard
          label="Usuarios (Soporte)"
          value={stats.users}
          icon="bi-people"
          color="indigo"
          to="/dashboard/support/users"
        />
        <StatsCard
          label="Tickets Abiertos"
          value={stats.openTickets}
          icon="bi-envelope-exclamation"
          color="amber"
          to="/dashboard/support/tickets"
        />
        <StatsCard
          label="Tickets Cerrados"
          value={stats.closedTickets}
          icon="bi-check-circle"
          color="emerald"
          to="/dashboard/support/tickets"
        />
      </div>

      {/* Recent Tickets */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="font-bold text-slate-900">Tickets Recientes</h2>
          <Link to="/dashboard/support/tickets" className="text-sm font-medium text-brand hover:text-brand-700">
            Ver todos
          </Link>
        </div>
        <div className="divide-y divide-slate-100">
          {recentTickets.length === 0 ? (
             <div className="p-6 text-center text-sm text-slate-500">No hay tickets recientes</div>
          ) : (
            recentTickets.map(ticket => (
              <div key={ticket.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/50">
                <div>
                  <p className="font-semibold text-slate-900">{ticket.subject}</p>
                  <p className="text-xs text-slate-500">{new Date(ticket.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  ticket.status === 'open' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  {ticket.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
