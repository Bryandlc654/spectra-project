import React, { useState, useEffect } from 'react';
import { useToast } from '../../components/ToastProvider';
import { apiFetch } from '../../lib/api';

export default function GlobalCostReportsPage({ apiUrl, token }) {
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [costs, setCosts] = useState([]);
    const [filterYear, setFilterYear] = useState(new Date().getFullYear());
    
    // Determine company_id from context or user (mock for now, should come from token/context)
    // Assuming the backend handles company_id extraction or we pass a hardcoded one for testing if context missing
    // In a real app, useAuth() would provide the user's company_id.
    // Here we'll rely on the backend to fail if not provided, or fetch the user's company first.
    const [companyId, setCompanyId] = useState('');

    useEffect(() => {
        // Fetch current user to get company_id
        async function fetchUser() {
            try {
                const res = await apiFetch(apiUrl, '/api/users/me', { token });
                if (res.company_id) {
                    setCompanyId(res.company_id);
                } else {
                    toast.error('No se encontró compañía asociada al usuario');
                }
            } catch (e) {
                console.error(e);
            }
        }
        fetchUser();
    }, [apiUrl, token]);

    useEffect(() => {
        if (!companyId) return;

        async function loadCosts() {
            setLoading(true);
            try {
                // Generate snapshot for current month just in case (optional, or manual trigger)
                // await apiFetch(apiUrl, '/api/analytics/snapshot', {
                //     token, method: 'POST', body: JSON.stringify({ company_id: companyId })
                // });

                const start = `${filterYear}-01`;
                const end = `${filterYear}-12`;
                
                const res = await apiFetch(apiUrl, `/api/analytics/global-costs?company_id=${companyId}&start_month=${start}&end_month=${end}`, { token });
                setCosts(res.data || []);
            } catch (e) {
                toast.error(e.message || 'Error cargando reportes');
            } finally {
                setLoading(false);
            }
        }
        loadCosts();
    }, [apiUrl, token, companyId, filterYear]);

    const handleGenerateSnapshot = async () => {
        if (!companyId) return;
        try {
            await apiFetch(apiUrl, '/api/analytics/snapshot', {
                token, 
                method: 'POST', 
                body: JSON.stringify({ company_id: companyId })
            });
            toast.success('Snapshot generado exitosamente');
            // Reload
            const start = `${filterYear}-01`;
            const end = `${filterYear}-12`;
            const res = await apiFetch(apiUrl, `/api/analytics/global-costs?company_id=${companyId}&start_month=${start}&end_month=${end}`, { token });
            setCosts(res.data || []);
        } catch (e) {
            toast.error(e.message || 'Error generando snapshot');
        }
    };

    const formatMoney = (amount) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Reportes de Costos Globales</h1>
                    <p className="text-sm text-slate-500">Visualización de costos de nómina, impuestos y tarifas.</p>
                </div>
                <div className="flex gap-2">
                    <select 
                        value={filterYear} 
                        onChange={e => setFilterYear(e.target.value)}
                        className="rounded-xl border-slate-200 text-sm"
                    >
                        <option value="2024">2024</option>
                        <option value="2025">2025</option>
                        <option value="2026">2026</option>
                    </select>
                    <button 
                        onClick={handleGenerateSnapshot}
                        className="px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold hover:bg-brand/90"
                    >
                        <i className="bi bi-arrow-clockwise mr-2"/>
                        Recalcular Mes Actual
                    </button>
                </div>
            </div>

            {loading && <div className="text-center py-12 text-slate-500">Cargando datos...</div>}

            {!loading && costs.length === 0 && (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-200">
                    <i className="bi bi-bar-chart text-4xl text-slate-300 mb-3 block" />
                    <p className="text-slate-500">No hay datos de costos para este periodo.</p>
                </div>
            )}

            {!loading && costs.length > 0 && (
                <div className="grid gap-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                            <p className="text-xs font-semibold text-slate-500 uppercase">Total Nómina (Año)</p>
                            <p className="text-2xl font-bold text-slate-900">
                                {formatMoney(costs.reduce((sum, c) => sum + Number(c.total_payroll), 0))}
                            </p>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                            <p className="text-xs font-semibold text-slate-500 uppercase">Total Impuestos (Año)</p>
                            <p className="text-2xl font-bold text-slate-900">
                                {formatMoney(costs.reduce((sum, c) => sum + Number(c.total_taxes), 0))}
                            </p>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                            <p className="text-xs font-semibold text-slate-500 uppercase">Total Tarifas (Año)</p>
                            <p className="text-2xl font-bold text-slate-900">
                                {formatMoney(costs.reduce((sum, c) => sum + Number(c.total_fees), 0))}
                            </p>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="px-4 py-3 text-left">Mes</th>
                                    <th className="px-4 py-3 text-right">Nómina</th>
                                    <th className="px-4 py-3 text-right">Impuestos</th>
                                    <th className="px-4 py-3 text-right">Tarifas</th>
                                    <th className="px-4 py-3 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {costs.map(c => {
                                    const total = Number(c.total_payroll) + Number(c.total_taxes) + Number(c.total_fees);
                                    return (
                                        <tr key={c.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-medium text-slate-900">{c.month}</td>
                                            <td className="px-4 py-3 text-right text-slate-600">{formatMoney(c.total_payroll)}</td>
                                            <td className="px-4 py-3 text-right text-slate-600">{formatMoney(c.total_taxes)}</td>
                                            <td className="px-4 py-3 text-right text-slate-600">{formatMoney(c.total_fees)}</td>
                                            <td className="px-4 py-3 text-right font-bold text-brand">{formatMoney(total)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
