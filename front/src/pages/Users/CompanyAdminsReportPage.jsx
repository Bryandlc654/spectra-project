import React, { useEffect, useMemo, useState } from 'react';
import { createApi } from '../../lib/api';
import { useToast } from '../../components/ToastProvider';
import Modal from '../../components/Modal';

export default function CompanyAdminsReportPage({ apiUrl, token }) {
  const api = useMemo(() => createApi({ baseUrl: apiUrl, token }), [apiUrl, token]);
  const toast = useToast();

  const [q, setQ] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [passwordUser, setPasswordUser] = useState(null);
  const [password1, setPassword1] = useState('');
  const [password2, setPassword2] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (companyId.trim()) params.set('company_id', companyId.trim());
      const res = await api.get(`/api/users/company-admins?${params.toString()}`);
      const data = res?.data || [];
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e.message || 'Error cargando reporte');
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (companyId.trim()) params.set('company_id', companyId.trim());
    const url = `${apiUrl}/api/users/company-admins/export?${params.toString()}`;
    window.open(url, '_blank');
  }

  async function savePassword(e) {
    e.preventDefault();
    if (!passwordUser) return;

    const p1 = password1.trim();
    const p2 = password2.trim();

    if (p1.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (p1 !== p2) {
      toast.error('Las contraseñas no coinciden');
      return;
    }

    setSavingPassword(true);
    try {
      await api.post(`/api/users/${passwordUser.user_id}/set-password`, { password: p1 });
      toast.success('Contraseña actualizada. Se invalidaron las sesiones activas.');
      setPasswordUser(null);
      setPassword1('');
      setPassword2('');
    } catch (e2) {
      toast.error(e2.message || 'Error al actualizar contraseña');
    } finally {
      setSavingPassword(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Company Admins por empresa</h1>
          <p className="mt-1 text-sm text-slate-500">Lista de usuarios con rol company_admin y su empresa asignada.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all"
            type="button"
          >
            <i className="bi bi-download" />
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-1 gap-3 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Buscar</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
                placeholder="Nombre, email o empresa..."
              />
            </div>
            <div className="w-full md:w-64">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Company ID</label>
              <input
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
                placeholder="Filtrar por ID de empresa"
              />
            </div>
          </div>

          <button
            onClick={() => {
              load().catch(() => toast.error('Error al aplicar filtros'));
            }}
            disabled={loading}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            type="button"
          >
            Aplicar
          </button>
        </div>

        {err ? (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {err}
          </div>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-slate-500">
                <th className="py-3 px-2">Usuario</th>
                <th className="py-3 px-2">Email</th>
                <th className="py-3 px-2">Empresa</th>
                <th className="py-3 px-2">Estado</th>
                <th className="py-3 px-2">Asignación</th>
                <th className="py-3 px-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={`${r.user_id}-${r.company_id}`} className="hover:bg-slate-50/60">
                  <td className="py-3 px-2">
                    <div className="font-semibold text-slate-900">{r.full_name || '—'}</div>
                    <div className="text-xs text-slate-500">{r.user_id}</div>
                  </td>
                  <td className="py-3 px-2 text-slate-700">{r.email || '—'}</td>
                  <td className="py-3 px-2">
                    <div className="font-semibold text-slate-900">{r.trade_name || r.legal_name || '—'}</div>
                    <div className="text-xs text-slate-500">{r.company_id}</div>
                  </td>
                  <td className="py-3 px-2">
                    <div className="inline-flex flex-col gap-1">
                      <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold border bg-slate-50 text-slate-700 border-slate-200">
                        Usuario: {r.user_status || '—'}
                      </span>
                      <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold border bg-slate-50 text-slate-700 border-slate-200">
                        Empresa: {r.company_status || '—'}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-2 text-slate-700">
                    <div className="text-xs text-slate-500">Status: {r.membership_status || '—'}</div>
                    <div className="text-xs text-slate-500">Desde: {r.membership_created_at || '—'}</div>
                  </td>
                  <td className="py-3 px-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setPasswordUser(r);
                        setPassword1('');
                        setPassword2('');
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      title="Cambiar contraseña"
                    >
                      <i className="bi bi-key" />
                      Cambiar contraseña
                    </button>
                  </td>
                </tr>
              ))}

              {!rows.length && !loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    No se encontraron company_admins.
                  </td>
                </tr>
              ) : null}

              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    Cargando...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={!!passwordUser}
        title="Cambiar contraseña"
        onClose={() => {
          if (savingPassword) return;
          setPasswordUser(null);
          setPassword1('');
          setPassword2('');
        }}
        size="md"
      >
        <form onSubmit={savePassword} className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">{passwordUser?.full_name || '—'}</div>
            <div className="text-xs text-slate-600">{passwordUser?.email || '—'}</div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">Nueva contraseña</label>
            <input
              type="password"
              value={password1}
              onChange={(e) => setPassword1(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
              placeholder="••••••••"
              minLength={8}
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">Confirmar contraseña</label>
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:bg-white focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
              placeholder="••••••••"
              minLength={8}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                if (savingPassword) return;
                setPasswordUser(null);
                setPassword1('');
                setPassword2('');
              }}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              disabled={savingPassword}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingPassword}
              className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-70"
            >
              {savingPassword ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
