import React, { useEffect, useState } from 'react';
import { useToast } from '../../components/ToastProvider';
import Modal from '../../components/Modal';
import { apiFetch } from '../../lib/api';

export default function ReconciliationPage({ apiUrl, token }) {
  const toast = useToast();
  
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [perPage] = useState(20);
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // ''=all, '1'=reconciled, '0'=pending
  const [companyId, setCompanyId] = useState('');

  // Create Adjustment Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newAdjustment, setNewAdjustment] = useState({
    company_id: '',
    currency_id: '',
    amount: '',
    description: ''
  });

  // Aux data for modal (companies, currencies) - lazy load or load on mount?
  // Ideally we need a way to select company and currency.
  // For now we can fetch companies/currencies if needed or just input IDs if that's what we have.
  // But usually we need a dropdown. Let's assume we can fetch companies/currencies.
  // Or maybe just a simple input for now if we don't have those endpoints handy in this context.
  // Actually, to make it user friendly, we should probably fetch companies.
  // Let's stick to simple inputs or maybe reuse some selector if available. 
  // Given I don't want to overcomplicate, I'll fetch companies and currencies on mount if modal is opened.
  const [companies, setCompanies] = useState([]);
  const [currencies, setCurrencies] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr('');
      try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('per_page', String(perPage));
        if (search) params.set('q', search.trim());
        if (statusFilter !== '') params.set('reconciled', statusFilter);
        if (companyId) params.set('company_id', companyId);

        const res = await apiFetch(apiUrl, `/api/finance/reconciliation?${params.toString()}`, { token });
        
        let items = [];
        let pages = 1;

        if (res.data) {
          items = res.data;
          pages = res.meta?.total_pages || 1;
        } else if (Array.isArray(res)) {
            items = res;
        }

        if (!cancelled) {
          setTransactions(items);
          setTotalPages(pages);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e?.message || 'No se pudieron cargar las transacciones');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [apiUrl, token, page, search, statusFilter, companyId, perPage, refreshKey]);

  // Load aux data for create modal
  useEffect(() => {
      if (createModalOpen && companies.length === 0) {
          // Fetch companies
          apiFetch(apiUrl, '/api/tenants?per_page=100', { token }) // Assuming this endpoint exists
            .then(res => setCompanies(res.data || []))
            .catch(() => {});
          
          // Fetch currencies
          apiFetch(apiUrl, '/api/currencies', { token })
            .then(res => setCurrencies(res?.data || (Array.isArray(res) ? res : [])))
            .catch(() => {});
      }
  }, [createModalOpen, apiUrl, token, companies.length]);


  const handleReload = () => {
    setPage(1);
    setRefreshKey(k => k + 1);
  };

  const handleToggleReconciliation = async (tx) => {
      try {
          const res = await apiFetch(apiUrl, `/api/finance/reconciliation/${tx.id}/toggle`, { 
              method: 'POST',
              token 
            });
          
          // Update local state
          setTransactions(prev => prev.map(t => {
              if (t.id === tx.id) {
                  return { ...t, is_reconciled: res.is_reconciled, reconciled_at: res.is_reconciled ? new Date().toISOString() : null };
              }
              return t;
          }));
          
          toast.success(`Transacción ${res.is_reconciled ? 'conciliada' : 'desconciliada'}`);
      } catch (e) {
          toast.error(e.message || 'Error al actualizar estado');
      }
  };

  const handleCreateAdjustment = async (e) => {
      e.preventDefault();
      setCreating(true);
      try {
          await apiFetch(apiUrl, '/api/finance/reconciliation/adjustment', {
              method: 'POST',
              body: newAdjustment,
              token
          });
          toast.success('Ajuste creado correctamente');
          setCreateModalOpen(false);
          setNewAdjustment({ company_id: '', currency_id: '', amount: '', description: '' });
          handleReload();
      } catch (e) {
          toast.error(e.message || 'Error al crear ajuste');
      } finally {
          setCreating(false);
      }
  };

  const formatDate = (value) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  };

  const formatAmount = (tx) => {
      const amt = Number(tx.amount);
      const symbol = tx.currency_symbol || '$';
      const color = amt >= 0 ? 'text-emerald-600' : 'text-red-600';
      return (
          <span className={`font-mono font-bold ${color}`}>
              {symbol} {Math.abs(amt).toLocaleString(undefined, {minimumFractionDigits: 2})}
              {amt < 0 ? ' (DR)' : ' (CR)'}
          </span>
      );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Conciliación / Reconciliation</h1>
          <p className="text-sm text-slate-500">Gestión de transacciones y conciliación bancaria</p>
        </div>
        <div className="flex flex-wrap gap-2">
           <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center gap-1 rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-600"
          >
            <i className="bi bi-plus-lg" />
            Nuevo Ajuste
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex-1 min-w-[200px]">
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Buscar por descripción, referencia..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand focus:ring-brand"
              />
          </div>
          <div>
              <select
                  value={statusFilter}
                  onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setPage(1);
                  }}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:border-brand focus:ring-brand"
              >
                  <option value="">Todos los estados</option>
                  <option value="1">Conciliado</option>
                  <option value="0">Pendiente</option>
              </select>
          </div>
           <button
            type="button"
            onClick={handleReload}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            <i className="bi bi-arrow-repeat" />
          </button>
      </div>

      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {err}
        </div>
      )}

      {!transactions.length && !loading && !err && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-12 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-white shadow-sm text-slate-300">
            <i className="bi bi-list-check text-3xl" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No hay transacciones</h3>
          <p className="mt-2 text-slate-500">
            No se encontraron transacciones que coincidan con los filtros.
          </p>
        </div>
      )}

      {transactions.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Descripción</th>
                <th className="px-4 py-3 text-left">Empresa</th>
                <th className="px-4 py-3 text-right">Monto</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                      {formatDate(tx.created_at)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                        <div className="font-medium text-slate-900">{tx.description}</div>
                        <div className="text-xs text-slate-500 capitalize">{tx.type} • {tx.reference_type || 'Manual'}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                        {tx.company_name}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {formatAmount(tx)}
                    </td>
                    <td className="px-4 py-3 text-center">
                        {Number(tx.is_reconciled) === 1 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                                <i className="bi bi-check-circle-fill" /> Conciliado
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                                <i className="bi bi-clock" /> Pendiente
                            </span>
                        )}
                    </td>
                    <td className="px-4 py-3 text-right">
                        <button
                            onClick={() => handleToggleReconciliation(tx)}
                            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition ${
                                Number(tx.is_reconciled) === 1 
                                ? 'bg-red-50 text-red-700 hover:bg-red-100'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                        >
                            {Number(tx.is_reconciled) === 1 ? 'Deshacer' : 'Conciliar'}
                        </button>
                    </td>
                  </tr>
              ))}
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
                Anterior
              </button>
              <span>
                Página {page} de {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Siguiente
                <i className="bi bi-chevron-right" />
              </button>
            </div>
           )}
        </div>
      )}

      {/* Create Adjustment Modal */}
      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Crear Ajuste Manual">
          <form onSubmit={handleCreateAdjustment} className="space-y-4">
              <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Empresa</label>
                  <select
                      required
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                      value={newAdjustment.company_id}
                      onChange={e => setNewAdjustment({...newAdjustment, company_id: e.target.value})}
                  >
                      <option value="">Seleccione una empresa...</option>
                      {companies.map(c => (
                          <option key={c.id} value={c.id}>{c.legal_name || c.brand_name}</option>
                      ))}
                  </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                  <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Moneda</label>
                      <select
                          required
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                          value={newAdjustment.currency_id}
                          onChange={e => setNewAdjustment({...newAdjustment, currency_id: e.target.value})}
                      >
                          <option value="">Moneda...</option>
                          {currencies.map(c => (
                              <option key={c.id} value={c.id}>{c.code} ({c.symbol})</option>
                          ))}
                      </select>
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Monto</label>
                      <input
                          type="number"
                          step="0.01"
                          required
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                          value={newAdjustment.amount}
                          onChange={e => setNewAdjustment({...newAdjustment, amount: e.target.value})}
                          placeholder="0.00"
                      />
                      <p className="text-xs text-slate-500 mt-1">Use negativo para débitos.</p>
                  </div>
              </div>
              <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                  <textarea
                      required
                      rows="3"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                      value={newAdjustment.description}
                      onChange={e => setNewAdjustment({...newAdjustment, description: e.target.value})}
                      placeholder="Motivo del ajuste..."
                  />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                  <button
                      type="button"
                      onClick={() => setCreateModalOpen(false)}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                      Cancelar
                  </button>
                  <button
                      type="submit"
                      disabled={creating}
                      className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50"
                  >
                      {creating ? 'Guardando...' : 'Crear Ajuste'}
                  </button>
              </div>
          </form>
      </Modal>
    </div>
  );
}
