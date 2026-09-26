import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DistroNode } from './useDistroData';
import {
    buildIndex, computeStats, filterByTimeline, getAncestryPath, getRelatedIds,
} from '../utils/lineage';

export interface HoverInfo {
    node: DistroNode;
    x: number;
    y: number;
}

/**
 * UI state shared by both visualisations: search, selection, timeline year,
 * active/all filter, and everything derived from them.
 */
export function useTreeState(data: DistroNode[]) {
    const currentYear = new Date().getFullYear();

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedNode, setSelectedNode] = useState<DistroNode | null>(null);
    const [showAll, setShowAll] = useState(false);
    const [timelineYear, setTimelineYear] = useState(currentYear);
    const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

    const index = useMemo(() => buildIndex(data), [data]);

    const suggestions = useMemo(() => {
        const s = searchTerm.trim().toLowerCase();
        if (s.length < 2) return [];
        return data
            .filter(d => d.name.toLowerCase().includes(s))
            .sort((a, b) => {
                const ap = a.name.toLowerCase().startsWith(s);
                const bp = b.name.toLowerCase().startsWith(s);
                if (ap !== bp) return ap ? -1 : 1;
                return a.name.localeCompare(b.name);
            })
            .slice(0, 8);
    }, [searchTerm, data]);

    // Node whose lineage is highlighted: an explicit click wins over an exact search match.
    const activeHighlightNode = useMemo(() => {
        if (selectedNode) return selectedNode;
        const s = searchTerm.trim().toLowerCase();
        if (!s) return null;
        return data.find(d => d.name.toLowerCase() === s || d.id.toLowerCase() === s) ?? null;
    }, [selectedNode, searchTerm, data]);

    const relatedIds = useMemo(
        () => (activeHighlightNode ? getRelatedIds(activeHighlightNode, index) : null),
        [activeHighlightNode, index],
    );

    const ancestryPath = useMemo(
        () => (selectedNode ? getAncestryPath(selectedNode, index) : []),
        [selectedNode, index],
    );

    const visibleNodes = useMemo(() => {
        const inTime = filterByTimeline(data, timelineYear, showAll);
        // While a search term is present the tree narrows to the highlighted lineage;
        // a plain click only highlights it.
        if (relatedIds && searchTerm.trim()) return inTime.filter(d => relatedIds.has(d.id));
        return inTime;
    }, [data, timelineYear, showAll, relatedIds, searchTerm]);

    const stats = useMemo(
        () => computeStats(data, timelineYear, showAll, activeHighlightNode),
        [data, timelineYear, showAll, activeHighlightNode],
    );

    const reset = useCallback(() => {
        setSearchTerm('');
        setShowAll(false);
        setSelectedNode(null);
        setTimelineYear(currentYear);
    }, [currentYear]);

    // Escape clears the selection, but only when focus is not inside a form control.
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            const t = e.target as HTMLElement | null;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
            setSelectedNode(null);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    return {
        currentYear,
        searchTerm, setSearchTerm,
        selectedNode, setSelectedNode,
        showAll, setShowAll,
        timelineYear, setTimelineYear,
        hoverInfo, setHoverInfo,
        suggestions,
        activeHighlightNode,
        relatedIds,
        ancestryPath,
        visibleNodes,
        stats,
        reset,
    };
}

export type TreeState = ReturnType<typeof useTreeState>;
