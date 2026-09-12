import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../components/ToastProvider';

const PER_PAGE = 20;

export default function AdminOnboardingPage({ apiUrl, token }) {
    const toast = useToast();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState(null); // For details modal
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);

    const api = useMemo(() => {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
        return {
            get: async (path) => {
                const res = await fetch(`${apiUrl}${path}`, { headers });
                if (!res.ok) throw new Error('Error fetching data');
                return res.json();
            }
        };
    }, [apiUrl, token]);

    useEffect(() => {
        loadData(page);
        // eslint-disable-next-line
    }, [page]);

    const loadData = async (nextPage) => {
        setLoading(true);
        try {
            const data = await api.get(`/api/onboarding/users-progress?page=${nextPage}&limit=${PER_PAGE}`);
            if (Array.isArray(data)) {
                setUsers(data);
                setTotal(data.length);
                setTotalPages(1);
            } else {
                setUsers(data.data || []);
                const pag = data.pagination || {};
                setTotal(pag.total || 0);
                setTotalPages(pag.total_pages || 1);
            }
        } catch (e) {
            toast.error('Error al cargar progreso de onboarding');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6">
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Seguimiento de Onboarding</h1>
                    <p className="text-sm text-slate-500">
                        Progreso de incorporación de empleados
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-8 text-slate-500">Cargando...</div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase">
                                <tr>
                                    <th className="px-6 py-4">Empleado</th>
                                    <th className="px-6 py-4">Rol</th>
                                    <th className="px-6 py-4">Progreso</th>
                                    <th className="px-6 py-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {users.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                                            Sin empleados para mostrar
                                        </td>
                                    </tr>
                                ) : users.map(u => (
                                    <tr key={u.id} className="hover:bg-slate-50">
                                        <td className="px-6 py-4">
                                            <div>
                                                <div className="font-semibold text-slate-900">{u.full_name}</div>
                                                <div className="text-xs text-slate-500">{u.email}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800">
                                                {u.platform_role}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="w-full max-w-xs">
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="font-medium">{u.progress}%</span>
                                                    <span className="text-slate-500">{u.tasks_completed}/{u.tasks_total} tareas</span>
                                                </div>
                                                <div className="w-full bg-slate-100 rounded-full h-2">
                                                    <div 
                                                        className={`h-2 rounded-full transition-all ${
                                                            u.progress === 100 ? 'bg-emerald-500' : 'bg-blue-500'
                                                        }`}
                                                        style={{ width: `${u.progress}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button 
                                                onClick={() => setSelectedUser(u)}
                                                className="text-blue-600 hover:text-blue-800 font-medium text-xs"
                                            >
                                                Ver Detalles
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/50">
                        <span className="text-sm text-slate-500">
                            Mostrando {(page - 1) * PER_PAGE + 1} a {Math.min(page * PER_PAGE, total)} de {total} empleados
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-3 py-1 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-sm"
                            >
                                Anterior
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages || 1, p + 1))}
                                disabled={page >= (totalPages || 1)}
                                className="px-3 py-1 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-sm"
                            >
                                Siguiente
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedUser && (
                <UserTasksModal 
                    user={selectedUser} 
                    api={api} 
                    onClose={() => setSelectedUser(null)} 
                />
            )}
        </div>
    );
}

const UserTasksModal = ({ user, api, onClose }) => {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadTasks = async () => {
            setLoading(true);
            try {
                const data = await api.get(`/api/onboarding/tasks/${user.id}`);
                setTasks(data);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        loadTasks();
    }, [user, api]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-slate-900">Checklist de {user.full_name}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <i className="bi bi-x-lg text-lg"></i>
                    </button>
                </div>

                {loading ? (
                    <div className="text-center py-8 text-slate-500">Cargando tareas...</div>
                ) : (
                    <div className="space-y-3">
                        {tasks.map(task => (
                            <div 
                                key={task.id}
                                className={`flex items-start gap-3 p-4 rounded-xl border ${
                                    task.status === 'completed' 
                                    ? 'bg-emerald-50 border-emerald-100' 
                                    : 'bg-white border-slate-200'
                                }`}
                            >
                                <div className="mt-1">
                                    {task.status === 'completed' ? (
                                        <i className="bi bi-check-circle-fill text-emerald-500 text-lg"></i>
                                    ) : (
                                        <i className="bi bi-circle text-slate-300 text-lg"></i>
                                    )}
                                </div>
                                <div>
                                    <h4 className={`font-semibold ${task.status === 'completed' ? 'text-slate-700' : 'text-slate-900'}`}>
                                        {task.title}
                                    </h4>
                                    <p className="text-sm text-slate-500 mt-1">{task.description}</p>
                                    {task.status === 'completed' && (
                                        <p className="text-xs text-emerald-600 mt-2">
                                            Completado: {new Date(task.completed_at).toLocaleDateString()}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                
                <div className="mt-6 flex justify-end">
                    <button 
                        onClick={onClose}
                        className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
};