import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';

export default function PayslipPage({ apiUrl, token }) {
    const { runId, userId } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const api = useMemo(() => {
        const headers = { 'Authorization': `Bearer ${token}` };
        return {
            get: async (path) => {
                const res = await fetch(`${apiUrl}${path}`, { headers });
                return res.ok ? res.json() : null;
            }
        };
    }, [apiUrl, token]);

    useEffect(() => {
        // Since we don't have a dedicated endpoint yet, we fetch the run and filter locally.
        // Ideally: GET /api/payroll/runs/:id/payslip/:userId
        const loadData = async () => {
            const [runRes, userRes] = await Promise.all([
                api.get(`/api/payroll/runs/${runId}`),
                api.get(`/api/users/${userId}`)
            ]);

            if (runRes) {
                const items = (runRes.items || []).filter(i => String(i.user_id) === String(userId));
                setData({ run: runRes, items, user: userRes });
            }
            setLoading(false);
        };
        loadData();
    }, [runId, userId]);

    if (loading) return <div className="p-10 text-center">Generando recibo...</div>;
    if (!data) return <div className="p-10 text-center text-red-600">No se encontraron datos.</div>;

    const { run, items, user } = data;
    const earnings = items.filter(i => i.type === 'earning' || i.type === 'reimbursement');
    const deductions = items.filter(i => i.type === 'deduction' || i.type === 'tax');
    
    const totalEarnings = earnings.reduce((sum, i) => sum + Number(i.amount), 0);
    const totalDeductions = deductions.reduce((sum, i) => sum + Number(i.amount), 0);
    const netPay = totalEarnings - totalDeductions;

    return (
        <div className="min-h-screen bg-gray-100 p-8 flex justify-center items-start">
            <div className="bg-white w-[210mm] min-h-[297mm] p-12 shadow-2xl print:shadow-none print:w-full print:h-full print:absolute print:top-0 print:left-0">
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 uppercase tracking-widest">Payslip</h1>
                        <p className="text-slate-500 mt-1">Recibo de Nómina</p>
                    </div>
                    <div className="text-right">
                        <h2 className="text-xl font-bold text-slate-800">Spectra ERP</h2>
                        <p className="text-sm text-slate-500">123 Business Rd, Tech City</p>
                        <p className="text-sm text-slate-500">Tax ID: 999-999-999</p>
                    </div>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-12 mb-12">
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase mb-1">Empleado</p>
                        <p className="text-lg font-bold text-slate-900">{user?.full_name || `Usuario ID: ${userId}`}</p>
                        <p className="text-sm text-slate-600">{user?.role || 'Empleado'}</p>
                        <p className="text-sm text-slate-500">{user?.email}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-1">Periodo de Pago</p>
                        <p className="text-lg font-bold text-slate-900">{run.period_start} - {run.period_end}</p>
                        <p className="text-sm text-slate-600">Fecha de Pago: {run.pay_date || 'N/A'}</p>
                    </div>
                </div>

                {/* Tables */}
                <div className="grid grid-cols-2 gap-8 mb-8">
                    {/* Earnings */}
                    <div>
                        <h3 className="font-bold text-emerald-700 border-b border-emerald-200 pb-2 mb-4 uppercase text-sm">Ingresos</h3>
                        <table className="w-full text-sm">
                            <tbody className="divide-y divide-slate-100">
                                {earnings.map((item, idx) => (
                                    <tr key={idx}>
                                        <td className="py-2 text-slate-700">{item.description}</td>
                                        <td className="py-2 text-right font-medium text-slate-900">{Number(item.amount).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="border-t border-slate-300">
                                <tr>
                                    <td className="py-3 font-bold text-slate-900">Total Ingresos</td>
                                    <td className="py-3 text-right font-bold text-slate-900">{totalEarnings.toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Deductions */}
                    <div>
                        <h3 className="font-bold text-red-700 border-b border-red-200 pb-2 mb-4 uppercase text-sm">Deducciones</h3>
                        <table className="w-full text-sm">
                            <tbody className="divide-y divide-slate-100">
                                {deductions.map((item, idx) => (
                                    <tr key={idx}>
                                        <td className="py-2 text-slate-700">{item.description}</td>
                                        <td className="py-2 text-right font-medium text-red-600">-{Number(item.amount).toFixed(2)}</td>
                                    </tr>
                                ))}
                                {deductions.length === 0 && (
                                    <tr><td className="py-2 text-slate-400 italic">Sin deducciones</td></tr>
                                )}
                            </tbody>
                            <tfoot className="border-t border-slate-300">
                                <tr>
                                    <td className="py-3 font-bold text-slate-900">Total Deducciones</td>
                                    <td className="py-3 text-right font-bold text-red-600">-{totalDeductions.toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                {/* Net Pay */}
                <div className="bg-slate-900 text-white p-6 rounded-xl flex justify-between items-center print:bg-slate-200 print:text-black">
                    <div>
                        <p className="text-sm opacity-80 uppercase tracking-widest">Neto a Pagar</p>
                        <p className="text-xs opacity-60 mt-1">Transferencia Bancaria</p>
                    </div>
                    <div className="text-3xl font-bold">
                        {run.currency_code} {netPay.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-20 pt-8 border-t border-slate-200 text-center text-xs text-slate-400">
                    <p>Generado electrónicamente por Spectra ERP el {new Date().toLocaleDateString()}.</p>
                    <p>Este documento es válido sin firma autógrafa.</p>
                </div>

                {/* Actions (Hidden on Print) */}
                <div className="fixed bottom-8 right-8 flex gap-4 print:hidden">
                    <button 
                        onClick={() => window.print()}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-full font-bold shadow-lg transition-transform hover:scale-105 flex items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                        Descargar PDF
                    </button>
                </div>
            </div>
        </div>
    );
}
