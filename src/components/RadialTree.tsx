/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import TimelineControls from './TimelineControls';
import DetailPanel from './DetailPanel';
import { getVizTheme } from '../utils/theme';
import { useDistroData, type DistroNode } from '../hooks/useDistroData';
import {
    parseDate, getYear,
} from '../utils/distroUtils';
import { HoverTooltip } from './DistroWidgets';

const RadialTree: React.FC = () => {
    const { data: distroData, isLoading } = useDistroData();
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    // State
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedNode, setSelectedNode] = useState<DistroNode | null>(null);
    const [showAll, setShowAll] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
    const [hoverInfo, setHoverInfo] = useState<{ node: DistroNode; x: number; y: number } | null>(null);
    const prevHighlightIdRef = useRef<string | null>(null);

    const currentYear = new Date().getFullYear();
    const [timelineYear, setTimelineYear] = useState(currentYear);

    const childrenMap = useMemo(() => {
        const map = new Map<string, DistroNode[]>();
        distroData.forEach(d => {
            if (d.parent) {
                if (!map.has(d.parent)) map.set(d.parent, []);
                map.get(d.parent)!.push(d);
            }
        });
        return map;
    }, [distroData]);

    // Derived active node for lineage (either explicitly clicked or searched)
    const activeHighlightNode = useMemo(() => {
        if (selectedNode) return selectedNode;
        if (!searchTerm.trim()) return null;
        const search = searchTerm.trim().toLowerCase();
        return distroData.find(d => d.name.toLowerCase() === search || d.id.toLowerCase() === search) || null;
    }, [selectedNode, searchTerm, distroData]);

    const suggestions = useMemo(() => {
        if (searchTerm.trim().length < 2) return [];
        const s = searchTerm.trim().toLowerCase();
        return distroData
            .filter(d => d.name.toLowerCase().includes(s))
            .sort((a, b) => {
                const ap = a.name.toLowerCase().startsWith(s);
                const bp = b.name.toLowerCase().startsWith(s);
                if (ap && !bp) return -1;
                if (!ap && bp) return 1;
                return a.name.localeCompare(b.name);
            })
            .slice(0, 8);
    }, [searchTerm, distroData]);

    const ancestryPath = useMemo(() => {
        if (!selectedNode) return [] as string[];
        const idMap = new Map(distroData.map(d => [d.id, d]));
        const path: string[] = [];
        let curr: DistroNode | undefined = selectedNode;
        while (curr && path.length < 8) {
            path.unshift(curr.name);
            curr = curr.parent ? idMap.get(curr.parent) : undefined;
        }
        return path;
    }, [selectedNode, distroData]);

    // Calculate ecosystem statistics (Filter-aware & Search-aware)
    const stats = useMemo(() => {
        const yearMatched = distroData.filter((d) => {
            const startYear = getYear(d.start);
            return startYear <= timelineYear + 0.999;
        });

        const filterMatched = yearMatched.filter(d => {
            if (showAll) return true;
            if (!d.stop) return true;
            const stopYear = getYear(d.stop);
            return stopYear >= timelineYear;
        });

        let selectedChildrenCount = 0;
        if (activeHighlightNode) {
            const filteredChildrenMap = new Map<string, DistroNode[]>();
            filterMatched.forEach(d => {
                if (d.parent) {
                    if (!filteredChildrenMap.has(d.parent)) filteredChildrenMap.set(d.parent, []);
                    filteredChildrenMap.get(d.parent)!.push(d);
                }
            });
            const countDescendants = (pid: string): number => {
                const direct = filteredChildrenMap.get(pid) ?? [];
                let total = direct.length;
                direct.forEach(child => {
                    total += countDescendants(child.id);
                });
                return total;
            };
            selectedChildrenCount = countDescendants(activeHighlightNode.id);
        }

        return {
            total: yearMatched.length,
            active: yearMatched.filter(d => !d.stop).length,
            selectedChildren: selectedChildrenCount,
            selectedName: activeHighlightNode?.name
        };
    }, [distroData, timelineYear, activeHighlightNode, showAll]);

    // D3 Persistence
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setSelectedNode(null);
                setSearchTerm('');
                setShowSuggestions(false);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // D3 Persistence
    const zoomRef = useRef<any>(null);
    const groupsRef = useRef<{
        gZoom: any,
        gYearLines: any,
        gLink: any,
        gNode: any,
        radiusScale: any,
        treeLayout: any,
        diagonal: any,
        radius: number
    } | null>(null);

    // Initial SVG Setup
    useEffect(() => {
        if (!svgRef.current || !containerRef.current || !distroData.length) return;

        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        if (width === 0 || height === 0) return;

        const radius = 5000 / 2;

        if (!groupsRef.current) {
            const svg = d3.select(svgRef.current)
                .attr("width", width)
                .attr("height", height)
                .style("user-select", "none");

            svg.selectAll("*").remove();
            const gZoom = svg.append('g');

            const radiusScale = d3.scaleLinear()
                .domain([1991, currentYear + 2])
                .range([0, radius - 100]);

            const gYearLines = gZoom.append("g").attr("class", "year-lines");
            const gLink = gZoom.append("g").attr("fill", "none");
            const gNode = gZoom.append("g").attr("cursor", "pointer").attr("pointer-events", "all");

            const zoom = d3.zoom().scaleExtent([0.01, 4]).on("zoom", (event) => {
                const k = event.transform.k;
                gZoom.attr("transform", event.transform);
                gZoom.selectAll('text.node-label')
                    .style('font-size', function(d: any) {
                        const rank = d?.data?.popularity ? parseInt(d.data.popularity) : 9999;
                        return ((rank <= 100 ? 14 : 9) / k) + 'px';
                    })
                    .style('display', function(d: any) {
                        const rank = d?.data?.popularity ? parseInt(d.data.popularity) : 9999;
                        return (rank <= 100 ? k >= 0.05 : k >= 0.15) ? null : 'none';
                    } as any);
                gZoom.selectAll('text.year-label')
                    .style('font-size', (10 / k) + 'px');
            });
            zoomRef.current = zoom;
            svg.call(zoom as any);

            const initR = 5000 / 2;
            const initScale = Math.min((width - 80) / (initR * 2), (height - 80) / (initR * 2));
            svg.call(zoom.transform as any, d3.zoomIdentity.translate(width / 2, height / 2).scale(initScale));

            const treeLayout = d3.tree<DistroNode>().separation((a, b) => (a.parent == b.parent ? 4 : 8));
            const diagonal = d3.linkRadial<any, any>().angle((d: any) => d.x).radius((d: any) => d.y);

            groupsRef.current = { gZoom, gYearLines, gLink, gNode, radiusScale, treeLayout, diagonal, radius };
        }
    }, [distroData.length, currentYear]);

    // Update Loop
    useEffect(() => {
        if (!groupsRef.current || !distroData.length) return;
        const { gNode, gLink, gYearLines, radiusScale, treeLayout, diagonal, radius: currentRadius } = groupsRef.current;
        
        const duration = 400;
        const theme = getVizTheme();
        const colorScale = d3.scaleOrdinal<string>(theme.families);
        const search = searchTerm.trim().toLowerCase();

        // 1. Initial Filtering
        let filteredData = distroData.filter((d) => {
            const startYear = getYear(d.start);
            const stopYear = d.stop ? getYear(d.stop) : 9999;
            if (startYear > timelineYear + 0.999) return false;
            if (!showAll && d.stop && stopYear < timelineYear) return false;
            return true;
        });

        // 2. Lineage Calculation
        const relatedIds = new Set<string>();
        if (activeHighlightNode) {
            const idMap = new Map(distroData.map(d => [d.id, d]));
            let curr: DistroNode | undefined = activeHighlightNode;
            while (curr) { 
                relatedIds.add(curr.id); 
                curr = curr.parent ? idMap.get(curr.parent) : undefined; 
            }
            const addDescendants = (pid: string) => {
                (childrenMap.get(pid) ?? []).forEach(child => {
                    if (relatedIds.has(child.id)) return;
                    relatedIds.add(child.id);
                    addDescendants(child.id);
                });
            };
            addDescendants(activeHighlightNode.id);
        }

        // 3. Final Filtering
        if (search && activeHighlightNode) {
            filteredData = filteredData.filter(d => relatedIds.has(d.id));
        }

        const linuxRootNode: DistroNode = { id: "Linux_Original", name: "Linux", parent: null, isVirtual: false, start: "1991-09-17" };
        const nodeIds = new Set(filteredData.map((d) => d.id));
        const dataForStratify = [
            linuxRootNode,
            ...filteredData.map((d) => ({
                ...d,
                parentId: (d.parent && nodeIds.has(d.parent)) ? d.parent : linuxRootNode.id
            }))
        ].sort((a, b) => parseDate(a.start).getTime() - parseDate(b.start).getTime());

        const currentVisibleIds = new Set(dataForStratify.map(d => d.id));
        const stratify = d3.stratify<DistroNode>().id(d => d.id).parentId(d => (d.id === 'Linux_Original') ? null : (d.parent && currentVisibleIds.has(d.parent) ? d.parent : 'Linux_Original'));

        let root: d3.HierarchyNode<DistroNode>;
        try { root = stratify(dataForStratify); } catch { return; }

        treeLayout.size([2 * Math.PI, currentRadius]);
        treeLayout(root);

        root.descendants().forEach(d => {
            const startYear = getYear(d.data.start);
            d.y = radiusScale(Math.max(1991, Math.min(2026, startYear)));
        });

        // Rings
        const yearsToDraw = d3.range(1991, currentYear + 1, 5);
        const yearCircles = gYearLines.selectAll('circle.year-circle').data(yearsToDraw);
        yearCircles.enter().append("circle").attr("class", "year-circle")
            .attr("fill", "none").attr("stroke", theme.grid).attr("stroke-width", 1.5)
            .merge(yearCircles as any).attr("r", (d: number) => radiusScale(d));

        const yearLabels = gYearLines.selectAll('text.year-label').data(yearsToDraw);
        yearLabels.enter().append("text").attr("class", "year-label")
            .attr("dy", "0.35em").attr("text-anchor", "middle").attr("fill", theme.axis)
            .style("font-size", "10px").style("font-family", theme.font).style("pointer-events", "none")
            .merge(yearLabels as any).attr("y", (d: number) => -radiusScale(d)).text((d: number) => d);

        // Links
        const links = root.links();
        const linkSelection = gLink.selectAll("path.radial-link").data(links, (d: any) => d.target.id);
        linkSelection.exit().transition().duration(duration).attr("stroke-opacity", 0).remove();
        linkSelection.enter().append("path").attr("class", "radial-link")
            .attr("stroke-width", 1.5).attr("stroke-opacity", 0)
            .attr("d", (d: any) => { const o = { x: d.source.x, y: d.source.y }; return diagonal({ source: o, target: o } as any); })
            .merge(linkSelection as any).transition().duration(duration)
            .attr("d", diagonal as any)
            .attr("stroke", (d: any) => activeHighlightNode && relatedIds.has(d.target.id) ? theme.linkHighlight : theme.link)
            .attr("stroke-opacity", (d: any) => !activeHighlightNode ? 1 : (relatedIds.has(d.target.id) ? 1 : 0.15))
            .attr("stroke-width", (d: any) => activeHighlightNode && relatedIds.has(d.target.id) ? 2.5 : 1.5);

        // Nodes
        const nodes = root.descendants().reverse();
        const nodeSelection = gNode.selectAll("g.node-group").data(nodes, (d: any) => d.id);
        nodeSelection.exit().transition().duration(duration).attr("fill-opacity", 0).remove();
        
        const nodeEnter = nodeSelection.enter().append("g").attr("class", "node-group")
            .attr("transform", (d: any) => `rotate(${(d.x * 180 / Math.PI - 90)}) translate(${d.y},0)`)
            .attr("fill-opacity", 0)
            .on("click", (event: any, d: any) => {
                setSelectedNode(d.data);
                event.stopPropagation();
                if (svgRef.current && containerRef.current && zoomRef.current) {
                    const w = containerRef.current.clientWidth;
                    const h = containerRef.current.clientHeight;
                    const currentK = d3.zoomTransform(svgRef.current).k;
                    const k = Math.max(currentK, 0.3);
                    // Convert radial coords to Cartesian
                    const cx = d.y * Math.cos(d.x - Math.PI / 2);
                    const cy = d.y * Math.sin(d.x - Math.PI / 2);
                    d3.select(svgRef.current).transition().duration(600).call(
                        zoomRef.current.transform,
                        d3.zoomIdentity.translate(w / 2 - cx * k, h / 2 - cy * k).scale(k)
                    );
                }
            });

        nodeEnter.append('circle').attr('r', 6);
        nodeEnter.append('text').attr('class', 'node-label').attr('dy', '0.31em').style('font-size', '10px');

        nodeEnter
            .on('mouseenter', (event: any, d: any) => {
                if (d.data.id === 'Linux_Original') return;
                setHoverInfo({ node: d.data, x: event.clientX, y: event.clientY });
            })
            .on('mousemove', (event: any) => {
                setHoverInfo(prev => prev ? { ...prev, x: event.clientX, y: event.clientY } : null);
            })
            .on('mouseleave', () => setHoverInfo(null));

        const nodeUpdate = nodeSelection.merge(nodeEnter as any).transition().duration(duration)
            .attr("transform", (d: any) => `rotate(${(d.x * 180 / Math.PI - 90)}) translate(${d.y},0)`)
            .attr("fill-opacity", (d: any) => !activeHighlightNode || relatedIds.has(d.id) ? 1 : 0.1);

        nodeUpdate.select("circle")
            .attr("fill", (d: any) => {
                if (activeHighlightNode && relatedIds.has(d.data.id)) return theme.linkHighlight;
                if (d.data.id === 'Linux_Original') return theme.nodeRoot;
                if (d.data.stop) return theme.nodeDiscontinued;
                let family = d;
                while (family.parent && family.parent.data.id !== 'Linux_Original') { family = family.parent; }
                return colorScale(family.data.id);
            })
            .attr("r", (d: any) => activeHighlightNode && relatedIds.has(d.data.id) ? 8 : 6);

        nodeUpdate.select("text")
            .attr("transform", (d: any) => d.x >= Math.PI ? "rotate(180)" : null)
            .attr("x", (d: any) => d.x >= Math.PI ? -8 : 8)
            .attr("text-anchor", (d: any) => d.x >= Math.PI ? "end" : "start")
            .style("paint-order", "stroke").style("stroke", theme.bg).style("stroke-width", "3px")
            .style("font-weight", "400")
            .attr("fill", (d: any) => {
                if (activeHighlightNode && relatedIds.has(d.id)) return theme.labelHighlight;
                const rank = d?.data?.popularity ? parseInt(d.data.popularity) : 9999;
                return rank <= 100 ? theme.text : theme.label;
            })
            .text((d: any) => d.data.name);

        // Sync label font-size/weight/visibility with current zoom on each render
        const currentK = (() => {
            if (!svgRef.current) return 1;
            const t = d3.zoomTransform(svgRef.current as any);
            return t.k;
        })();
        gNode.selectAll('text.node-label')
            .style('font-size', function(d: any) {
                const rank = d?.data?.popularity ? parseInt(d.data.popularity) : 9999;
                return ((rank <= 100 ? 14 : 9) / currentK) + 'px';
            })
            .style('display', function(d: any) {
                const rank = d?.data?.popularity ? parseInt(d.data.popularity) : 9999;
                return (rank <= 100 ? currentK >= 0.05 : currentK >= 0.15) ? null : 'none';
            } as any);

        // Auto-pan when highlight changes
        const newHighlightId = activeHighlightNode?.id ?? null;
        if (newHighlightId && newHighlightId !== prevHighlightIdRef.current) {
            const target = root.descendants().find((d: any) => d.data.id === newHighlightId) as any;
            if (target && svgRef.current && containerRef.current && zoomRef.current) {
                const w = containerRef.current.clientWidth;
                const h = containerRef.current.clientHeight;
                const scale = 0.4;
                const cx = target.y * Math.cos(target.x - Math.PI / 2);
                const cy = target.y * Math.sin(target.x - Math.PI / 2);
                d3.select(svgRef.current).transition().duration(750).call(
                    zoomRef.current.transform,
                    d3.zoomIdentity.translate(w / 2 - cx * scale, h / 2 - cy * scale).scale(scale)
                );
            }
        }
        prevHighlightIdRef.current = newHighlightId;

    }, [distroData, searchTerm, selectedNode, showAll, timelineYear, currentYear, activeHighlightNode, childrenMap]);

    const handleResetZoom = () => {
        if (!svgRef.current || !containerRef.current || !zoomRef.current) return;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        const r = 5000 / 2;
        const scale = Math.min((w - 80) / (r * 2), (h - 80) / (r * 2));
        d3.select(svgRef.current).transition().duration(750).call(
            zoomRef.current.transform,
            d3.zoomIdentity.translate(w / 2, h / 2).scale(scale)
        );
    };

    const exportImage = useCallback(() => {
        if (!svgRef.current || !groupsRef.current) return;
        const isFiltered = !!(searchTerm.trim() && activeHighlightNode);
        const r = groupsRef.current.radius;
        const PAD = 200;
        const vx = -r - PAD; const vy = -r - PAD;
        const vw = (r + PAD) * 2; const vh = (r + PAD) * 2;
        const TARGET_W = 3520;
        const es = TARGET_W / vw;
        const svgClone = svgRef.current.cloneNode(true) as SVGSVGElement;
        svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svgClone.setAttribute('width', String(TARGET_W));
        svgClone.setAttribute('height', String(Math.round(vh * es)));
        svgClone.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
        const gZoomEl = svgClone.querySelector('g');
        if (gZoomEl) {
            gZoomEl.setAttribute('transform', `translate(${Math.round(vw / 2)},${Math.round(vh / 2)})`);
        }
        const theme = getVizTheme();
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('x', String(vx)); bg.setAttribute('y', String(vy));
        bg.setAttribute('width', String(vw)); bg.setAttribute('height', String(vh));
        bg.setAttribute('fill', theme.bg);
        svgClone.insertBefore(bg, svgClone.firstChild);
        const fsCSS = (px: number) => `${Math.round(px / es)}px`;
        svgClone.querySelectorAll('text.node-label').forEach(el => {
            (el as SVGElement).style.fontSize = fsCSS(10);
            (el as SVGElement).style.display = '';
            (el as SVGElement).setAttribute('font-family', theme.font);
        });
        svgClone.querySelectorAll('text.year-label').forEach(el => {
            (el as SVGElement).style.fontSize = fsCSS(12);
            (el as SVGElement).setAttribute('font-family', theme.font);
        });
        const xml = new XMLSerializer().serializeToString(svgClone);
        const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n', xml], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const slug = isFiltered ? activeHighlightNode!.name.toLowerCase().replace(/\s+/g, '-') : 'radial-full';
        a.download = `linux-ancestry-${slug}.svg`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [searchTerm, activeHighlightNode]);

    const handleReset = () => {
        setSearchTerm('');
        setShowAll(false);
        setSelectedNode(null);
        setTimelineYear(currentYear);
        handleResetZoom();
    };

    if (isLoading) return <p className="p-6 text-muted font-light">Loading…</p>;

    return (
        <div ref={containerRef} className="relative w-full h-full overflow-hidden">
            <div className="panel absolute top-4 left-4 z-20 w-[26rem] max-w-[calc(100%-2rem)] p-5 flex flex-col gap-4">
                <div className="flex items-baseline gap-5 text-[0.95rem]">
                    <div className="relative flex-1">
                        <input
                            type="search"
                            className="field"
                            aria-label="Search distributions"
                            placeholder="Search distributions"
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setShowSuggestions(true);
                                setSelectedSuggestionIndex(-1);
                            }}
                            onFocus={() => { setShowSuggestions(true); setSelectedSuggestionIndex(-1); }}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                            onKeyDown={(e) => {
                                if (!showSuggestions || suggestions.length === 0) return;
                                if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    setSelectedSuggestionIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
                                } else if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    setSelectedSuggestionIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
                                } else if (e.key === 'Enter') {
                                    if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < suggestions.length) {
                                        e.preventDefault();
                                        setSearchTerm(suggestions[selectedSuggestionIndex].name);
                                        setShowSuggestions(false);
                                        setSelectedSuggestionIndex(-1);
                                    }
                                } else if (e.key === 'Escape') {
                                    setShowSuggestions(false);
                                    setSelectedSuggestionIndex(-1);
                                }
                            }}
                        />
                        {showSuggestions && suggestions.length > 0 && (
                            <ul className="panel absolute top-full left-0 right-0 z-50 list-none m-0 p-0" role="listbox">
                                {suggestions.map((s, idx) => (
                                    <li key={s.id} role="option" aria-selected={idx === selectedSuggestionIndex}>
                                        <button
                                            onMouseDown={() => { setSearchTerm(s.name); setShowSuggestions(false); }}
                                            className={`w-full text-left px-3 py-1.5 flex items-baseline justify-between gap-3 border-t border-rule first:border-t-0 ${idx === selectedSuggestionIndex ? 'text-text underline decoration-1 underline-offset-[0.2em]' : 'text-muted hover:text-text'}`}
                                        >
                                            <span className="truncate">{s.name}</span>
                                            <span className="text-[0.8rem] font-light shrink-0 tabular-nums">{s.start?.slice(0, 4)}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <button onClick={() => setShowAll(false)} className="textbtn" aria-pressed={!showAll}>Active</button>
                    <button onClick={() => setShowAll(true)} className="textbtn" aria-pressed={showAll}>All</button>
                    <button onClick={handleReset} className="textbtn">Reset</button>
                </div>
                <TimelineControls minYear={1991} maxYear={currentYear} currentYear={timelineYear} onYearChange={setTimelineYear} stats={stats} className="pt-4 border-t border-rule" />
            </div>
            <div className="absolute top-4 right-4 z-20 flex items-baseline gap-5 text-[0.95rem]">
                <button onClick={handleResetZoom} className="textbtn">Fit</button>
                <button onClick={exportImage} className="textbtn">Export SVG</button>
            </div>
            <svg ref={svgRef} className="w-full h-full" />
            {selectedNode && <DetailPanel node={selectedNode} ancestryPath={ancestryPath} onClose={() => setSelectedNode(null)} />}
            {hoverInfo && <HoverTooltip node={hoverInfo.node} x={hoverInfo.x} y={hoverInfo.y} />}
        </div>
    );
};

export default RadialTree;
