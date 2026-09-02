import React, { useEffect, useState, useMemo } from 'react';
import { createApi } from '../lib/api';

export default function FreelancerContractsPage({ user, apiUrl, token }) {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);

  useEffect(() => {
    if (!user?.id) return;

    const fetchContracts = async () => {
      try {
        setLoading(true);
        const data = await api.get(`/api/freelancers/${user.id}/contracts`);
        setContracts(data || []);
      } catch (err) {
        console.error('Error fetching contracts:', err);
        setError(err.message || 'No se pudieron cargar los contratos.');
      } finally {
        setLoading(false);
      }
    };

    fetchContracts();
  }, [user?.id, api]);

  const handleSign = async (contract) => {
    if (!contract.docusign_envelope_id) return;
    try {
        // Request signing URL
        const res = await api.post(`/api/envelopes/${contract.docusign_envelope_id}?action=view`, { 
            returnUrl: window.location.href 
        });
        
        if (res && res.url) {
            window.location.href = res.url;
        } else {
            alert('No se pudo obtener la URL de firma. Por favor contacta a soporte.');
        }
    } catch (err) {
        console.error('Signing error:', err);
        alert('Error al iniciar el proceso de firma.');
    }
  };

  const handleDownload = (contract) => {
      if (contract.file_url) {
          window.open(contract.file_url, '_blank');
      } else {
          // Fallback or alert
          alert('El documento no está disponible para descarga directa en este momento.');
      }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Cargando contratos...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Mis Contratos</h1>
      </div>

      {contracts.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                <i className="bi bi-file-earmark-text text-3xl text-slate-400"></i>
            </div>
            <h3 className="text-lg font-medium text-slate-900">No tienes contratos</h3>
            <p className="mt-2 text-slate-500">Los contratos generados aparecerán aquí.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Contrato / Empresa</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Fechas</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Jurisdicción</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Estado</th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {contracts.map((contract) => (
                <tr key={contract.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-slate-900">{contract.title}</div>
                    <div className="text-sm text-slate-500">{contract.company_name}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    <div>Inicio: {contract.start_date ? new Date(contract.start_date).toLocaleDateString() : '—'}</div>
                    <div>Fin: {contract.end_date ? new Date(contract.end_date).toLocaleDateString() : 'Indefinido'}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {contract.jurisdiction || '—'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        contract.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 
                        contract.envelope_status === 'sent' ? 'bg-amber-100 text-amber-800' :
                        'bg-slate-100 text-slate-800'
                    }`}>
                        {contract.envelope_status === 'sent' ? 'Pendiente de Firma' : 
                         contract.status === 'active' ? 'Activo' : contract.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-medium">
                    {contract.envelope_status === 'sent' && contract.docusign_envelope_id && (
                        <button 
                            onClick={() => handleSign(contract)}
                            className="text-indigo-600 hover:text-indigo-900 mr-4 font-semibold"
                        >
                            <i className="bi bi-pen me-1"></i> Firmar
                        </button>
                    )}
                    {(contract.status === 'active' || contract.envelope_status === 'completed') && (
                        <button 
                            onClick={() => handleDownload(contract)}
                            className="text-slate-600 hover:text-slate-900"
                        >
                            <i className="bi bi-download me-1"></i> Descargar
                        </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
