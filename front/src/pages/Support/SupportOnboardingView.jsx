import React, { useState } from 'react';

export default function SupportOnboardingView() {
  // Mock data
  const [tasks, setTasks] = useState([
    { id: 1, company: 'Acme Corp', task: 'Validación KYB', status: 'pending', sla: '24h' },
    { id: 2, company: 'Globex Inc', task: 'Configuración Fiscal', status: 'in_progress', sla: '48h' },
    { id: 3, company: 'Soylent Corp', task: 'Firma de Contrato', status: 'escalated', sla: 'Overdue' },
  ]);

  const getStatusBadge = (status) => {
    switch(status) {
      case 'pending': return 'bg-slate-100 text-slate-600';
      case 'in_progress': return 'bg-blue-50 text-blue-700';
      case 'escalated': return 'bg-red-50 text-red-700';
      case 'completed': return 'bg-emerald-50 text-emerald-700';
      default: return 'bg-slate-50 text-slate-600';
    }
  };

  const handleStatusChange = (id, newStatus) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, status: newStatus } : t));
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Onboarding y Post-Contrato</h1>
        <p className="text-sm text-slate-500">Seguimiento de tareas de onboarding y SLAs.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="text-sm font-medium text-slate-500 mb-1">Tareas Pendientes</div>
          <div className="text-3xl font-bold text-slate-900">{tasks.filter(t => t.status === 'pending').length}</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="text-sm font-medium text-slate-500 mb-1">En Proceso</div>
          <div className="text-3xl font-bold text-blue-600">{tasks.filter(t => t.status === 'in_progress').length}</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="text-sm font-medium text-slate-500 mb-1">Escaladas / Retrasadas</div>
          <div className="text-3xl font-bold text-red-600">{tasks.filter(t => t.status === 'escalated').length}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 font-medium text-slate-900">Checklist de Onboarding Activos</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-xs text-slate-500 uppercase">
                <th className="p-4 font-semibold">Empresa</th>
                <th className="p-4 font-semibold">Tarea</th>
                <th className="p-4 font-semibold">SLA</th>
                <th className="p-4 font-semibold">Estado</th>
                <th className="p-4 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.map(task => (
                <tr key={task.id} className="hover:bg-slate-50">
                  <td className="p-4 font-medium text-slate-900">{task.company}</td>
                  <td className="p-4 text-slate-600">{task.task}</td>
                  <td className="p-4">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${task.sla === 'Overdue' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'}`}>
                      {task.sla}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(task.status)}`}>
                      {task.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <select 
                      value={task.status}
                      onChange={(e) => handleStatusChange(task.id, e.target.value)}
                      className="text-xs border-slate-200 rounded-lg py-1 px-2 focus:ring-brand focus:border-brand"
                    >
                      <option value="pending">Pendiente</option>
                      <option value="in_progress">En Proceso</option>
                      <option value="escalated">Escalar</option>
                      <option value="completed">Completado</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
