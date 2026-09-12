import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createApi } from '../../lib/api';
import { normalizePageResponse } from '../../lib/pagination';
import { useToast } from '../../components/ToastProvider';

export default function FreelancersReviewsPage({ apiUrl, token }) {
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  const toast = useToast();

  const [page, setPage] = useState(1);
  const perPage = 20;

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, perPage, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [ratingFilter, setRatingFilter] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [range, setRange] = useState('all');
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  async function load(nextPage = page) {
    setLoading(true);
    setErr('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(nextPage));
      params.set('per_page', String(perPage));
      if (ratingFilter) params.set('rating', String(ratingFilter));
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      if (range && range !== 'all') params.set('range', range);

      const data = await api.get(`/api/freelancers/reviews?${params.toString()}`);
      const out = normalizePageResponse(data);
      
      setRows(out.items);
      setMeta(out.meta);
    } catch (e) {
      setErr(e.message || 'Error cargando revisiones');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(page);
    // eslint-disable-next-line
  }, [page, debouncedSearch, ratingFilter, statusFilter, range]);

  async function handleUpdateStatus(id, nextStatus) {
    setActionLoadingId(id);
    try {
      await api.post('/api/freelancers/reviews', { id, status: nextStatus });
      toast.success('Estado de reseña actualizado');
      await load(page);
    } catch (e) {
      toast.error(e.message || 'Error actualizando estado de la reseña');
    } finally {
      setActionLoadingId(null);
    }
  }

  function renderStars(rating) {
    return (
      <div className="flex text-amber-400 text-sm">
        {[...Array(5)].map((_, i) => (
          <i key={i} className={`bi ${i < rating ? 'bi-star-fill' : 'bi-star'} mr-0.5`}></i>
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Revisiones y Calificaciones</h1>
          <p className="text-slate-500 text-sm mt-1">Gestión de feedback y reputación de freelancers</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative">
            <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input
              type="text"
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
              placeholder="Buscar freelancer..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          
          <select
            className="w-full border-slate-300 rounded-lg text-sm px-3 py-2 focus:ring-brand focus:border-brand"
            value={ratingFilter}
            onChange={e => { setRatingFilter(e.target.value); setPage(1); }}
          >
            <option value="">Todas las calificaciones</option>
            <option value="5">5 Estrellas</option>
            <option value="4">4 Estrellas</option>
            <option value="3">3 Estrellas</option>
            <option value="2">2 Estrellas</option>
            <option value="1">1 Estrella</option>
          </select>

          <select
            className="w-full border-slate-300 rounded-lg text-sm px-3 py-2 focus:ring-brand focus:border-brand"
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="all">Todos los estados</option>
            <option value="pending">Pendientes</option>
            <option value="approved">Aprobadas</option>
            <option value="rejected">Rechazadas</option>
          </select>

          <select
            className="w-full border-slate-300 rounded-lg text-sm px-3 py-2 focus:ring-brand focus:border-brand"
            value={range}
            onChange={e => { setRange(e.target.value); setPage(1); }}
          >
            <option value="all">Cualquier fecha</option>
            <option value="7d">Últimos 7 días</option>
            <option value="30d">Últimos 30 días</option>
          </select>
        </div>
      </div>

      {err && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 animate-fadeIn">
          <i className="bi bi-exclamation-circle-fill mt-0.5"></i>
          <div>
            <h4 className="font-semibold text-sm">Error al cargar datos</h4>
            <p className="text-sm opacity-90">{err}</p>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-900 uppercase text-xs tracking-wider">
              <tr>
                <th className="px-6 py-4">Freelancer</th>
                <th className="px-6 py-4">Evaluador</th>
                <th className="px-6 py-4">Calificación</th>
                <th className="px-6 py-4 w-1/3">Comentario</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-32"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-24"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-20"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-full"></div></td>
                    <td className="px-6 py-4"><div className="h-6 bg-slate-100 rounded w-16"></div></td>
                    <td className="px-6 py-4"><div className="h-8 bg-slate-100 rounded w-20 ml-auto"></div></td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                        <i className="bi bi-chat-square-text text-3xl text-slate-300"></i>
                      </div>
                      <h3 className="text-lg font-medium text-slate-900">No se encontraron revisiones</h3>
                      <p className="text-slate-500 max-w-sm mt-1">
                        Intenta ajustar los filtros de búsqueda para encontrar lo que buscas.
                      </p>
                      <button 
                        onClick={() => {
                          setSearch('');
                          setRatingFilter('');
                          setStatusFilter('all');
                          setRange('all');
                          setPage(1);
                        }}
                        className="mt-4 text-brand font-medium hover:underline"
                      >
                        Limpiar filtros
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4">
                      <Link
                        to={`/dashboard/freelancers/${r.freelancer_id}`}
                        className="font-medium text-slate-900 hover:text-brand transition-colors flex items-center gap-2"
                      >
                        <div className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold text-xs">
                          {r.freelancer_name?.charAt(0).toUpperCase()}
                        </div>
                        {r.freelancer_name}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-slate-900">{r.reviewer_name}</span>
                        <span className="text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString()}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {renderStars(r.rating)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="relative group/tooltip">
                        <p className="line-clamp-2 text-slate-600 text-sm">
                          "{r.comment}"
                        </p>
                        {r.comment?.length > 100 && (
                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover/tooltip:block w-64 bg-slate-800 text-white text-xs p-3 rounded shadow-lg z-10">
                            {r.comment}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        r.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        r.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' :
                        'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {r.status === 'approved' ? 'Aprobada' : r.status === 'rejected' ? 'Rechazada' : 'Pendiente'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {r.status === 'pending' ? (
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(r.id, 'rejected')}
                            disabled={actionLoadingId === r.id}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Rechazar"
                          >
                            <i className="bi bi-x-lg"></i>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(r.id, 'approved')}
                            disabled={actionLoadingId === r.id}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                            title="Aprobar"
                          >
                            <i className="bi bi-check-lg"></i>
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">
                          Procesado
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-slate-100">
          {loading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="p-4 animate-pulse space-y-3">
                <div className="flex justify-between">
                  <div className="h-4 bg-slate-100 rounded w-1/3"></div>
                  <div className="h-4 bg-slate-100 rounded w-1/4"></div>
                </div>
                <div className="h-16 bg-slate-100 rounded w-full"></div>
                <div className="h-8 bg-slate-100 rounded w-full"></div>
              </div>
            ))
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <i className="bi bi-chat-square-text text-3xl text-slate-300 mb-3 block"></i>
              No se encontraron revisiones
            </div>
          ) : (
            rows.map(r => (
              <div key={r.id} className="p-4 space-y-3 bg-white">
                <div className="flex justify-between items-start">
                  <Link 
                    to={`/dashboard/freelancers/${r.freelancer_id}`}
                    className="flex items-center gap-2 font-medium text-slate-900"
                  >
                    <div className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold text-xs">
                      {r.freelancer_name?.charAt(0).toUpperCase()}
                    </div>
                    {r.freelancer_name}
                  </Link>
                  <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                    r.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    r.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' :
                    'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {r.status}
                  </span>
                </div>

                <div className="text-sm border-l-2 border-slate-100 pl-3 py-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-medium text-slate-900">{r.reviewer_name}</span>
                    {renderStars(r.rating)}
                  </div>
                  <p className="text-slate-600 italic">"{r.comment}"</p>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-slate-400">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                  
                  {r.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdateStatus(r.id, 'rejected')}
                        disabled={actionLoadingId === r.id}
                        className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
                      >
                        Rechazar
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(r.id, 'approved')}
                        disabled={actionLoadingId === r.id}
                        className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                      >
                        Aprobar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              Anterior
            </button>
            <span className="text-sm font-medium text-slate-600">
              Página {page} de {meta.totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
              disabled={page >= meta.totalPages || loading}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
