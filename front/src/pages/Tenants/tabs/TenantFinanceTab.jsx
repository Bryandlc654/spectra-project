import React, { useState, useEffect } from 'react';
import CriticalActionModal from '../../../components/CriticalActionModal';
import { useToast } from '../../../components/ToastProvider';

export default function TenantFinanceTab({ api, companyId }) {
  const toast = useToast();
  const [config, setConfig] = useState({
    invoice_number_next: '',
    invoice_prefix: '',
    base_currency_validation: true,
  });

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Critical Action state
  const [confirmModal, setConfirmModal] = useState({
      open: false,
      reason: ''
  });

  // Mock export history
  const exports = [
    { id: 1, type: 'Invoices', date: '2024-03-10 14:30', status: 'completed', url: '#' },
    { id: 2, type: 'Payouts', date: '2024-03-09 09:15', status: 'failed', error: 'Connection timeout' },
  ];

  useEffect(() => {
    loadSettings();
  }, [companyId]);

  async function loadSettings() {
    if (!companyId) return;
    setLoading(true);
    try {
        const res = await api.get(`/api/tenants/${companyId}/settings`);
        const data = res.data || {};
        setConfig({
            invoice_number_next: data.invoice_number_next || 1,
            invoice_prefix: data.invoice_series || '',
            base_currency_validation: data.base_currency_validation !== 0 && data.base_currency_validation !== false
        });
    } catch (e) {
        console.error(e);
        toast.error('Error cargando configuración financiera');
    } finally {
        setLoading(false);
    }
  }

  function handleSaveClick(e) {
    e.preventDefault();
    setConfirmModal({ open: true, reason: '' });
  }

  async function confirmSave(reason) {
    setSaving(true);
    try {
        await api.put(`/api/tenants/${companyId}/settings`, {
            invoice_number_next: config.invoice_number_next,
            invoice_series: config.invoice_prefix,
            base_currency_validation: config.base_currency_validation ? 1 : 0,
            reason // Audit log reason
        });
        toast.success('Configuración financiera guardada');
        setConfirmModal({ open: false, reason: '' });
        loadSettings();
    } catch (e) {
        toast.error(e.message || 'Error guardando configuración');
    } finally {
        setSaving(false);
    }
  }

  if (loading) return <div className="py-8 text-center text-slate-500">Cargando configuración...</div>;

  return (
    <div className="space-y-6">
      <CriticalActionModal
        open={confirmModal.open}
        title="Confirmar Cambios Financieros"
        message="Estás a punto de modificar la configuración de facturación/finanzas. Esto puede afectar la generación de documentos y validaciones."
        danger={true}
        onClose={() => setConfirmModal({ ...confirmModal, open: false })}
        onConfirm={confirmSave}
        loading={saving}
      />

      {/* Configuración de Facturación */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h3 className="font-bold text-slate-800 mb-4">Configuración Financiera</h3>
        <form onSubmit={handleSaveClick} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Próximo Número de Factura</label>
            <input 
              type="number"
              value={config.invoice_number_next}
              onChange={e => setConfig({...config, invoice_number_next: e.target.value})}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Prefijo de Factura (Serie)</label>
            <input 
              type="text"
              value={config.invoice_prefix}
              onChange={e => setConfig({...config, invoice_prefix: e.target.value})}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
              placeholder="Ej. INV-"
            />
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <input 
              type="checkbox"
              id="curr_val"
              checked={config.base_currency_validation}
              onChange={e => setConfig({...config, base_currency_validation: e.target.checked})}
              className="h-5 w-5 rounded border-slate-300 text-brand focus:ring-brand"
            />
            <label htmlFor="curr_val" className="text-sm font-medium text-slate-700">Validar transacciones en moneda base estricta</label>
          </div>
          <div className="md:col-span-2 pt-2">
            <button 
                type="submit"
                disabled={saving} 
                className="rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-70"
            >
              {saving ? 'Guardando...' : 'Guardar Configuración'}
            </button>
          </div>
        </form>
      </div>

      {/* Historial de Exportaciones */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Historial de Exportaciones y Reportes</h3>
        </div>
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-500 font-semibold">
            <tr>
              <th className="px-6 py-3">Tipo de Reporte</th>
              <th className="px-6 py-3">Fecha Generación</th>
              <th className="px-6 py-3">Estado</th>
              <th className="px-6 py-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {exports.map(ex => (
              <tr key={ex.id} className="hover:bg-slate-50/50">
                <td className="px-6 py-3 font-medium text-slate-900">{ex.type}</td>
                <td className="px-6 py-3 text-slate-600">{ex.date}</td>
                <td className="px-6 py-3">
                  {ex.status === 'completed' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">
                      <i className="bi bi-check-circle-fill"/> Completado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-xs font-bold" title={ex.error}>
                      <i className="bi bi-x-circle-fill"/> Fallido
                    </span>
                  )}
                </td>
                <td className="px-6 py-3 text-right">
                  {ex.status === 'completed' && (
                    <a href={ex.url} className="text-brand font-semibold hover:underline">Descargar</a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
