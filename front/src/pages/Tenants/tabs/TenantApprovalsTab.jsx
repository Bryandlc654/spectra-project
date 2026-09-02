import React, { useState, useEffect } from 'react';
import CriticalActionModal from '../../../components/CriticalActionModal';
import { useToast } from '../../../components/ToastProvider';

export default function TenantApprovalsTab({ api, companyId }) {
  const toast = useToast();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  
  // Simulator State
  const [simulator, setSimulator] = useState({
    amount: '',
    currency: 'USD',
    result: null,
    simulating: false,
    error: ''
  });

  // Critical Action State
  const [actionModal, setActionModal] = useState({
    open: false,
    policy: null,
    isActive: false, // current status
    loading: false
  });

  async function loadPolicies() {
    setLoading(true);
    try {
      // Endpoint should be /api/tenants/{id}/approvals/policies
      // If it doesn't exist yet, we might need to handle 404
      const res = await api.get(`/api/tenants/${companyId}/approvals/policies`);
      setPolicies(res.data || []);
    } catch (e) {
      console.error(e);
      // Fallback to empty if not implemented yet
      setPolicies([]); 
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPolicies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  function confirmToggle(policy) {
    setActionModal({
      open: true,
      policy,
      isActive: !!policy.is_active,
      loading: false
    });
  }

  async function handleToggle(reason) {
    setActionModal(prev => ({ ...prev, loading: true }));
    const { policy, isActive } = actionModal;
    
    try {
      await api.post(`/api/tenants/${companyId}/approvals/policies/${policy.id}/toggle`, {
        reason
      });
      
      toast.success(`Política ${isActive ? 'desactivada' : 'activada'} correctamente`);
      loadPolicies();
      loadLogs();
      setActionModal(prev => ({ ...prev, open: false }));
    } catch (e) {
      toast.error(e.message || 'Error actualizando política');
      setActionModal(prev => ({ ...prev, loading: false }));
    }
  }

  async function simulate(e) {
    e.preventDefault();
    if (!simulator.amount) return;

    setSimulator(prev => ({ ...prev, simulating: true, error: '', result: null }));
    
    try {
      const res = await api.post(`/api/tenants/${companyId}/approvals/simulate`, {
        amount: parseFloat(simulator.amount),
        currency: simulator.currency
      });
      
      setSimulator(prev => ({ 
        ...prev, 
        result: res.result || 'Aprobación automática (sin reglas coincidentes)', 
        simulating: false 
      }));
    } catch (e) {
      setSimulator(prev => ({ 
        ...prev, 
        error: e.message || 'Error en simulación', 
        simulating: false 
      }));
    }
  }

  return (
    <div className="space-y-8">
      {/* Policies List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Políticas de Aprobación</h3>
            <p className="text-sm text-slate-500">Reglas configuradas para el control de gastos</p>
          </div>
          <button className="text-sm font-semibold text-brand hover:text-brand/80 transition-colors">
            + Nueva Política
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500">Cargando políticas...</div>
        ) : policies.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            No hay políticas de aprobación configuradas.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 font-medium uppercase tracking-wider text-xs">
                <tr>
                  <th className="px-6 py-3">Nombre</th>
                  <th className="px-6 py-3">Reglas</th>
                  <th className="px-6 py-3">Estado</th>
                  <th className="px-6 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {policies.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-6 py-4 font-medium text-slate-900">{p.name}</td>
                    <td className="px-6 py-4 text-slate-600">{p.rules_count || 0} reglas</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${p.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${p.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                        {p.is_active ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => confirmToggle(p)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors shadow-sm
                          ${p.is_active 
                            ? 'border-amber-200 text-amber-700 hover:bg-amber-50' 
                            : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                          }`}
                      >
                        {p.is_active ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Simulator */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <i className="bi bi-cpu text-xl"></i>
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Simulador de Aprobación</h3>
            <p className="text-sm text-slate-500">Prueba cómo se comportarán las reglas con diferentes montos</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          <form onSubmit={simulate} className="space-y-5 p-5 bg-slate-50 rounded-xl border border-slate-100">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Monto de Transacción</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                  <input 
                    type="number" 
                    step="0.01"
                    required
                    value={simulator.amount}
                    onChange={e => setSimulator({...simulator, amount: e.target.value})}
                    className="w-full rounded-lg border-slate-200 pl-7 pr-3 py-2 outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                    placeholder="0.00"
                  />
                </div>
                <select 
                  value={simulator.currency}
                  onChange={e => setSimulator({...simulator, currency: e.target.value})}
                  className="rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand bg-white"
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="MXN">MXN</option>
                </select>
              </div>
            </div>
            <button 
                type="submit"
                disabled={simulator.simulating || !simulator.amount}
                className="w-full rounded-lg bg-brand text-white font-semibold py-2.5 hover:bg-brand/90 transition disabled:opacity-50 flex justify-center items-center gap-2"
            >
                {simulator.simulating ? (
                  <>
                    <i className="bi bi-arrow-repeat animate-spin"></i>
                    Analizando...
                  </>
                ) : (
                  <>
                    <i className="bi bi-play-fill"></i>
                    Simular Aprobación
                  </>
                )}
            </button>
          </form>

          {/* Result */}
          <div className="h-full min-h-[200px] rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center p-6 relative overflow-hidden">
            {simulator.error ? (
               <div className="text-red-500">
                 <i className="bi bi-exclamation-circle text-3xl mb-2 block" />
                 <p className="font-medium">{simulator.error}</p>
               </div>
            ) : simulator.result ? (
                <div className="animate-in fade-in zoom-in duration-300">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4 mx-auto">
                        <i className="bi bi-check-lg text-3xl" />
                    </div>
                    <h4 className="font-bold text-slate-900 text-lg mb-2">Resultado del Análisis</h4>
                    <div className="bg-slate-100 rounded-lg px-4 py-3 text-slate-700 font-mono text-sm inline-block">
                      {simulator.result}
                    </div>
                </div>
            ) : (
                <div className="text-slate-400">
                    <i className="bi bi-diagram-3 text-4xl mb-3 block opacity-50" />
                    <p className="font-medium">Esperando datos...</p>
                    <p className="text-sm mt-1">Ingresa un monto para ver qué política aplica</p>
                </div>
            )}
          </div>
        </div>
      </div>

      {/* Audit Logs */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-base font-semibold text-slate-900">Historial de Cambios</h3>
          <p className="text-sm text-slate-500">Registro de actividad relacionado con políticas de aprobación</p>
        </div>
        
        {logsLoading ? (
          <div className="p-8 text-center text-slate-500">Cargando historial...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            No hay registros de actividad recientes.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 font-medium uppercase tracking-wider text-xs">
                <tr>
                  <th className="px-6 py-3">Fecha</th>
                  <th className="px-6 py-3">Usuario</th>
                  <th className="px-6 py-3">Acción</th>
                  <th className="px-6 py-3">Detalles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 font-medium text-slate-900">
                      {log.actor_name || log.actor_email || 'Sistema'}
                    </td>
                    <td className="px-6 py-3">
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-500 max-w-xs truncate" title={log.metadata?.reason || JSON.stringify(log.metadata)}>
                      {log.metadata?.reason ? (
                        <span className="italic">"{log.metadata.reason}"</span>
                      ) : (
                        JSON.stringify(log.metadata)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CriticalActionModal
        open={actionModal.open}
        title={actionModal.isActive ? 'Desactivar Política' : 'Activar Política'}
        message={`Estás a punto de ${actionModal.isActive ? 'desactivar' : 'activar'} la política "${actionModal.policy?.name}". Esto afectará el flujo de aprobaciones de la empresa.`}
        danger={actionModal.isActive} // Deactivating is considered dangerous/sensitive
        loading={actionModal.loading}
        requireReason={true}
        onClose={() => setActionModal(prev => ({ ...prev, open: false }))}
        onConfirm={handleToggle}
        confirmText={actionModal.isActive ? 'Desactivar' : 'Activar'}
      />
    </div>
  );
}
