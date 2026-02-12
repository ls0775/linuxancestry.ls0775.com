import React, { useState, useEffect } from 'react';
import { Play, Pause, Clock, RotateCcw } from 'lucide-react';

interface TimelineControlsProps {
    minYear: number;
    maxYear: number;
    currentYear: number;
    onYearChange: (year: number) => void;
    className?: string;
}

const TimelineControls: React.FC<TimelineControlsProps> = ({
    minYear,
    maxYear,
    currentYear,
    onYearChange,
    className = ""
}) => {
    const [isPlaying, setIsPlaying] = useState(false);

    // Auto-play logic
    useEffect(() => {
        if (isPlaying) {
            const timer = setTimeout(() => {
                if (currentYear >= maxYear) {
                    setIsPlaying(false);
                } else {
                    onYearChange(currentYear + 1);
                }
            }, 600); // 600ms per year
            return () => clearTimeout(timer);
        }
    }, [isPlaying, currentYear, maxYear, onYearChange]); // Dependencies ensure fresh currentYear

    const togglePlay = () => {
        if (!isPlaying && currentYear >= maxYear) {
            // Restart if at end
            onYearChange(minYear);
        }
        setIsPlaying(!isPlaying);
    };

    const handleReset = () => {
        setIsPlaying(false);
        onYearChange(minYear);
    };

    return (
        <div className={`bg-slate-900/40 backdrop-blur-3xl border border-slate-700/50 rounded-[2rem] p-6 shadow-2xl flex flex-col gap-4 ${className}`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-cyan-400">
                    <Clock className="w-5 h-5" />
                    <span className="text-xs font-black tracking-widest uppercase">Ecosystem Timeline</span>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-2xl font-black text-white tabular-nums tracking-tight">
                        {currentYear}
                    </span>
                    <div className="w-px h-6 bg-slate-700/50"></div>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <button
                    onClick={togglePlay}
                    className="flex items-center justify-center w-10 h-10 rounded-full bg-cyan-500 hover:bg-cyan-400 text-white shadow-lg transition-all"
                    title={isPlaying ? "Pause" : "Play"}
                >
                    {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                </button>

                <button
                    onClick={handleReset}
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
                    title="Reset to Start"
                >
                    <RotateCcw className="w-3.5 h-3.5" />
                </button>

                <div className="flex-1 relative group">
                    <input
                        type="range"
                        min={minYear}
                        max={maxYear}
                        step="1"
                        value={currentYear}
                        onChange={(e) => {
                            setIsPlaying(false); // Stop playing on manual interaction
                            onYearChange(parseInt(e.target.value));
                        }}
                        className="w-full h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                    />
                    {/* Tick marks could go here */}
                </div>
            </div>

            <div className="flex justify-between text-[10px] font-bold text-slate-500 px-1">
                <span>{minYear}</span>
                <span>{maxYear}</span>
            </div>
        </div>
    );
};

export default TimelineControls;
