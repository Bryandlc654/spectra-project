import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../components/ToastProvider';

export default function OnboardingPage({ apiUrl, token }) {
    const toast = useToast();
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);

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
            },
            post: async (path, body) => {
                const res = await fetch(`${apiUrl}${path}`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body)
                });
                if (!res.ok) throw new Error('Error posting data');
                return res.json();
            }
        };
    }, [apiUrl, token]);

    useEffect(() => {
        loadTasks();
    }, []);

    const loadTasks = async () => {
        setLoading(true);
        try {
            const data = await api.get('/api/onboarding/me');
            setTasks(data);
        } catch (e) {
            toast.error('Error al cargar checklist');
        } finally {
            setLoading(false);
        }
    };

    const handleComplete = async (task) => {
        if (task.status === 'completed') return;
        try {
            await api.post(`/api/onboarding/tasks/${task.id}/complete`);
            toast.success('¡Tarea completada!');
            loadTasks();
        } catch (e) {
            toast.error(e.message);
        }
    };

    const progress = useMemo(() => {
        if (!tasks.length) return 0;
        const completed = tasks.filter(t => t.status === 'completed').length;
        return Math.round((completed / tasks.length) * 100);
    }, [tasks]);

    if (loading) return <div className="p-8 text-center">Cargando tu onboarding...</div>;

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900">Bienvenido a Spectra ERP</h1>
                <p className="text-slate-500 mt-2">Completa estos pasos para finalizar tu ingreso.</p>
                
                <div className="mt-6 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between text-sm font-medium mb-2">
                        <span className="text-slate-700">Progreso General</span>
                        <span className="text-blue-600">{progress}% Completado</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3">
                        <div 
                            className="bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                {tasks.map(task => (
                    <div 
                        key={task.id}
                        className={`group relative bg-white p-6 rounded-xl border-2 transition-all ${
                            task.status === 'completed' 
                            ? 'border-emerald-100 bg-emerald-50/30' 
                            : 'border-slate-200 hover:border-blue-300 shadow-sm hover:shadow-md'
                        }`}
                    >
                        <div className="flex items-start gap-4">
                            <div className="flex-shrink-0 mt-1">
                                {task.status === 'completed' ? (
                                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    </div>
                                ) : (
                                    <div 
                                        onClick={() => handleComplete(task)}
                                        className="w-8 h-8 rounded-full border-2 border-slate-300 group-hover:border-blue-500 cursor-pointer flex items-center justify-center transition-colors"
                                    >
                                        <div className="w-4 h-4 rounded-full bg-blue-500 opacity-0 group-hover:opacity-20"></div>
                                    </div>
                                )}
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-3">
                                    <h3 className={`text-lg font-bold ${task.status === 'completed' ? 'text-slate-600 line-through decoration-emerald-500/50' : 'text-slate-900'}`}>
                                        {task.title}
                                    </h3>
                                    {task.required == 1 && task.status !== 'completed' && (
                                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700">Requerido</span>
                                    )}
                                </div>
                                <p className="text-slate-500 mt-1">{task.description}</p>
                                
                                {task.status !== 'completed' && (
                                    <button 
                                        onClick={() => handleComplete(task)}
                                        className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                                    >
                                        Marcar como completado
                                    </button>
                                )}
                                {task.status === 'completed' && task.completed_at && (
                                    <p className="text-xs text-emerald-600 mt-2 font-medium">
                                        Completado el {new Date(task.completed_at).toLocaleDateString()}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
