import React, { useMemo } from 'react';
import TenantOnboardingOpsTab from '../Tenants/tabs/TenantOnboardingOpsTab';
import { createApi } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function CompanyOnboardingPage({ apiUrl }) {
    const { session } = useAuth();
    const companyId = session?.user?.company_id;

    const api = useMemo(() => createApi({ baseUrl: apiUrl, token: session?.token }), [apiUrl, session?.token]);

    // Construct a pseudo-tenant object to satisfy TenantOnboardingOpsTab props
    const tenant = useMemo(() => ({
        id: companyId,
        company: { id: companyId }
    }), [companyId]);

    if (!companyId) {
        return <div className="p-10 text-center text-slate-500">No company context found</div>;
    }

    return (
        <div className="p-6">
            <TenantOnboardingOpsTab tenant={tenant} api={api} />
        </div>
    );
}
