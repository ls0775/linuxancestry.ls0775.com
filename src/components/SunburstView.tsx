import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { Search, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

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

const SunburstView: React.FC = () => {
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

    // Sanitize data
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
    const [showAll, setShowAll] = useState(false);
    const [focusedPath, setFocusedPath] = useState<any>(null);

    const handleReset = () => {
        setSearchTerm('');
        setShowAll(false);
        setSelectedNode(null);
        setFocusedPath(null);
    };

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
        const parts = d.split(/[.-]/);
        const year = parseInt(parts[0]);
        const month = parts[1] ? parseInt(parts[1]) - 1 : 0;
        const day = parts[2] ? parseInt(parts[2]) : 1;
        return new Date(year, month, day);
    }, []);

    useEffect(() => {
        if (!svgRef.current || !containerRef.current) return;

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;
        const radius = Math.min(width, height) / 2 - 20;

        // Clear previous render
        d3.select(svgRef.current).selectAll('*').remove();

        const svg = d3.select(svgRef.current)
            .attr('width', width)
            .attr('height', height);

        const g = svg.append('g')
            .attr('transform', `translate(${width / 2},${height / 2})`);

        // Filter data
        const now = new Date();
        let filteredData = fixedData.filter(d => {
            if (!showAll && d.stop && parseDate(d.stop) < now) return false;
            if (searchTerm) {
                return d.name.toLowerCase().includes(searchTerm.toLowerCase());
            }
            return true;
        });

        // Create a set of visible IDs for fast lookup
        const visibleIds = new Set(filteredData.map(d => d.id));

        // Find roots (nodes with no parent OR parent is not visible)
        const roots = filteredData.filter(d => !d.parent || d.parent === null || !visibleIds.has(d.parent));
        const hasMultipleRoots = roots.length > 0;

        if (hasMultipleRoots) {
            filteredData = [
                { id: '__virtual_root__', name: 'Linux', isVirtual: true, parent: null, color: '#64748b' },
                ...filteredData.map(d => ({
                    ...d,
                    parent: (!d.parent || !d.parent || !visibleIds.has(d.parent)) ? '__virtual_root__' : d.parent
                }))
            ];
        }

        // Cycle breaking
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

        // Add value to each node (count of descendants + 1)
        root.sum(() => 1);

        // Create partition layout
        const partition = d3.partition<DistroNode>()
            .size([2 * Math.PI, radius]);

        partition(root);

        // Color scale
        const color = d3.scaleOrdinal(d3.schemeCategory10);

        // Arc generator
        const arc = d3.arc<any>()
            .startAngle(d => d.x0)
            .endAngle(d => d.x1)
            .innerRadius(d => d.y0)
            .outerRadius(d => d.y1);

        // Draw arcs
        g.selectAll('path')
            .data(root.descendants())
            .join('path')
            .attr('d', arc)
            .attr('fill', (d: any) => {
                if (d.data.isVirtual) return '#1e293b';
                if (d.data.stop) return '#ef4444'; // Red for discontinued
                if (d.data.color) return d.data.color;
                // Color by root ancestor
                let ancestor = d;
                while (ancestor.parent && !ancestor.parent.data.isVirtual) {
                    ancestor = ancestor.parent;
                }
                return color(ancestor.data.name);
            })
            .attr('stroke', '#0f172a')
            .attr('stroke-width', 1)
            .style('cursor', 'pointer')
            .style('opacity', (d: any) => {
                if (focusedPath) {
                    return focusedPath.includes(d) ? 1 : 0.3;
                }
                return d.depth === 0 ? 0.5 : 0.9;
            })
            .on('click', (event, d: any) => {
                event.stopPropagation();
                if (!d.data.isVirtual) {
                    setSelectedNode(d.data);
                    // Set focused path
                    const path = d.ancestors().reverse();
                    setFocusedPath(path);
                }
            })
            .on('mouseenter', function (_event, d: any) {
                if (!d.data.isVirtual) {
                    d3.select(this)
                        .transition()
                        .duration(200)
                        .style('opacity', 1)
                        .attr('stroke-width', 2);
                }
            })
            .on('mouseleave', function (_event, _d: any) {
                d3.select(this)
                    .transition()
                    .duration(200)
                    .style('opacity', (d: any) => {
                        if (focusedPath) {
                            return focusedPath.includes(d) ? 1 : 0.3;
                        }
                        return d.depth === 0 ? 0.5 : 0.9;
                    })
                    .attr('stroke-width', 1);
            });

        // Add labels for larger segments
        g.selectAll('text')
            .data(root.descendants().filter((d: any) => {
                const angle = d.x1 - d.x0;
                const arcLength = angle * d.y1;
                return arcLength > 20 && d.depth > 0; // Only show if arc is large enough
            }))
            .join('text')
            .attr('transform', (d: any) => {
                const angle = (d.x0 + d.x1) / 2;
                const radius = (d.y0 + d.y1) / 2;
                const x = Math.cos(angle - Math.PI / 2) * radius;
                const y = Math.sin(angle - Math.PI / 2) * radius;
                return `translate(${x},${y}) rotate(${(angle * 180 / Math.PI - 90)})`;
            })
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('fill', '#e2e8f0')
            .attr('font-size', '9px')
            .attr('font-weight', 'bold')
            .style('pointer-events', 'none')
            .style('user-select', 'none')
            .text((d: any) => {
                const angle = d.x1 - d.x0;
                const arcLength = angle * d.y1;
                if (arcLength > 40) return d.data.name;
                return '';
            });

        // Center label
        g.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('fill', '#64748b')
            .attr('font-size', '14px')
            .attr('font-weight', 'bold')
            .text(selectedNode ? selectedNode.name : 'Linux Ecosystem')
            .style('pointer-events', 'none');

    }, [searchTerm, showAll, parseDate, focusedPath, selectedNode]);

    return (
        <div ref={containerRef} className="w-full h-full relative">
            {/* Search Bar */}
            <div className="absolute top-4 left-4 z-10 flex items-center gap-3">
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

                {focusedPath && (
                    <button
                        onClick={() => {
                            setFocusedPath(null);
                            setSelectedNode(null);
                        }}
                        className="px-4 py-2 bg-slate-800/90 backdrop-blur-md border border-slate-700/50 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-all"
                    >
                        RESET VIEW
                    </button>
                )}
            </div>

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
                                onClick={() => {
                                    setSelectedNode(null);
                                    setFocusedPath(null);
                                }}
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

        </div>
    );
};

export default SunburstView;
