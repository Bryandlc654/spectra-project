import React, { useEffect, useState } from 'react';
import { useToast } from '../../components/ToastProvider';
import Modal from '../../components/Modal';
import { apiFetch } from '../../lib/api';

export default function WalletPage({ apiUrl, token }) {
  const [activeTab, setActiveTab] = useState('balances');

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Wallet / Ledger</h1>
      </div>

      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit mb-6">
        <button
          onClick={() => setActiveTab('balances')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'balances'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Saldos por Empresa
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'ledger'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Libro Mayor Global
        </button>
      </div>

      {activeTab === 'balances' && <BalancesTab apiUrl={apiUrl} token={token} />}
      {activeTab === 'ledger' && <LedgerTab apiUrl={apiUrl} token={token} />}
    </div>
  );
}

function BalancesTab({ apiUrl, token }) {
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const toast = useToast();

  // Detail Modal
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [loadingWallet, setLoadingWallet] = useState(false);

  // Adjust Modal
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustWallet, setAdjustWallet] = useState(null);

  useEffect(() => {
    loadWallets();
  }, []);

  const loadWallets = async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await apiFetch(apiUrl, '/api/finance/wallet', { token });
      setWallets(res.data || []);
    } catch (e) {
      setErr(e.message || 'Error cargando wallets');
    } finally {
      setLoading(false);
    }
  };

  const handleView = async (companyId) => {
    setLoadingWallet(true);
    setSelectedWallet(null);
    setViewModalOpen(true);
    try {
      const res = await apiFetch(apiUrl, `/api/finance/wallet/${companyId}`, { token });
      setSelectedWallet(res);
    } catch (e) {
      toast.error('Error cargando detalle de wallet');
      setViewModalOpen(false);
    } finally {
      setLoadingWallet(false);
    }
  };

  const handleAdjust = (wallet) => {
    setAdjustWallet(wallet);
    setAdjustModalOpen(true);
  };

  const handleAdjustSuccess = () => {
    setAdjustModalOpen(false);
    setAdjustWallet(null);
    loadWallets();
    toast.success('Saldo actualizado correctamente');
  };

  const formatCurrency = (amount, symbol) => {
    return `${symbol || ''} ${Number(amount).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
  };

  return (
    <>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading && <div className="p-8 text-center text-gray-500">Cargando saldos...</div>}
        {err && <div className="p-8 text-center text-red-500">{err}</div>}
        
        {!loading && !err && wallets.length === 0 && (
          <div className="p-8 text-center text-gray-500">No hay wallets registradas.</div>
        )}

        {!loading && !err && wallets.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Empresa</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tax ID</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Última Act.</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {wallets.map((w) => (
                  <tr key={w.company_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{w.company_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{w.company_tax_id || '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                      {formatCurrency(w.balance, w.currency_symbol)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {w.updated_at ? new Date(w.updated_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button 
                        onClick={() => handleAdjust(w)}
                        className="text-green-600 hover:text-green-900 mr-3"
                        title="Recargar o Ajustar Saldo"
                      >
                        Recargar/Ajustar
                      </button>
                      <button 
                        onClick={() => handleView(w.company_id)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Ver movimientos"
                      >
                        Ver Detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Detalle Wallet */}
      <Modal
        open={viewModalOpen}
        onClose={() => setViewModalOpen(false)}
        title={selectedWallet ? `Wallet: ${selectedWallet.company_name}` : 'Cargando...'}
        size="4xl"
      >
        {loadingWallet && <div className="p-8 text-center text-gray-500">Cargando detalles...</div>}
        
        {!loadingWallet && selectedWallet && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg">
               <div>
                  <div className="text-xs text-gray-500 uppercase">Saldo Actual</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {formatCurrency(selectedWallet.balance, selectedWallet.currency_symbol)}
                  </div>
               </div>
               <div>
                  <div className="text-xs text-gray-500 uppercase">Moneda</div>
                  <div className="text-lg font-medium text-gray-700">{selectedWallet.currency_code}</div>
               </div>
               <div>
                  <div className="text-xs text-gray-500 uppercase">ID Empresa</div>
                  <div className="text-xs font-mono text-gray-500 break-all">{selectedWallet.company_id}</div>
               </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-3">Movimientos Recientes</h3>
              {(!selectedWallet.transactions?.data || selectedWallet.transactions.data.length === 0) ? (
                 <div className="text-center py-8 text-gray-500 border border-dashed rounded-lg">No hay transacciones registradas.</div>
              ) : (
                <div className="overflow-x-auto border rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Monto</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ref.</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {selectedWallet.transactions.data.map((tx) => (
                        <tr key={tx.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                             {new Date(tx.created_at).toLocaleDateString()} <span className="text-xs text-gray-400">{new Date(tx.created_at).toLocaleTimeString()}</span>
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 capitalize">{tx.type}</td>
                          <td className={`px-4 py-2 whitespace-nowrap text-sm text-right font-medium ${Number(tx.amount) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                             {Number(tx.amount) > 0 ? '+' : ''}{formatCurrency(tx.amount, tx.currency_symbol)}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm">
                             <StatusBadge status={tx.status} />
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500 font-mono">
                             {tx.reference_type || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Adjust Balance Modal */}
      {adjustModalOpen && adjustWallet && (
        <AdjustBalanceModal
          isOpen={adjustModalOpen}
          onClose={() => setAdjustModalOpen(false)}
          wallet={adjustWallet}
          apiUrl={apiUrl}
          token={token}
          onSuccess={handleAdjustSuccess}
        />
      )}
    </>
  );
}

