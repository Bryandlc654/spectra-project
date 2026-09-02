import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import { useToast } from '../../components/ToastProvider';
import { Link } from 'react-router-dom';

export default function SupportCompaniesView({ apiUrl, token }) {
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const toast = useToast();

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: 20,
        search
      });
      const res = await apiFetch(apiUrl, `/api/tenants/support-view?${params.toString()}`, { token });
      if (res.data) {
        setCompanies(res.data);
        setTotalPages(res.meta?.last_page || 1);
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar empresas');
    } finally {
      setLoading(false);
    }
  }, [apiUrl, token, page, search, toast]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleSearch = (e) => {
    if (e.key === 'Enter') {
        setPage(1);
        fetchCompanies();
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
      suspended: 'bg-red-50 text-red-700 ring-red-600/20',
      pending: 'bg-amber-50 text-amber-700 ring-amber-600/20'
    };
    return (
      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${styles[status] || 'bg-slate-50 text-slate-600 ring-slate-500/10'}`}>
        {status === 'active' ? 'Activo' : status === 'suspended' ? 'Suspendido' : status}
      </span>
    );
  };

  const getPaymentBadge = (status) => {
      if (status === 'overdue') {
          return <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">Pagos Pendientes</span>;
      }
      return <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">Al día</span>;
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase">Soporte</div>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">Vista de empresas</h1>
            <p className="mt-1 text-sm text-slate-600">
              Listado de solo lectura con métricas clave para soporte.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
             <div className="relative">
                <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                <input 
                    type="text"
                    placeholder="Buscar empresa..." 
                    className="h-10 w-64 rounded-xl border-slate-200 pl-10 text-sm focus:border-brand focus:ring-brand"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={handleSearch}
                />
             </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Empresa</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">País / Plan</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Estado</th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Usuarios</th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Proyectos</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Pagos</th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Incidencias</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan="7" className="p-10 text-center text-slate-500">
                    <div className="flex justify-center mb-2"><div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-brand"></div></div>
                    Cargando empresas...
                  </td>
                </tr>
              ) : companies.length === 0 ? (
                <tr>
                   <td colSpan="7" className="p-10 text-center text-slate-500">No se encontraron empresas.</td>
                </tr>
              ) : (
                companies.map((company) => (
                  <tr key={company.id} className="hover:bg-slate-50 transition">
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 flex-none rounded-lg bg-slate-100 object-cover overflow-hidden border border-slate-200">
                            {company.logo_url ? (
                                <img src={company.logo_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                                <div className="grid h-full w-full place-items-center text-slate-400">
                                    <i className="bi bi-building"></i>
                                </div>
                            )}
                        </div>
                        <div>
                          <div className="font-medium text-slate-900">{company.legal_name}</div>
                          <div className="text-xs text-slate-500">{company.trade_name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="text-sm text-slate-900">{company.country_name || 'Global'}</div>
                      <div className="text-xs text-slate-500 capitalize">{company.plan || 'Free'}</div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      {getStatusBadge(company.status)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-center">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800">
                            {company.users_count}
                        </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-center">
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                            {company.active_projects_count}
                        </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                        {getPaymentBadge(company.payment_status)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-center">
                         <div className="flex items-center justify-center gap-2">
                             <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${company.open_tickets_count > 0 ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                                {company.open_tickets_count} Abiertos
                             </span>
                             <Link 
                                to={`/dashboard/support/tickets?company_id=${company.id}`}
                                className="text-brand hover:text-brand-dark transition-colors" 
                                title="Ver historial de incidencias"
                             >
                                <i className="bi bi-clock-history text-lg"></i>
                             </Link>
                         </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
            <div className="flex flex-1 justify-between sm:hidden">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="relative inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Anterior</button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="relative ml-3 inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Siguiente</button>
            </div>
            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                    <p className="text-sm text-slate-700">
                        Página <span className="font-medium">{page}</span> de <span className="font-medium">{totalPages}</span>
                    </p>
                </div>
                <div>
                    <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                         <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="relative inline-flex items-center rounded-l-md px-2 py-2 text-slate-400 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50">
                            <span className="sr-only">Anterior</span>
                            <i className="bi bi-chevron-left h-5 w-5" aria-hidden="true"></i>
                        </button>
                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="relative inline-flex items-center rounded-r-md px-2 py-2 text-slate-400 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50">
                            <span className="sr-only">Siguiente</span>
                            <i className="bi bi-chevron-right h-5 w-5" aria-hidden="true"></i>
                        </button>
                    </nav>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
