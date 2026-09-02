import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createApi } from '../../lib/api';
import { useToast } from '../../components/ToastProvider';

export default function SupportContractsView({ apiUrl, token }) {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const toast = useToast();

  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        per_page: 20, // Controller uses per_page
        q: debouncedSearch
      });
      const res = await api.get(`/api/global-contracts/support-view?${params.toString()}`);
      if (res.data) {
        setContracts(res.data);
        setTotalPages(res.meta?.total_pages || 1);
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar contratos');
    } finally {
      setLoading(false);
    }
  }, [api, page, debouncedSearch, toast]);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const getStatusBadge = (status, envelopeStatus) => {
    // Priority to envelope status if available
    const effectiveStatus = envelopeStatus || status;

    switch(effectiveStatus) {
      case 'completed':
      case 'active': 
      case 'signed':
        return 'bg-emerald-50 text-emerald-700';
      case 'sent':
      case 'delivered':
      case 'pending_signature': 
        return 'bg-amber-50 text-amber-700';
      case 'expired': 
      case 'voided':
        return 'bg-slate-100 text-slate-500 line-through';
      case 'draft':
        return 'bg-slate-50 text-slate-600';
      default: 
        return 'bg-slate-50 text-slate-600';
    }
  };

  const getStatusLabel = (status, envelopeStatus) => {
    const effectiveStatus = envelopeStatus || status;
    switch(effectiveStatus) {
      case 'completed':
      case 'signed': return 'Firmado';
      case 'active': return 'Vigente';
      case 'sent': return 'Enviado';
      case 'delivered': return 'Entregado';
      case 'pending_signature': return 'Firma Pendiente';
      case 'expired': return 'Vencido';
      case 'voided': return 'Anulado';
      case 'draft': return 'Borrador';
      default: return effectiveStatus;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Visor de Contratos</h1>
        <p className="text-sm text-slate-500">Solo lectura. Detección de vencimientos y firmas pendientes.</p>
      </div>

      {/* Search */}
      <div className="flex gap-4">
        <input 
          type="text" 
          placeholder="Buscar por referencia o empresa..." 
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
                <th className="p-4 font-semibold">Ref Contrato</th>
                <th className="p-4 font-semibold">Empresa</th>
                <th className="p-4 font-semibold">Tipo</th>
                <th className="p-4 font-semibold">Versión</th>
                <th className="p-4 font-semibold">Fecha Firma</th>
                <th className="p-4 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-500">Cargando...</td>
                </tr>
              ) : contracts.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-500">No se encontraron contratos.</td>
                </tr>
              ) : (
                contracts.map(contract => (
                  <tr key={contract.id} className="hover:bg-slate-50">
                    <td className="p-4 font-mono text-xs text-slate-600">
                      {contract.reference_number || contract.id.substring(0, 8)}
                    </td>
                    <td className="p-4 font-medium text-slate-900">{contract.company_name || 'Sin Empresa'}</td>
                    <td className="p-4 text-sm text-slate-600">{contract.type || contract.contract_type || 'N/A'}</td>
                    <td className="p-4 text-sm text-slate-600">v{contract.version || '1.0'}</td>
                    <td className="p-4 text-sm text-slate-600">
                        {contract.signed_at ? new Date(contract.signed_at).toLocaleDateString() : '-'}
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(contract.status, contract.envelope_status)}`}>
                        {getStatusLabel(contract.status, contract.envelope_status)}
                      </span>
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

      <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 flex items-start gap-3">
        <i className="bi bi-exclamation-triangle text-amber-600 mt-0.5"></i>
        <div className="text-sm text-amber-800">
          <p className="font-semibold mb-1">Modo Solo Lectura</p>
          <p className="opacity-90">Este módulo no permite editar cláusulas, subir anexos ni aprobar nuevas versiones. Contacte al equipo Legal para cambios.</p>
        </div>
      </div>
    </div>
  );
}
