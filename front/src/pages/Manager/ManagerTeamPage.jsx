import React, { useState, useEffect } from 'react';

export default function ManagerTeamPage({ apiUrl, token, user }) {
  const [activeTab, setActiveTab] = useState('team');
  const [teamMembers, setTeamMembers] = useState([]);
  const [timeOffRequests, setTimeOffRequests] = useState([]);
  const [expenseRequests, setExpenseRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, [activeTab, user]);

  const fetchData = async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'team') {
        const res = await fetch(`${apiUrl}/api/users/team?manager_id=${user.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Error al cargar equipo');
        const data = await res.json();
        setTeamMembers(Array.isArray(data) ? data : []);
      } else if (activeTab === 'timeoff') {
        const res = await fetch(`${apiUrl}/api/time-off/requests?mode=team&manager_id=${user.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Error al cargar solicitudes');
        const data = await res.json();
        setTimeOffRequests(Array.isArray(data) ? data : []);
      } else if (activeTab === 'expenses') {
        const res = await fetch(`${apiUrl}/api/expenses?mode=team&manager_id=${user.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Error al cargar gastos');
        const data = await res.json();
        setExpenseRequests(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTimeOffAction = async (id, status) => {
    try {
      const res = await fetch(`${apiUrl}/api/time-off/requests/${id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ status, approver_id: user.id })
      });
      if (!res.ok) throw new Error('Error al actualizar solicitud');
      fetchData(); // Reload
    } catch (err) {
      alert(err.message);
    }
  };

  const handleExpenseAction = async (id, status) => {
    try {
      const res = await fetch(`${apiUrl}/api/expenses/${id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error('Error al actualizar gasto');
      fetchData(); // Reload
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Gestión de Equipo (Manager)</h1>
      
      {/* Tabs */}
      <div className="flex space-x-4 border-b mb-6">
        <button 
          onClick={() => setActiveTab('team')}
          className={`pb-2 px-4 ${activeTab === 'team' ? 'border-b-2 border-indigo-600 text-indigo-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Mi Equipo
        </button>
        <button 
          onClick={() => setActiveTab('timeoff')}
          className={`pb-2 px-4 ${activeTab === 'timeoff' ? 'border-b-2 border-indigo-600 text-indigo-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Aprobaciones Tiempo Libre
        </button>
        <button 
          onClick={() => setActiveTab('expenses')}
          className={`pb-2 px-4 ${activeTab === 'expenses' ? 'border-b-2 border-indigo-600 text-indigo-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Aprobaciones Gastos
        </button>
      </div>

      {loading && <div className="text-gray-500">Cargando...</div>}
      {error && <div className="text-red-500 mb-4">{error}</div>}

      {/* Team Content */}
      {activeTab === 'team' && !loading && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cargo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ingreso</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {teamMembers.length === 0 ? (
                <tr><td colSpan="4" className="px-6 py-4 text-center text-gray-500">No tienes miembros asignados.</td></tr>
              ) : (
                teamMembers.map(m => (
                  <tr key={m.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{m.full_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{m.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{m.job_title || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(m.created_at).toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Time Off Content */}
      {activeTab === 'timeoff' && !loading && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Empleado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Política</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fechas</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Días</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {timeOffRequests.length === 0 ? (
                <tr><td colSpan="6" className="px-6 py-4 text-center text-gray-500">No hay solicitudes pendientes.</td></tr>
              ) : (
                timeOffRequests.map(req => (
                  <tr key={req.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{req.full_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{req.policy_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {req.start_date} - {req.end_date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{req.days_requested}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        req.status === 'approved' ? 'bg-green-100 text-green-800' :
                        req.status === 'rejected' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {req.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {req.status === 'pending' && (
                        <>
                          <button onClick={() => handleTimeOffAction(req.id, 'approved')} className="text-green-600 hover:text-green-900 mr-4">Aprobar</button>
                          <button onClick={() => handleTimeOffAction(req.id, 'rejected')} className="text-red-600 hover:text-red-900">Rechazar</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Expenses Content */}
      {activeTab === 'expenses' && !loading && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Empleado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoría</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Monto</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {expenseRequests.length === 0 ? (
                <tr><td colSpan="5" className="px-6 py-4 text-center text-gray-500">No hay gastos pendientes.</td></tr>
              ) : (
                expenseRequests.map(exp => (
                  <tr key={exp.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{exp.full_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{exp.category_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{exp.amount} {exp.currency}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        exp.status === 'approved' ? 'bg-green-100 text-green-800' :
                        exp.status === 'rejected' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {exp.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {exp.status === 'pending' && (
                        <>
                          <button onClick={() => handleExpenseAction(exp.id, 'approved')} className="text-green-600 hover:text-green-900 mr-4">Aprobar</button>
                          <button onClick={() => handleExpenseAction(exp.id, 'rejected')} className="text-red-600 hover:text-red-900">Rechazar</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
