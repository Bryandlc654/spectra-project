import React, { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { createApi, resolveApiUrl } from '../../lib/api';
import TenantAuditTab from '../Tenants/tabs/TenantAuditTab';

export default function CompanyAuditPage() {
    const { user, token } = useAuth();
    const apiUrl = resolveApiUrl();
    const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
    
    if (!user?.company_id) {
        return <div className="p-8 text-center text-slate-500">No se encontró información de la empresa.</div>;
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-slate-900">Seguridad y Auditoría</h1>
                <p className="text-slate-500 text-sm mt-1">
                    Visualiza los registros de actividad, accesos y cambios importantes en tu organización.
                </p>
            </div>
            
            <TenantAuditTab api={api} companyId={user.company_id} />
        </div>
    );
}
