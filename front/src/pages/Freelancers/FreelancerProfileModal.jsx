import React, { useEffect, useState } from 'react';
import { createApi } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import Modal from '../../components/Modal';

const STATUS_LABEL = {
  active: 'Activo',
  suspended: 'Suspendido',
  invited: 'Invitado'
};

export default function FreelancerProfileModal({ open, freelancerId, apiUrl, onClose, onEdit }) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!open || !freelancerId) return;

    const api = createApi({ baseUrl: apiUrl, token });
    setLoading(true);
    setErr('');
    setData(null);

    api.get(`/api/freelancers/${freelancerId}?_t=${Date.now()}`)
      .then((res) => {
        if (!cancelled) setData(res || null);
      })
      .catch((e) => {
        if (!cancelled) setErr(e.message || 'Error cargando el freelancer');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, freelancerId, apiUrl, token]);

  const user = data?.user;
  const reviews = data?.reviews || [];
  const summary = data?.reviews_summary || null;
  const status = user?.status || 'active';

  return (
    <Modal open={open} title="Perfil del Freelancer" onClose={onClose} size="3xl">
      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500">Cargando perfil...</div>
      ) : err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{err}</div>
      ) : !user ? (
        <div className="py-10 text-center text-sm text-slate-500">Freelancer no encontrado.</div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand/10 text-xl font-bold text-brand">
                {String(user.full_name || 'F').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-lg font-bold text-slate-900">{user.full_name || 'Sin nombre'}</div>
                <div className="text-sm text-slate-600">{user.email}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 font-semibold ${
                    status === 'active'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : status === 'invited'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {STATUS_LABEL[status] || status}
                  </span>
                  {user.freelancer_code && (
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 font-mono text-slate-700">
                      {user.freelancer_code}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {typeof onEdit === 'function' && (
              <button
                type="button"
                onClick={() => onEdit(user)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <i className="bi bi-pencil" />
                Editar perfil
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Área / Especialidad</div>
              <div className="mt-1 text-sm font-medium text-slate-800">{user.area || '—'}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Años de experiencia</div>
              <div className="mt-1 text-sm font-medium text-slate-800">{user.years_experience ? `${user.years_experience} años` : '—'}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">País / Ciudad</div>
              <div className="mt-1 text-sm font-medium text-slate-800">{[user.country, user.city].filter(Boolean).join(', ') || '—'}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Teléfono</div>
              <div className="mt-1 text-sm font-medium text-slate-800">{user.phone || '—'}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Documento</div>
              <div className="mt-1 text-sm font-medium text-slate-800">{user.national_id || '—'}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Registro</div>
              <div className="mt-1 text-sm font-medium text-slate-800">{user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</div>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Habilidades</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {user.skills ? user.skills.split(',').map((s, i) => (
                <span key={i} className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                  {s.trim()}
                </span>
              )) : <span className="text-sm text-slate-400">Sin habilidades registradas.</span>}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Bio</div>
            <p className="mt-2 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              {user.bio || 'Sin biografía disponible.'}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Reseñas</div>
              <div className="text-xs text-slate-500">
                {summary?.total_reviews ? `${Number(summary.avg_rating || 0).toFixed(1)} / 5 · ${summary.total_reviews} reseña(s)` : `${reviews.length} reseña(s)`}
              </div>
            </div>
            {reviews.length === 0 ? (
              <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">Sin reseñas registradas.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {reviews.slice(0, 3).map((r) => (
                  <div key={r.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">{r.reviewer_name || 'Usuario'}</span>
                      <span className="text-amber-500">{'★'.repeat(Number(r.rating) || 0)}</span>
                    </div>
                    {r.comment && <p className="mt-1 text-sm text-slate-600">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
