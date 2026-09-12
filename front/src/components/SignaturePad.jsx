import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';

const WIDTH = 900;
const HEIGHT = 300;

const SignaturePad = forwardRef(function SignaturePad({ placeholder = 'Firma aquí con el mouse o con el dedo' }, ref) {
    const canvasRef = useRef(null);
    const strokesRef = useRef([]);
    const currentStrokeRef = useRef(null);
    const drawingRef = useRef(false);
    const [drawn, setDrawn] = useState(false);

    const getPoint = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const scaleX = WIDTH / rect.width;
        const scaleY = HEIGHT / rect.height;
        const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    };

    const redraw = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#1e3a8a';
        ctx.fillStyle = 'rgba(30, 58, 138, 0.5)';
        for (const stroke of strokesRef.current) {
            drawStroke(ctx, stroke);
        }
    };

    const drawStroke = (ctx, stroke) => {
        ctx.beginPath();
        if (stroke.length === 1) {
            const p = stroke[0];
            ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
            ctx.fill();
            return;
        }
        ctx.moveTo(stroke[0].x, stroke[0].y);
        for (let i = 1; i < stroke.length; i++) {
            ctx.lineTo(stroke[i].x, stroke[i].y);
        }
        ctx.stroke();
    };

    const onPointerDown = (e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        e.preventDefault();
        const canvas = canvasRef.current;
        canvas.setPointerCapture(e.pointerId);
        drawingRef.current = true;
        currentStrokeRef.current = [getPoint(e)];
        strokesRef.current.push(currentStrokeRef.current);
        setDrawn(true);
        redraw();
    };

    const onPointerMove = (e) => {
        if (!drawingRef.current) return;
        e.preventDefault();
        currentStrokeRef.current.push(getPoint(e));
        redraw();
    };

    const endStroke = (e) => {
        if (!drawingRef.current) return;
        drawingRef.current = false;
        if (e) e.preventDefault();
    };

    const clear = () => {
        strokesRef.current = [];
        currentStrokeRef.current = null;
        setDrawn(false);
        redraw();
    };

    const undo = () => {
        strokesRef.current.pop();
        setDrawn(strokesRef.current.length > 0);
        redraw();
    };

    const buildSvgPath = () => {
        const strokes = strokesRef.current;
        if (!strokes.length) return null;
        let d = '';
        for (const stroke of strokes) {
            if (!stroke.length) continue;
            d += `M ${stroke[0].x.toFixed(1)} ${stroke[0].y.toFixed(1)} `;
            if (stroke.length === 1) {
                d += `L ${(stroke[0].x + 0.6).toFixed(1)} ${(stroke[0].y + 0.6).toFixed(1)} `;
            } else {
                for (let i = 1; i < stroke.length; i++) {
                    d += `L ${stroke[i].x.toFixed(1)} ${stroke[i].y.toFixed(1)} `;
                }
            }
        }
        return d.trim() || null;
    };

    useImperativeHandle(ref, () => ({
        getSignature: () => {
            if (!drawn || strokesRef.current.length === 0) return null;
            return canvasRef.current.toDataURL('image/png');
        },
        getSignatureSvg: () => {
            const path = buildSvgPath();
            if (!path) return null;
            return { path, width: WIDTH, height: HEIGHT };
        }
    }));

    return (
        <div>
            <div className="relative overflow-hidden rounded-xl border border-slate-300 bg-white">
                <canvas
                    ref={canvasRef}
                    width={WIDTH}
                    height={HEIGHT}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={endStroke}
                    onPointerCancel={endStroke}
                    onPointerLeave={endStroke}
                    className="block w-full cursor-crosshair touch-none select-none"
                    style={{ height: 220 }}
                />
                {!drawn && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-300">
                        {placeholder}
                    </div>
                )}
            </div>
            <div className="mt-2 flex items-center gap-2">
                <button
                    type="button"
                    onClick={undo}
                    disabled={!drawn}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                    <i className="bi bi-arrow-counterclockwise mr-1" />
                    Deshacer
                </button>
                <button
                    type="button"
                    onClick={clear}
                    disabled={!drawn}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                    <i className="bi bi-trash mr-1" />
                    Limpiar
                </button>
            </div>
        </div>
    );
});

export default SignaturePad;