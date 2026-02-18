import React, { useCallback, useEffect, useRef, useState, useReducer } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Calendar, Search, Maximize2, Info, X } from 'lucide-react';
import TimelineControls from './TimelineControls';

interface DistroNode {
    id: string;
    name: string;
    color?: string;
    parent?: string | null;
    start?: string;
    stop?: string;
    icon?: string;
    logo?: string;
    url?: string;
    isVirtual?: boolean;
    parentId?: string;
    actualX?: number;
    popularity?: string | null;
    description?: string | null;
    based_on?: string;
}

const RadialTree: React.FC = () => {
    const [distroData, setDistroData] = useState<DistroNode[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetch('/distros.json')
            .then(res => res.json())
            .then(data => {
                setDistroData(data);
                setIsLoading(false);
            })
            .catch(err => {
                console.error('Failed to load distro data:', err);
                setIsLoading(false);
            });
    }, []);

    // Sanitize data: fix known issues in source JSON
    const fixedData = React.useMemo(() => {
        if (!distroData.length) return [];
        const data = (distroData as DistroNode[]).map(d => ({ ...d }));
        const idMap = new Map(data.map(d => [d.id, d]));

        // Fix Ubuntu parent if broken
        const ubuntu = idMap.get('ubuntu');
        if (ubuntu && ubuntu.parent !== 'debian') {
            ubuntu.parent = 'debian';
        }

        // Fix Ubuntu-based distros incorrectly pointing to Debian
        data.forEach(d => {
            if (d.id === 'ubuntu') return;
            const basedOn = d.based_on || '';
            const desc = d.description || '';
            if (basedOn.includes('Ubuntu') || desc.includes('Ubuntu-based') || desc.includes('based on Ubuntu')) {
                if (d.parent !== 'ubuntu') d.parent = 'ubuntu';
            }
        });
        return data;
    }, []);

    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [selectedNode, setSelectedNode] = useState<DistroNode | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showAll, setShowAll] = useState(false);

    const handleReset = () => {
        setSearchTerm('');
        setShowAll(false);
        setSelectedNode(null);
        setTimelineYear(overallMaxYearRef.current);
        if (svgRef.current && zoomRef.current) {
            d3.select(svgRef.current).transition().duration(750).call(
                zoomRef.current.transform,
                d3.zoomIdentity
            );
        }
    };

    const timelineYear = useRef(2026); // Change to useRef
    const setTimelineYear = (year: number) => {
        timelineYear.current = year;
        forceRender(); // A way to force component re-render when ref changes
    };
    const forceRender = useReducer(x => x + 1, 0)[1]; // Forcing re-render for ref updates
    const zoomRef = useRef<any>(null);
    const gZoomRef = useRef<any>(null);
    const overallMinYearRef = useRef<number>(1992); // Default
    const overallMaxYearRef = useRef<number>(new Date().getFullYear()); // Default

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    const getDistroWatchUrl = (name: string, url?: string) => {
        if (url && url.includes('distrowatch.com')) return url;
        const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return `https://distrowatch.com/table.php?distribution=${slug}`;
    };

    const getLogoUrl = (node: DistroNode) => {
        if (node.logo) return node.logo;
        if (node.icon) return node.icon;
        const slug = node.id.toLowerCase().replace(/[^a-z0-9]/g, '');
        return `https://distrowatch.com/images/y9go/${slug}.png`;
    };

    const parseDate = useCallback((d?: string) => {
        if (!d) return new Date(8640000000000000);
        // Handle both YYYY.MM.DD and YYYY-MM-DD formats
        const parts = d.split(/[.-]/);
        const year = parseInt(parts[0]);
        const month = parts[1] ? parseInt(parts[1]) - 1 : 0;
        const day = parts[2] ? parseInt(parts[2]) : 1;
        return new Date(year, month, day);
    }, []);

    const getYear = useCallback((d?: string | null) => {
        if (!d) return 9999;
        if (!d) return 9999;
        const date = parseDate(d);
        if (date.getFullYear() > 3000) return 9999;

        const startOfYear = new Date(date.getFullYear(), 0, 1);
        const dayOfYear = (date.getTime() - startOfYear.getTime()) / 86400000;
        return date.getFullYear() + (dayOfYear / 366);
    }, [parseDate]);

    // Calculate overall min/max years once on mount
    useEffect(() => {
        const years = (distroData as DistroNode[]).map(d => {
            const startYear = getYear(d.start);
            const stopYear = getYear(d.stop); // Using getYear which handles null
            return [startYear, stopYear];
        }).flat().filter(year => year !== 9999);

        // Add the original Linux year to the considerations
        years.push(1991);

        // Use floor and ceil to get integer years for the scale domain
        overallMinYearRef.current = Math.floor(d3.min(years) || 1991);
        overallMaxYearRef.current = Math.max(Math.ceil(d3.max(years) || 1992), new Date().getFullYear());
        timelineYear.current = overallMaxYearRef.current; // Initialize timelineYear to the latest year
        forceRender(); // Trigger re-render to update UI with initial timelineYear
    }, [getYear]);

    const render = useCallback((
        gNode: d3.Selection<SVGGElement, unknown, null, undefined>,
        gLink: d3.Selection<SVGGElement, unknown, null, undefined>,
        gYearLines: d3.Selection<SVGGElement, unknown, null, undefined>, // New parameter for year lines group
        treeLayout: d3.TreeLayout<DistroNode>,
        diagonal: Function,
        i: number,
        radiusScale: d3.ScaleLinear<number, number, never>, // New parameter for radial scale
        maxRadius: number
    ) => {
        const duration = 600;
        const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

        const baseDistros = fixedData.filter((d) => {
            const startYear = getYear(d.start);
            const stopYear = d.stop ? getYear(d.stop) : 9999;
            if (startYear > timelineYear.current + 0.999) return false;
            if (!showAll && d.stop && stopYear < timelineYear.current) return false;
            return true;
        });

        const nodeIds = new Set(baseDistros.map((d) => d.id));

        // Define the original Linux root node
        const linuxRootNode: DistroNode = {
            id: "Linux_Original",
            name: "Linux",
            parent: null,
            isVirtual: false,
            start: "1991-09-17",
            url: "https://www.kernel.org/"
        };

        let dataForStratify = [
            linuxRootNode, // Use the new Linux root node
            ...baseDistros.map((d) => ({
                ...d,
                // Assign parent to linuxRootNode if parent is null or not found
                parentId: (d.parent && nodeIds.has(d.parent)) ? d.parent : linuxRootNode.id
            }))
        ].sort((a, b) => parseDate(a.start).getTime() - parseDate(b.start).getTime());

        const search = searchTerm.trim().toLowerCase();
        const focusId = selectedNode?.id;

        if (search || focusId) {
            const visibleIds = new Set<string>();
            try {
                const stratifyFull = d3.stratify<DistroNode>().id((d) => d.id).parentId((d) => d.parentId || null);
                const fullHierarchy = stratifyFull(dataForStratify);
                const nodes = fullHierarchy.descendants();

                const matches = nodes.filter(n =>
                    (search && n.data.name.toLowerCase().includes(search)) || (focusId && n.id === focusId)
                );

                matches.forEach(m => {
                    let curr: any = m;
                    while (curr) { visibleIds.add(curr.id); curr = curr.parent; }
                    m.descendants().forEach(d => visibleIds.add(d.id!));
                });

                dataForStratify = dataForStratify.filter(d => visibleIds.has(d.id));
            } catch (e) {
                console.warn("Filtering error", e);
            }
        }

        if (dataForStratify.length === 0) {
            gNode.selectAll("g").remove();
            gLink.selectAll("path").remove();
            gYearLines.selectAll(".year-circle").remove();
            return;
        }

        // Standardize Parent ID and ensure validity
        const idSet = new Set(dataForStratify.map((d: any) => d.id));

        // Add virtual root if multiple roots or missing parents found
        const effectiveRoots = dataForStratify.filter((d: any) => {
            const pid = d.parent || d.parentId;
            return !pid || !idSet.has(pid);
        });

        if (effectiveRoots.length > 0) {
            dataForStratify = [
                { id: '__virtual_root__', name: 'Linux Origins', isVirtual: true, parent: null, parentId: null, start: '1991-01-01' },
                ...dataForStratify.map((d: any) => {
                    const pid = d.parent || d.parentId;
                    const newParent = (!pid || !idSet.has(pid)) ? '__virtual_root__' : pid;
                    return { ...d, parent: newParent, parentId: newParent };
                })
            ];
            idSet.add('__virtual_root__'); // Add to set for cycle check
        }

        // Cycle Detection
        const idMap = new Map<string, any>();
        dataForStratify.forEach((d: any) => idMap.set(d.id, d));

        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const hasCycle = (nodeId: string): boolean => {
            if (recursionStack.has(nodeId)) return true;
            if (visited.has(nodeId)) return false;

            visited.add(nodeId);
            recursionStack.add(nodeId);

            const node = idMap.get(nodeId);
            const pid = node?.parent || node?.parentId;

            if (node && pid && pid !== '__virtual_root__') {
                if (hasCycle(pid)) {
                    // Auto-fix cycle
                    node.parent = '__virtual_root__';
                    node.parentId = '__virtual_root__';
                }
            }

            recursionStack.delete(nodeId);
            return false;
        };

        dataForStratify.forEach((d: any) => hasCycle(d.id));

        const stratify = d3.stratify<DistroNode>()
            .id((d) => d.id)
            .parentId((d) => d.parent || d.parentId || null);

        let root;
        try {
            root = stratify(dataForStratify);
        } catch (e) {
            console.error("Stratification failed", e);
            return;
        }

        // Apply tree layout
        // IMPORTANT: size in radial is [angle, radius]
        // But d3.tree() size treats x as angle (0-360) and y as radius? No.
        // d3.tree().size([2 * Math.PI, maxRadius]) 
        // x will be angle (radians), y will be radius
        treeLayout.size([2 * Math.PI, maxRadius]);

        treeLayout(root);

        // Manually adjust node y positions (radius) based on year
        root.descendants().forEach(d => {
            const startYear = getYear(d.data.start);
            // Clamp year to domain 
            const clampedYear = Math.max(overallMinYearRef.current, Math.min(overallMaxYearRef.current + 1, startYear));
            d.y = radiusScale(clampedYear);
            d.data.actualX = d.y; // store radius
        });

        // Update year circles (concentric rings)
        const yearsToDraw = d3.range(overallMinYearRef.current, overallMaxYearRef.current + 1, 5); // From minYear to maxYear, step 5

        const yearCircleSelection = gYearLines.selectAll<SVGCircleElement, number>(".year-circle")
            .data(yearsToDraw);
        yearCircleSelection.exit().remove();
        yearCircleSelection.enter().append("circle")
            .attr("class", "year-circle")
            .merge(yearCircleSelection)
            .attr("cx", 0)
            .attr("cy", 0)
            .attr("r", d => radiusScale(d))
            .attr("fill", "none")
            .attr("stroke", "#ffffff")
            .attr("stroke-opacity", 0.05)
            .attr("stroke-dasharray", "2,2");

        const yearLabelSelection = gYearLines.selectAll<SVGTextElement, number>(".year-label")
            .data(yearsToDraw);
        yearLabelSelection.exit().remove();
        yearLabelSelection.enter().append("text")
            .attr("class", "year-label")
            .merge(yearLabelSelection)
            .attr("x", 0)
            .attr("y", d => -radiusScale(d))
            .attr("dy", "0.35em")
            .attr("text-anchor", "middle")
            .attr("fill", "#ffffff")
            .attr("fill-opacity", 0.3)
            .style("font-size", "10px")
            .style("font-weight", "bold")
            .style("pointer-events", "none")
            .text(d => d);

        const nodes = root.descendants().reverse();
        const links = root.links();

        const node = gNode.selectAll("g")
            .data(nodes, (d: any) => d.id || (d.id = ++i));

        const nodeEnter = node.enter().append("g")
            .attr("transform", (d: any) => `rotate(${(d.x * 180 / Math.PI - 90)}) translate(${d.y},0)`)
            .attr("fill-opacity", 0)
            .on("click", (event, d: any) => {
                if (d.data.isVirtual) return;
                setSelectedNode(d.data);
                event.stopPropagation();
            });

        nodeEnter.append("circle").attr("r", 6).attr("stroke", "#06b6d4").attr("stroke-width", 2);
        nodeEnter.append("text").attr("dy", "0.31em").style("font-size", "10px").style("font-weight", "600");

        const nodeUpdate = node.merge(nodeEnter as any).transition().duration(duration)
            .attr("transform", (d: any) => `rotate(${(d.x * 180 / Math.PI - 90)}) translate(${d.y},0)`)
            .attr("fill-opacity", 1);

        nodeUpdate.select("circle")
            .attr("fill", (d: any) => {
                const isFocus = (search && d.data.name.toLowerCase().includes(search)) || (focusId === d.id);
                if (d.data.isVirtual) return '#64748b';
                if (isFocus) return "#facc15";
                if (d.data.stop) return '#ef4444'; // Red for discontinued

                // Color by family (trace back to child of Linux_Original or __virtual_root__)
                let family = d;
                while (family.parent &&
                    family.parent.data.id !== 'Linux_Original' &&
                    family.parent.data.id !== '__virtual_root__') {
                    family = family.parent;
                }
                return colorScale(family.data.id);
            })
            .attr("r", (d: any) => d.data.isVirtual ? 0 : ((search && d.data.name.toLowerCase().includes(search)) || (focusId === d.id) ? 10 : 6))
            .attr("stroke", (d: any) => ((search && d.data.name.toLowerCase().includes(search)) || (focusId === d.id) ? "#facc15" : "#06b6d4"));

        nodeUpdate.select("text")
            .attr("transform", (d: any) => d.x >= Math.PI ? "rotate(180)" : null) // Flip text on left side
            .attr("x", (d: any) => d.x >= Math.PI ? -8 : 8)
            .attr("text-anchor", (d: any) => d.x >= Math.PI ? "end" : "start")
            .style("paint-order", "stroke")
            .style("stroke", "#0f172a")
            .style("stroke-width", "3px")
            .attr("fill", (d: any) => ((search && d.data.name.toLowerCase().includes(search)) || (focusId === d.id) ? "#facc15" : "#cbd5e1"))
            .text((d: any) => d.data.isVirtual ? "" : d.data.name);

        node.exit().transition().duration(duration).remove()
            .attr("fill-opacity", 0);

        const link = gLink.selectAll("path").data(links, (d: any) => d.target.id);

        const linkEnter = link.enter().append("path")
            .attr("d", (d: any) => {
                const o = { x: d.source.x, y: d.source.y };
                return diagonal({ source: o, target: o } as any);
            })
            .attr("stroke", "#334155").attr("stroke-opacity", 0.4).attr("stroke-width", 1.5);

        link.merge(linkEnter as any).transition().duration(duration)
            .attr("d", diagonal as any)
            .attr("stroke", "#06b6d4")
            .attr("stroke-opacity", (search || focusId) ? 1 : 0.4)
            .attr("stroke-width", (search || focusId) ? 2.5 : 1.5);

        link.exit().transition().duration(duration).remove()
            .attr("d", (d: any) => {
                const o = { x: d.source.x, y: d.source.y };
                return diagonal({ source: o, target: o } as any);
            });
    }, [showAll, searchTerm, selectedNode, getYear, parseDate, timelineYear.current, overallMinYearRef.current, overallMaxYearRef.current]);

    useEffect(() => {
        if (!svgRef.current || !containerRef.current || !distroData) return;

        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        // Use a larger virtual radius to spread out nodes and prevent overlap
        const radius = Math.max(width, height, 2400) / 2;

        const svg = d3.select(svgRef.current)
            .attr("width", width)
            .attr("height", height)
            .style("user-select", "none");

        svg.selectAll("*").remove();
        const gZoom = svg.append("g");
        gZoomRef.current = gZoom;

        // Radius scale for years (timeline goes outwards)
        const radiusScale = d3.scaleLinear()
            .domain([overallMinYearRef.current, overallMaxYearRef.current + 2])
            .range([0, radius - 100]); // Margin from edge

        // Groups (centered)
        const gYearLines = gZoom.append("g").attr("class", "year-lines");
        const gLink = gZoom.append("g").attr("fill", "none");
        const gNode = gZoom.append("g").attr("cursor", "pointer").attr("pointer-events", "all");

        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on("zoom", (event) => gZoom.attr("transform", event.transform));

        zoomRef.current = zoom;
        svg.call(zoom as any);

        // Center the view and fit the tree
        const initialScale = Math.min(width, height) / (radius * 2.2);
        svg.call(zoom.transform as any, d3.zoomIdentity.translate(width / 2, height / 2).scale(initialScale));

        const treeLayout = d3.tree<DistroNode>()
            .separation((a, b) => (a.parent == b.parent ? 1 : 2) / a.depth);

        const diagonal = d3.linkRadial()
            .angle((d: any) => d.x)
            .radius((d: any) => d.y);

        let i = 0;

        render(gNode, gLink, gYearLines, treeLayout, diagonal, i, radiusScale, radius);

    }, [showAll, searchTerm, selectedNode, getYear, parseDate, render, overallMinYearRef.current, overallMaxYearRef.current]);

    const handleResetZoom = () => {
        if (!svgRef.current || !containerRef.current || !zoomRef.current) return;
        const height = containerRef.current.clientHeight;
        const width = containerRef.current.clientWidth;
        d3.select(svgRef.current).transition().duration(750).call(
            zoomRef.current.transform as any,
            d3.zoomIdentity.translate(width / 2, height / 2).scale(0.8)
        );
    };

    return (
        <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-[#0f172a]">
            {/* Same UI as FamilyTree, simplified timeline? */}
            <div className="absolute top-8 left-8 z-20 flex flex-col gap-6">
                <div className="flex items-center gap-6">
                    <div className="relative group w-96">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-cyan-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="Research distribution origins..."
                            className="w-full bg-slate-900/40 backdrop-blur-3xl border border-slate-700/50 rounded-2xl py-4.5 pl-14 pr-14 text-sm focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 transition-all text-white shadow-2xl"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {(searchTerm || selectedNode) && (
                            <button
                                onClick={() => { setSearchTerm(''); setSelectedNode(null); }}
                                className="absolute right-4 top-1/2 -translate-y-1/2 bg-rose-500 p-2 rounded-xl text-white hover:bg-rose-400 transition-all shadow-lg"
                                title="Reset Lineage"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    <div className="flex bg-slate-900/40 backdrop-blur-3xl border border-slate-700/50 rounded-2xl p-1.5 shadow-2xl">
                        <button
                            onClick={() => setShowAll(false)}
                            className={`px-6 py-3 rounded-xl text-xs font-black transition-all ${!showAll ? 'bg-cyan-500 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                        >
                            ACTIVE ONLY
                        </button>
                        <button
                            onClick={() => setShowAll(true)}
                            className={`px-6 py-3 rounded-xl text-xs font-black transition-all ${showAll ? 'bg-cyan-500 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                        >
                            SHOW ALL
                        </button>
                        <button
                            onClick={handleReset}
                            className="px-6 py-3 rounded-xl text-xs font-black text-rose-500 hover:bg-rose-500/10 transition-all border-l border-slate-700/50"
                        >
                            RESET
                        </button>
                    </div>
                </div>
                {/* Timeline Control */}
                {/* Timeline Control */}
                <div className="w-[32rem]">
                    <TimelineControls
                        minYear={overallMinYearRef.current}
                        maxYear={overallMaxYearRef.current}
                        currentYear={timelineYear.current}
                        onYearChange={setTimelineYear}
                    />
                </div>
            </div>

            <div className="absolute top-8 right-8 z-20">
                <button
                    onClick={handleResetZoom}
                    className="p-4 bg-slate-900/40 backdrop-blur-3xl border border-slate-700/50 rounded-2xl text-slate-400 hover:text-white transition-all shadow-2xl"
                >
                    <Maximize2 className="w-6 h-6" />
                </button>
            </div>

            <svg ref={svgRef} className="w-full h-full" />

            {/* Selected Node Details - Same as FamilyTree */}
            <AnimatePresence>
                {selectedNode && (
                    <motion.div
                        initial={{ opacity: 0, x: 100 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 100 }}
                        className="absolute bottom-8 right-8 z-30 w-96 bg-slate-950/90 backdrop-blur-3xl border border-white/10 rounded-[3rem] shadow-2xl p-10 overflow-hidden"
                    >
                        <div className="absolute top-0 left-0 w-full h-3" style={{ backgroundColor: selectedNode.color || '#06b6d4' }}></div>

                        <div className="flex items-start gap-8 mb-10">
                            <div className="flex-1">
                                <h2 className="text-4xl font-black text-white leading-[0.9] mb-4">{selectedNode.name}</h2>
                                <p className="text-[10px] text-cyan-400 font-black tracking-[0.3em] uppercase opacity-70">
                                    {selectedNode.parent ? `Ancestor: ${selectedNode.parent}` : 'Origin Project'}
                                </p>
                            </div>
                            <div className="bg-white p-4 rounded-3xl shadow-2xl flex items-center justify-center w-24 h-24 relative overflow-hidden">
                                <img
                                    src={getLogoUrl(selectedNode)}
                                    alt=""
                                    className="w-20 h-20 object-contain z-10"
                                    onError={(e) => { (e.target as HTMLImageElement).src = 'https://distrowatch.com/images/y9go/linux.png'; }}
                                />
                                {selectedNode.popularity && (
                                    <div className="absolute top-0 right-0 bg-yellow-400 text-slate-900 text-[8px] font-black px-2 py-1 rounded-bl-xl z-20 shadow-sm">
                                        #{selectedNode.popularity}
                                    </div>
                                )}
                            </div>


                        </div>

                        <div className="space-y-8 mb-12">
                            <div className="flex items-center gap-6">
                                <div className="p-4 bg-white/5 rounded-3xl text-cyan-400">
                                    <Calendar className="w-7 h-7" />
                                </div>
                                <div>
                                    <p className="text-white font-black text-xl leading-none mb-1">{selectedNode.start || 'Unknown Release'}</p>
                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest leading-none">
                                        {selectedNode.stop ? `Retired ${selectedNode.stop}` : 'In Active Production'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {selectedNode.description && (
                            <p className="text-slate-400 text-[11px] leading-relaxed mb-10 line-clamp-4 font-medium italic opacity-80">
                                "{selectedNode.description}"
                            </p>
                        )}

                        <div className="flex flex-col gap-3">
                            <a href={getDistroWatchUrl(selectedNode.name, selectedNode.url)} target="_blank" rel="noopener noreferrer"
                                className="flex items-center justify-center gap-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-[1.5rem] py-5 text-sm font-black tracking-tight transition-all shadow-glow"
                            >
                                DISTROWATCH
                                <Info className="w-5 h-5" />
                            </a>
                            {selectedNode.url && (
                                <a href={selectedNode.url} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-4 bg-slate-800 hover:bg-slate-700 text-white rounded-[1.5rem] py-4 text-xs font-bold transition-all"
                                >
                                    WEBSITE
                                    <ExternalLink className="w-4 h-4" />
                                </a>
                            )}
                        </div>
                        <button
                            onClick={() => setSelectedNode(null)}
                            className="mt-8 w-full text-[10px] text-slate-500 hover:text-white font-black uppercase tracking-[0.4em] transition-colors py-2"
                        >
                            CLOSE RESEARCH
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div >
    );
};

export default RadialTree;