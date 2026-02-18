import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { Search, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import TimelineControls from './TimelineControls';
import { useDistroData, type DistroNode } from '../hooks/useDistroData';

const FamilyTree: React.FC = () => {
    const { data: fixedData, isLoading } = useDistroData();
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    // State
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedNode, setSelectedNode] = useState<DistroNode | null>(null);
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
    const [showAll, setShowAll] = useState(false);
    
    const currentYear = new Date().getFullYear();
    const [timelineYear, setTimelineYear] = useState(currentYear);

    // D3 Persistence
    const zoomRef = useRef<any>(null);
    const groupsRef = useRef<{
        gZoom: any,
        gGrid: any,
        gLink: any,
        gNode: any,
        xScale: any,
        treeLayout: any,
        margin: any
    } | null>(null);

    const handleReset = () => {
        setSearchTerm('');
        setShowAll(false);
        setSelectedNode(null);
        setCollapsedIds(new Set());
        setTimelineYear(currentYear);
        if (svgRef.current && zoomRef.current) {
            d3.select(svgRef.current).transition().duration(750).call(
                zoomRef.current.transform,
                d3.zoomIdentity.translate(50, 50).scale(0.6)
            );
        }
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
        const startOfYear = new Date(date.getFullYear(), 0, 1);
        const dayOfYear = (date.getTime() - startOfYear.getTime()) / 86400000;
        return date.getFullYear() + (dayOfYear / 366);
    }, [parseDate]);

    // Unified Initialization and Update Effect
    useEffect(() => {
        if (!svgRef.current || !containerRef.current || !fixedData.length) return;

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (width === 0 || height === 0) return;

        const margin = { top: 100, right: 100, bottom: 100, left: 100 };
        // Increase base sizes to prevent compression
        const chartWidth = 2400; 
        const chartHeight = 1200;

        // 1. Setup Groups if missing
        if (!groupsRef.current) {
            const svg = d3.select(svgRef.current).attr('width', width).attr('height', height);
            svg.selectAll('*').remove();
            const gZoom = svg.append('g');

            const xScale = d3.scaleLinear().domain([1991, currentYear]).range([0, chartWidth]);
            const gGrid = gZoom.append('g').attr('class', 'year-grid');
            const gLink = gZoom.append('g').attr('class', 'links');
            const gNode = gZoom.append('g').attr('class', 'nodes');

            const zoom = d3.zoom<SVGSVGElement, unknown>()
                .scaleExtent([0.05, 4])
                .on('zoom', (event) => {
                    gZoom.attr('transform', event.transform);
                    gZoom.selectAll('.year-label-major').style('font-size', (12 / event.transform.k) + 'px');
                    gZoom.selectAll('.year-label-minor').style('font-size', (10 / event.transform.k) + 'px');
                });
            zoomRef.current = zoom;
            svg.call(zoom).on('click', () => { setSelectedNode(null); });

            // Initial view - pull back to see more
            svg.call(zoom.transform as any, d3.zoomIdentity.translate(50, height/4).scale(0.3));

            const treeLayout = d3.tree<DistroNode>().size([chartHeight, chartWidth]).separation((a, b) => (a.parent === b.parent ? 1.5 : 2.5));

            groupsRef.current = { gZoom, gGrid, gLink, gNode, xScale, treeLayout, margin };
        }

        // 2. Perform Update
        const { gGrid, gLink, gNode, xScale, treeLayout } = groupsRef.current;
        const duration = 400;
        const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

        // Grid Update
        const yearsToDraw = d3.range(1991, currentYear + 1, 5);
        const gridLines = gGrid.selectAll('line').data(yearsToDraw);
        gridLines.enter().append('line')
            .attr('stroke', '#1e293b').attr('stroke-width', (d: any) => d % 10 === 0 ? 2 : 1).attr('stroke-opacity', (d: any) => d % 10 === 0 ? 0.5 : 0.3)
            .merge(gridLines as any)
            .attr('x1', (d: any) => xScale(d)).attr('x2', (d: any) => xScale(d))
            .attr('y1', -100).attr('y2', chartHeight + 100);

        const gridLabels = gGrid.selectAll('text').data(yearsToDraw.flatMap(y => [{y, pos:'top'}, {y, pos:'bottom'}]));
        gridLabels.enter().append('text')
            .attr('class', (d: any) => d.y % 10 === 0 ? 'year-label-major' : 'year-label-minor')
            .attr('text-anchor', 'middle').attr('fill', '#64748b')
            .style('font-size', (d: any) => d.y % 10 === 0 ? '12px' : '10px').style('font-weight', (d: any) => d.y % 10 === 0 ? 'bold' : 'normal')
            .merge(gridLabels as any)
            .attr('x', (d: any) => xScale(d.y))
            .attr('y', (d: any) => d.pos === 'top' ? -20 : chartHeight + 30)
            .text((d: any) => d.y);

        // Data Prep
        let filteredData = fixedData.filter(d => {
            const startYear = getYear(d.start);
            if (startYear > timelineYear + 0.999) return false;
            if (!showAll && d.stop && getYear(d.stop) < timelineYear) return false;
            if (searchTerm && !d.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
            return true;
        });

        const relatedIds = new Set<string>();
        if (selectedNode) {
            const idMap = new Map(fixedData.map(d => [d.id, d]));
            let curr: DistroNode | undefined = selectedNode;
            while (curr) { relatedIds.add(curr.id); curr = curr.parent ? idMap.get(curr.parent) : undefined; }
            relatedIds.add('__virtual_root__');
            const addDescendants = (pid: string) => {
                fixedData.filter(d => d.parent === pid).forEach(child => { relatedIds.add(child.id); addDescendants(child.id); });
            };
            addDescendants(selectedNode.id);
            filteredData = filteredData.filter(d => relatedIds.has(d.id));
        }

        if (filteredData.length === 0) filteredData = [{ id: '__virtual_root__', name: 'Linux Origins', isVirtual: true, parent: null, start: '1991-01-01' }];
        const currentVisibleIds = new Set(filteredData.map(d => d.id));
        const stratify = d3.stratify<DistroNode>().id(d => d.id).parentId(d => (d.id === '__virtual_root__') ? null : (d.parent && currentVisibleIds.has(d.parent) ? d.parent : '__virtual_root__'));
        
        let root: d3.HierarchyNode<DistroNode>;
        try { root = stratify(filteredData); } catch (e) { return; }
        root.descendants().forEach((d: any) => { if (collapsedIds.has(d.data.id) && d.children) { d._children = d.children; d.children = null; } });
        
        treeLayout(root);
        root.descendants().forEach((node: any) => {
            // node.x from d3.tree is the BREADTH (vertical here)
            // node.y from d3.tree is the DEPTH (horizontal here)
            // WE OVERRIDE x with time
            const verticalPos = node.x; 
            node.x = xScale(getYear(node.data.start)); 
            node.y = verticalPos; 
        });

        // Update Links
        const linkSelection = gLink.selectAll('path.link-path').data(root.links(), (d: any) => d.target.data.id);
        linkSelection.exit().transition().duration(duration).attr('stroke-opacity', 0).remove();
        linkSelection.enter().append('path').attr('class', 'link-path')
            .attr('fill', 'none').attr('stroke', '#475569').attr('stroke-width', 2).attr('stroke-opacity', 0)
            .merge(linkSelection as any).transition().duration(duration)
            .attr('stroke-opacity', (d: any) => !selectedNode ? 0.6 : (relatedIds.has(d.source.data.id) && relatedIds.has(d.target.data.id) ? 0.8 : 0.1))
            .attr('d', (d: any) => {
                const midX = d.source.x + (d.target.x - d.source.x) * 0.4;
                return `M ${d.source.x},${d.source.y} H ${midX} V ${d.target.y} H ${d.target.x}`;
            });

        // Update Nodes
        const nodes = root.descendants();
        const nodeSelection = gNode.selectAll('g.node-group').data(nodes, (d: any) => d.data.id);
        nodeSelection.exit().transition().duration(duration).attr('opacity', 0).remove();
        
        const nodeEnter = nodeSelection.enter().append('g').attr('class', 'node-group').attr('cursor', 'pointer').attr('opacity', 0)
            .on('click', (event: any, d: any) => {
                event.stopPropagation();
                if (d.data.isVirtual) return;
                setSelectedNode(d.data);
            });

        nodeEnter.append('circle').attr('r', (d: any) => d.data.isVirtual ? 8 : 6).attr('stroke-width', 2);
        nodeEnter.append('text').attr('text-anchor', 'middle').attr('fill', '#e2e8f0').attr('font-size', '11px').style('pointer-events', 'none');

        const nodeUpdate = nodeSelection.merge(nodeEnter as any).transition().duration(duration)
            .attr('opacity', (d: any) => !selectedNode || relatedIds.has(d.data.id) ? 1 : 0.1)
            .attr('transform', (d: any) => `translate(${d.x},${d.y})`);

        nodeUpdate.select('circle')
            .attr('fill', (d: any) => d.data.isVirtual ? '#64748b' : (d.data.stop ? '#ef4444' : colorScale(d.ancestors().reverse()[1]?.data.id || d.data.id)))
            .attr('stroke', (d: any) => selectedNode?.id === d.data.id ? '#fff' : 'none');

        nodeUpdate.select('text')
            .attr('dy', (_d: any, i: number) => i % 2 === 0 ? -12 : 20)
            .attr('font-weight', (d: any) => d.data.isVirtual ? 'bold' : 'normal')
            .text((d: any) => d.data.name);

    }, [fixedData, timelineYear, searchTerm, showAll, collapsedIds, selectedNode, currentYear, getYear]);

    if (isLoading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div></div>;

    return (
        <div ref={containerRef} className="w-full h-full relative bg-[#0f172a]">
            <div className="absolute top-4 left-4 z-10 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input type="text" placeholder="Search distributions..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 bg-slate-800/90 backdrop-blur-md border border-slate-700/50 rounded-xl text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 w-64" />
                    </div>
                    <div className="flex bg-slate-800/90 backdrop-blur-md rounded-xl border border-slate-700/50 overflow-hidden">
                        <button onClick={() => setShowAll(false)} className={`px-6 py-3 rounded-xl text-xs font-black transition-all ${!showAll ? 'bg-cyan-500 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>ACTIVE ONLY</button>
                        <button onClick={() => setShowAll(true)} className={`px-6 py-3 rounded-xl text-xs font-black transition-all ${showAll ? 'bg-cyan-500 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>SHOW ALL</button>
                        <button onClick={handleReset} className="px-6 py-3 rounded-xl text-xs font-black text-rose-500 hover:bg-rose-500/10 transition-all border-l border-slate-700/50">RESET</button>
                    </div>
                </div>
                <div className="w-[30rem]"><TimelineControls minYear={1991} maxYear={currentYear} currentYear={timelineYear} onYearChange={setTimelineYear} /></div>
            </div>
            <svg ref={svgRef} className="w-full h-full" />
            <AnimatePresence>
                {selectedNode && (
                    <motion.div initial={{ x: 400, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 400, opacity: 0 }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="absolute top-4 right-4 w-96 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden z-20">
                        <div className="p-8">
                            <button onClick={() => setSelectedNode(null)} className="absolute top-6 right-6 text-slate-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
                            <div className="flex items-start gap-6 mb-8">
                                <div><h2 className="text-2xl font-black text-white leading-tight">{selectedNode.name}</h2><p className="text-xs text-slate-400 font-medium uppercase">{selectedNode.parent ? `Ancestor: ${selectedNode.parent}` : 'Origin Project'}</p></div>
                                <div className="bg-white p-4 rounded-3xl shadow-2xl w-24 h-24 flex items-center justify-center overflow-hidden">
                                    <img src={getLogoUrl(selectedNode)} alt="" className="w-20 h-20 object-contain z-10" onError={(e) => { (e.target as HTMLImageElement).src = 'https://distrowatch.com/images/y9go/linux.png'; }} />
                                    {selectedNode.popularity && <div className="absolute top-0 right-0 bg-yellow-400 text-slate-900 text-[8px] font-black px-2 py-1 rounded-bl-xl z-20">#{selectedNode.popularity}</div>}
                                </div>
                            </div>
                            <div className="space-y-6 mb-8">
                                <div className="flex gap-4 text-sm"><div className="bg-slate-800 p-2 rounded-lg text-slate-400 italic">Born: {selectedNode.start || 'Unknown'}</div>{selectedNode.stop && <div className="bg-rose-500/20 p-2 rounded-lg text-rose-400 italic">Retired: {selectedNode.stop}</div>}</div>
                                <div className="text-sm text-slate-300 leading-relaxed max-h-48 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700">{selectedNode.description || 'Historical distribution details are currently being indexed.'}</div>
                            </div>
                            <a href={`https://distrowatch.com/table.php?distribution=${selectedNode.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full py-4 bg-cyan-500 hover:bg-cyan-400 text-white rounded-2xl font-black text-xs tracking-widest transition-all shadow-lg shadow-cyan-500/25">VIEW ON DISTROWATCH <Info className="w-4 h-4" /></a>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default FamilyTree;
