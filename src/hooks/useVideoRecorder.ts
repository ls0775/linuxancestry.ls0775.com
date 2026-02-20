/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useState, useCallback } from 'react';

export interface RecordingOptions {
    width: number;
    height: number;
    fps: number;
    bitrate: number;
    yearsPerSecond: number;
    startYear: number;
    endYear: number;
}

export interface RecordingCallbacks {
    onYearChange: (year: number) => void;
    getCinematicTransform: (year: number) => { x: number; y: number; k: number } | null;
    applyCinematicCamera: (t: { x: number; y: number; k: number }, durationMs: number) => void;
    fitAll: () => void;
}

export type RecordingStatus = 'idle' | 'preloading' | 'recording' | 'done';

export function useVideoRecorder() {
    const [isRecording, setIsRecording] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentRecYear, setCurrentRecYear] = useState<number | null>(null);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [status, setStatus] = useState<RecordingStatus>('idle');

    const stopRef = useRef(false);
    const rafRef = useRef<number>(0);
    const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const canRecord =
        typeof window !== 'undefined' &&
        typeof (window as any).MediaRecorder !== 'undefined' &&
        typeof HTMLCanvasElement.prototype.captureStream !== 'undefined';

    /** Pre-fetch all visible logo <image> hrefs → base64 data URIs */
    const preloadLogos = useCallback(async (svgEl: SVGSVGElement): Promise<Map<string, string>> => {
        const map = new Map<string, string>();
        const hrefs = [
            ...new Set(
                Array.from(svgEl.querySelectorAll('image[href]'))
                    .map(img => img.getAttribute('href'))
                    .filter((h): h is string => !!h && !h.startsWith('data:'))
            ),
        ];
        await Promise.allSettled(
            hrefs.map(async href => {
                try {
                    const res = await fetch(href);
                    if (!res.ok) return;
                    const blob = await res.blob();
                    const dataUri = await new Promise<string>(resolve => {
                        const fr = new FileReader();
                        fr.onload = () => resolve(fr.result as string);
                        fr.readAsDataURL(blob);
                    });
                    map.set(href, dataUri);
                } catch { /* skip failed logos */ }
            })
        );
        return map;
    }, []);

    const startRecording = useCallback(async (
        svgEl: SVGSVGElement,
        canvasEl: HTMLCanvasElement,
        options: RecordingOptions,
        callbacks: RecordingCallbacks
    ) => {
        if (!canRecord || isRecording) return;

        stopRef.current = false;
        setDownloadUrl(null);
        setIsRecording(true);
        setProgress(0);
        setCurrentRecYear(null);

        const { width, height, fps, bitrate, yearsPerSecond, startYear, endYear } = options;
        const { onYearChange, getCinematicTransform, applyCinematicCamera, fitAll } = callbacks;

        // Size the canvas
        canvasEl.width = width;
        canvasEl.height = height;
        const ctx = canvasEl.getContext('2d')!;

        // Pre-load logos into base64 cache
        setStatus('preloading');
        const logoCache = await preloadLogos(svgEl);
        if (stopRef.current) { setIsRecording(false); setStatus('idle'); return; }

        setStatus('recording');

        // MediaRecorder on the canvas stream
        const stream = canvasEl.captureStream(fps);
        const mimeType = (window as any).MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : 'video/webm';
        const chunks: Blob[] = [];
        const mr = new (window as any).MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
        mr.ondataavailable = (e: any) => { if (e.data.size > 0) chunks.push(e.data); };
        mr.onstop = () => {
            const blob = new Blob(chunks, { type: mimeType });
            setDownloadUrl(URL.createObjectURL(blob));
            setIsRecording(false);
            setStatus('done');
            setProgress(1);
        };
        mr.start(100);

        // SVG → Image pipeline (async, keeps a "last known good" frame)
        const serializer = new XMLSerializer();
        let lastImg: HTMLImageElement | null = null;
        let updating = false;

        const updateFrame = () => {
            if (updating || stopRef.current) return;
            updating = true;
            try {
                const clone = svgEl.cloneNode(true) as SVGSVGElement;
                clone.querySelectorAll('image[href]').forEach(el => {
                    const href = el.getAttribute('href');
                    if (href && logoCache.has(href)) el.setAttribute('href', logoCache.get(href)!);
                });
                const svgStr = serializer.serializeToString(clone);
                const blob2 = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
                const blobUrl = URL.createObjectURL(blob2);
                const img = new Image();
                img.onload = () => { lastImg = img; URL.revokeObjectURL(blobUrl); updating = false; };
                img.onerror = () => { URL.revokeObjectURL(blobUrl); updating = false; };
                img.src = blobUrl;
            } catch { updating = false; }
        };

        // Letterbox SVG onto canvas preserving aspect ratio
        const svgW = svgEl.clientWidth || 1400;
        const svgH = svgEl.clientHeight || 900;
        const scale = Math.min(width / svgW, height / svgH);
        const drawW = svgW * scale, drawH = svgH * scale;
        const drawX = (width - drawW) / 2, drawY = (height - drawH) / 2;

        let hudYear = startYear;

        // rAF draw loop — draws last SVG image + year HUD on every frame
        const drawCanvas = () => {
            if (stopRef.current) return;
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, width, height);
            if (lastImg) ctx.drawImage(lastImg, drawX, drawY, drawW, drawH);

            // Year counter HUD
            const hudH = Math.round(height * 0.09);
            ctx.font = `900 ${hudH}px system-ui, sans-serif`;
            const pad = Math.round(width * 0.025);
            const text = String(hudYear);
            const tw = ctx.measureText(text).width;
            ctx.fillStyle = 'rgba(15,23,42,0.75)';
            ctx.beginPath();
            (ctx as any).roundRect(pad, pad, tw + pad * 1.5, hudH + pad, 10);
            ctx.fill();
            ctx.fillStyle = '#22d3ee';
            ctx.fillText(text, pad * 1.3, pad + hudH - Math.round(hudH * 0.1));

            rafRef.current = requestAnimationFrame(drawCanvas);
        };

        // Kick off frame update at ~15fps (enough to capture D3 transitions smoothly)
        frameIntervalRef.current = setInterval(updateFrame, 67);
        drawCanvas();

        const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

        // Title card helpers
        const clearAndDraw = (fn: () => void) => {
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, width, height);
            fn();
        };
        const drawTitleCard = (alpha: number) => {
            clearAndDraw(() => {
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.textAlign = 'center';
                ctx.fillStyle = '#f8fafc';
                ctx.font = `900 ${Math.round(height * 0.075)}px system-ui, sans-serif`;
                ctx.fillText('Linux Distribution Timeline', width / 2, height * 0.42);
                ctx.fillStyle = '#64748b';
                ctx.font = `${Math.round(height * 0.036)}px system-ui, sans-serif`;
                ctx.fillText(`${startYear} – ${endYear}`, width / 2, height * 0.52);
                ctx.fillStyle = '#22d3ee';
                ctx.font = `700 ${Math.round(height * 0.022)}px system-ui, sans-serif`;
                ctx.fillText('linuxancestry.app', width / 2, height * 0.61);
                ctx.restore();
            });
        };

        // === INTRO: fade-in title card ===
        cancelAnimationFrame(rafRef.current); // pause the SVG draw loop during title
        for (let i = 0; i <= 30 && !stopRef.current; i++) { drawTitleCard(i / 30); await sleep(33); }
        await sleep(1500);
        for (let i = 30; i >= 0 && !stopRef.current; i--) { drawTitleCard(i / 30); await sleep(33); }
        if (stopRef.current) { mr.stop(); return; }

        // Resume live SVG draw loop
        drawCanvas();

        // === CINEMATIC: zoom in to start year ===
        onYearChange(startYear);
        hudYear = startYear;
        const initTransform = getCinematicTransform(startYear);
        if (initTransform) applyCinematicCamera(initTransform, 1000);
        await sleep(1300);

        // === YEAR ANIMATION ===
        const totalYears = endYear - startYear;
        const msPerYear = 1000 / yearsPerSecond;

        for (let year = startYear; year <= endYear && !stopRef.current; year++) {
            hudYear = year;
            onYearChange(year);
            setCurrentRecYear(year);
            setProgress((year - startYear) / totalYears * 0.9);

            const cam = getCinematicTransform(year);
            if (cam) applyCinematicCamera(cam, Math.min(msPerYear * 0.75, 600));

            await sleep(msPerYear);
        }

        if (!stopRef.current) {
            // === OUTRO: zoom back to full tree ===
            fitAll();
            await sleep(1500);

            // Fade to black
            for (let i = 0; i <= 25 && !stopRef.current; i++) {
                if (lastImg) { ctx.drawImage(lastImg, drawX, drawY, drawW, drawH); }
                ctx.fillStyle = `rgba(15,23,42,${i / 25})`;
                ctx.fillRect(0, 0, width, height);
                await sleep(40);
            }
            await sleep(500);
        }

        if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
        cancelAnimationFrame(rafRef.current);
        mr.stop();
    }, [canRecord, isRecording, preloadLogos]);

    const stopRecording = useCallback(() => {
        stopRef.current = true;
        if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
        cancelAnimationFrame(rafRef.current);
        setIsRecording(false);
        setStatus('idle');
    }, []);

    const clearDownload = useCallback(() => {
        if (downloadUrl) URL.revokeObjectURL(downloadUrl);
        setDownloadUrl(null);
        setStatus('idle');
        setProgress(0);
        setCurrentRecYear(null);
    }, [downloadUrl]);

    return {
        isRecording,
        progress,
        currentRecYear,
        downloadUrl,
        status,
        canRecord,
        startRecording,
        stopRecording,
        clearDownload,
    };
}
