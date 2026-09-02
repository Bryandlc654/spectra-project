import React, { useMemo, useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { createApi, resolveApiUrl } from '../../lib/api';
import TenantInvoicesTab from '../Tenants/tabs/TenantInvoicesTab';

export default function CompanyInvoicesPage() {
    const { user, token } = useAuth();
    const apiUrl = resolveApiUrl();
    const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
    
    const [tenant, setTenant] = useState(null);
    const [currencies, setCurrencies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState('all'); // all, freelancer, platform

    useEffect(() => {
        if (user?.company_id) {
            loadData();
        }
    }, [user?.company_id]);

    const loadData = async () => {
        try {
            const [tenantRes, currenciesRes] = await Promise.all([
                api.get(`/api/tenants/${user.company_id}`),
                api.get('/api/common/currencies')
            ]);
            setTenant(tenantRes.data || tenantRes);
            setCurrencies(Array.isArray(currenciesRes) ? currenciesRes : (currenciesRes.data || []));
        } catch (e) {
            console.error('Error loading data', e);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-center">Cargando facturas...</div>;

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Facturación y Documentos</h1>
                    <p className="text-slate-500 text-sm mt-1">Gestiona tus facturas de freelancers y de la plataforma.</p>
                </div>
                
                <div className="flex p-1 bg-slate-100 rounded-lg">
                    <button
                        onClick={() => setFilterType('all')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                            filterType === 'all' 
                                ? 'bg-white text-slate-900 shadow-sm' 
                                : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        Todas
                    </button>
                    <button
                        onClick={() => setFilterType('freelancer')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                            filterType === 'freelancer' 
                                ? 'bg-white text-slate-900 shadow-sm' 
                                : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        Freelancers
                    </button>
                    <button
                        onClick={() => setFilterType('platform')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                            filterType === 'platform' 
                                ? 'bg-white text-slate-900 shadow-sm' 
                                : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        Plataforma
                    </button>
                </div>
            </div>

            <TenantInvoicesTab 
                api={api} 
                companyId={user.company_id} 
                tenantId={user.company_id} 
                tenant={tenant} 
                currencies={currencies}
                type={filterType === 'all' ? undefined : filterType}
            />
        </div>
    );
}
