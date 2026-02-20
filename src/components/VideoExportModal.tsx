import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Video, Download, Square, AlertTriangle } from 'lucide-react';
import { useVideoRecorder } from '../hooks/useVideoRecorder';

interface VideoExportModalProps {
    svgRef: React.RefObject<SVGSVGElement | null>;
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    onYearChange: (year: number) => void;
    fitAll: () => void;
    getCinematicTransform: (year: number) => { x: number; y: number; k: number } | null;
    applyCinematicCamera: (t: { x: number; y: number; k: number }, durationMs: number) => void;
    minYear: number;
    maxYear: number;
    onClose: () => void;
}

const ASPECT_RATIOS = [
    { id: '16:9',  label: '16:9',    sub: 'YouTube',        width: 1920, height: 1080 },
    { id: '9:16',  label: '9:16',    sub: 'TikTok / Reels', width: 1080, height: 1920 },
    { id: '1:1',   label: '1:1',     sub: 'Instagram',      width: 1080, height: 1080 },
];

const SPEEDS = [
    { id: '0.5', label: '0.5×', sub: '~70s', value: 0.5 },
    { id: '1',   label: '1×',   sub: '~35s', value: 1   },
    { id: '2',   label: '2×',   sub: '~18s', value: 2   },
];

const QUALITIES = [
    { id: 'low',  label: 'Low',    sub: '2.5 Mbps', bitrate: 2_500_000  },
    { id: 'med',  label: 'Medium', sub: '5 Mbps',   bitrate: 5_000_000  },
    { id: 'high', label: 'High',   sub: '10 Mbps',  bitrate: 10_000_000 },
];

