import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch, resolveApiUrl } from '../../lib/api';
import { useToast } from '../../components/ToastProvider';

export default function NpsDashboardPage() {
  const { user, token } = useAuth();
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsData, responsesData] = await Promise.all([
        apiFetch(resolveApiUrl(), '/api/nps/stats', { token }),
        apiFetch(resolveApiUrl(), '/api/nps/responses', { token })
      ]);
      setStats(statsData);
      setResponses(responsesData.responses || []);
    } catch (err) {
      console.error(err);
      toast.error('Error cargando datos de NPS');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Cargando métricas...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Métricas eNPS</h1>
          <p className="text-gray-500">Employee Net Promoter Score (Interno)</p>
        </div>
        <button 
          onClick={loadData}
          className="text-indigo-600 hover:text-indigo-800 font-medium"
        >
          Actualizar
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-indigo-500">
          <div className="text-gray-500 text-sm font-medium uppercase tracking-wider">NPS Score</div>
          <div className="mt-2 flex items-baseline">
            <span className={`text-4xl font-extrabold ${getNpsColor(stats?.nps)}`}>
              {stats?.nps}
            </span>
            <span className="ml-2 text-sm text-gray-500">(-100 a +100)</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-green-500">
          <div className="text-gray-500 text-sm font-medium uppercase tracking-wider">Promotores (9-10)</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{stats?.promoters}</div>
          <div className="text-xs text-gray-500">
            {stats?.total > 0 ? Math.round((stats.promoters / stats.total) * 100) : 0}% del total
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-yellow-500">
          <div className="text-gray-500 text-sm font-medium uppercase tracking-wider">Pasivos (7-8)</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{stats?.passives}</div>
          <div className="text-xs text-gray-500">
            {stats?.total > 0 ? Math.round((stats.passives / stats.total) * 100) : 0}% del total
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-red-500">
          <div className="text-gray-500 text-sm font-medium uppercase tracking-wider">Detractores (0-6)</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{stats?.detractors}</div>
          <div className="text-xs text-gray-500">
            {stats?.total > 0 ? Math.round((stats.detractors / stats.total) * 100) : 0}% del total
          </div>
        </div>
      </div>

      {/* Recent Feedback */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Feedback Reciente</h3>
        </div>
        <ul className="divide-y divide-gray-200">
          {responses.length === 0 ? (
            <li className="px-6 py-4 text-gray-500 text-center">No hay respuestas aún.</li>
          ) : (
            responses.map((resp) => (
              <li key={resp.id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-start space-x-4">
                  <div className={`
                    flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-white
                    ${resp.score >= 9 ? 'bg-green-500' : resp.score >= 7 ? 'bg-yellow-500' : 'bg-red-500'}
                  `}>
                    {resp.score}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {resp.first_name} {resp.last_name}
                    </p>
                    <p className="text-sm text-gray-500">
                      {new Date(resp.created_at).toLocaleDateString()}
                    </p>
                    {resp.feedback && (
                      <div className="mt-2 text-sm text-gray-700 bg-gray-50 p-3 rounded">
                        "{resp.feedback}"
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

function getNpsColor(score) {
  if (score >= 50) return 'text-green-600';
  if (score > 0) return 'text-yellow-600';
  return 'text-red-600';
}
