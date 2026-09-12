import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import SignaturePad from '../components/SignaturePad';
import { resolveApiUrl } from '../lib/api';

export default function SignContractPage({ apiUrl }) {
    const { token } = useParams();
    const base = useMemo(() => String(apiUrl || resolveApiUrl()).replace(/\/$/, ''), [apiUrl]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [data, setData] = useState(null);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');

    const padRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError('');
        fetch(`${base}/api/sign/${encodeURIComponent(token)}`)
            .then(async res => {
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(json?.message || json?.error || 'Enlace de firma inválido');
                if (cancelled) return;
                setData(json);
                setName(json.signer_name || '');
                setEmail(json.signer_email || '');
            })
            .catch(e => {
                if (!cancelled) setError(e?.message || 'No se pudo cargar el documento');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [base, token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const signature = padRef.current?.getSignature?.() || null;
        const svg = padRef.current?.getSignatureSvg?.() || null;
        if (!signature && !svg?.path) {
            setSubmitError('Dibuja tu firma en el recuadro para continuar.');
            return;
        }
        setSubmitError('');
        setSubmitting(true);
        try {
            const res = await fetch(`${base}/api/sign/${encodeURIComponent(token)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    signature,
                    signature_svg: svg?.path || null,
                    signature_width: svg?.width || null,
                    signature_height: svg?.height || null,
                    name: name.trim(),
                    email: email.trim()
                })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.message || json?.error || 'No se pudo guardar la firma');
            setData(prev => ({ ...(prev || {}), signed: true, signed_at: json.signed_at, pdf_url: json.pdf_url }));
        } catch (err) {
            setSubmitError(err?.message || 'No se pudo guardar la firma');
        } finally {
            setSubmitting(false);
        }
    };

    const downloadPdf = (url) => {
        window.open(url, '_blank', 'noopener');
    };

    // Marca del estado
    if (loading) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 p-4">
                <div className="text-center text-slate-500">
                    <i className="bi bi-arrow-repeat animate-spin inline-block text-3xl" />
                    <p className="mt-3 text-sm">Cargando documento...</p>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 p-4">
                <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
                        <i className="bi bi-x-lg text-2xl text-red-600" />
                    </div>
                    <h1 className="mb-2 text-xl font-bold text-slate-900">Enlace inválido</h1>
                    <p className="text-sm text-slate-600">{error || 'El enlace de firma no existe o ha vencido.'}</p>
                </div>
            </div>
        );
    }

    const isVoided = data.status === 'voided' || data.status === 'declined';

    return (
        <div className="min-h-screen bg-slate-100 pb-16">
            {/* Header */}
            <header className="bg-gradient-to-r from-indigo-900 to-indigo-700 px-6 py-4 text-white">
                <div className="mx-auto flex max-w-3xl items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-lg font-bold">Spectra Sign</span>
                        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                            Firma electrónica
                        </span>
                    </div>
                    <Link to="/" className="text-xs text-indigo-200 hover:text-white">
                        Volver al inicio
                    </Link>
                </div>
            </header>

            <main className="mx-auto mt-8 max-w-3xl px-4">
                {isVoided ? (
                    <div className="rounded-2xl bg-white p-8 text-center shadow-lg">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
                            <i className="bi bi-file-earmark-x text-2xl text-red-600" />
                        </div>
                        <h1 className="text-xl font-bold text-slate-900">Documento anulado</h1>
                        <p className="mt-2 text-sm text-slate-600">
                            Este documento fue anulado por un administrador y ya no puede firmarse.
                        </p>
                    </div>
                ) : data.signed ? (
                    <div className="rounded-2xl bg-white p-8 text-center shadow-lg">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                            <i className="bi bi-check-lg text-3xl text-emerald-600" />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900">¡Firmado correctamente!</h1>
                        <p className="mt-2 text-sm text-slate-600">
                            Tu firma dibujada fue guardada y el documento quedó firmado digitalmente.
                        </p>
                        {data.signed_at && (
                            <p className="mt-2 text-xs text-slate-500">
                                Fecha de firma: {new Date(data.signed_at).toLocaleString()}
                            </p>
                        )}
                        {data.pdf_url && (
                            <button
                                onClick={() => downloadPdf(data.pdf_url)}
                                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
                            >
                                <i className="bi bi-file-earmark-pdf" />
                                Descargar PDF firmado
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-5">
                        {/* Resumen */}
                        <div className="rounded-2xl bg-white p-6 shadow-sm">
                            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                                {data.amendment_id ? 'Enmienda al contrato' : 'Contrato para firma'}
                            </p>
                            <h1 className="mt-1 text-xl font-bold text-slate-900">{data.contract_title}</h1>
                            <p className="mt-1 text-sm text-slate-500">{data.company_name}</p>
                        </div>

                        {/* Documento */}
                        <div className="rounded-2xl bg-white p-6 shadow-sm sm:p-10">
                            <div
                                className="contract-doc max-w-none"
                                dangerouslySetInnerHTML={{ __html: data.content_html || '<p>Sin contenido.</p>' }}
                            />
                        </div>

                        {/* Firma */}
                        <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-6 shadow-sm">
                            <h2 className="text-base font-bold text-slate-900">Firma del Contratista</h2>
                            <p className="mb-4 text-xs text-slate-500">
                                Dibuja tu firma en el recuadro. Se guardará junto con tu IP, dispositivo y fecha para el registro de auditoría.
                            </p>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="block text-xs font-medium text-slate-700">Nombre completo</label>
                                    <input
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        required
                                        className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                                        placeholder="Tu nombre"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-700">Email</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                                        placeholder="Tu email"
                                    />
                                </div>
                            </div>

                            <div className="mt-5">
                                <SignaturePad ref={padRef} />
                            </div>

                            {submitError && (
                                <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                                    {submitError}
                                </div>
                            )}

                            <div className="mt-6 flex items-center justify-between gap-3">
                                <label className="flex items-start gap-2 text-xs text-slate-500">
                                    <input type="checkbox" required className="mt-0.5" />
                                    <span>
                                        Entiendo que al firmar acepto los términos del documento y que mi firma dibujada
                                        quedará registrada digitalmente con fecha, IP y dispositivo.
                                    </span>
                                </label>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
                                >
                                    {submitting ? (
                                        <>
                                            <i className="bi bi-arrow-repeat animate-spin" />
                                            Firmando...
                                        </>
                                    ) : (
                                        <>
                                            <i className="bi bi-pen" />
                                            Firmar documento
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                )}
            </main>
        </div>
    );
}