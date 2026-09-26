import React, { useState, useEffect } from 'react';

interface TimelineStats {
    total: number;
    active: number;
    selectedChildren?: number;
    selectedName?: string;
}

interface TimelineControlsProps {
    minYear: number;
    maxYear: number;
    currentYear: number;
    onYearChange: (year: number) => void;
    stats: TimelineStats;
    className?: string;
}

const TimelineControls: React.FC<TimelineControlsProps> = ({
    minYear,
    maxYear,
    currentYear,
    onYearChange,
    stats,
    className = ""
}) => {
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        if (isPlaying) {
            const timer = setTimeout(() => {
                if (currentYear >= maxYear) {
                    setIsPlaying(false);
                } else {
                    onYearChange(currentYear + 1);
                }
            }, 600);
            return () => clearTimeout(timer);
        }
    }, [isPlaying, currentYear, maxYear, onYearChange]);

    const togglePlay = () => {
        if (!isPlaying && currentYear >= maxYear) {
            onYearChange(minYear);
        }
        setIsPlaying(!isPlaying);
    };

    const handleReset = () => {
        setIsPlaying(false);
        onYearChange(minYear);
    };

    return (
        <div className={`flex flex-col gap-3 ${className}`}>
            <div className="flex items-baseline justify-between">
                <span className="label">Year</span>
                <span className="text-2xl font-light tabular-nums leading-none">{currentYear}</span>
            </div>

            <div className="flex items-center gap-4 text-[0.95rem]">
                <button onClick={togglePlay} className="textbtn">{isPlaying ? 'Pause' : 'Play'}</button>
                <button onClick={handleReset} className="textbtn" disabled={currentYear === minYear && !isPlaying}>Rewind</button>
                <input
                    type="range"
                    className="range flex-1"
                    aria-label="Year"
                    min={minYear}
                    max={maxYear}
                    step="1"
                    value={currentYear}
                    onChange={(e) => {
                        setIsPlaying(false);
                        onYearChange(parseInt(e.target.value));
                    }}
                />
            </div>

            <dl className="flex gap-6 pt-3 border-t border-rule text-[0.95rem]">
                <div className="flex flex-col">
                    <dt className="label">Distributions</dt>
                    <dd className="tabular-nums">{stats.total}</dd>
                </div>
                <div className="flex flex-col">
                    <dt className="label">Active</dt>
                    <dd className="tabular-nums">{stats.active}</dd>
                </div>
                {stats.selectedName && (
                    <div className="flex flex-col min-w-0">
                        <dt className="label truncate">{stats.selectedName}</dt>
                        <dd className="tabular-nums">{stats.selectedChildren} <span className="text-muted font-light">descendants</span></dd>
                    </div>
                )}
            </dl>
        </div>
    );
};

export default TimelineControls;
