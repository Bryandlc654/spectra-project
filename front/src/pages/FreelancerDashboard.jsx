import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { createApi } from '../lib/api';

export default function FreelancerDashboard({ user, apiUrl, token }) {
  const [loading, setLoading] = useState(true);
  const [pendingContracts, setPendingContracts] = useState([]);
  const [projectsCount, setProjectsCount] = useState(0);
  
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);

  const fetchContracts = async () => {
    if (!user?.id) return;
    
    try {
      setLoading(true);
      // Fetch pending contracts. Assuming status 'pending' covers pending signature.
      // If GlobalContractController filters strictly by exact match, we might need to adjust.
      const res = await api.get(`/api/global-contracts?freelancer_id=${user.id}&status=pending`);
      setPendingContracts(res.data || []);
    } catch (err) {
      console.error('Error fetching contracts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContracts();
  }, [user?.id, api]);

  const handleSign = async (contract) => {
    if (!contract.envelope_db_id) {
        alert('Error: No envelope ID found for this contract.');
        return;
    }

    try {
        if (contract.envelope_provider === 'docusign') {
            const res = await api.post(`/api/envelopes/${contract.envelope_db_id}?action=view`);
            if (res.url) {
                window.location.href = res.url;
            } else {
                alert(res.message || 'Error getting signing URL');
            }
        } else {
            // Local signing
            // In a real flow, we might want to show the document first.
            // For now, we'll ask for confirmation and sign.
            if (window.confirm(`Do you want to sign "${contract.title}"?`)) {
                await api.post(`/api/envelopes/${contract.envelope_db_id}?action=sign`);
                alert('Contract signed successfully!');
                fetchContracts();
            }
        }
    } catch (err) {
        console.error('Error signing contract:', err);
        alert(err.message || 'Error signing contract');
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="rounded-3xl bg-gradient-to-br from-indigo-900 to-indigo-800 p-8 text-white shadow-xl shadow-indigo-200">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold">
            Hola, {user?.full_name || 'Freelancer'}
          </h1>
          <p className="mt-2 text-indigo-200">
            Bienvenido a tu espacio de trabajo. Gestiona tus proyectos, contratos y pagos desde aquí.
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/dashboard/projects" className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Mis Proyectos</p>
              <h3 className="mt-1 text-2xl font-bold text-slate-900 group-hover:text-indigo-600">
                {projectsCount}
              </h3>
            </div>
            <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600">
              <i className="bi bi-kanban text-xl"></i>
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs font-medium text-slate-500">
            <span>En curso</span>
          </div>
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Contratos</p>
              <h3 className="mt-1 text-2xl font-bold text-slate-900">—</h3>
            </div>
            <div className="rounded-xl bg-amber-50 p-2 text-amber-600">
              <i className="bi bi-file-earmark-text text-xl"></i>
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs font-medium text-slate-500">
            <span>Pendientes de firma</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Ingresos (Mes)</p>
              <h3 className="mt-1 text-2xl font-bold text-slate-900">—</h3>
            </div>
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
              <i className="bi bi-wallet2 text-xl"></i>
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs font-medium text-slate-500">
            <span>Ver historial</span>
          </div>
        </div>


      </div>

      {/* Recent Activity / Pending Contracts */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-4">Contratos Pendientes de Firma</h3>
        
        {loading ? (
            <div className="text-center py-8 text-slate-500">Cargando...</div>
        ) : pendingContracts.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
                No tienes contratos pendientes de firma.
            </div>
        ) : (
            <div className="divide-y divide-slate-100">
                {pendingContracts.map(contract => (
                    <div key={contract.id} className="flex items-center justify-between py-4">
                        <div>
                            <h4 className="font-medium text-slate-900">{contract.title}</h4>
                            <p className="text-xs text-slate-500">
                                {contract.company_name} • {new Date(contract.created_at).toLocaleDateString()}
                            </p>
                            {contract.envelope_provider === 'docusign' && (
                                <span className="mt-1 inline-flex items-center rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                                    DocuSign
                                </span>
                            )}
                            {contract.envelope_provider === 'local' && (
                                <span className="mt-1 inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                                    Firma Local
                                </span>
                            )}
                        </div>
                        <button
                            onClick={() => handleSign(contract)}
                            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200"
                        >
                            Firmar Ahora
                        </button>
                    </div>
                ))}
            </div>
        )}
      </div>
    </div>
  );
}
