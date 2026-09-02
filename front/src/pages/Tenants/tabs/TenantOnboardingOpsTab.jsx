import React, { useState, useEffect } from 'react';
import { useToast } from '../../../components/ToastProvider';
import Modal from '../../../components/Modal';

function Badge({ children, color = 'gray' }) {
    const colors = {
        gray: 'bg-slate-100 text-slate-700',
        green: 'bg-emerald-100 text-emerald-700',
        blue: 'bg-blue-100 text-blue-700',
        yellow: 'bg-amber-100 text-amber-700',
        red: 'bg-rose-100 text-rose-700',
    };
    return (
        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${colors[color] || colors.gray}`}>
            {children}
        </span>
    );
}

export default function TenantOnboardingOpsTab({ tenant, api }) {
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [activeOnboardings, setActiveOnboardings] = useState([]);
    
    // Selection for Details
    const [selectedUser, setSelectedUser] = useState(null);
    const [userTasks, setUserTasks] = useState([]);
    const [tasksLoading, setTasksLoading] = useState(false);
    
    // New Checklist Modal
    const [isNewModalOpen, setIsNewModalOpen] = useState(false);
    const [candidates, setCandidates] = useState([]); // List of freelancers/employees
    const [selectedCandidate, setSelectedCandidate] = useState('');
    
    // Team Members for Responsible Assignment
    const [teamMembers, setTeamMembers] = useState([]);

    useEffect(() => {
        if (tenant?.id) {
            loadData();
            loadTeamMembers();
        }
    }, [tenant?.id]);

    const loadData = async () => {
        setLoading(true);
        try {
            // Fetch users with internal onboarding tasks, filtered by company
            const res = await api.get(`/api/onboarding/users-progress?type=internal_onboarding&company_id=${tenant.id}`);
            // Filter out users with 0 tasks if we want to only show active onboardings, 
            // but the endpoint returns all users. We might want to show only those with tasks > 0 or specific status.
            // For now, let's show all who have tasks or are active.
            const data = Array.isArray(res) ? res : res.data || [];
            setActiveOnboardings(data.filter(u => u.tasks_total > 0)); 
        } catch (e) {
            console.error(e);
            toast.error('Error al cargar procesos de onboarding');
        } finally {
            setLoading(false);
        }
    };

    const loadTeamMembers = async () => {
        try {
            const res = await api.get(`/api/companies/${tenant.id}/members`);
            const members = res.data || (Array.isArray(res) ? res : []);
            
            // Map members to user structure for compatibility and deduplicate by user ID
            const uniqueUsers = new Map();
            members.forEach(m => {
                const user = m.user ? {
                    id: m.user.id,
                    full_name: m.user.full_name,
                    email: m.user.email
                } : m;
                
                if (user.id && !uniqueUsers.has(user.id)) {
                    uniqueUsers.set(user.id, user);
                }
            });
            
            setTeamMembers(Array.from(uniqueUsers.values()));
        } catch (e) {
            console.error("Failed to load team members", e);
        }
    };

    // --- Template Management ---
    const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false);
    const [templates, setTemplates] = useState([]);
    const [newTemplate, setNewTemplate] = useState({ title: '', checklist_group: 'accesos', sla_days: 0, description: '' });

    const loadTemplates = async () => {
        try {
            const res = await api.get(`/api/onboarding/templates/${tenant.id}`);
            setTemplates(Array.isArray(res) ? res : res.data || []);
        } catch (e) {
            console.error(e);
            toast.error('Error al cargar plantillas');
        }
    };

    const handleOpenTemplates = () => {
        setIsTemplatesModalOpen(true);
        loadTemplates();
    };

    const handleCreateTemplate = async () => {
        if (!newTemplate.title) return;
        try {
            await api.post(`/api/onboarding/templates/${tenant.id}`, newTemplate);
            toast.success('Plantilla creada');
            setNewTemplate({ title: '', checklist_group: 'accesos', sla_days: 0, description: '' });
            loadTemplates();
        } catch (e) {
            toast.error('Error al crear plantilla');
        }
    };

    const handleDeleteTemplate = async (id) => {
        if (!window.confirm('¿Eliminar esta plantilla?')) return;
        try {
            await api.delete(`/api/onboarding/templates/${id}`);
            toast.success('Plantilla eliminada');
            loadTemplates();
        } catch (e) {
            toast.error('Error al eliminar plantilla');
        }
    };

    const handleOpenNewModal = async () => {
        setIsNewModalOpen(true);
        try {
            // Fetch candidates (users of the tenant)
            const res = await api.get(`/api/companies/${tenant.id}/members`);
            const members = res.data || (Array.isArray(res) ? res : []);
            
            // Map and deduplicate
            const uniqueUsers = new Map();
            members.forEach(m => {
                const user = m.user ? {
                    id: m.user.id,
                    full_name: m.user.full_name,
                    email: m.user.email
                } : m;
                
                if (user.id && !uniqueUsers.has(user.id)) {
                    uniqueUsers.set(user.id, user);
                }
            });

            setCandidates(Array.from(uniqueUsers.values()));
        } catch (e) {
            toast.error('Error al cargar candidatos');
        }
    };

    const handleStartChecklist = async () => {
        if (!selectedCandidate) return;
        try {
            await api.post('/api/onboarding/internal/assign', { user_id: selectedCandidate, company_id: tenant.id });
            toast.success('Checklist iniciado correctamente');
            setIsNewModalOpen(false);
            loadData();
        } catch (e) {
            toast.error('Error al iniciar checklist');
        }
    };

    const handleViewDetails = async (user) => {
        setSelectedUser(user);
        setTasksLoading(true);
        try {
            const res = await api.get(`/api/onboarding/tasks/${user.id}?type=internal_onboarding`);
            setUserTasks(Array.isArray(res) ? res : []);
        } catch (e) {
            toast.error('Error al cargar tareas');
        } finally {
            setTasksLoading(false);
        }
    };

    const handleUpdateTask = async (taskId, updates) => {
        try {
            await api.put(`/api/onboarding/tasks/${taskId}`, updates);
            // Update local state
            setUserTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
            
            // If status changed to completed, toast
            if (updates.status === 'completed') {
                toast.success('Tarea completada');
            }
        } catch (e) {
            toast.error('Error al actualizar tarea');
        }
    };

    const handleCloseDetails = () => {
        setSelectedUser(null);
        setUserTasks([]);
        loadData(); // Refresh main list progress
    };

    const handleConfirmCompliance = async () => {
        if (!window.confirm('¿Confirmar que se ha completado todo el proceso de onboarding operativo?')) return;
        try {
            // Could call an API here to mark a specific flag if needed
            toast.success('Onboarding confirmado exitosamente');
            handleCloseDetails();
        } catch (e) {
            toast.error('Error al confirmar');
        }
    };

    const groupedTasks = {
        accesos: userTasks.filter(t => t.checklist_group === 'accesos'),
        induccion: userTasks.filter(t => t.checklist_group === 'induccion'),
        documentacion: userTasks.filter(t => t.checklist_group === 'documentacion'),
        others: userTasks.filter(t => !['accesos', 'induccion', 'documentacion'].includes(t.checklist_group))
    };

    const isAllCompleted = userTasks.length > 0 && userTasks.every(t => t.status === 'completed');

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-slate-900">Onboarding Operativo</h2>
                    <p className="text-sm text-slate-500">Gestión de incorporaciones, accesos y documentación.</p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={handleOpenTemplates}
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
                    >
                        <i className="bi bi-gear mr-2"></i>
                        Gestionar Plantillas
                    </button>
                    <button 
                        onClick={handleOpenNewModal}
                        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 transition"
                    >
                        <i className="bi bi-plus-lg mr-2"></i>
                        Nuevo Checklist
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-10 text-slate-500">Cargando...</div>
            ) : activeOnboardings.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                        <i className="bi bi-clipboard-check text-2xl text-slate-400"></i>
                    </div>
                    <h3 className="mt-2 text-sm font-semibold text-slate-900">No hay procesos activos</h3>
                    <p className="mt-1 text-sm text-slate-500">Inicia un nuevo checklist para comenzar el onboarding de un miembro.</p>
                    <div className="mt-6">
                        <button
                            onClick={handleOpenNewModal}
                            className="inline-flex items-center rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500"
                        >
                            <i className="bi bi-plus-lg mr-2"></i>
                            Nuevo Checklist
                        </button>
                    </div>
                </div>
            ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Usuario</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Rol</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Progreso</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Estado</th>
                                <th scope="col" className="relative px-6 py-3"><span className="sr-only">Acciones</span></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {activeOnboardings.map((user) => (
                                <tr key={user.id} className="hover:bg-slate-50 transition">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="h-8 w-8 rounded-full bg-brand/10 flex items-center justify-center text-brand font-bold text-xs">
                                                {user.full_name?.substring(0,2).toUpperCase()}
                                            </div>
                                            <div className="ml-4">
                                                <div className="text-sm font-medium text-slate-900">{user.full_name}</div>
                                                <div className="text-sm text-slate-500">{user.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-slate-900 capitalize">{user.platform_role?.replace('_', ' ')}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 w-24 bg-slate-200 rounded-full h-2">
                                                <div 
                                                    className="bg-brand h-2 rounded-full" 
                                                    style={{ width: `${user.progress}%` }}
                                                ></div>
                                            </div>
                                            <span className="text-xs font-medium text-slate-700">{user.progress}%</span>
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1">
                                            {user.tasks_completed} / {user.tasks_total} tareas
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {user.progress === 100 ? (
                                            <Badge color="green">Completado</Badge>
                                        ) : (
                                            <Badge color="blue">En progreso</Badge>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button 
                                            onClick={() => handleViewDetails(user)}
                                            className="text-brand hover:text-brand-600"
                                        >
                                            Ver detalles
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal: Templates */}
            <Modal
                open={isTemplatesModalOpen}
                onClose={() => setIsTemplatesModalOpen(false)}
                title="Gestionar Plantillas de Onboarding"
                maxWidth="max-w-4xl"
            >
                <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <h4 className="text-sm font-bold text-slate-900 mb-3">Nueva Plantilla</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
                            <div className="sm:col-span-4">
                                <label className="block text-xs font-medium text-slate-700">Título de la Tarea</label>
                                <input 
                                    type="text" 
                                    className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm p-2 border"
                                    value={newTemplate.title}
                                    onChange={e => setNewTemplate({...newTemplate, title: e.target.value})}
                                    placeholder="Ej: Configurar Email"
                                />
                            </div>
                            <div className="sm:col-span-3">
                                <label className="block text-xs font-medium text-slate-700">Grupo</label>
                                <select 
                                    className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm p-2 border"
                                    value={newTemplate.checklist_group}
                                    onChange={e => setNewTemplate({...newTemplate, checklist_group: e.target.value})}
                                >
                                    <option value="accesos">Accesos</option>
                                    <option value="induccion">Inducción</option>
                                    <option value="documentacion">Documentación</option>
                                    <option value="otros">Otros</option>
                                </select>
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-medium text-slate-700">SLA (Días)</label>
                                <input 
                                    type="number" 
                                    className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm p-2 border"
                                    value={newTemplate.sla_days}
                                    onChange={e => setNewTemplate({...newTemplate, sla_days: parseInt(e.target.value) || 0})}
                                />
                            </div>
                            <div className="sm:col-span-3">
                                <button 
                                    onClick={handleCreateTemplate}
                                    disabled={!newTemplate.title}
                                    className="w-full rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50"
                                >
                                    <i className="bi bi-plus-lg mr-1"></i> Agregar
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="border rounded-lg overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Tarea</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Grupo</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">SLA</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                                {templates.map(t => (
                                    <tr key={t.id}>
                                        <td className="px-6 py-4 text-sm text-slate-900">{t.title}</td>
                                        <td className="px-6 py-4 text-sm text-slate-500 capitalize">{t.checklist_group}</td>
                                        <td className="px-6 py-4 text-sm text-slate-500">{t.sla_days} días</td>
                                        <td className="px-6 py-4 text-right text-sm font-medium">
                                            <button 
                                                onClick={() => handleDeleteTemplate(t.id)}
                                                className="text-red-600 hover:text-red-900"
                                            >
                                                <i className="bi bi-trash"></i>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {templates.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="px-6 py-10 text-center text-slate-500 text-sm">
                                            No hay plantillas definidas. Agrega una arriba.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Modal>

            {/* Modal: Nuevo Checklist */}
            <Modal
                open={isNewModalOpen}
                onClose={() => setIsNewModalOpen(false)}
                title="Iniciar Onboarding Operativo"
            >
                <div className="space-y-4">
                    <p className="text-sm text-slate-500">
                        Selecciona un miembro del equipo para iniciar su lista de verificación de onboarding (Accesos, Inducción, Documentación).
                    </p>
                    
                    <div>
                        <label className="block text-sm font-medium text-slate-700">Miembro del equipo</label>
                        <select
                            value={selectedCandidate}
                            onChange={(e) => setSelectedCandidate(e.target.value)}
                            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm p-2 border"
                        >
                            <option value="">Selecciona un usuario...</option>
                            {candidates.map(c => (
                                <option key={c.id} value={c.id}>
                                    {c.full_name} ({c.email})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="mt-5 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={() => setIsNewModalOpen(false)}
                            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleStartChecklist}
                            disabled={!selectedCandidate}
                            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-600 disabled:opacity-50"
                        >
                            Iniciar Checklist
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Modal: Detalles / Checklist */}
            {selectedUser && (
                <Modal
                    open={true}
                    onClose={handleCloseDetails}
                    title={`Checklist: ${selectedUser.full_name}`}
                    maxWidth="max-w-4xl"
                >
                    <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
                        {/* Header Info */}
                        <div className="flex items-center justify-between bg-slate-50 p-4 rounded-lg border border-slate-200">
                            <div>
                                <h4 className="font-semibold text-slate-900">{selectedUser.email}</h4>
                                <p className="text-xs text-slate-500">Rol: {selectedUser.platform_role}</p>
                            </div>
                            <div className="text-right">
                                <div className="text-sm font-medium text-slate-700">
                                    Progreso General
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-32 bg-slate-200 rounded-full h-2.5">
                                        <div 
                                            className="bg-brand h-2.5 rounded-full transition-all duration-500" 
                                            style={{ width: `${(userTasks.filter(t => t.status === 'completed').length / (userTasks.length || 1)) * 100}%` }}
                                        ></div>
                                    </div>
                                    <span className="text-xs font-bold text-brand">
                                        {Math.round((userTasks.filter(t => t.status === 'completed').length / (userTasks.length || 1)) * 100)}%
                                    </span>
                                </div>
                            </div>
                        </div>

                        {tasksLoading ? (
                            <div className="text-center py-10">Cargando tareas...</div>
                        ) : (
                            <div className="space-y-8">
                                <ChecklistGroup 
                                    title="1. Accesos y Herramientas" 
                                    tasks={groupedTasks.accesos} 
                                    teamMembers={teamMembers}
                                    onUpdate={handleUpdateTask}
                                />
                                <ChecklistGroup 
                                    title="2. Inducción y Cultura" 
                                    tasks={groupedTasks.induccion} 
                                    teamMembers={teamMembers}
                                    onUpdate={handleUpdateTask}
                                />
                                <ChecklistGroup 
                                    title="3. Documentación Legal" 
                                    tasks={groupedTasks.documentacion} 
                                    teamMembers={teamMembers}
                                    onUpdate={handleUpdateTask}
                                />
                                {groupedTasks.others.length > 0 && (
                                    <ChecklistGroup 
                                        title="Otros" 
                                        tasks={groupedTasks.others} 
                                        teamMembers={teamMembers}
                                        onUpdate={handleUpdateTask}
                                    />
                                )}
                            </div>
                        )}

                        {/* Compliance Action */}
                        <div className="mt-8 border-t border-slate-200 pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-bold text-slate-900">Confirmación de Cumplimiento</h4>
                                    <p className="text-xs text-slate-500">
                                        Solo se puede confirmar si todos los pasos obligatorios están completos.
                                    </p>
                                </div>
                                <button
                                    onClick={handleConfirmCompliance}
                                    disabled={!isAllCompleted}
                                    className={`px-6 py-2 rounded-lg text-sm font-bold shadow-sm transition ${
                                        isAllCompleted 
                                            ? 'bg-green-600 text-white hover:bg-green-700' 
                                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                    }`}
                                >
                                    <i className="bi bi-check-circle-fill mr-2"></i>
                                    Confirmar Onboarding Completo
                                </button>
                            </div>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

function ChecklistGroup({ title, tasks, teamMembers, onUpdate }) {
    if (!tasks || tasks.length === 0) return null;

    return (
        <div>
            <h3 className="text-md font-bold text-slate-800 border-b border-slate-200 pb-2 mb-3">
                {title}
            </h3>
            <div className="space-y-3">
                {tasks.map(task => (
                    <TaskItem 
                        key={task.id} 
                        task={task} 
                        teamMembers={teamMembers} 
                        onUpdate={onUpdate} 
                    />
                ))}
            </div>
        </div>
    );
}

function TaskItem({ task, teamMembers, onUpdate }) {
    const isCompleted = task.status === 'completed';
    const isOverdue = task.sla_due_at && new Date(task.sla_due_at) < new Date() && !isCompleted;

    return (
        <div className={`flex items-start gap-4 p-3 rounded-lg border transition ${isCompleted ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-200 hover:border-brand/30'}`}>
            <div className="pt-1">
                <input
                    type="checkbox"
                    checked={isCompleted}
                    onChange={(e) => onUpdate(task.id, { status: e.target.checked ? 'completed' : 'pending' })}
                    className="h-5 w-5 rounded border-slate-300 text-brand focus:ring-brand cursor-pointer"
                />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                    <div>
                        <p className={`text-sm font-medium ${isCompleted ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                            {task.title}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{task.description}</p>
                    </div>
                    {isOverdue && (
                        <span className="inline-flex items-center rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">
                            Vencido
                        </span>
                    )}
                </div>
                
                <div className="mt-3 flex items-center gap-4">
                    {/* Responsible Assignment */}
                    <div className="flex items-center gap-2">
                        <i className="bi bi-person text-slate-400 text-xs"></i>
                        <select
                            value={task.responsible_id || ''}
                            onChange={(e) => onUpdate(task.id, { responsible_id: e.target.value })}
                            className="text-xs border-none bg-transparent p-0 text-slate-600 focus:ring-0 cursor-pointer hover:text-brand"
                        >
                            <option value="">Sin asignar</option>
                            {teamMembers.map(m => (
                                <option key={m.id} value={m.id}>{m.full_name}</option>
                            ))}
                        </select>
                    </div>

                    {/* SLA Display */}
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <i className="bi bi-calendar text-slate-400"></i>
                        <span>
                            {task.sla_due_at ? new Date(task.sla_due_at).toLocaleDateString() : 'Sin fecha'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
