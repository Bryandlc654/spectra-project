import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { resolveApiUrl } from '../../lib/api';

export default function CompanyBillingPage() {
    const { token, user } = useAuth();
    const apiUrl = resolveApiUrl();
    const [activeTab, setActiveTab] = useState('invoices');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);

    // Params for pagination
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState(null);

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
        loadData();
    }, [activeTab, page]);

    const loadData = async () => {
        setLoading(true);
        let path = '';
        if (activeTab === 'invoices') {
            path = `/api/finance/invoices?company_id=${user.company_id}&page=${page}`;
        } else {
            // Wallet Transactions (Platform History)
            path = `/api/finance/wallet/${user.company_id}?page=${page}`;
        }

        const res = await api.get(path);
        if (res) {
            if (activeTab === 'invoices') {
                setData(res.data || []);
                setMeta(res.meta);
            } else {
                // Wallet endpoint returns wallet object with transactions inside
                setData(res.transactions?.data || []);
                setMeta(res.transactions?.meta);
            }
        }
        setLoading(false);
    };

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Facturación y Documentos</h1>

            <div className="flex gap-4 border-b mb-6">
                <button 
                    onClick={() => { setActiveTab('invoices'); setPage(1); }}
                    className={`pb-2 px-4 ${activeTab === 'invoices' ? 'border-b-2 border-blue-600 font-bold text-blue-600' : 'text-gray-500'}`}
                >
                    Facturas de Contratos
                </button>
                <button 
                    onClick={() => { setActiveTab('platform'); setPage(1); }}
                    className={`pb-2 px-4 ${activeTab === 'platform' ? 'border-b-2 border-blue-600 font-bold text-blue-600' : 'text-gray-500'}`}
                >
                    Historial de Plataforma
                </button>
            </div>

            {loading ? (
                <div>Cargando...</div>
            ) : (
                <div className="bg-white shadow rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="p-4 text-sm font-semibold text-gray-600">Fecha</th>
                                <th className="p-4 text-sm font-semibold text-gray-600">Descripción / N° Factura</th>
                                <th className="p-4 text-sm font-semibold text-gray-600 text-right">Monto</th>
                                <th className="p-4 text-sm font-semibold text-gray-600">Estado</th>
                                <th className="p-4 text-sm font-semibold text-gray-600 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {data.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="p-8 text-center text-gray-400">No hay registros.</td>
                                </tr>
                            ) : data.map((item, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                    <td className="p-4 text-sm text-gray-700">
                                        {activeTab === 'invoices' ? item.issue_date : new Date(item.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="p-4 text-sm text-gray-900 font-medium">
                                        {activeTab === 'invoices' ? (
                                            <>
                                                <div>{item.invoice_number}</div>
                                                <div className="text-xs text-gray-500">{item.freelancer_first_name} {item.freelancer_last_name}</div>
                                            </>
                                        ) : (
                                            item.description
                                        )}
                                    </td>
                                    <td className={`p-4 text-sm font-bold text-right ${
                                        activeTab === 'platform' && item.type === 'credit' ? 'text-green-600' : 'text-slate-900'
                                    }`}>
                                        {item.currency_symbol || '$'} {Number(item.amount).toFixed(2)}
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                                            (item.status || 'completed') === 'paid' || (item.status || 'completed') === 'completed' 
                                            ? 'bg-green-100 text-green-700' 
                                            : 'bg-yellow-100 text-yellow-700'
                                        }`}>
                                            {item.status || 'Completado'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right">
                                        {activeTab === 'invoices' && (
                                            <button 
                                                className="text-blue-600 hover:underline text-sm"
                                                onClick={() => {
                                                    const url = `${apiUrl}/api/finance/invoices/${item.id}/download`;
                                                    // Add token to url or fetch blob
                                                    // For simplicity, opening in new tab (requires token in query or cookie, 
                                                    // but our API expects Bearer header usually. 
                                                    // We'll use a fetch-blob approach).
                                                    
                                                    fetch(url, {
                                                        headers: { 'Authorization': `Bearer ${token}` }
                                                    })
                                                    .then(res => res.blob())
                                                    .then(blob => {
                                                        const a = document.createElement('a');
                                                        a.href = window.URL.createObjectURL(blob);
                                                        a.download = `invoice_${item.invoice_number || 'doc'}.txt`;
                                                        a.click();
                                                    })
                                                    .catch(e => alert('Error al descargar'));
                                                }}
                                            >
                                                Descargar PDF
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    
                    {/* Pagination */}
                    {meta && meta.total_pages > 1 && (
                        <div className="p-4 border-t flex justify-between items-center">
                            <button 
                                disabled={page <= 1}
                                onClick={() => setPage(p => p - 1)}
                                className="px-3 py-1 border rounded disabled:opacity-50"
                            >
                                Anterior
                            </button>
                            <span className="text-sm text-gray-600">Página {page} de {meta.total_pages}</span>
                            <button 
                                disabled={page >= meta.total_pages}
                                onClick={() => setPage(p => p + 1)}
                                className="px-3 py-1 border rounded disabled:opacity-50"
                            >
                                Siguiente
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
