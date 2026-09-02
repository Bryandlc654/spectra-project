import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { resolveApiUrl } from '../../lib/api';

export default function CompanyReportsPage() {
    const { token, user } = useAuth();
    const apiUrl = resolveApiUrl();
    const [stats, setStats] = useState({ 
        hires: [], 
        turnover: [], 
        performance: [], 
        costs: [],
        projectCosts: [],
        fiscal: []
    });
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('dashboard');

    const api = useMemo(() => {
        const headers = { 'Authorization': `Bearer ${token}` };
        return {
            get: async (path) => {
                try {
                    const res = await fetch(`${apiUrl}${path}`, { headers });
                    return res.ok ? res.json() : null;
                } catch (e) {
                    console.error(e);
                    return null;
                }
            }
        };
    }, [apiUrl, token]);

    useEffect(() => {
        if (user?.company_id) {
            loadAllStats();
        }
    }, [user?.company_id]);

    const loadAllStats = async () => {
        setLoading(true);
        try {
            const [hires, turnover, perf, costs, projCosts, fiscal] = await Promise.all([
                api.get(`/api/analytics/hires?company_id=${user.company_id}`),
                api.get(`/api/analytics/turnover?company_id=${user.company_id}`),
                api.get(`/api/analytics/performance?company_id=${user.company_id}`),
                api.get(`/api/analytics/global-costs?company_id=${user.company_id}`),
                api.get(`/api/analytics/project-costs?company_id=${user.company_id}`),
                api.get(`/api/analytics/fiscal-compliance?company_id=${user.company_id}`)
            ]);

            setStats({
                hires: hires?.data || [],
                turnover: turnover?.data || [],
                performance: perf?.data || [],
                costs: costs?.data || [],
                projectCosts: projCosts?.data || [],
                fiscal: fiscal?.data || []
            });
        } catch (error) {
            console.error('Error loading stats', error);
        } finally {
            setLoading(false);
        }
    };

    const downloadCSV = () => {
        let rows = [['Reporte General Spectra ERP']];
        rows.push(['Generado el:', new Date().toLocaleString()]);
        rows.push([]);

        // Hires
        rows.push(['--- CONTRATACIONES ---']);
        rows.push(['Mes', 'Cantidad']);
        stats.hires.forEach(h => rows.push([h.month, h.count]));
        rows.push([]);

        // Turnover
        rows.push(['--- ROTACIÓN ---']);
        rows.push(['Mes', 'Terminados']);
        stats.turnover.forEach(h => rows.push([h.month, h.count]));
        rows.push([]);

        // Costs
        rows.push(['--- COSTOS GLOBALES ---']);
        rows.push(['Mes', 'Nómina', 'Impuestos', 'Fees', 'Total']);
        stats.costs.forEach(c => rows.push([
            c.month, 
            c.total_payroll, 
            c.total_taxes, 
            c.total_fees, 
            Number(c.total_payroll) + Number(c.total_fees) + Number(c.total_taxes)
        ]));
        rows.push([]);

        // Project Costs
        rows.push(['--- COSTOS POR PROYECTO ---']);
        rows.push(['ID Proyecto', 'Nombre', 'Costo Total', 'Moneda']);
        stats.projectCosts.forEach(p => rows.push([p.id, p.name, p.total_cost, p.currency_code]));
        rows.push([]);

        // Fiscal
        rows.push(['--- CUMPLIMIENTO FISCAL ---']);
        rows.push(['Estado', 'Cantidad']);
        stats.fiscal.forEach(f => rows.push([f.status, f.count]));
        rows.push([]);

        // Performance
        rows.push(['--- DESEMPEÑO (HITOS) ---']);
        rows.push(['Estado', 'Cantidad']);
        stats.performance.forEach(p => rows.push([p.status, p.count]));

        const csvContent = "data:text/csv;charset=utf-8," 
            + rows.map(e => e.map(cell => `"${cell}"`).join(",")).join("\n");
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `reporte_spectra_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading) return <div className="p-8 text-center text-slate-500">Cargando reportes y analítica...</div>;

    const tabs = [
        { id: 'dashboard', label: 'Dashboard General' },
        { id: 'projects', label: 'Costos por Proyecto' },
        { id: 'hr', label: 'Contrataciones y Rotación' },
        { id: 'performance', label: 'Desempeño' },
        { id: 'fiscal', label: 'Cumplimiento Fiscal' },
    ];

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Reportes y Analítica</h1>
                    <p className="text-slate-500 text-sm mt-1">Visión general del estado de la empresa</p>
                </div>
                <button 
                    onClick={downloadCSV}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand/90 transition-colors"
                >
                    <i className="bi bi-download" />
                    Exportar Excel/CSV
                </button>
            </div>

            {/* Tabs */}
            <div className="border-b border-slate-200">
                <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`
                                whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors
                                ${activeTab === tab.id
                                    ? 'border-brand text-brand'
                                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'}
                            `}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Content */}
            <div className="min-h-[400px]">
                {activeTab === 'dashboard' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Summary Cards */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                            <h3 className="text-sm font-medium text-slate-500">Gasto Total (Año)</h3>
                            <div className="mt-2 text-3xl font-bold text-slate-900">
                                ${stats.costs.reduce((acc, curr) => acc + Number(curr.total_payroll || 0) + Number(curr.total_fees || 0), 0).toLocaleString()}
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                            <h3 className="text-sm font-medium text-slate-500">Contrataciones (12m)</h3>
                            <div className="mt-2 text-3xl font-bold text-emerald-600">
                                {stats.hires.reduce((acc, curr) => acc + Number(curr.count), 0)}
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                            <h3 className="text-sm font-medium text-slate-500">Rotación (12m)</h3>
                            <div className="mt-2 text-3xl font-bold text-red-600">
                                {stats.turnover.reduce((acc, curr) => acc + Number(curr.count), 0)}
                            </div>
                        </div>
                        
                        {/* Recent Activity / Mini Charts */}
                         <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 col-span-full lg:col-span-2">
                            <h3 className="text-lg font-bold text-slate-800 mb-4">Evolución de Costos</h3>
                            {stats.costs.length === 0 ? <p className="text-slate-400">Sin datos suficientes</p> : (
                                <div className="h-64 flex items-end justify-between gap-2">
                                    {stats.costs.map((c, i) => {
                                        const total = Number(c.total_payroll) + Number(c.total_fees);
                                        const max = Math.max(...stats.costs.map(x => Number(x.total_payroll) + Number(x.total_fees))) || 1;
                                        const height = (total / max) * 100;
                                        return (
                                            <div key={i} className="flex-1 flex flex-col items-center group relative">
                                                <div 
                                                    className="w-full bg-brand/80 rounded-t-md hover:bg-brand transition-all"
                                                    style={{ height: `${height}%` }}
                                                />
                                                <span className="text-xs text-slate-500 mt-2 truncate w-full text-center">{c.month}</span>
                                                {/* Tooltip */}
                                                <div className="absolute bottom-full mb-2 hidden group-hover:block bg-slate-800 text-white text-xs p-2 rounded z-10">
                                                    ${total.toLocaleString()}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'projects' && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="p-6 border-b border-slate-100">
                            <h3 className="text-lg font-bold text-slate-800">Costos Acumulados por Proyecto</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                                    <tr>
                                        <th className="px-6 py-3">Proyecto</th>
                                        <th className="px-6 py-3 text-right">Costo Total</th>
                                        <th className="px-6 py-3 text-right">Moneda</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {stats.projectCosts.length === 0 ? (
                                        <tr><td colSpan="3" className="px-6 py-4 text-center text-slate-500">No hay datos de proyectos</td></tr>
                                    ) : (
                                        stats.projectCosts.map((p, i) => (
                                            <tr key={i} className="hover:bg-slate-50">
                                                <td className="px-6 py-4 font-medium text-slate-900">{p.name}</td>
                                                <td className="px-6 py-4 text-right font-bold">${Number(p.total_cost).toLocaleString()}</td>
                                                <td className="px-6 py-4 text-right">{p.currency_code || 'USD'}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'hr' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                            <h3 className="text-lg font-bold text-slate-800 mb-4">Contrataciones (Últimos 12 meses)</h3>
                            {stats.hires.length === 0 ? <p className="text-slate-400">Sin datos</p> : (
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-slate-500 border-b">
                                            <th className="pb-2">Mes</th>
                                            <th className="pb-2 text-right">Cantidad</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {stats.hires.map((h, i) => (
                                            <tr key={i}>
                                                <td className="py-3 text-slate-700">{h.month}</td>
                                                <td className="py-3 text-right font-bold text-emerald-600">{h.count}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                            <h3 className="text-lg font-bold text-slate-800 mb-4">Rotación de Personal</h3>
                            {stats.turnover.length === 0 ? <p className="text-slate-400">Sin datos</p> : (
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-slate-500 border-b">
                                            <th className="pb-2">Mes</th>
                                            <th className="pb-2 text-right">Bajas</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {stats.turnover.map((h, i) => (
                                            <tr key={i}>
                                                <td className="py-3 text-slate-700">{h.month}</td>
                                                <td className="py-3 text-right font-bold text-red-600">{h.count}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'performance' && (
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                        <h3 className="text-lg font-bold text-slate-800 mb-6">Estado de Hitos (Entregables)</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {stats.performance.length === 0 ? <p className="text-slate-400 col-span-4">Sin datos de desempeño</p> : (
                                stats.performance.map((p, i) => (
                                    <div key={i} className="bg-slate-50 p-6 rounded-xl text-center border border-slate-100">
                                        <div className="text-4xl font-bold text-brand mb-2">{p.count}</div>
                                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{p.status}</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'fiscal' && (
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 max-w-2xl mx-auto">
                        <h3 className="text-lg font-bold text-slate-800 mb-6">Cumplimiento Fiscal de Freelancers</h3>
                        <div className="space-y-4">
                            {stats.fiscal.map((f, i) => {
                                const total = stats.fiscal.reduce((acc, curr) => acc + Number(curr.count), 0);
                                const percent = total > 0 ? (f.count / total) * 100 : 0;
                                const isCompliant = f.status === 'Compliant';
                                return (
                                    <div key={i}>
                                        <div className="flex justify-between text-sm font-medium mb-1">
                                            <span className={isCompliant ? 'text-emerald-700' : 'text-red-700'}>
                                                {isCompliant ? 'Cumplimiento OK (Con RFC/Tax ID)' : 'Pendiente (Sin RFC/Tax ID)'}
                                            </span>
                                            <span className="text-slate-600">{f.count} ({Math.round(percent)}%)</span>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-2.5">
                                            <div 
                                                className={`h-2.5 rounded-full ${isCompliant ? 'bg-emerald-500' : 'bg-red-500'}`} 
                                                style={{ width: `${percent}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                             {stats.fiscal.length === 0 && <p className="text-slate-400">Sin datos fiscales</p>}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
