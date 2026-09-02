import React, { useState, useEffect } from 'react';

const TimeOffPage = ({ apiUrl, token }) => {
  const [activeTab, setActiveTab] = useState('policies');
  const [policies, setPolicies] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'policies') fetchPolicies();
    if (activeTab === 'requests') fetchRequests();
  }, [activeTab]);

  const fetchPolicies = async () => {
    setLoading(true);
    try {
      // Assuming company_id is handled by backend session or query param. 
      // For now fetching all visible policies.
      const res = await fetch(`${apiUrl}/api/time-off/policies?company_id=1`, { // Mock company_id
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setPolicies(data);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/time-off/requests`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setRequests(data);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Gestión de Tiempo Libre (PTO)</h1>
      
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('policies')}
            className={`${activeTab === 'policies' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Políticas
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`${activeTab === 'requests' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Solicitudes
          </button>
        </nav>
      </div>

      {loading ? <p>Cargando...</p> : (
        <>
          {activeTab === 'policies' && (
            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <ul className="divide-y divide-gray-200">
                {policies.length === 0 ? <p className="p-4 text-gray-500">No hay políticas definidas.</p> : policies.map((policy) => (
                  <li key={policy.id} className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-indigo-600 truncate">{policy.name}</p>
                      <div className="ml-2 flex-shrink-0 flex">
                        <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">{policy.type}</p>
                      </div>
                    </div>
                    <div className="mt-2 sm:flex sm:justify-between">
                      <div className="sm:flex">
                        <p className="flex items-center text-sm text-gray-500">
                          Días/Año: {policy.days_per_year}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {activeTab === 'requests' && (
            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <ul className="divide-y divide-gray-200">
                {requests.length === 0 ? <p className="p-4 text-gray-500">No hay solicitudes pendientes.</p> : requests.map((req) => (
                  <li key={req.id} className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-indigo-600 truncate">Usuario: {req.user_id}</p>
                      <p className="text-sm text-gray-500">{req.start_date} - {req.end_date}</p>
                    </div>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">{req.reason}</p>
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${req.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {req.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TimeOffPage;
