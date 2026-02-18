import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { Search, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
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
    popularity?: string | null;
    description?: string | null;
    based_on?: string;
}

const FamilyTree: React.FC = () => {
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
    const fixedData = useMemo(() => {
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
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedNode, setSelectedNode] = useState<DistroNode | null>(null);
    const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
    const [showAll, setShowAll] = useState(false);

    // Timeline state
    const currentYear = new Date().getFullYear();
    const [timelineYear, setTimelineYear] = useState(currentYear);
    const zoomRef = useRef<any>(null);

    const handleReset = () => {
        setSearchTerm('');
        setShowAll(false);
        setSelectedNode(null);
        setFocusedNodeId(null);
        setCollapsedIds(new Set());
        setTimelineYear(currentYear);
        if (svgRef.current && zoomRef.current) {
            d3.select(svgRef.current).transition().duration(750).call(
                zoomRef.current.transform,
                d3.zoomIdentity.translate(0, 0).scale(0.8)
            );
        }
    };

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
        const parts = d.split(/[.-]/);
        const year = parseInt(parts[0]);
        const month = parts[1] ? parseInt(parts[1]) - 1 : 0;
        const day = parts[2] ? parseInt(parts[2]) : 1;
        return new Date(year, month, day);
    }, []);

    const getYear = useCallback((d?: string | null) => {
        if (!d) return 9999;
        const date = parseDate(d);
        if (date.getFullYear() > 3000) return 9999;

        // Calculate decimal year for precise positioning
        // (DayOfYear / 365 or 366)
        const startOfYear = new Date(date.getFullYear(), 0, 1);
        const dayOfYear = (date.getTime() - startOfYear.getTime()) / 86400000;
        return date.getFullYear() + (dayOfYear / 366);
    }, [parseDate]);

    useEffect(() => {
        if (!svgRef.current || !containerRef.current) return;

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;

        // Clear previous render
        d3.select(svgRef.current).selectAll('*').remove();

        const svg = d3.select(svgRef.current)
            .attr('width', width)
            .attr('height', height);

        const g = svg.append('g');

        // Add zoom behavior
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
                // Keep font size constant by scaling inversely
                g.selectAll('.year-label-major').style('font-size', (12 / event.transform.k) + 'px');
                g.selectAll('.year-label-minor').style('font-size', (10 / event.transform.k) + 'px');
            });
        zoomRef.current = zoom;

        svg.call(zoom)
            .on('click', () => {
                setFocusedNodeId(null);
                setSelectedNode(null);
            });

        // Filter data based on timeline and search
        let filteredData = fixedData.filter(d => {
            const startYear = getYear(d.start);

            // timelineYear filter: Hide future distros
            if (startYear > timelineYear + 0.999) return false;

            // showAll filter: If "Active Only", hide distros that ended BEFORE the timeline year
            if (!showAll && d.stop) {
                const stopYear = getYear(d.stop);
                if (stopYear < timelineYear) return false;
            }

            if (searchTerm) {
                return d.name.toLowerCase().includes(searchTerm.toLowerCase());
            }
            return true;
        });

        // Dynamic Horizontal Line Focus: If a node is selected, show only its lineage
        if (selectedNode) {
            const lineageIds = new Set<string>();
            lineageIds.add(selectedNode.id);

            // Ancestors (trace up)
            const idMap = new Map(fixedData.map(d => [d.id, d]));
            let curr: DistroNode | undefined = selectedNode;
            while (curr && curr.parent) {
                const p = idMap.get(curr.parent);
                if (p) {
                    lineageIds.add(p.id);
                    curr = p;
                } else {
                    break;
                }
            }
            lineageIds.add('__virtual_root__');

            // Descendants (trace down)
            const fixedParentMap = new Map<string, string[]>();
            fixedData.forEach(d => {
                if (d.parent) {
                    const existing = fixedParentMap.get(d.parent) || [];
                    existing.push(d.id);
                    fixedParentMap.set(d.parent, existing);
                }
            });

            const addDescendants = (pid: string) => {
                const children = fixedParentMap.get(pid);
                if (children) {
                    children.forEach(cid => {
                        lineageIds.add(cid);
                        addDescendants(cid);
                    });
                }
            };
            addDescendants(selectedNode.id);

            // Apply filter
            filteredData = filteredData.filter(d => lineageIds.has(d.id));
        }

        // Add virtual root for multiple root nodes
        // Create a set of visible IDs for fast lookup
        const visibleIds = new Set(filteredData.map(d => d.id));

        // Find roots (nodes with no parent OR parent is not visible)
        const effectiveRoots = filteredData.filter(d => !d.parent || !visibleIds.has(d.parent));
        const hasMultipleRoots = effectiveRoots.length > 0; // Almost always true with filtering

        if (hasMultipleRoots) {
            filteredData = [
                { id: '__virtual_root__', name: 'Linux Origins', isVirtual: true, parent: null, start: '1991-01-01' },
                ...filteredData.map(d => ({
                    ...d,
                    // If parent is not visible (filtered out), re-parent to virtual root
                    parent: (!d.parent || !visibleIds.has(d.parent)) ? '__virtual_root__' : d.parent
                }))
            ];
        }

        // Cycle breaking and validation
        const idMap = new Map<string, any>();
        filteredData.forEach(d => idMap.set(d.id, d));

        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const hasCycle = (nodeId: string): boolean => {
            if (recursionStack.has(nodeId)) return true;
            if (visited.has(nodeId)) return false;

            visited.add(nodeId);
            recursionStack.add(nodeId);

            const node = idMap.get(nodeId);
            if (node && node.parent && node.parent !== '__virtual_root__') {
                if (hasCycle(node.parent)) {
                    // Auto-fix cycle
                    node.parent = '__virtual_root__';
                }
            }

            recursionStack.delete(nodeId);
            return false;
        };

        filteredData.forEach(d => hasCycle(d.id));

        // Create hierarchy
        const stratify = d3.stratify<DistroNode>()
            .id(d => d.id)
            .parentId(d => d.parent || null);

        let root;
        try {
            root = stratify(filteredData);
        } catch (e) {
            console.error('Stratification error:', e);
            return;
        }

        // Apply collapse state
        root.descendants().forEach((d: any) => {
            if (collapsedIds.has(d.data.id)) {
                if (d.children) {
                    d._children = d.children;
                    d.children = null;
                }
            }
        });

        // Timeline setup
        const minYear = 1991;
        const maxYear = new Date().getFullYear();

        const margin = { top: 80, right: 50, bottom: 80, left: 50 };
        const chartWidth = width - margin.left - margin.right;
        const chartHeight = height - margin.top - margin.bottom;

        // X scale: time-based (horizontal)
        const xScale = d3.scaleLinear()
            .domain([minYear, maxYear])
            .range([0, chartWidth]);


        // Draw year gridlines
        const yearGridGroup = g.append('g').attr('class', 'year-grid');

        // Color scale for families
        const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

        for (let year = minYear; year <= maxYear; year += 5) {
            const x = xScale(year) + margin.left;

            // Vertical line
            yearGridGroup.append('line')
                .attr('x1', x)
                .attr('y1', margin.top)
                .attr('x2', x)
                .attr('y2', height - margin.bottom)
                .attr('stroke', '#1e293b')
                .attr('stroke-width', year % 10 === 0 ? 2 : 1)
                .attr('stroke-opacity', year % 10 === 0 ? 0.5 : 0.3);

            const isMajor = year % 10 === 0;
            const className = isMajor ? 'year-label-major' : 'year-label-minor';
            const fontSize = isMajor ? '12px' : '10px';
            const fontWeight = isMajor ? 'bold' : 'normal';

            // Year label at top
            yearGridGroup.append('text')
                .attr('class', className)
                .attr('x', x)
                .attr('y', margin.top - 10)
                .attr('text-anchor', 'middle')
                .attr('fill', '#64748b')
                .attr('font-size', fontSize)
                .attr('font-weight', fontWeight)
                .text(year);

            // Year label at bottom
            yearGridGroup.append('text')
                .attr('class', className)
                .attr('x', x)
                .attr('y', height - margin.bottom + 25)
                .attr('text-anchor', 'middle')
                .attr('fill', '#64748b')
                .attr('font-size', fontSize)
                .attr('font-weight', fontWeight)
                .text(year);
        }

        // Calculate dynamic height based on leaf count to avoid overlap
        // Allocate vertical space per leaf node
        const leaves = root.leaves().length;
        const minHeightPerLeaf = 24;
        const layoutHeight = Math.max(chartHeight, leaves * minHeightPerLeaf);

        const treeLayout = d3.tree<DistroNode>()
            .size([layoutHeight, chartWidth])
            .separation((a, b) => (a.parent === b.parent ? 1 : 2));

        treeLayout(root);

        // Calculate focus state
        let focusedNode: any = null;
        const relatedIds = new Set<string>();

        if (focusedNodeId) {
            focusedNode = root.descendants().find((d: any) => d.data.id === focusedNodeId);
            if (focusedNode) {
                // Highlight ancestors (path to root) and descendants (family tree)
                focusedNode.ancestors().forEach((d: any) => relatedIds.add(d.data.id));
                focusedNode.descendants().forEach((d: any) => relatedIds.add(d.data.id));
            }
        }

        // Position nodes based on start date (X) and tree layout breadth (Y)
        root.each((node: any) => {
            const startYear = getYear(node.data.start);

            // Override X with time-scale
            // Keep Y from tree layout (which is stored in node.x by d3.tree horizontal logic? No, let's verify)

            // d3.tree().size([height, width])
            // Standard vertical tree: x=breadth (horizontal), y=depth (vertical)

            // If we want a horizontal tree layout from D3, usually we swap x/y.
            // Here, we want D3 to compute vertical positions for us.
            // If we use default vertical tree layout: 
            // node.x will be horizontal position (0..width)
            // node.y will be vertical position (0..height)

            // Wait, if root is "Linux Origins" and it has many children, 
            // a vertical tree puts root at top (x=center), children spread below.

            // We want Root at Left (Vertical Center), children spread to right.
            // This corresponds to node.x in a vertical tree becoming our node.y!

            // Let's use node.x from the layout as our node.y
            const computedY = node.x;

            node.x = xScale(startYear) + margin.left;
            node.y = computedY + margin.top;
        });

        // Draw links
        g.selectAll('.link')
            .data(root.links())
            .join('path')
            .attr('class', 'link')
            .attr('d', (d: any) => {
                const sourceX = d.source.x;
                const sourceY = d.source.y;
                const targetX = d.target.x;
                const targetY = d.target.y;

                // Smooth cubic Bezier curve for horizontal flow (Left-to-Right)
                // Control points create a horizontal ease-out from parent and horizontal ease-in to child

                // If nodes are far apart vertically, add some vertical easing too
                const xDist = Math.abs(targetX - sourceX);
                const curvature = Math.min(xDist * 0.5, 100); // Cap curvature radius

                return `M ${sourceX},${sourceY}
                        C ${sourceX + curvature},${sourceY}
                          ${targetX - curvature},${targetY}
                          ${targetX},${targetY}`;
            })
            .attr('fill', 'none')
            .attr('stroke', '#475569')
            .attr('stroke-width', 2)
            .attr('stroke-opacity', (d: any) => {
                if (!focusedNodeId) return 0.6;
                // Highlight link only if both ends are part of the focused family
                return (relatedIds.has(d.source.data.id) && relatedIds.has(d.target.data.id)) ? 0.8 : 0.1;
            });

        // Draw nodes
        const nodes = g.selectAll('.node')
            .data(root.descendants())
            .join('g')
            .attr('class', 'node')
            .attr('transform', (d: any) => `translate(${d.x},${d.y})`)
            .style('cursor', 'pointer')
            .style('opacity', (d: any) => {
                if (!focusedNodeId) return 1;
                return relatedIds.has(d.data.id) ? 1 : 0.1;
            })
            .on('click', (event, d) => {
                event.stopPropagation();
                if (d.data.isVirtual) return;

                if (focusedNodeId === d.data.id) {
                    // Already focused -> Toggle details? Or nothing?
                    // If we toggle off, filter is removed.
                    // Let's keep it selected.
                    // Or maybe toggle off resets?
                    // User says "until users resets". Reset is usually background click.
                    // So clicking node again does nothing? Or keeps panel open?
                    setSelectedNode(d.data);
                } else {
                    // New Focus -> Filter Lineage Immediately
                    setFocusedNodeId(d.data.id);
                    setSelectedNode(d.data);

                    // Auto-expand ancestors and self to show lineage and children
                    setCollapsedIds(prev => {
                        const next = new Set(prev);
                        next.delete(d.data.id); // Expand self
                        if (d.ancestors) {
                            d.ancestors().forEach((a: any) => next.delete(a.data.id));
                        }
                        return next;
                    });
                }
            });

        // Zoom to focused node
        if (focusedNode) {
            const scale = 1.5;
            const x = -focusedNode.x * scale + width / 2;
            const y = -focusedNode.y * scale + height / 2;

            svg.transition().duration(750).call(
                zoom.transform as any,
                d3.zoomIdentity.translate(x, y).scale(scale)
            );
        }

        // Node circles
        nodes.append('circle')
            .attr('r', d => d.data.isVirtual ? 8 : 6)
            .attr('fill', (d: any) => {
                if (d.data.isVirtual) return '#64748b';
                if (d.data.stop) return '#ef4444'; // Red for discontinued

                // Find family root
                let family = d;
                while (family.parent && family.parent.data.id !== '__virtual_root__') {
                    family = family.parent;
                }
                return colorScale(family.data.id);
            })
            .attr('stroke', '#0f172a')
            .attr('stroke-width', 2)
            .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))');

        // Node labels
        nodes.append('text')
            .attr('dy', -12)
            .attr('text-anchor', 'middle')
            .attr('fill', '#e2e8f0')
            .attr('font-size', '11px')
            .attr('font-weight', d => d.data.isVirtual ? 'bold' : 'normal')
            .text(d => d.data.name)
            .style('pointer-events', 'none')
            .style('user-select', 'none');

        // Toggle buttons (for nodes with children)
        const toggles = nodes.filter((d: any) => d.children || d._children)
            .append('g')
            .attr('class', 'toggle-btn')
            .attr('transform', 'translate(14, 0)')
            .style('cursor', 'pointer')
            .on('click', (event, d) => {
                event.stopPropagation();
                setCollapsedIds(prev => {
                    const next = new Set(prev);
                    if (next.has(d.data.id)) {
                        next.delete(d.data.id); // Expand
                    } else {
                        next.add(d.data.id); // Collapse
                    }
                    return next;
                });
            });

        toggles.append('circle')
            .attr('r', 5)
            .attr('fill', '#1e293b')
            .attr('stroke', '#cbd5e1')
            .attr('stroke-width', 1);

        toggles.append('text')
            .attr('dy', 0.5)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('font-size', '8px')
            .attr('font-weight', 'bold')
            .attr('fill', '#e2e8f0')
            .text((d: any) => d._children ? '+' : '-');


        // Initial zoom / Auto-Center
        if (selectedNode) {
            const targetNode = root.descendants().find((d: any) => d.data.id === selectedNode.id);
            if (targetNode && typeof targetNode.x === 'number' && typeof targetNode.y === 'number') {
                const x = targetNode.x;
                const y = targetNode.y;

                svg.transition().duration(750).call(
                    zoom.transform as any,
                    d3.zoomIdentity.translate(width / 2 - x, height / 2 - y).scale(1)
                );
            }
        } else if (!focusedNodeId) {
            const initialScale = 0.8;
            const initialTranslateX = (width - chartWidth * initialScale) / 2;
            const initialTranslateY = 0;
            svg.call(zoom.transform as any, d3.zoomIdentity
                .translate(initialTranslateX, initialTranslateY)
                .scale(initialScale));
        }

    }, [searchTerm, showAll, parseDate, getYear, timelineYear, focusedNodeId, collapsedIds, selectedNode, fixedData]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="w-full h-full relative">
            {/* Search Bar */}
            {/* Search, Filter & Timeline Overlay */}
            <div className="absolute top-4 left-4 z-10 flex flex-col gap-4">
                {/* Row 1: Search & Filter */}
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search distributions..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-2 bg-slate-800/90 backdrop-blur-md border border-slate-700/50 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 w-64"
                        />
                    </div>

                    <div className="flex bg-slate-800/90 backdrop-blur-md rounded-xl border border-slate-700/50 overflow-hidden">
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

                {/* Row 2: Timeline */}
                <div className="w-[30rem]">
                    <TimelineControls
                        minYear={1991}
                        maxYear={currentYear}
                        currentYear={timelineYear}
                        onYearChange={setTimelineYear}
                    />
                </div>
            </div>

            {/* Timeline Controls */}


            {/* SVG Canvas */}
            <svg ref={svgRef} className="w-full h-full" />

            {/* Info Panel */}
            <AnimatePresence>
                {selectedNode && (
                    <motion.div
                        initial={{ x: 400, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 400, opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="absolute top-4 right-4 w-96 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden z-20"
                    >
                        <div className="p-8">
                            <button
                                onClick={() => setSelectedNode(null)}
                                className="absolute top-6 right-6 text-slate-400 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <div className="flex items-start gap-6 mb-8">
                                <div>
                                    <h2 className="text-2xl font-black text-white mb-2 leading-tight">
                                        {selectedNode.name}
                                    </h2>
                                    <p className="text-xs text-slate-400 font-medium tracking-wide uppercase">
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

                            <div className="space-y-4 mb-8">
                                <div>
                                    <div className="text-[10px] text-slate-500 font-black tracking-widest uppercase mb-1">Release Date</div>
                                    <div className="text-sm text-slate-300 font-medium">{selectedNode.start || 'Unknown'}</div>
                                </div>
                                {selectedNode.stop && (
                                    <div>
                                        <div className="text-[10px] text-slate-500 font-black tracking-widest uppercase mb-1">Discontinued</div>
                                        <div className="text-sm text-red-400 font-medium">{selectedNode.stop}</div>
                                    </div>
                                )}
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
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div >
    );
};

export default FamilyTree;
