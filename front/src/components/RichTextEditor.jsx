import React, { useEffect, useRef } from 'react';

const BTN = 'inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900';

export default function RichTextEditor({ value = '', onChange, variables = [], placeholder = 'Escribe aquí...' }) {
    const ref = useRef(null);

    useEffect(() => {
        const el = ref.current;
        if (el && el.innerHTML !== (value || '')) {
            el.innerHTML = value || '';
        }
    }, [value]);

    const emit = (cmd, arg = null) => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        document.execCommand(cmd, false, arg);
        if (onChange) onChange(el.innerHTML);
    };

    const insertVariable = (token) => {
        if (!token) return;
        emit('insertText', token);
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        if (text) emit('insertText', text);
    };

    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white transition-all focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
            <style>{`
                .rte-body:empty::before {
                    content: attr(data-placeholder);
                    color: #94a3b8;
                    pointer-events: none;
                }
                .rte-body p { margin: 0 0 0.5rem; }
                .rte-body ul, .rte-body ol { margin: 0 0 0.5rem 1.25rem; list-style: revert; }
                .rte-body h2 { font-size: 1.15rem; }
                .rte-body h3 { font-size: 1.05rem; }
                .rte-body h4 { font-size: 1rem; }
                .rte-body h2, .rte-body h3, .rte-body h4 { font-weight: 700; margin: 0.75rem 0 0.35rem; }
                .rte-body blockquote { border-left: 3px solid #e2e8f0; color: #475569; font-style: italic; margin: 0 0 0.5rem 0; padding-left: 0.75rem; }
                .rte-body hr { border: none; border-top: 1px solid #e2e8f0; margin: 0.75rem 0; }
            `}</style>
            <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50/70 px-2 py-1.5">
                <button type="button" title="Negrita (Ctrl+B)" onMouseDown={e => e.preventDefault()} onClick={() => emit('bold')} className={BTN}>
                    <i className="bi bi-type-bold" />
                </button>
                <button type="button" title="Cursiva (Ctrl+I)" onMouseDown={e => e.preventDefault()} onClick={() => emit('italic')} className={BTN}>
                    <i className="bi bi-type-italic" />
                </button>
                <button type="button" title="Subrayado (Ctrl+U)" onMouseDown={e => e.preventDefault()} onClick={() => emit('underline')} className={BTN}>
                    <i className="bi bi-type-underline" />
                </button>
                <button type="button" title="Tachado" onMouseDown={e => e.preventDefault()} onClick={() => emit('strikeThrough')} className={BTN}>
                    <i className="bi bi-type-strikethrough" />
                </button>

                <span className="mx-1 h-5 w-px bg-slate-200" />

                <button type="button" title="Título 2" onMouseDown={e => e.preventDefault()} onClick={() => emit('formatBlock', '<h2>')} className={BTN}>
                    <i className="bi bi-type-h2" />
                </button>
                <button type="button" title="Título 3" onMouseDown={e => e.preventDefault()} onClick={() => emit('formatBlock', '<h3>')} className={BTN}>
                    <i className="bi bi-type-h3" />
                </button>
                <button type="button" title="Párrafo" onMouseDown={e => e.preventDefault()} onClick={() => emit('formatBlock', '<p>')} className={BTN}>
                    <i className="bi bi-paragraph" />
                </button>
                <button type="button" title="Cita" onMouseDown={e => e.preventDefault()} onClick={() => emit('formatBlock', '<blockquote>')} className={BTN}>
                    <i className="bi bi-quote" />
                </button>

                <span className="mx-1 h-5 w-px bg-slate-200" />

                <button type="button" title="Lista con viñetas" onMouseDown={e => e.preventDefault()} onClick={() => emit('insertUnorderedList')} className={BTN}>
                    <i className="bi bi-list-ul" />
                </button>
                <button type="button" title="Lista numerada" onMouseDown={e => e.preventDefault()} onClick={() => emit('insertOrderedList')} className={BTN}>
                    <i className="bi bi-list-ol" />
                </button>
                <button type="button" title="Línea separadora" onMouseDown={e => e.preventDefault()} onClick={() => emit('insertHorizontalRule')} className={BTN}>
                    <i className="bi bi-hr" />
                </button>
                <button type="button" title="Quitar formato" onMouseDown={e => e.preventDefault()} onClick={() => emit('removeFormat')} className={BTN}>
                    <i className="bi bi-eraser" />
                </button>

                <span className="mx-1 h-5 w-px bg-slate-200" />

                <select
                    className="ml-auto h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 shadow-sm"
                    value=""
                    onChange={e => {
                        insertVariable(e.target.value);
                        e.target.value = '';
                    }}
                    title="Insertar variable del contrato"
                >
                    <option value="" disabled>Insertar variable...</option>
                    {variables.map(v => (
                        <option key={v.token} value={v.token}>{v.label} — {v.token}</option>
                    ))}
                </select>
            </div>
            <div
                ref={ref}
                contentEditable
                suppressContentEditableWarning
                data-placeholder={placeholder}
                className="rte-body min-h-[220px] max-h-[440px] overflow-y-auto px-3 py-2.5 text-sm text-slate-800 outline-none"
                onInput={() => onChange && onChange(ref.current.innerHTML)}
                onPaste={handlePaste}
            />
        </div>
    );
}