function AdjustBalanceModal({ isOpen, onClose, wallet, apiUrl, token, onSuccess }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || !description) return;
    
    setSubmitting(true);
    try {
      await apiFetch(apiUrl, '/api/finance/reconciliation/adjustment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          company_id: wallet.company_id,
          currency_id: wallet.currency_id, // Ensure your backend expects currency_id or handles it
          amount: parseFloat(amount),
          description: description
        },
        token
      });
      onSuccess();
    } catch (error) {
      toast.error(error.message || 'Error al ajustar saldo');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose} title="Recargar / Ajustar Saldo" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Empresa</label>
          <div className="mt-1 p-2 bg-gray-100 rounded text-sm text-gray-900">{wallet.company_name}</div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Moneda</label>
          <div className="mt-1 p-2 bg-gray-100 rounded text-sm text-gray-900">{wallet.currency_code} ({wallet.currency_symbol})</div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Monto del Ajuste</label>
          <div className="mt-1 relative rounded-md shadow-sm">
             <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-3 pr-12 sm:text-sm border-gray-300 rounded-md"
              placeholder="0.00"
              required
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <span className="text-gray-500 sm:text-sm">{wallet.currency_code}</span>
            </div>
          </div>
          <p className="mt-1 text-xs text-gray-500">Use valores positivos para depósitos, negativos para retiros.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Descripción / Motivo</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
            placeholder="Ej: Depósito bancario inicial, Corrección de error..."
            required
          />
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="button"
            onClick={onClose}
            className="mr-3 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Procesando...' : 'Aplicar Ajuste'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function LedgerTab({ apiUrl, token }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    loadTransactions();
  }, []);

  const loadTransactions = async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await apiFetch(apiUrl, '/api/finance/wallet/transactions', { token });
      setTransactions(res.data || []);
    } catch (e) {
      setErr(e.message || 'Error cargando libro mayor');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount, symbol) => {
    return `${symbol || ''} ${Number(amount).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading && <div className="p-8 text-center text-gray-500">Cargando transacciones...</div>}
        {err && <div className="p-8 text-center text-red-500">{err}</div>}
        
        {!loading && !err && transactions.length === 0 && (
          <div className="p-8 text-center text-gray-500">No hay transacciones registradas.</div>
        )}

        {!loading && !err && transactions.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Empresa</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Monto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Referencia</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                       {new Date(tx.created_at).toLocaleDateString()} <br/>
                       <span className="text-xs text-gray-400">{new Date(tx.created_at).toLocaleTimeString()}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{tx.company_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 capitalize">{tx.type}</td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${Number(tx.amount) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                       {Number(tx.amount) > 0 ? '+' : ''}{formatCurrency(tx.amount, tx.currency_symbol)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                       <StatusBadge status={tx.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 font-mono">
                       {tx.reference_type || '—'} <br/> {tx.reference_id ? `${String(tx.reference_id).substring(0,8)}...` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    pending: 'bg-yellow-100 text-yellow-800',
    posted: 'bg-green-100 text-green-800',
    completed: 'bg-green-100 text-green-800',
    voided: 'bg-red-100 text-red-800',
    failed: 'bg-red-100 text-red-800',
  };
  const label = {
    pending: 'Pendiente',
    posted: 'Procesado',
    completed: 'Completado',
    voided: 'Anulado',
    failed: 'Fallido',
  };

  return (
    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
      {label[status] || status}
    </span>
  );
}