// ─── tiny reusable option picker ─────────────────────────────────────────────
const OptionGroup: React.FC<{
    label: string;
    options: { id: string; label: string; sub: string }[];
    value: string;
    onChange: (id: string) => void;
}> = ({ label, options, value, onChange }) => (
    <div>
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{label}</p>
        <div className="grid grid-cols-3 gap-2">
            {options.map(opt => (
                <button
                    key={opt.id}
                    onClick={() => onChange(opt.id)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                        value === opt.id
                            ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400'
                            : 'bg-slate-800 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600'
                    }`}
                >
                    <div className="text-xs font-black">{opt.label}</div>
                    <div className="text-[10px] opacity-70 mt-0.5">{opt.sub}</div>
                </button>
            ))}
        </div>
    </div>
);

// ─── main modal ──────────────────────────────────────────────────────────────
const VideoExportModal: React.FC<VideoExportModalProps> = ({
    svgRef, canvasRef, onYearChange, fitAll,
    getCinematicTransform, applyCinematicCamera,
    minYear, maxYear, onClose,
}) => {
    const [aspectId, setAspectId]   = useState('16:9');
    const [speedId,  setSpeedId]    = useState('1');
    const [qualityId, setQualityId] = useState('med');

    const {
        isRecording, progress, currentRecYear,
        downloadUrl, status, canRecord,
        startRecording, stopRecording, clearDownload,
    } = useVideoRecorder();

    const aspect  = ASPECT_RATIOS.find(a => a.id === aspectId)!;
    const speed   = SPEEDS.find(s => s.id === speedId)!;
    const quality = QUALITIES.find(q => q.id === qualityId)!;

    const handleStart = async () => {
        if (!svgRef.current || !canvasRef.current) return;
        await startRecording(svgRef.current, canvasRef.current, {
            width: aspect.width,
            height: aspect.height,
            fps: 30,
            bitrate: quality.bitrate,
            yearsPerSecond: speed.value,
            startYear: minYear,
            endYear: maxYear,
        }, {
            onYearChange,
            getCinematicTransform,
            applyCinematicCamera,
            fitAll,
        });
    };

    const handleDownload = () => {
        if (!downloadUrl) return;
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `linux-timeline-${aspectId.replace(':', 'x')}.webm`;
        a.click();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget && !isRecording) onClose(); }}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="bg-slate-900 border border-slate-700/50 rounded-3xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-rose-500/20 flex items-center justify-center">
                            <Video className="w-4 h-4 text-rose-400" />
                        </div>
                        <div>
                            <div className="text-sm font-black text-white">Export Video</div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-widest">Cinematic Timeline Recording</div>
                        </div>
                    </div>
                    {!isRecording && (
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                <div className="px-6 py-5 space-y-5">
                    {/* Browser compatibility warning */}
                    {!canRecord && (
                        <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-amber-300 leading-relaxed">
                                Video recording requires a modern Chromium browser (Chrome, Edge, Brave).
                            </p>
                        </div>
                    )}

                    {/* Settings — hidden while recording or done */}
                    <AnimatePresence>
                        {status === 'idle' && (
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="space-y-5"
                            >
                                <OptionGroup
                                    label="Aspect Ratio"
                                    options={ASPECT_RATIOS.map(a => ({ id: a.id, label: a.label, sub: a.sub }))}
                                    value={aspectId} onChange={setAspectId}
                                />
                                <OptionGroup
                                    label="Speed"
                                    options={SPEEDS.map(s => ({ id: s.id, label: s.label, sub: s.sub }))}
                                    value={speedId} onChange={setSpeedId}
                                />
                                <OptionGroup
                                    label="Quality"
                                    options={QUALITIES.map(q => ({ id: q.id, label: q.label, sub: q.sub }))}
                                    value={qualityId} onChange={setQualityId}
                                />

                                {/* Storyboard description */}
                                <div className="p-4 bg-slate-800/60 rounded-2xl space-y-1.5">
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Storyboard</p>
                                    {[
                                        ['🎬', 'Title card fade-in'],
                                        ['🔭', 'Zoom in to Linux kernel (1991)'],
                                        ['⏩', `Timeline builds ${minYear} → ${maxYear} with distro logos`],
                                        ['🌍', 'Zoom out to full tree'],
                                        ['⬛', 'Fade to black'],
                                    ].map(([icon, text]) => (
                                        <div key={text as string} className="flex items-center gap-2 text-xs text-slate-400">
                                            <span>{icon}</span><span>{text}</span>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Progress during recording / preloading */}
                    {(isRecording) && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                                    <span className="text-xs font-black text-rose-400 uppercase tracking-widest">
                                        {status === 'preloading' ? 'Loading logos…' : 'Recording'}
                                    </span>
                                </div>
                                {currentRecYear != null && (
                                    <span className="text-2xl font-black text-white tabular-nums">{currentRecYear}</span>
                                )}
                            </div>
                            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-rose-500 rounded-full"
                                    animate={{ width: `${Math.round(progress * 100)}%` }}
                                    transition={{ duration: 0.3 }}
                                />
                            </div>
                            <p className="text-[11px] text-slate-500 text-center">
                                {Math.round(progress * 100)}% — {aspect.width}×{aspect.height} · {quality.sub}
                            </p>
                        </div>
                    )}

                    {/* Done — download prompt */}
                    {status === 'done' && downloadUrl && (
                        <div className="text-center space-y-4 py-2">
                            <div className="text-5xl">🎬</div>
                            <div>
                                <p className="text-sm font-black text-white">Recording complete!</p>
                                <p className="text-xs text-slate-500 mt-1">
                                    {aspect.width}×{aspect.height} WebM · ready to share on YouTube, TikTok &amp; Reels
                                </p>
                            </div>
                            <button
                                onClick={handleDownload}
                                className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-500/20"
                            >
                                <Download className="w-4 h-4" /> Download .webm
                            </button>
                            <button
                                onClick={clearDownload}
                                className="text-xs text-slate-500 hover:text-white transition-colors"
                            >
                                Record another
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer CTA */}
                {status !== 'done' && (
                    <div className="px-6 pb-6">
                        {!isRecording ? (
                            <button
                                onClick={handleStart}
                                disabled={!canRecord}
                                className="w-full py-3.5 bg-rose-500 hover:bg-rose-400 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-rose-500/20"
                            >
                                <Video className="w-4 h-4" /> Start Recording
                            </button>
                        ) : (
                            <button
                                onClick={stopRecording}
                                className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-rose-400 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all border border-rose-500/30"
                            >
                                <Square className="w-4 h-4 fill-current" /> Stop Recording
                            </button>
                        )}
                    </div>
                )}
            </motion.div>
        </div>
    );
};

export default VideoExportModal;
