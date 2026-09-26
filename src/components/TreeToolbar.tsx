import React from 'react';
import SearchBox from './SearchBox';
import TimelineControls from './TimelineControls';
import { MIN_YEAR } from '../utils/lineage';
import type { TreeState } from '../hooks/useTreeState';

interface TreeToolbarProps {
    state: TreeState;
    onFit: () => void;
    onExport: () => void;
}

/**
 * Shared chrome for both views: search/filter panel (top-left) and the
 * Fit / Export actions (top-right on wide screens, inside the panel on narrow ones).
 */
const TreeToolbar: React.FC<TreeToolbarProps> = ({ state, onFit, onExport }) => {
    const actions = (
        <>
            <button type="button" onClick={onFit} className="textbtn">Fit</button>
            <button type="button" onClick={onExport} className="textbtn">Export SVG</button>
        </>
    );

    return (
        <>
            <div className="panel absolute top-3 left-3 sm:top-4 sm:left-4 z-20 w-[26rem] max-w-[calc(100%-1.5rem)] sm:max-w-[calc(100%-2rem)] p-4 sm:p-5 flex flex-col gap-4">
                <div className="flex items-baseline gap-x-5 gap-y-2 flex-wrap text-[0.95rem]">
                    <SearchBox
                        className="flex-1 min-w-[10rem]"
                        value={state.searchTerm}
                        onChange={state.setSearchTerm}
                        suggestions={state.suggestions}
                    />
                    <div className="flex items-baseline gap-5">
                        <button type="button" onClick={() => state.setShowAll(false)} className="textbtn" aria-pressed={!state.showAll}>Active</button>
                        <button type="button" onClick={() => state.setShowAll(true)} className="textbtn" aria-pressed={state.showAll}>All</button>
                        <button type="button" onClick={() => { state.reset(); onFit(); }} className="textbtn">Reset</button>
                    </div>
                </div>
                <TimelineControls
                    minYear={MIN_YEAR}
                    maxYear={state.currentYear}
                    currentYear={state.timelineYear}
                    onYearChange={state.setTimelineYear}
                    stats={state.stats}
                    className="pt-4 border-t border-rule"
                />
                <div className="flex sm:hidden items-baseline gap-5 text-[0.95rem] pt-3 border-t border-rule">{actions}</div>
            </div>
            <div className="hidden sm:flex absolute top-4 right-4 z-20 items-baseline gap-5 text-[0.95rem]">{actions}</div>
        </>
    );
};

export default TreeToolbar;
