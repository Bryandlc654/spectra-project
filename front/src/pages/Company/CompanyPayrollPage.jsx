import React, { useMemo, useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { createApi, resolveApiUrl } from '../../lib/api';
import TenantPayrollTab from '../Tenants/tabs/TenantPayrollTab';

export default function CompanyPayrollPage() {
    const { user, token } = useAuth();
    const apiUrl = resolveApiUrl();
    const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
    
    const [tenant, setTenant] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user?.company_id) {
            loadTenant();
        }
    }, [user?.company_id]);

    const loadTenant = async () => {
        try {
            const res = await api.get(`/api/tenants/${user.company_id}`);
            setTenant(res.data || res);
        } catch (e) {
            console.error('Error loading tenant info', e);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-center">Cargando nómina...</div>;

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold mb-6 text-slate-900">Nómina</h1>
            <TenantPayrollTab 
                api={api} 
                companyId={user.company_id} 
                tenantId={user.company_id} 
                tenant={tenant} 
            />
        </div>
    );
}
