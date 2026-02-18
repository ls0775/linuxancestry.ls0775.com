import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { Search, X } from 'lucide-react';
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
    popularity?: string | null;
    description?: string | null;
    based_on?: string;
}

const IcicleView: React.FC = () => {
    const [distroData, setDistroData] = useState<DistroNode[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedNode, setSelectedNode] = useState<DistroNode | null>(null);
    const [showAll, setShowAll] = useState(false);

    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

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

    const handleReset = () => {
        setSearchTerm('');
        setShowAll(false);
        setSelectedNode(null);
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

    const fixedData = useMemo(() => {
        if (!distroData.length) return [];
        const data = (distroData as DistroNode[]).map(d => ({ ...d }));
        const idMap = new Map(data.map(d => [d.id, d]));

        const ubuntu = idMap.get('ubuntu');
        if (ubuntu && ubuntu.parent !== 'debian') {
            ubuntu.parent = 'debian';
        }

        data.forEach(d => {
            if (d.id === 'ubuntu') return;
            const basedOn = d.based_on || '';
            const desc = d.description || '';
            if (basedOn.includes('Ubuntu') || desc.includes('Ubuntu-based') || desc.includes('based on Ubuntu')) {
                if (d.parent !== 'ubuntu') d.parent = 'ubuntu';
            }
        });
        return data;
    }, [distroData]);

    useEffect(() => {
        if (!svgRef.current || !containerRef.current || !fixedData.length) return;

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;

        d3.select(svgRef.current).selectAll('*').remove();

        const svg = d3.select(svgRef.current)
            .attr('width', width)
            .attr('height', height);

        const now = new Date();
        let filteredData = fixedData.filter(d => {
            if (!showAll && d.stop && parseDate(d.stop) < now) return false;
            if (searchTerm) {
                return d.name.toLowerCase().includes(searchTerm.toLowerCase());
            }
            return true;
        });

        const visibleIds = new Set(filteredData.map(d => d.id));

        // Icicle requires a single root
        const virtualRoot: any = {
            id: '__virtual_root__',
            name: 'Linux Ecosystem',
            isVirtual: true,
            parent: null,
            children: []
        };

        const stratifyData = filteredData.length === 0 ? [virtualRoot] : [virtualRoot, ...filteredData];

        const stratify = d3.stratify<DistroNode>()
            .id(d => d.id)
            .parentId(d => (!d.parent || !visibleIds.has(d.parent)) ? (d.id === '__virtual_root__' ? null : '__virtual_root__') : d.parent);

        let root;
        try {
            root = stratify(stratifyData);
        } catch (e) {
            console.error('Icicle stratification error:', e);
            return;
        }

        // Sum popularity or just count nodes for sizing
        root.count(); 
        root.sort((a, b) => (b.height - a.height) || (b.value! - a.value!));

        const partition = d3.partition<DistroNode>()
            .size([height, width])
            .padding(1);

        partition(root);

        const g = svg.append('g');

        const cell = g.selectAll('g')
            .data(root.descendants())
            .join('g')
            .attr('transform', (d: any) => `translate(${d.y0},${d.x0})`);

        cell.append('rect')
            .attr('width', (d: any) => d.y1 - d.y0)
            .attr('height', (d: any) => d.x1 - d.x0)
            .attr('fill', (d: any) => {
                if (d.data.isVirtual) return '#1e293b';
                if (d.data.stop) return '#ef4444';
                return d.data.color || '#06b6d4';
            })
            .attr('fill-opacity', 0.8)
            .attr('stroke', '#0f172a')
            .attr('stroke-width', 0.5)
            .style('cursor', 'pointer')
            .on('click', (event, d) => {
                if (d.data.isVirtual) return;
                setSelectedNode(d.data);
                event.stopPropagation();
            });

        cell.append('text')
            .filter((d: any) => (d.x1 - d.x0) > 10 && (d.y1 - d.y0) > 20)
            .attr('x', 4)
            .attr('y', (d: any) => (d.x1 - d.x0) / 2)
            .attr('dy', '0.35em')
            .attr('fill', '#ffffff')
            .attr('font-size', '10px')
            .attr('font-weight', 'bold')
            .style('pointer-events', 'none')
            .text((d: any) => d.data.name);

        // Add Zoom
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.5, 8])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });

        svg.call(zoom);

    }, [fixedData, searchTerm, showAll]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="w-full h-full relative bg-[#0f172a]">
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
            </div>

            <svg ref={svgRef} className="w-full h-full" />

            <AnimatePresence>
                {selectedNode && (
                    <motion.div
                        initial={{ x: 400, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 400, opacity: 0 }}
                        className="absolute top-4 right-4 w-96 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden z-20"
                    >
                        <div className="p-8">
                            <button onClick={() => setSelectedNode(null)} className="absolute top-6 right-6 text-slate-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                            <div className="flex items-start gap-6 mb-8">
                                <div>
                                    <h2 className="text-2xl font-black text-white mb-2">{selectedNode.name}</h2>
                                    <p className="text-xs text-slate-400 font-medium uppercase">{selectedNode.parent || 'Root'}</p>
                                </div>
                                <div className="bg-white p-2 rounded-xl w-20 h-20 flex items-center justify-center overflow-hidden">
                                    <img src={getLogoUrl(selectedNode)} alt="" className="w-16 h-16 object-contain" />
                                </div>
                            </div>
                            <div className="text-sm text-slate-300 leading-relaxed max-h-60 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700">
                                {selectedNode.description || 'Historical distribution tracing back to the early days of the Linux kernel ecosystem.'}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default IcicleView;
