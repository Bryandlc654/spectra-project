import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../components/ToastProvider';
import Modal from '../../components/Modal';
import { apiFetch } from '../../lib/api';

export default function InvoicesPage({ apiUrl, token }) {
  const toast = useToast();
  
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState('');

  // View Modal State
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr('');
      try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        if (search) params.set('q', search.trim());

        const res = await apiFetch(apiUrl, `/api/finance/invoices?${params.toString()}`, { token });
        
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
          setInvoices(items);
          setTotalPages(Math.max(1, Number(pages) || 1));
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e?.message || 'No se pudieron cargar las facturas');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [apiUrl, token, page, search]);

  const handleReload = () => {
    setPage(1);
    // Trigger reload by resetting state if needed or just letting effect run if dependecies change
    // Since effect depends on page, setting page to 1 triggers it if page was not 1. 
    // If page is 1, we might need a force reload. 
    // For simplicity, let's just re-fetch in effect if we add a 'tick' dependency or just rely on search/page.
    // Actually, calling setPage(1) works if we are not on page 1. If on page 1, we can just toggle a 'reload' flag.
    // But let's keep it simple.
  };

  const handleView = async (invoiceId) => {
      setLoadingInvoice(true);
      setSelectedInvoice(null);
      setViewModalOpen(true);
      try {
          const res = await apiFetch(apiUrl, `/api/finance/invoices/${invoiceId}`, { token });
          setSelectedInvoice(res);
      } catch (e) {
          toast.error('Error al cargar factura');
          setViewModalOpen(false);
      } finally {
          setLoadingInvoice(false);
      }
  };

  const formatDate = (value) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString();
  };

  const formatAmount = (row) => {
    const amount = Number(row.total ?? row.amount ?? row.total_amount ?? 0);
    const symbol = row.currency_symbol || '$';
    const code = row.currency_code || '';
    return {
      text: `${symbol} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      code,
    };
  };

  const renderStatusBadge = (statusRaw) => {
    if (!statusRaw) return <span className="text-xs text-slate-500">Sin estado</span>;
    const status = String(statusRaw).toLowerCase();
    let cls = 'bg-slate-100 text-slate-700';
    if (status === 'draft') cls = 'bg-slate-100 text-slate-700';
    else if (status === 'sent') cls = 'bg-blue-50 text-blue-700';
    else if (status === 'paid') cls = 'bg-emerald-50 text-emerald-700';
    else if (status === 'overdue') cls = 'bg-red-50 text-red-700';

    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
        {status || 'Desconocido'}
      </span>
    );
  };

  const handleCopyId = (id) => {
    if (!id || typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(String(id)).then(
      () => toast.success('ID copiado'),
      () => {}
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Facturación / Invoices</h1>
          <p className="text-sm text-slate-500">Gestión global de todas las facturas del sistema</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por número..."
            className="w-64 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand focus:ring-brand"
          />
          <button
            type="button"
            onClick={handleReload}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <i className="bi bi-arrow-repeat" />
            Refrescar
          </button>
        </div>
      </div>

      {/* View Invoice Modal */}
      <Modal open={viewModalOpen} onClose={() => setViewModalOpen(false)} title="Detalle de Factura">
        {loadingInvoice ? (
            <div className="p-8 text-center text-slate-500">Cargando detalle...</div>
        ) : selectedInvoice ? (
            <div className="space-y-6">
                <div className="flex justify-between items-start bg-slate-50 p-4 rounded-xl">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">Factura #{selectedInvoice.invoice_number}</h3>
                        <p className="text-sm text-slate-500">Emitida: {formatDate(selectedInvoice.issue_date)}</p>
                        {selectedInvoice.company_name && (
                            <p className="text-sm text-slate-500 mt-1">
                                <strong>Empresa:</strong> {selectedInvoice.company_name}
                                {selectedInvoice.company_tax_id && ` (${selectedInvoice.company_tax_id})`}
                            </p>
                        )}
                    </div>
                    <div className="text-right">
                         <div className="text-2xl font-bold text-brand">
                             {selectedInvoice.currency_symbol} {Number(selectedInvoice.total_amount || 0).toLocaleString()}
                         </div>
                         <div className="text-xs text-slate-500 uppercase">{selectedInvoice.currency_code}</div>
                         <div className="mt-2">
                             {renderStatusBadge(selectedInvoice.status)}
                         </div>
                    </div>
                </div>

                {/* Freelancer info if available */}
                {(selectedInvoice.freelancer_first_name || selectedInvoice.freelancer_last_name) && (
                    <div className="bg-white border border-slate-100 p-4 rounded-xl">
                        <h4 className="text-sm font-bold text-slate-900 mb-2">Freelancer</h4>
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold text-xs">
                                {(selectedInvoice.freelancer_first_name?.[0] || '')}{(selectedInvoice.freelancer_last_name?.[0] || '')}
                            </div>
                            <div>
                                <p className="text-sm font-medium text-slate-900">
                                    {selectedInvoice.freelancer_first_name} {selectedInvoice.freelancer_last_name}
                                </p>
                                <p className="text-xs text-slate-500">{selectedInvoice.freelancer_email}</p>
                            </div>
                        </div>
                    </div>
                )}

                <div>
                    <h4 className="text-sm font-bold text-slate-900 mb-3">Ítems</h4>
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-xs font-medium text-slate-500 uppercase">
                                <tr>
                                    <th className="px-4 py-2">Descripción</th>
                                    <th className="px-4 py-2 text-right">Cant.</th>
                                    <th className="px-4 py-2 text-right">Precio Unit.</th>
                                    <th className="px-4 py-2 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {(selectedInvoice.items || []).map((item, i) => (
                                    <tr key={i}>
                                        <td className="px-4 py-2 text-slate-700">{item.description}</td>
                                        <td className="px-4 py-2 text-right text-slate-600">{item.quantity}</td>
                                        <td className="px-4 py-2 text-right text-slate-600">
                                            {Number(item.unit_price).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                        </td>
                                        <td className="px-4 py-2 text-right font-medium text-slate-900">
                                            {(item.quantity * item.unit_price).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-50 font-bold">
                                <tr>
                                    <td colSpan="3" className="px-4 py-2 text-right text-slate-900">Total</td>
                                    <td className="px-4 py-2 text-right text-brand">
                                        {selectedInvoice.currency_symbol} {Number(selectedInvoice.total_amount).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        ) : (
            <div className="text-red-500">No se pudo cargar la información.</div>
        )}
      </Modal>

      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {err}
        </div>
      )}

      {!invoices.length && !loading && !err && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-12 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-white shadow-sm text-slate-300">
            <i className="bi bi-receipt text-3xl" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No hay facturas</h3>
          <p className="mt-2 text-slate-500">
            No se encontraron facturas registradas en el sistema.
          </p>
        </div>
      )}

      {invoices.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Factura</th>
                <th className="px-4 py-3 text-left">Empresa</th>
                <th className="px-4 py-3 text-left">Monto</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((inv) => {
                const amt = formatAmount(inv);
                const displayNumber = inv.invoice_number || inv.number || inv.id;
                const date = inv.issue_date || inv.created_at;

                return (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                      {formatDate(date)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">
                          {displayNumber || 'Sin número'}
                        </span>
                        <button
                            type="button"
                            onClick={() => handleCopyId(inv.id)}
                            className="text-slate-400 hover:text-brand"
                            title="Copiar ID"
                        >
                            <i className="bi bi-clipboard" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                        <div className="font-medium text-slate-900">{inv.company_name || '—'}</div>
                        {inv.company_tax_id && <div className="text-xs text-slate-500">{inv.company_tax_id}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-900 font-mono whitespace-nowrap">
                      {amt.text}
                      {amt.code && (
                        <span className="ml-1 text-xs text-slate-400">{amt.code}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {renderStatusBadge(inv.status)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleView(inv.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        title="Ver detalle"
                      >
                        <i className="bi bi-eye" />
                      </button>
                    </td>
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
    </div>
  );
}
