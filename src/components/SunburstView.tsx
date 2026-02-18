import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { Search, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDistroData, type DistroNode } from '../hooks/useDistroData';

const SunburstView: React.FC = () => {
    const { data: fixedData, isLoading } = useDistroData();
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
        if (!svgRef.current || !containerRef.current || !fixedData.length) return;

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;
        const radius = Math.min(width, height) / 2 - 20;

        d3.select(svgRef.current).selectAll('*').remove();
        const svg = d3.select(svgRef.current).attr('width', width).attr('height', height);
        const g = svg.append('g').attr('transform', `translate(${width / 2},${height / 2})`);

        const now = new Date();
        let filteredData = fixedData.filter(d => {
            if (!showAll && d.stop && parseDate(d.stop) < now) return false;
            if (searchTerm) return d.name.toLowerCase().includes(searchTerm.toLowerCase());
            return true;
        });

        const visibleIds = new Set(filteredData.map(d => d.id));
        const roots = filteredData.filter(d => !d.parent || !visibleIds.has(d.parent));
        if (roots.length > 0) {
            filteredData = [
                { id: '__virtual_root__', name: 'Linux', isVirtual: true, parent: null, color: '#64748b' },
                ...filteredData.map(d => ({
                    ...d,
                    parent: (!d.parent || !visibleIds.has(d.parent)) ? '__virtual_root__' : d.parent
                }))
            ];
        }

        if (filteredData.length === 0) {
            filteredData = [{ id: '__virtual_root__', name: 'Linux', isVirtual: true, parent: null, color: '#64748b' }];
        }

        const currentVisibleIds = new Set(filteredData.map(d => d.id));

        const stratify = d3.stratify<DistroNode>()
            .id(d => d.id)
            .parentId(d => {
                if (d.id === '__virtual_root__') return null;
                return (d.parent && currentVisibleIds.has(d.parent)) ? d.parent : '__virtual_root__';
            });
        let root;
        try {
            root = stratify(filteredData);
        } catch (e) {
            console.error('Stratification error:', e);
            return;
        }

        root.sum(() => 1);
        const partition = d3.partition<DistroNode>().size([2 * Math.PI, radius]);
        partition(root);

        const color = d3.scaleOrdinal(d3.schemeCategory10);
        const arc = d3.arc<any>().startAngle(d => d.x0).endAngle(d => d.x1).innerRadius(d => d.y0).outerRadius(d => d.y1);

        g.selectAll('path')
            .data(root.descendants())
            .join('path')
            .attr('display', d => d.depth ? null : 'none')
            .attr('d', arc as any)
            .style('stroke', '#0f172a')
            .style('stroke-width', '1px')
            .style('fill', (d: any) => {
                if (d.data.isVirtual) return '#64748b';
                if (d.data.stop) return '#ef4444';
                let family = d;
                while (family.parent && family.parent.depth > 0) { family = family.parent; }
                return color(family.data.id);
            })
            .style('cursor', 'pointer')
            .on('click', (event, d) => {
                setSelectedNode(d.data);
                setFocusedPath(d);
                event.stopPropagation();
            });

        g.selectAll('text')
            .data(root.descendants().filter((d: any) => {
                const angle = d.x1 - d.x0;
                const arcLength = angle * d.y1;
                return arcLength > 20 && d.depth > 0;
            }))
            .join('text')
            .attr('transform', (d: any) => {
                const angle = (d.x0 + d.x1) / 2;
                const radius = (d.y0 + d.y1) / 2;
                const x = Math.cos(angle - Math.PI / 2) * radius;
                const y = Math.sin(angle - Math.PI / 2) * radius;
                return `translate(${x},${y}) rotate(${(angle * 180 / Math.PI - 90)})`;
            })
            .attr('text-anchor', 'middle').attr('dy', '0.35em').attr('fill', '#e2e8f0').attr('font-size', '9px').attr('font-weight', 'bold').style('pointer-events', 'none')
            .text((d: any) => (d.x1 - d.x0) * d.y1 > 40 ? d.data.name : '');

        g.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em').attr('fill', '#64748b').attr('font-size', '14px').attr('font-weight', 'bold')
            .text(selectedNode ? selectedNode.name : 'Linux Ecosystem').style('pointer-events', 'none');

    }, [searchTerm, showAll, parseDate, focusedPath, selectedNode, fixedData]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="w-full h-full relative">
            <div className="absolute top-4 left-4 z-10 flex items-center gap-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text" placeholder="Search distributions..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 pr-4 py-2 bg-slate-800/90 backdrop-blur-md border border-slate-700/50 rounded-xl text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 w-64"
                    />
                </div>
                <div className="flex bg-slate-800/90 backdrop-blur-md rounded-xl border border-slate-700/50 overflow-hidden">
                    <button onClick={() => setShowAll(false)} className={`px-6 py-3 rounded-xl text-xs font-black transition-all ${!showAll ? 'bg-cyan-500 text-white' : 'text-slate-500 hover:text-white'}`}>ACTIVE ONLY</button>
                    <button onClick={() => setShowAll(true)} className={`px-6 py-3 rounded-xl text-xs font-black transition-all ${showAll ? 'bg-cyan-500 text-white' : 'text-slate-500 hover:text-white'}`}>SHOW ALL</button>
                    <button onClick={handleReset} className="px-6 py-3 rounded-xl text-xs font-black text-rose-500 hover:bg-rose-500/10 transition-all border-l border-slate-700/50">RESET</button>
                </div>
                {focusedPath && <button onClick={() => { setFocusedPath(null); setSelectedNode(null); }} className="px-4 py-2 bg-slate-800/90 backdrop-blur-md border border-slate-700/50 rounded-xl text-xs font-bold text-slate-400 hover:text-white">RESET VIEW</button>}
            </div>
            <svg ref={svgRef} className="w-full h-full" />
            <AnimatePresence>
                {selectedNode && (
                    <motion.div initial={{ x: 400, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 400, opacity: 0 }} className="absolute top-4 right-4 w-96 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden z-20">
                        <div className="p-8">
                            <button onClick={() => { setSelectedNode(null); setFocusedPath(null); }} className="absolute top-6 right-6 text-slate-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
                            <div className="flex items-start gap-6 mb-8">
                                <div>
                                    <h2 className="text-2xl font-black text-white mb-2 leading-tight">{selectedNode.name}</h2>
                                    <p className="text-xs text-slate-400 font-medium tracking-wide uppercase">{selectedNode.parent ? `Ancestor: ${selectedNode.parent}` : 'Origin Project'}</p>
                                </div>
                                <div className="bg-white p-4 rounded-3xl shadow-2xl flex items-center justify-center w-24 h-24 relative overflow-hidden">
                                    <img src={getLogoUrl(selectedNode)} alt="" className="w-20 h-20 object-contain z-10" onError={(e) => { (e.target as HTMLImageElement).src = 'https://distrowatch.com/images/y9go/linux.png'; }} />
                                    {selectedNode.popularity && <div className="absolute top-0 right-0 bg-yellow-400 text-slate-900 text-[8px] font-black px-2 py-1 rounded-bl-xl z-20 shadow-sm">#{selectedNode.popularity}</div>}
                                </div>
                            </div>
                            <div className="text-sm text-slate-300 leading-relaxed max-h-60 overflow-y-auto pr-2 mb-8 scrollbar-thin scrollbar-thumb-slate-700">
                                {selectedNode.description || 'Historical distribution tracing back to the early days of the Linux kernel ecosystem.'}
                            </div>
                            <a href={getDistroWatchUrl(selectedNode.name, selectedNode.url)} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full py-4 bg-cyan-500 hover:bg-cyan-400 text-white rounded-2xl font-black text-xs tracking-widest transition-all shadow-lg">VIEW ON DISTROWATCH <Info className="w-4 h-4" /></a>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default SunburstView;
