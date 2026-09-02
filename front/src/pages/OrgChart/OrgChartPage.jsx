import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../components/ToastProvider';

export default function OrgChartPage({ apiUrl, token }) {
    const { toast } = useToast();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editManagerModal, setEditManagerModal] = useState(null); // { user }

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
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await api.get('/api/onboarding/org-chart');
            setUsers(data);
        } catch (e) {
            toast.error('Error al cargar organigrama');
        } finally {
            setLoading(false);
        }
    };

    const handleAssignManager = async (userId, managerId) => {
        try {
            await api.post('/api/onboarding/assign-manager', { user_id: userId, manager_id: managerId });
            toast.success('Manager asignado correctamente');
            setEditManagerModal(null);
            loadData();
        } catch (e) {
            toast.error('Error al asignar manager');
        }
    };

    const buildTree = (userList) => {
        const map = {};
        const roots = [];
        
        // Initialize map
        userList.forEach(u => {
            map[u.id] = { ...u, children: [] };
        });

        // Link children
        userList.forEach(u => {
            if (u.manager_id && map[u.manager_id]) {
                map[u.manager_id].children.push(map[u.id]);
            } else {
                roots.push(map[u.id]);
            }
        });

        return roots;
    };

    const treeData = useMemo(() => buildTree(users), [users]);

    if (loading) return <div className="p-8 text-center">Cargando organigrama...</div>;

    return (
        <div className="p-6 h-screen flex flex-col">
            <div className="mb-6 flex justify-between items-center">
                <h1 className="text-2xl font-bold text-slate-900">Organigrama</h1>
                <div className="text-sm text-slate-500">
                    {users.length} Empleados
                </div>
            </div>
            
            <div className="flex-1 overflow-auto bg-slate-50 rounded-2xl border border-slate-200 p-8 shadow-inner">
                <div className="min-w-max flex justify-center">
                    {treeData.map(root => (
                        <TreeNode key={root.id} node={root} onEditManager={(u) => setEditManagerModal(u)} />
                    ))}
                </div>
            </div>

            {editManagerModal && (
                <ManagerSelectionModal 
                    user={editManagerModal} 
                    allUsers={users} 
                    onClose={() => setEditManagerModal(null)} 
                    onSave={handleAssignManager} 
                />
            )}
        </div>
    );
}

const ManagerSelectionModal = ({ user, allUsers, onClose, onSave }) => {
    const [selectedManager, setSelectedManager] = useState(user.manager_id || '');

    // Filter potential managers: exclude self
    // Ideally we should also exclude descendants to prevent cycles, but for now just self.
    const potentialManagers = allUsers.filter(u => u.id !== user.id);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Asignar Manager para {user.full_name}</h3>
                
                <div className="mb-4">
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Manager</label>
                    <select 
                        value={selectedManager} 
                        onChange={e => setSelectedManager(e.target.value)}
                        className="w-full rounded-xl border-slate-200 text-sm"
                    >
                        <option value="">-- Sin Manager (Raíz) --</option>
                        {potentialManagers.map(m => (
                            <option key={m.id} value={m.id}>{m.full_name} ({m.platform_role})</option>
                        ))}
                    </select>
                </div>

                <div className="flex justify-end gap-2">
                    <button 
                        onClick={onClose}
                        className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={() => onSave(user.id, selectedManager || null)}
                        className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90"
                    >
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    );
};

const TreeNode = ({ node, onEditManager }) => {
    const [expanded, setExpanded] = useState(true);
    const hasChildren = node.children && node.children.length > 0;

    return (
        <div className="flex flex-col items-center mx-4">
            <div className="relative group">
                <div 
                    className={`
                        relative z-10 p-4 rounded-xl border-2 bg-white shadow-sm transition-all
                        ${hasChildren ? 'cursor-pointer hover:border-blue-400' : 'border-slate-200'}
                        w-64 mb-8 text-center
                    `}
                    onClick={() => hasChildren && setExpanded(!expanded)}
                >
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold flex items-center justify-center text-lg mx-auto mb-3 shadow-md">
                        {node.full_name.substring(0, 2).toUpperCase()}
                    </div>
                    <h3 className="font-bold text-slate-900 truncate">{node.full_name}</h3>
                    <p className="text-xs text-slate-500 truncate">{node.email}</p>
                    <span className="inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-600">
                        {node.platform_role}
                    </span>

                    {hasChildren && (
                        <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 bg-white rounded-full border border-slate-200 shadow-sm px-1.5 py-0.5">
                            <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    )}
                </div>
                
                {/* Edit Button (Visible on Hover) */}
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        onEditManager(node);
                    }}
                    className="absolute -top-2 -right-2 z-20 hidden h-8 w-8 items-center justify-center rounded-full bg-white text-slate-400 shadow-md ring-1 ring-slate-200 hover:text-brand hover:ring-brand group-hover:flex"
                    title="Asignar Manager"
                >
                    <i className="bi bi-pencil-fill text-xs" />
                </button>
            </div>

            {hasChildren && expanded && (
                <div className="relative flex items-start pt-8">
                    {/* Vertical line from parent */}
                    <div className="absolute top-0 left-1/2 w-px h-8 bg-slate-300 transform -translate-x-1/2"></div>
                    
                    <div className="flex">
                        {node.children.map((child, index) => (
                            <div key={child.id} className="relative flex flex-col items-center">
                                {/* Connector Lines */}
                                <div className="w-full h-8 absolute -top-8 left-0 flex">
                                    <div className={`h-full w-1/2 border-t-2 border-slate-300 ${index === 0 ? 'border-t-0' : ''} ${index === node.children.length - 1 ? 'border-r-0' : 'border-r-0'}`}></div> {/* Left half */}
                                    <div className={`h-full w-1/2 border-t-2 border-slate-300 ${index === node.children.length - 1 ? 'border-t-0' : ''} ${index === 0 ? 'border-l-0' : 'border-l-0'}`}></div> {/* Right half */}
                                </div>
                                {/* Center Vertical Down */}
                                <div className="absolute -top-8 h-8 w-px bg-slate-300"></div>

                                <TreeNode node={child} onEditManager={onEditManager} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
