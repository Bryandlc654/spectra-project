import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { createApi, resolveApiUrl } from '../lib/api';

export default function FreelancerPaymentPage() {
  const { user, token } = useAuth();
  const apiUrl = resolveApiUrl();
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    bank_name: '',
    account_holder_name: '',
    account_number: '',
    routing_number: '',
    swift_code: '',
    currency_code: 'USD',
    type: 'bank_transfer',
    country_code: '',
    is_primary: false
  });

  useEffect(() => {
    fetchAccounts();
  }, [user?.id]);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/api/bank-accounts?limit=50`);
      const data = res?.data || res;
      setAccounts(Array.isArray(data) ? data : (data?.data || []));
    } catch (err) {
      setError(err.message || 'Error al cargar cuentas');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar esta cuenta?')) return;
    try {
      await api.del(`/api/bank-accounts/${id}`);
      fetchAccounts();
    } catch (err) {
      alert(err.message || 'Error al eliminar cuenta');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        bank_name: String(formData.bank_name || '').trim(),
        account_holder_name: String(formData.account_holder_name || '').trim(),
        account_number: String(formData.account_number || '').trim(),
        currency_code: String(formData.currency_code || 'USD').toUpperCase().trim(),
        country_code: String(formData.country_code || '').toUpperCase().trim(),
        routing_number: formData.routing_number?.trim?.() || formData.routing_number || '',
        swift_code: formData.swift_code?.trim?.() || formData.swift_code || ''
      };
      if (editingId) {
        await api.put(`/api/bank-accounts/${editingId}`, payload);
      } else {
        await api.post(`/api/bank-accounts`, payload);
      }

      setShowModal(false);
      setEditingId(null);
      setFormData({
        bank_name: '',
        account_holder_name: '',
        account_number: '',
        routing_number: '',
        swift_code: '',
        currency_code: 'USD',
        type: 'bank_transfer',
        country_code: '',
        is_primary: false
      });
      fetchAccounts();
    } catch (err) {
      alert(err.message || 'Error al guardar');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      verified: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      pending: 'bg-amber-100 text-amber-800 border-amber-200',
      rejected: 'bg-red-100 text-red-800 border-red-200'
    };
    const labels = {
      verified: 'Verificado',
      pending: 'Pendiente',
      rejected: 'Rechazado'
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${styles[status] || styles.pending}`}>
        {labels[status] || status || 'Pendiente'}
      </span>
    );
  };

  if (loading && accounts.length === 0) return <div className="p-8 text-center text-slate-500">Cargando datos de pago...</div>;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Datos de Pago</h1>
          <p className="text-slate-500 mt-1">Administra tus cuentas bancarias y preferencias de pago.</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition"
        >
          <i className="bi bi-plus-lg"></i>
          Agregar Cuenta
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-600 border border-red-100">
          {error}
        </div>
      )}

      {/* Primary Payment Currency Info */}
      <div className="mb-8 rounded-2xl bg-slate-900 p-6 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-slate-300 mb-1">Moneda de Pago Preferida</div>
            <div className="text-3xl font-bold">
              {accounts.find(a => a.is_primary)?.currency_code || 'No configurada'}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Basado en tu cuenta principal
            </div>
          </div>
          <div className="h-12 w-12 rounded-full bg-white/10 flex items-center justify-center">
            <i className="bi bi-currency-exchange text-2xl"></i>
          </div>
        </div>
        <div className="absolute -right-6 -bottom-6 h-32 w-32 rounded-full bg-indigo-500/20 blur-2xl"></div>
      </div>

      {/* Accounts List */}
      <div className="grid gap-6">
        {accounts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-50">
              <i className="bi bi-bank text-xl text-slate-400"></i>
            </div>
            <h3 className="mt-2 text-sm font-semibold text-slate-900">No hay cuentas registradas</h3>
            <p className="mt-1 text-sm text-slate-500">Agrega una cuenta bancaria para recibir pagos.</p>
          </div>
        ) : (
          accounts.map(account => (
            <div key={account.id} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <i className={`bi ${account.type === 'paypal' ? 'bi-paypal' : account.type === 'crypto' ? 'bi-currency-bitcoin' : 'bi-bank'} text-2xl`}></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{account.bank_name}</h3>
                      {account.is_primary === 1 && (
                        <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
                          Principal
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-col gap-1 text-sm text-slate-500">
                      <p><span className="font-medium text-slate-700">Titular:</span> {account.account_holder_name || account.account_holder || '—'}</p>
                      <p><span className="font-medium text-slate-700">Cuenta:</span> •••• {typeof account.account_number === 'string' && account.account_number.length >= 4 ? account.account_number.slice(-4) : '—'}</p>
                      <p><span className="font-medium text-slate-700">Moneda:</span> {account.currency_code}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-3">
                  {getStatusBadge(account.validation_status)}
                  {!(account.is_primary === 1 || account.is_primary === true) && (
                    <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                      Secundaria
                    </span>
                  )}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingId(account.id);
                        setFormData({
                          bank_name: account.bank_name || '',
                          account_holder_name: account.account_holder_name || account.account_holder || '',
                          account_number: account.account_number || '',
                          routing_number: account.routing_number || '',
                          swift_code: account.swift_code || '',
                          currency_code: account.currency_code || account.currency || 'USD',
                          type: account.type || 'bank_transfer',
                          country_code: (account.country_code || '').toUpperCase(),
                          is_primary: !!(account.is_primary === 1 || account.is_primary === true),
                        });
                        setShowModal(true);
                      }}
                      className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition"
                      title="Editar cuenta"
                    >
                      <i className="bi bi-pencil"></i>
                    </button>
                    <button 
                      onClick={() => handleDelete(account.id)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                      title="Eliminar cuenta"
                    >
                      <i className="bi bi-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Account Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-lg font-semibold text-slate-900">{editingId ? 'Editar Cuenta Bancaria' : 'Agregar Cuenta Bancaria'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
                    <select 
                      value={formData.type}
                      onChange={e => setFormData({...formData, type: e.target.value})}
                      className="w-full rounded-xl border-slate-200 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                    >
                      <option value="bank_transfer">Transferencia Bancaria</option>
                      <option value="wise">Wise</option>
                      <option value="paypal">PayPal</option>
                      <option value="payoneer">Payoneer</option>
                      <option value="crypto">Crypto</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Moneda</label>
                    <select 
                      value={formData.currency_code}
                      onChange={e => setFormData({...formData, currency_code: e.target.value})}
                      className="w-full rounded-xl border-slate-200 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                    >
                      <option value="USD">USD - Dólar Estadounidense</option>
                      <option value="EUR">EUR - Euro</option>
                      <option value="GBP">GBP - Libra Esterlina</option>
                      <option value="PEN">PEN - Sol Peruano</option>
                      <option value="MXN">MXN - Peso Mexicano</option>
                      <option value="COP">COP - Peso Colombiano</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Banco / Plataforma</label>
                  <input 
                    type="text" 
                    required
                    value={formData.bank_name}
                    onChange={e => setFormData({...formData, bank_name: e.target.value})}
                    placeholder="Ej. BCP, Interbank, Wise"
                    className="w-full rounded-xl border-slate-200 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Titular</label>
                  <input 
                    type="text" 
                    required
                    value={formData.account_holder_name}
                    onChange={e => setFormData({...formData, account_holder_name: e.target.value})}
                    placeholder="Como aparece en la cuenta"
                    className="w-full rounded-xl border-slate-200 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Número de Cuenta / Email</label>
                  <input 
                    type="text" 
                    required
                    value={formData.account_number}
                    onChange={e => setFormData({...formData, account_number: e.target.value})}
                    placeholder="Número de cuenta o correo de PayPal/Wise"
                    className="w-full rounded-xl border-slate-200 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Routing / Swift (Opcional)</label>
                    <input 
                      type="text" 
                      value={formData.routing_number}
                      onChange={e => setFormData({...formData, routing_number: e.target.value})}
                      placeholder="Código de ruta"
                      className="w-full rounded-xl border-slate-200 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">SWIFT / BIC (Opcional)</label>
                    <input 
                      type="text" 
                      value={formData.swift_code}
                      onChange={e => setFormData({...formData, swift_code: e.target.value})}
                      placeholder="Ej. ABCDPEPL"
                      className="w-full rounded-xl border-slate-200 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">País del Banco (Opcional)</label>
                  <input 
                    type="text" 
                    value={formData.country_code}
                    onChange={e => setFormData({...formData, country_code: e.target.value.toUpperCase()})}
                    placeholder="Ej. PE, US, ES"
                    maxLength={2}
                    className="w-full rounded-xl border-slate-200 text-sm focus:border-indigo-500 focus:ring-indigo-500 uppercase"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input 
                    type="checkbox" 
                    id="is_primary"
                    checked={formData.is_primary}
                    onChange={e => setFormData({...formData, is_primary: e.target.checked})}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <label htmlFor="is_primary" className="text-sm text-slate-700">Marcar como cuenta principal</label>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => { setShowModal(false); setEditingId(null); }}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition disabled:opacity-50"
                >
                  {submitting ? 'Guardando...' : (editingId ? 'Guardar Cambios' : 'Guardar Cuenta')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
