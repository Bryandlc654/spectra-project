import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createApi } from '../../lib/api';
import { useToast } from '../../components/ToastProvider';

export default function SupportPaymentsView({ apiUrl, token }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const toast = useToast();

  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);

  // Modal state for linking ticket
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [ticketIdInput, setTicketIdInput] = useState('');

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: 20,
        search
      });
      const res = await api.get(`/api/finance/support-view?${params.toString()}`);
      if (res.data) {
        setPayments(res.data);
        setTotalPages(res.meta?.last_page || 1);
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar incidencias de pagos');
    } finally {
      setLoading(false);
    }
  }, [api, page, search, toast]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleRequestFinanceReview = async (id) => {
    if (!window.confirm('¿Solicitar revisión de Finanzas para esta factura?')) return;
    
    try {
      await api.post(`/api/finance/invoices/${id}/request-review`);
      toast.success('Solicitud enviada a Finanzas');
      fetchPayments(); // Refresh
    } catch (err) {
      console.error(err);
      toast.error('Error al solicitar revisión');
    }
  };

  const openLinkTicketModal = (id) => {
    setSelectedInvoiceId(id);
    setTicketIdInput('');
    setShowLinkModal(true);
  };

  const handleLinkTicket = async () => {
    if (!ticketIdInput.trim()) {
      toast.error('Ingrese un ID de ticket');
      return;
    }

    try {
      await api.post(`/api/finance/invoices/${selectedInvoiceId}/link-ticket`, {
        ticket_id: ticketIdInput
      });
      toast.success('Ticket asociado correctamente');
      setShowLinkModal(false);
      fetchPayments();
    } catch (err) {
      console.error(err);
      toast.error('Error al asociar ticket');
    }
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'paid': return 'bg-emerald-50 text-emerald-700';
      case 'overdue': return 'bg-red-100 text-red-700';
      case 'voided': return 'bg-slate-100 text-slate-700';
      case 'draft': return 'bg-amber-50 text-amber-700';
      case 'sent': return 'bg-blue-50 text-blue-700';
      default: return 'bg-slate-50 text-slate-600';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Incidencias de Pagos</h1>
        <p className="text-sm text-slate-500">Vista limitada de facturas con incidencias (Vencidas, Anuladas o En Revisión). Montos ocultos por seguridad.</p>
      </div>

      {/* Search & Filters */}
      <div className="flex gap-4">
        <input 
          type="text" 
          placeholder="Buscar por factura o empresa..." 
          className="flex-1 max-w-md px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand focus:border-transparent"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-xs text-slate-500 uppercase">
                <th className="p-4 font-semibold">Factura</th>
                <th className="p-4 font-semibold">Empresa</th>
                <th className="p-4 font-semibold">Fechas</th>
                <th className="p-4 font-semibold">Estado</th>
                <th className="p-4 font-semibold">Ticket Asociado</th>
                <th className="p-4 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-500">Cargando...</td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-500">No se encontraron incidencias de pago.</td>
                </tr>
              ) : (
                payments.map(payment => (
                  <tr key={payment.id} className="hover:bg-slate-50">
                    <td className="p-4 font-mono text-xs text-slate-600">
                      {payment.invoice_number}
                      {payment.support_review_requested === 1 && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                          En Revisión
                        </span>
                      )}
                    </td>
                    <td className="p-4 font-medium text-slate-900">{payment.company_name}</td>
                    <td className="p-4 text-slate-600 text-xs">
                      <div>Emisión: {payment.issue_date}</div>
                      <div className="text-red-600">Vence: {payment.due_date}</div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(payment.status)}`}>
                        {payment.status === 'overdue' ? 'Vencida' : 
                         payment.status === 'voided' ? 'Anulada' : 
                         payment.status === 'paid' ? 'Pagada' : payment.status}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-slate-600">
                      {payment.support_ticket_id ? (
                        <span className="text-brand font-medium">#{payment.support_ticket_id}</span>
                      ) : (
                        <span className="text-slate-400 italic">--</span>
                      )}
                    </td>
                    <td className="p-4 text-right space-x-2">
                      <button 
                        onClick={() => openLinkTicketModal(payment.id)}
                        className="text-xs font-medium text-slate-600 hover:text-brand px-3 py-1.5 rounded-lg border border-slate-200 hover:border-brand transition bg-white"
                        title="Vincular Ticket"
                      >
                        <i className="bi bi-ticket-perforated"></i>
                      </button>
                      <button 
                        onClick={() => handleRequestFinanceReview(payment.id)}
                        disabled={payment.support_review_requested === 1}
                        className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                          payment.support_review_requested === 1 
                            ? 'text-slate-400 bg-slate-50 border-slate-200 cursor-not-allowed'
                            : 'text-slate-600 hover:text-brand border-slate-200 hover:border-brand bg-white'
                        }`}
                        title="Solicitar Revisión a Finanzas"
                      >
                        <i className="bi bi-flag"></i>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="p-4 border-t border-slate-100 flex justify-between items-center">
          <button 
            disabled={page <= 1} 
            onClick={() => setPage(p => p - 1)}
            className="px-3 py-1 text-sm border rounded disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-sm text-slate-600">Página {page} de {totalPages}</span>
          <button 
            disabled={page >= totalPages} 
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 text-sm border rounded disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      </div>
      
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex items-start gap-3">
        <i className="bi bi-info-circle text-blue-600 mt-0.5"></i>
        <div className="text-sm text-blue-800">
          <p className="font-semibold mb-1">Restricciones de Rol</p>
          <ul className="list-disc pl-4 space-y-1 opacity-90">
            <li>No puede modificar montos ni ejecutar pagos.</li>
            <li>No puede ver ni editar cuentas bancarias completas.</li>
            <li>Solo puede solicitar revisión o asociar tickets existentes.</li>
          </ul>
        </div>
      </div>

      {/* Modal Vincular Ticket */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Vincular Ticket</h3>
            <p className="text-sm text-slate-600 mb-4">
              Ingrese el ID del ticket para asociarlo a esta factura.
            </p>
            <input 
              type="text" 
              className="w-full px-3 py-2 border rounded mb-4"
              placeholder="Ej: TKT-12345"
              value={ticketIdInput}
              onChange={(e) => setTicketIdInput(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => setShowLinkModal(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded"
              >
                Cancelar
              </button>
              <button 
                onClick={handleLinkTicket}
                className="px-4 py-2 text-sm text-white bg-brand hover:bg-brand-dark rounded"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
