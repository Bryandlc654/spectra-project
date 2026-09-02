import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { useToast } from '../components/ToastProvider';
import Modal from '../components/Modal';

export default function WithdrawalMethodsPage({ apiUrl, token }) {
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const toast = useToast();

  const [formData, setFormData] = useState({
    type: 'bank_transfer',
    bank_name: '',
    account_holder_name: '',
    account_number: '',
    routing_number: '',
    swift_code: '',
    currency_code: 'USD',
    country_code: '',
    is_primary: false
  });

  useEffect(() => {
    loadMethods();
  }, [apiUrl, token]);

  const loadMethods = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(apiUrl, '/api/bank-accounts', { token });
      setMethods(res.data || []);
    } catch (err) {
      console.error(err);
      setError('Error cargando métodos de retiro');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar este método de retiro?')) return;
    try {
      await apiFetch(apiUrl, `/api/bank-accounts/${id}`, { token, method: 'DELETE' });
      toast.success('Método eliminado correctamente');
      loadMethods();
    } catch (err) {
      toast.error('Error al eliminar método');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiFetch(apiUrl, '/api/bank-accounts', {
        token,
        method: 'POST',
        body: formData
      });
      toast.success('Método agregado correctamente');
      setIsModalOpen(false);
      setFormData({
        type: 'bank_transfer',
        bank_name: '',
        account_holder_name: '',
        account_number: '',
        routing_number: '',
        swift_code: '',
        currency_code: 'USD',
        country_code: '',
        is_primary: false
      });
      loadMethods();
    } catch (err) {
      toast.error(err.message || 'Error al guardar método');
    }
  };

  const getMethodIcon = (type) => {
    switch (type) {
      case 'wise': return '🚀';
      case 'paypal': return '🅿️';
      case 'payoneer': return '🅿️';
      case 'crypto': return '₿';
      default: return '🏦';
    }
  };

  const getMethodLabel = (type) => {
     switch (type) {
      case 'wise': return 'Wise';
      case 'paypal': return 'PayPal';
      case 'payoneer': return 'Payoneer';
      case 'crypto': return 'Criptomonedas';
      default: return 'Transferencia Bancaria';
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Métodos de Retiro</h1>
          <p className="text-gray-600">Gestiona tus cuentas bancarias y métodos de pago para recibir fondos.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2"
        >
          <span>+</span> Agregar Método
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-500">Cargando...</div>
      ) : error ? (
        <div className="text-center py-10 text-red-500">{error}</div>
      ) : methods.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-gray-500 mb-2">No tienes métodos de retiro configurados.</p>
          <button onClick={() => setIsModalOpen(true)} className="text-blue-600 font-medium hover:underline">
            Agregar el primero
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {methods.map((method) => (
            <div key={method.id} className="bg-white p-4 rounded-lg shadow border border-gray-200 relative group">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl" role="img" aria-label="icon">{getMethodIcon(method.type)}</span>
                  <div>
                    <h3 className="font-semibold text-gray-800">{getMethodLabel(method.type)}</h3>
                    <span className="text-xs text-gray-500">{method.currency_code}</span>
                  </div>
                </div>
                {method.is_primary === 1 && (
                  <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">Principal</span>
                )}
              </div>
              
              <div className="space-y-1 text-sm text-gray-600 mt-3">
                <p><span className="font-medium">Banco:</span> {method.bank_name}</p>
                <p><span className="font-medium">Titular:</span> {method.account_holder_name}</p>
                <p><span className="font-medium">Cuenta:</span> •••• {method.account_number.slice(-4)}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
                <button
                  onClick={() => handleDelete(method.id)}
                  className="text-red-600 hover:text-red-800 text-sm font-medium"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Agregar Método de Retiro"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Tipo de Cuenta</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
            >
              <option value="bank_transfer">Transferencia Bancaria Local / SWIFT</option>
              <option value="wise">Wise</option>
              <option value="paypal">PayPal</option>
              <option value="payoneer">Payoneer</option>
              <option value="crypto">Criptomonedas</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Moneda</label>
              <input
                type="text"
                required
                value={formData.currency_code}
                onChange={(e) => setFormData({ ...formData, currency_code: e.target.value.toUpperCase() })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                placeholder="USD, EUR, PEN..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">País del Banco</label>
              <input
                type="text"
                value={formData.country_code}
                onChange={(e) => setFormData({ ...formData, country_code: e.target.value.toUpperCase() })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                placeholder="US, PE, ES..."
                maxLength={2}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Nombre del Banco / Proveedor</label>
            <input
              type="text"
              required
              value={formData.bank_name}
              onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
              placeholder="Ej: Chase, BCP, Wise Inc."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Nombre del Titular</label>
            <input
              type="text"
              required
              value={formData.account_holder_name}
              onChange={(e) => setFormData({ ...formData, account_holder_name: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Número de Cuenta / IBAN / Email</label>
            <input
              type="text"
              required
              value={formData.account_number}
              onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Routing Number (Opcional)</label>
              <input
                type="text"
                value={formData.routing_number}
                onChange={(e) => setFormData({ ...formData, routing_number: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">SWIFT / BIC (Opcional)</label>
              <input
                type="text"
                value={formData.swift_code}
                onChange={(e) => setFormData({ ...formData, swift_code: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
              />
            </div>
          </div>

          <div className="flex items-center mt-2">
            <input
              type="checkbox"
              id="is_primary"
              checked={formData.is_primary}
              onChange={(e) => setFormData({ ...formData, is_primary: e.target.checked })}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="is_primary" className="ml-2 block text-sm text-gray-900">
              Establecer como método principal
            </label>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="mr-3 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              Guardar Método
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
