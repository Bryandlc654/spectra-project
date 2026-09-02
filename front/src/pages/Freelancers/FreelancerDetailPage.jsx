import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createApi } from '../../lib/api';
import { useToast } from '../../components/ToastProvider';
import { useAuth } from '../../context/AuthContext';
import Modal from '../../components/Modal';
import ConfirmModal from '../../components/ConfirmModal';
import { hasAccess, PLATFORM_ROLES } from '../../lib/platformRoles';

export default function FreelancerDetailPage({ apiUrl, token }) {
    const { id } = useParams();
    const navigate = useNavigate();
    const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
    const toast = useToast();
    const { user: currentUser } = useAuth();
    const isFreelancerRole = currentUser?.platform_role === PLATFORM_ROLES.FREELANCER || currentUser?.platform_role === 'freelance';
    const canAccessDirectory = hasAccess(currentUser?.platform_role || currentUser?.role, 'freelancers', currentUser?.roles);

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [err, setErr] = useState('');
    const [notFound, setNotFound] = useState(false);

    const [activeTab, setActiveTab] = useState('profile');

    const [openEdit, setOpenEdit] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [saving, setSaving] = useState(false);

    const [confirmBlock, setConfirmBlock] = useState(null); // boolean or null
    const [openReview, setOpenReview] = useState(false);
    const [reviewRating, setReviewRating] = useState(5);
    const [reviewComment, setReviewComment] = useState('');
    const [savingReview, setSavingReview] = useState(false);

    useEffect(() => {
        load();
        // eslint-disable-next-line
    }, [id]);

    async function load() {
        setLoading(true);
        setErr('');
        setNotFound(false);
        try {
            const res = await api.get(`/api/freelancers/${id}?_t=${Date.now()}`);
            setData(res);
        } catch (e) {
            if (e.status === 404) {
                setNotFound(true);
            } else {
                setErr(e.message || 'Error cargando freelancer');
            }
        } finally {
            setLoading(false);
        }
    }

    function handleEditOpen() {
        if (!data?.user) return;
        const u = data.user;
        setEditForm({
            full_name: u.full_name,
            national_id: u.national_id || '',
            years_experience: u.years_experience || '',
            area: u.area || '',
            country: u.country || '',
            city: u.city || '',
            phone: u.phone || '',
            bio: u.bio || '',
            skills: u.skills || ''
        });
        setOpenEdit(true);
    }

    async function handleEditSubmit(e) {
        e.preventDefault();
        setSaving(true);
        try {
            await api.put(`/api/freelancers/${id}`, editForm);
            toast.success('Freelancer actualizado');
            setOpenEdit(false);
            load();
        } catch (e) {
            toast.error(e.message || 'Error actualizando');
        } finally {
            setSaving(false);
        }
    }

    async function handleBlock() {
        if (!data?.user) return;
        const isBlocked = data.user.status !== 'active';
        try {
            const action = isBlocked ? 'unblock' : 'block';
            await api.post(`/api/freelancers/${id}/${action}`);
            toast.success(isBlocked ? 'Freelancer desbloqueado' : 'Freelancer bloqueado');
            setConfirmBlock(null);
            load();
        } catch (e) {
            toast.error(e.message);
        }
    }

    async function handleCreateReview(e) {
        e.preventDefault();
        if (!reviewRating || reviewRating < 1 || reviewRating > 5) {
            toast.error('Selecciona una calificación entre 1 y 5');
            return;
        }
        setSavingReview(true);
        try {
            await api.post(`/api/freelancers/${id}/reviews`, {
                rating: reviewRating,
                comment: reviewComment
            });
            toast.success('Reseña enviada para revisión');
            setOpenReview(false);
            setReviewComment('');
            setReviewRating(5);
            load();
        } catch (e) {
            toast.error(e.message || 'Error al registrar la reseña');
        } finally {
            setSavingReview(false);
        }
    }

    // Skeleton Loader
    if (loading) {
        return (
            <div className="p-6 max-w-5xl mx-auto animate-pulse">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div className="space-y-3 w-full max-w-md">
                        <div className="h-4 bg-slate-200 rounded w-32"></div>
                        <div className="h-8 bg-slate-200 rounded w-3/4"></div>
                        <div className="flex gap-2">
                            <div className="h-5 bg-slate-200 rounded w-24"></div>
                            <div className="h-5 bg-slate-200 rounded w-20"></div>
                        </div>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                        <div className="h-10 bg-slate-200 rounded w-24"></div>
                        <div className="h-10 bg-slate-200 rounded w-24"></div>
                    </div>
                </div>
                <div className="border-b border-slate-200 mb-6">
                    <div className="flex gap-6">
                        <div className="h-8 bg-slate-200 rounded w-20"></div>
                        <div className="h-8 bg-slate-200 rounded w-20"></div>
                        <div className="h-8 bg-slate-200 rounded w-20"></div>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-6 h-64"></div>
            </div>
        );
    }

    if (notFound) {
        return (
            <div className="p-8 max-w-xl mx-auto text-center mt-12">
                <div className="mb-4 text-6xl text-slate-200">
                    <i className="bi bi-person-x" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900 mb-2">Freelancer no encontrado</h1>
                <p className="text-slate-500 mb-8 text-sm">
                    Es posible que este freelancer haya sido eliminado o que el enlace no sea válido.
                </p>
                {canAccessDirectory && (
                    <button
                        onClick={() => navigate('/dashboard/freelancers')}
                        className="px-6 py-2.5 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors shadow-sm shadow-brand/20"
                    >
                        Volver al directorio
                    </button>
                )}
            </div>
        );
    }

    if (err) {
        return (
            <div className="p-8 max-w-xl mx-auto text-center mt-12">
                <div className="mb-4 text-6xl text-red-100 text-red-500">
                    <i className="bi bi-exclamation-circle" />
                </div>
                <h1 className="text-xl font-semibold text-slate-900 mb-2">No se pudo cargar el freelancer</h1>
                <p className="text-slate-500 mb-8 text-sm">{err}</p>
                <div className="flex justify-center gap-3">
                    <button
                        onClick={load}
                        className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors"
                    >
                        Reintentar
                    </button>
                    {canAccessDirectory && (
                        <button
                            onClick={() => navigate('/dashboard/freelancers')}
                            className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            Volver al directorio
                        </button>
                    )}
                </div>
            </div>
        );
    }
    
    if (!data) return null;

    const { user, reviews, reviews_summary } = data;
    const averageRating = reviews_summary && typeof reviews_summary.avg_rating !== 'undefined' && reviews_summary.avg_rating !== null
        ? Number(reviews_summary.avg_rating)
        : 0;
    const totalReviews = reviews_summary && reviews_summary.total_reviews ? Number(reviews_summary.total_reviews) : reviews.length;
    
    const isBlocked = user.status !== 'active';
    const isSelf = currentUser?.id && currentUser.id === user.id;
    

    return (
        <div className="p-4 sm:p-6 max-w-6xl mx-auto">
             {/* Header */}
             <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
                <div className="w-full lg:w-auto">
                    {canAccessDirectory && (
                        <button 
                            onClick={() => navigate('..')} 
                            className="group text-slate-500 hover:text-brand text-sm mb-3 flex items-center gap-1 transition-colors"
                        >
                            <i className="bi bi-arrow-left group-hover:-translate-x-1 transition-transform"></i>
                            Volver al directorio
                        </button>
                    )}
                    
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                        <div className="w-16 h-16 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold text-3xl shrink-0">
                            {user.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                                {user.full_name}
                            </h1>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-1">
                                <span className="text-slate-500 text-sm flex items-center gap-1">
                                    <i className="bi bi-envelope"></i> {user.email}
                                </span>
                                <span className="text-slate-500 text-sm flex items-center gap-1">
                                    <i className="bi bi-card-text"></i> ID: {user.national_id || '—'}
                                </span>
                                <span className="text-slate-500 text-sm flex items-center gap-1">
                                    <i className="bi bi-hash"></i> Código: {user.freelancer_code || '—'}
                                </span>
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide border ${
                                    user.status === 'active' 
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-red-50 text-red-700 border-red-200'
                                }`}>
                                    {user.status === 'active' ? 'Activo' : 'Suspendido'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {totalReviews > 0 && (
                        <div className="mt-3 flex items-center gap-2 ml-0 sm:ml-20">
                            <div className="flex text-amber-400 text-sm">
                                {[...Array(5)].map((_, i) => (
                                    <i
                                        key={i}
                                        className={`bi ${i < Math.round(averageRating) ? 'bi-star-fill' : 'bi-star'}`}
                                    ></i>
                                ))}
                            </div>
                            <span className="text-xs font-medium text-slate-600">
                                {averageRating.toFixed(1)} / 5 · <span className="text-slate-400">({totalReviews} reseña{totalReviews !== 1 ? 's' : ''})</span>
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                    <button 
                        onClick={handleEditOpen} 
                        className="flex-1 lg:flex-none justify-center px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 hover:border-slate-400 font-medium text-sm transition-all shadow-sm"
                    >
                        <i className="bi bi-pencil mr-2"></i> Editar
                    </button>
                    {!isFreelancerRole && (
                        <>
                            <button
                                onClick={() => setOpenReview(true)}
                                className="flex-1 lg:flex-none justify-center px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 hover:bg-amber-100 font-medium text-sm transition-colors shadow-sm"
                                disabled={isSelf}
                            >
                                <i className="bi bi-star-half mr-2"></i> Calificar
                            </button>
                            <button 
                                onClick={() => setConfirmBlock(true)} 
                                className={`flex-1 lg:flex-none justify-center px-4 py-2 border rounded-lg font-medium text-sm transition-colors shadow-sm ${
                                    isBlocked 
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                                    : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                                }`}
                                disabled={isSelf}
                            >
                                {isBlocked ? (
                                    <><i className="bi bi-check-circle mr-2"></i> Desbloquear</>
                                ) : (
                                    <><i className="bi bi-slash-circle mr-2"></i> Bloquear</>
                                )}
                            </button>
                        </>
                    )}
                </div>
             </div>

             {/* Tabs */}
             <div className="border-b border-slate-200 mb-6 overflow-x-auto">
                <nav className="flex gap-6 min-w-max">
                    {[
                        { id: 'profile', label: 'Perfil', icon: 'bi-person' },
                        { id: 'reviews', label: 'Reseñas', icon: 'bi-star' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                                activeTab === tab.id
                                ? 'border-brand text-brand'
                                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                            }`}
                        >
                            <i className={`bi ${tab.icon}`}></i>
                            {tab.label}
                        </button>
                    ))}
                </nav>
             </div>

             {/* Content */}
             <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 min-h-[400px]">
                {activeTab === 'profile' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fadeIn">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2 pb-2 border-b border-slate-100">
                                <i className="bi bi-briefcase text-slate-400"></i>
                                Información Profesional
                            </h3>
                            <dl className="space-y-6">
                                <div>
                                    <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Área / Especialidad</dt>
                                    <dd className="text-slate-900 font-medium">{user.area || <span className="text-slate-400 italic">No especificado</span>}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Años de experiencia</dt>
                                    <dd className="text-slate-900 font-medium">{user.years_experience ? `${user.years_experience} años` : <span className="text-slate-400 italic">No especificado</span>}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Habilidades (Skills)</dt>
                                    <dd className="text-slate-900">
                                        {user.skills ? (
                                            <div className="flex flex-wrap gap-2">
                                                {user.skills.split(',').map((s, i) => (
                                                    <span key={i} className="px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium">
                                                        {s.trim()}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : <span className="text-slate-400 italic">Sin habilidades registradas</span>}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Bio</dt>
                                    <dd className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap bg-slate-50 p-4 rounded-lg border border-slate-100">
                                        {user.bio || <span className="text-slate-400 italic">Sin biografía disponible.</span>}
                                    </dd>
                                </div>
                            </dl>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2 pb-2 border-b border-slate-100">
                                <i className="bi bi-geo-alt text-slate-400"></i>
                                Ubicación y Contacto
                            </h3>
                            <dl className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">País</dt>
                                        <dd className="text-slate-900 font-medium">{user.country || '-'}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Ciudad</dt>
                                        <dd className="text-slate-900 font-medium">{user.city || '-'}</dd>
                                    </div>
                                </div>
                                <div>
                                    <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Teléfono</dt>
                                    <dd className="text-slate-900 font-medium flex items-center gap-2">
                                        {user.phone ? (
                                            <>
                                                <i className="bi bi-telephone text-slate-400 text-xs"></i>
                                                {user.phone}
                                            </>
                                        ) : <span className="text-slate-400 italic">No registrado</span>}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Fecha de registro</dt>
                                    <dd className="text-slate-900 font-medium">
                                        {new Date(user.created_at).toLocaleDateString('es-ES', { 
                                            year: 'numeric', month: 'long', day: 'numeric' 
                                        })}
                                    </dd>
                                </div>
                            </dl>
                        </div>
                    </div>
                )}

                {activeTab === 'reviews' && (
                    <div className="animate-fadeIn">
                        <h3 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
                            <i className="bi bi-star text-slate-400"></i>
                            Reseñas Recibidas
                        </h3>
                        {reviews.length === 0 ? (
                            <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                                <i className="bi bi-chat-left-text text-4xl text-slate-300 mb-3 block"></i>
                                <p className="text-slate-500 text-sm font-medium">No hay reseñas registradas aún.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4">
                                {reviews.map(r => (
                                    <div key={r.id} className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold">
                                                    {(r.reviewer_name || 'U').charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-slate-900">{r.reviewer_name || 'Usuario'}</div>
                                                    <div className="text-xs text-slate-500">{new Date(r.created_at).toLocaleDateString(undefined, { dateStyle: 'long' })}</div>
                                                </div>
                                            </div>
                                            <div className="flex text-amber-400 text-sm bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">
                                                {[...Array(5)].map((_, i) => (
                                                    <i key={i} className={`bi ${i < r.rating ? 'bi-star-fill' : 'bi-star'}`}></i>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="pl-13 ml-13">
                                             <p className="text-slate-700 leading-relaxed">"{r.comment}"</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
             </div>

             <Modal open={openEdit} onClose={() => setOpenEdit(false)} title="Editar Perfil de Freelancer" size="xl">
                <form onSubmit={handleEditSubmit} className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo</label>
                            <input 
                                type="text" 
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none" 
                                required
                                value={editForm.full_name || ''} 
                                onChange={e => setEditForm({...editForm, full_name: e.target.value})} 
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Cédula / ID Nacional</label>
                            <input 
                                type="text" 
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
                                value={editForm.national_id || ''} 
                                onChange={e => setEditForm({...editForm, national_id: e.target.value})} 
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Años Exp.</label>
                            <input 
                                type="number" 
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
                                value={editForm.years_experience || ''} 
                                onChange={e => setEditForm({...editForm, years_experience: e.target.value})} 
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Área</label>
                            <input 
                                type="text" 
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
                                value={editForm.area || ''} 
                                onChange={e => setEditForm({...editForm, area: e.target.value})} 
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">País</label>
                            <input 
                                type="text" 
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
                                value={editForm.country || ''} 
                                onChange={e => setEditForm({...editForm, country: e.target.value})} 
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Ciudad</label>
                            <input 
                                type="text" 
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
                                value={editForm.city || ''} 
                                onChange={e => setEditForm({...editForm, city: e.target.value})} 
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                        <input 
                            type="text" 
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
                            value={editForm.phone || ''} 
                            onChange={e => setEditForm({...editForm, phone: e.target.value})} 
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Habilidades (separadas por coma)</label>
                        <input 
                            type="text" 
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
                            placeholder="Ej: React, PHP, Design"
                            value={editForm.skills || ''} 
                            onChange={e => setEditForm({...editForm, skills: e.target.value})} 
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Biografía</label>
                        <textarea 
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
                            rows="4"
                            value={editForm.bio || ''} 
                            onChange={e => setEditForm({...editForm, bio: e.target.value})} 
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button 
                            type="button" 
                            onClick={() => setOpenEdit(false)}
                            className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium text-sm transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit" 
                            disabled={saving}
                            className="px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark font-medium text-sm transition-colors shadow-sm disabled:opacity-50"
                        >
                            {saving ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </form>
             </Modal>

             <Modal open={openReview} onClose={() => setOpenReview(false)} title="Agregar Reseña">
                <form onSubmit={handleCreateReview} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Calificación</label>
                        <div className="flex gap-2 text-2xl text-amber-400">
                            {[1, 2, 3, 4, 5].map(star => (
                                <button
                                    key={star}
                                    type="button"
                                    onClick={() => setReviewRating(star)}
                                    className="focus:outline-none hover:scale-110 transition-transform"
                                >
                                    <i className={`bi ${star <= reviewRating ? 'bi-star-fill' : 'bi-star'}`}></i>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Comentario</label>
                        <textarea 
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none"
                            rows="4"
                            placeholder="Describe tu experiencia trabajando con este freelancer..."
                            value={reviewComment} 
                            onChange={e => setReviewComment(e.target.value)} 
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button 
                            type="button" 
                            onClick={() => setOpenReview(false)}
                            className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium text-sm transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit" 
                            disabled={savingReview}
                            className="px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark font-medium text-sm transition-colors shadow-sm disabled:opacity-50"
                        >
                            {savingReview ? 'Enviando...' : 'Enviar Reseña'}
                        </button>
                    </div>
                </form>
             </Modal>

             <ConfirmModal
                open={!!confirmBlock}
                onClose={() => setConfirmBlock(null)}
                onConfirm={handleBlock}
                title={isBlocked ? "Desbloquear Freelancer" : "Bloquear Freelancer"}
                message={isBlocked 
                    ? `¿Estás seguro que deseas desbloquear a ${user.full_name}? Podrá volver a acceder a la plataforma.` 
                    : `¿Estás seguro que deseas bloquear a ${user.full_name}? No podrá acceder a la plataforma hasta que sea desbloqueado.`}
                confirmText={isBlocked ? "Desbloquear" : "Bloquear"}
                cancelText="Cancelar"
            />
        </div>
    );
}
