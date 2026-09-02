import React, { useEffect, useState } from 'react';
import { useToast } from '../../../components/ToastProvider';

export default function TenantIntegrationTab({ companyId, api }) {
    const toast = useToast();
    const [integrations, setIntegrations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!companyId || !api) return;
        loadIntegrations();
    }, [companyId, api]);

    const loadIntegrations = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/api/tenants/${companyId}/integrations`);
            setIntegrations(Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []));
            setError(null);
        } catch (e) {
            console.error(e);
            setError('Error al cargar integraciones');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="p-12 text-center text-slate-400">
                <i className="bi bi-arrow-repeat animate-spin text-2xl mb-3 block"></i>
                Cargando integraciones...
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm">
                <i className="bi bi-exclamation-triangle mr-2"></i>
                {error}
                <button onClick={loadIntegrations} className="ml-4 underline hover:no-underline font-medium">
                    Reintentar
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-slate-900">Integraciones</h2>
                    <p className="text-sm text-slate-500">Conecta este tenant con servicios externos (ERP, HRIS, Bancos).</p>
                </div>
                <button 
                    disabled
                    className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-xl shadow-sm hover:bg-brand-dark transition-colors opacity-50 cursor-not-allowed"
                >
                    <i className="bi bi-plus-lg mr-2"></i>
                    Nueva Integración
                </button>
            </div>

            {integrations.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-4">
                        <i className="bi bi-puzzle text-xl"></i>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">Sin integraciones activas</h3>
                    <p className="mt-1 text-sm text-slate-500">
                        No hay integraciones configuradas para esta empresa.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {integrations.map((integration) => (
                        <div key={integration.id} className="rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-sm transition-shadow">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                                        <i className={`bi bi-${integration.icon || 'hdd-network'} text-xl`}></i>
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900 text-sm">{integration.name || 'Sin nombre'}</h4>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                                            integration.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                        }`}>
                                            {integration.status === 'active' ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="text-xs text-slate-500 line-clamp-2 mb-4">
                                {integration.description || 'Sin descripción disponible.'}
                            </div>
                            <div className="pt-4 border-t border-slate-100 flex justify-end">
                                <button className="text-xs font-semibold text-brand hover:text-brand-dark">
                                    Configurar <i className="bi bi-arrow-right ml-1"></i>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
