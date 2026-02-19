import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { Search, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import TimelineControls from './TimelineControls';
import { useDistroData, type DistroNode } from '../hooks/useDistroData';

const FamilyTree: React.FC = () => {
    const { data: distroData, isLoading } = useDistroData();
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    // State
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedNode, setSelectedNode] = useState<DistroNode | null>(null);
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
    const [showAll, setShowAll] = useState(false);
    
    const currentYear = new Date().getFullYear();
    const [timelineYear, setTimelineYear] = useState(currentYear);

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

    // Derived active node for lineage (either explicitly clicked or searched)
    const activeHighlightNode = useMemo(() => {
        if (selectedNode) return selectedNode;
        if (!searchTerm.trim()) return null;
        const search = searchTerm.trim().toLowerCase();
        return distroData.find(d => d.name.toLowerCase() === search || d.id.toLowerCase() === search) || null;
    }, [selectedNode, searchTerm, distroData]);

    // Calculate ecosystem statistics
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
            const countDescendants = (pid: string): number => {
                const direct = filterMatched.filter(d => d.parent === pid);
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
    }, [distroData, timelineYear, activeHighlightNode, getYear, showAll]);

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
                d3.zoomIdentity.translate(50, 50).scale(0.1)
            );
        }
    };

    // Unified Initialization and Update Effect
    useEffect(() => {
        if (!svgRef.current || !containerRef.current || !distroData.length) return;

        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        if (width === 0 || height === 0) return;

        const margin = { top: 100, right: 100, bottom: 100, left: 100 };
        const chartWidth = 32000; 
        const chartHeight = 40000; 

        if (!groupsRef.current) {
            const svg = d3.select(svgRef.current).attr('width', width).attr('height', height);
            svg.selectAll('*').remove();
            const gZoom = svg.append('g');

            const xScale = d3.scaleLinear().domain([1991, 2026]).range([0, chartWidth]);
            const gGrid = gZoom.append('g').attr('class', 'year-grid');
            const gLink = gZoom.append('g').attr('class', 'links');
            const gNode = gZoom.append('g').attr('class', 'nodes');

            const zoom = d3.zoom<SVGSVGElement, unknown>()
                .scaleExtent([0.001, 4])
                .on('zoom', (event) => {
                    gZoom.attr('transform', event.transform);
                    gZoom.selectAll('.year-label-major').style('font-size', (24 / event.transform.k) + 'px');
                    gZoom.selectAll('.year-label-minor').style('font-size', (14 / event.transform.k) + 'px');
                });
            zoomRef.current = zoom;
            svg.call(zoom).on('click', () => { setSelectedNode(null); });

            // Closer initial view for readability
            svg.call(zoom.transform as any, d3.zoomIdentity.translate(margin.left, height/4).scale(0.12));

            const treeLayout = d3.tree<DistroNode>().size([chartHeight, chartWidth]).separation((a, b) => (a.parent === b.parent ? 15 : 30));

            groupsRef.current = { gZoom, gGrid, gLink, gNode, xScale, treeLayout, margin };
        }

        // Perform Update
        const { gGrid, gLink, gNode, xScale, treeLayout } = groupsRef.current;
        const duration = 400;
        const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
        const search = searchTerm.trim().toLowerCase();

        // Grid Update - STAGGERED
        const yearsToDraw = d3.range(1991, 2027, 1);
        const gridLines = gGrid.selectAll('line').data(yearsToDraw);
        gridLines.enter().append('line')
            .attr('stroke', '#1e293b')
            .attr('stroke-width', (d: any) => d % 5 === 0 ? 8 : 2)
            .attr('stroke-opacity', (d: any) => d % 5 === 0 ? 0.5 : 0.2)
            .merge(gridLines as any)
            .attr('x1', (d: any) => xScale(d)).attr('x2', (d: any) => xScale(d))
            .attr('y1', -200).attr('y2', chartHeight + 200);

        const gridLabels = gGrid.selectAll('text').data(yearsToDraw.flatMap(y => [{y, pos:'top'}, {y, pos:'bottom'}]));
        gridLabels.enter().append('text')
            .attr('class', (d: any) => d.y % 5 === 0 ? 'year-label-major' : 'year-label-minor')
            .attr('text-anchor', 'middle').attr('fill', '#64748b')
            .style('font-weight', (d: any) => d.y % 5 === 0 ? '900' : '500')
            .merge(gridLabels as any)
            .attr('x', (d: any) => xScale(d.y))
            .attr('y', (d: any) => {
                const base = d.pos === 'top' ? -40 : chartHeight + 100;
                // Stagger minor years closer to axis, major years further away
                const offset = d.y % 5 === 0 ? (d.pos === 'top' ? -60 : 60) : 0;
                return base + offset;
            })
            .style('font-size', (d: any) => d.y % 5 === 0 ? '24px' : '14px')
            .text((d: any) => d.y);

        // Data Filtering
        let filteredData = distroData.filter((d) => {
            const startYear = getYear(d.start);
            if (startYear > timelineYear + 0.999) return false;
            if (!showAll && d.stop && getYear(d.stop) < timelineYear) return false;
            return true;
        });

        // Lineage Calculation
        const relatedIds = new Set<string>();
        if (activeHighlightNode) {
            const idMap = new Map(distroData.map(d => [d.id, d]));
            let curr: DistroNode | undefined = activeHighlightNode;
            while (curr) { 
                relatedIds.add(curr.id); 
                curr = curr.parent ? idMap.get(curr.parent) : undefined; 
            }
            const addDescendants = (pid: string) => {
                distroData.filter(d => d.parent === pid).forEach(child => {
                    if (relatedIds.has(child.id)) return;
                    relatedIds.add(child.id);
                    addDescendants(child.id);
                });
            };
            addDescendants(activeHighlightNode.id);
        }

        if (search && activeHighlightNode) {
            filteredData = filteredData.filter(d => relatedIds.has(d.id));
        }

        const linuxRootNode: DistroNode = { id: "Linux_Original", name: "Linux", parent: null, isVirtual: false, start: "1991-09-17" };
        const nodeIds = new Set(filteredData.map(d => d.id));
        let dataForStratify = [
            linuxRootNode,
            ...filteredData.map((d) => ({
                ...d,
                parentId: (d.parent && nodeIds.has(d.parent)) ? d.parent : linuxRootNode.id
            }))
        ].sort((a, b) => parseDate(a.start).getTime() - parseDate(b.start).getTime());

        const currentVisibleIds = new Set(dataForStratify.map(d => d.id));
        const finalStratify = d3.stratify<DistroNode>().id(d => d.id).parentId(d => (d.id === 'Linux_Original') ? null : (d.parent && currentVisibleIds.has(d.parent) ? d.parent : 'Linux_Original'));

        let root: d3.HierarchyNode<DistroNode>;
        try { root = finalStratify(dataForStratify); } catch (e) { return; }
        
        treeLayout(root);
        root.descendants().forEach((node: any) => {
            const verticalLayoutPos = node.x; 
            node.x = xScale(getYear(node.data.start)); 
            node.y = verticalLayoutPos; 
        });

        const diagonal = d3.linkHorizontal<any, any>().x(d => d.x).y(d => d.y);
        const linkSelection = gLink.selectAll('path.link-path').data(root.links(), (d: any) => d.target.data.id);
        linkSelection.exit().transition().duration(duration).attr('stroke-opacity', 0).remove();
        linkSelection.enter().append('path').attr('class', 'link-path')
            .attr('fill', 'none').attr('stroke-width', 4).attr('stroke-opacity', 0)
            .merge(linkSelection as any).transition().duration(duration)
            .attr('stroke', (d: any) => activeHighlightNode && relatedIds.has(d.target.data.id) ? '#facc15' : '#475569')
            .attr('stroke-opacity', (d: any) => !activeHighlightNode ? 0.6 : (relatedIds.has(d.target.data.id) ? 1 : 0.1))
            .attr('stroke-width', (d: any) => activeHighlightNode && relatedIds.has(d.target.data.id) ? 16 : 8)
            .attr('d', diagonal as any);

        const nodeSelection = gNode.selectAll('g.node-group').data(root.descendants(), (d: any) => d.data.id);
        nodeSelection.exit().transition().duration(duration).attr('opacity', 0).remove();
        const nodeEnter = nodeSelection.enter().append('g').attr('class', 'node-group').attr('cursor', 'pointer').attr('opacity', 0)
            .on('click', (event: any, d: any) => {
                event.stopPropagation();
                if (d.data.id === 'Linux_Original') return;
                setSelectedNode(d.data);
            });

        nodeEnter.append('circle').attr('r', 24).attr('stroke-width', 8);
        nodeEnter.append('text').attr('text-anchor', 'middle').attr('fill', '#e2e8f0').style('pointer-events', 'none');

        const nodeUpdate = nodeSelection.merge(nodeEnter as any).transition().duration(duration)
            .attr('opacity', (d: any) => !activeHighlightNode || relatedIds.has(d.data.id) ? 1 : 0.1)
            .attr('transform', (d: any) => `translate(${d.x},${d.y})`);

        nodeUpdate.select('circle')
            .attr('fill', (d: any) => {
                if (activeHighlightNode && relatedIds.has(d.data.id)) return '#facc15';
                if (d.data.id === 'Linux_Original') return '#64748b';
                if (d.data.stop) return '#ef4444';
                let family = d;
                while (family.parent && family.parent.data.id !== 'Linux_Original') { family = family.parent; }
                return colorScale(family.data.id);
            })
            .attr('stroke', (d: any) => (selectedNode?.id === d.data.id || (search && activeHighlightNode?.id === d.data.id)) ? '#fff' : 'none')
            .attr('r', (d: any) => activeHighlightNode && relatedIds.has(d.data.id) ? 32 : 24);

        nodeUpdate.select('text')
            .attr('dy', 85)
            .style('font-size', '64px') // DOUBLED font size
            .attr('font-weight', '900')
            .attr('fill', (d: any) => activeHighlightNode && relatedIds.has(d.data.id) ? '#facc15' : '#e2e8f0')
            .text((d: any) => d.data.name);

    }, [distroData, timelineYear, searchTerm, showAll, collapsedIds, selectedNode, currentYear, getYear, parseDate, activeHighlightNode]);

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
                <div className="w-[30rem]"><TimelineControls minYear={1991} maxYear={currentYear} currentYear={timelineYear} onYearChange={setTimelineYear} stats={stats} /></div>
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
