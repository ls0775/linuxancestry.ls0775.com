import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Calendar, Search, Maximize2, X } from 'lucide-react';
import TimelineControls from './TimelineControls';
import { useDistroData, type DistroNode } from '../hooks/useDistroData';

const RadialTree: React.FC = () => {
    const { data: distroData, isLoading } = useDistroData();
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    // State
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedNode, setSelectedNode] = useState<DistroNode | null>(null);
    const [showAll, setShowAll] = useState(false);
    
    const currentYear = new Date().getFullYear();
    const [timelineYear, setTimelineYear] = useState(currentYear);

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

    // 1. One-time Setup
    useEffect(() => {
        if (!svgRef.current || !containerRef.current || !distroData.length) return;

        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        const radius = Math.max(width, height, 2400) / 2;

        const svg = d3.select(svgRef.current)
            .attr("width", width)
            .attr("height", height)
            .style("user-select", "none");

        svg.selectAll("*").remove();
        const gZoom = svg.append("g");

        const radiusScale = d3.scaleLinear()
            .domain([1991, currentYear + 2])
            .range([0, radius - 100]);

        const gYearLines = gZoom.append("g").attr("class", "year-lines");
        const gLink = gZoom.append("g").attr("fill", "none");
        const gNode = gZoom.append("g").attr("cursor", "pointer").attr("pointer-events", "all");

        const zoom = d3.zoom().scaleExtent([0.05, 4]).on("zoom", (event) => gZoom.attr("transform", event.transform));
        zoomRef.current = zoom;
        svg.call(zoom as any);

        const initialScale = Math.min(width, height) / (radius * 2.2);
        svg.call(zoom.transform as any, d3.zoomIdentity.translate(width / 2, height / 2).scale(initialScale));

        const treeLayout = d3.tree<DistroNode>().separation((a, b) => (a.parent == b.parent ? 1 : 2) / a.depth);
        const diagonal = d3.linkRadial<any, any>().angle((d: any) => d.x).radius((d: any) => d.y);

        groupsRef.current = { gZoom, gYearLines, gLink, gNode, radiusScale, treeLayout, diagonal, radius };
    }, [distroData.length, currentYear]);

    // 2. Smooth Update Loop
    useEffect(() => {
        if (!groupsRef.current || !distroData.length) return;
        const { gNode, gLink, gYearLines, radiusScale, treeLayout, diagonal, radius } = groupsRef.current;
        
        const duration = 400; 
        const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
        const search = searchTerm.trim().toLowerCase();
        const focusId = selectedNode?.id;

        // Filtering
        const baseDistros = distroData.filter((d) => {
            const startYear = getYear(d.start);
            const stopYear = d.stop ? getYear(d.stop) : 9999;
            if (startYear > timelineYear + 0.999) return false;
            if (!showAll && d.stop && stopYear < timelineYear) return false;
            if (search && !d.name.toLowerCase().includes(search)) return false;
            return true;
        });

        const nodeIds = new Set(baseDistros.map((d) => d.id));
        const linuxRootNode: DistroNode = {
            id: "Linux_Original",
            name: "Linux",
            parent: null,
            isVirtual: false,
            start: "1991-09-17",
            url: "https://www.kernel.org/"
        };

        let dataForStratify = [
            linuxRootNode,
            ...baseDistros.map((d) => ({
                ...d,
                parentId: (d.parent && nodeIds.has(d.parent)) ? d.parent : linuxRootNode.id
            }))
        ].sort((a, b) => parseDate(a.start).getTime() - parseDate(b.start).getTime());

        const currentVisibleIds = new Set(dataForStratify.map(d => d.id));
        const stratify = d3.stratify<DistroNode>()
            .id((d) => d.id)
            .parentId((d) => {
                if (d.id === 'Linux_Original') return null;
                const pid = d.parent || d.parentId;
                return (pid && currentVisibleIds.has(pid)) ? pid : 'Linux_Original';
            });

        let root: d3.HierarchyNode<DistroNode>;
        try { root = stratify(dataForStratify); } catch (e) { return; }

        treeLayout.size([2 * Math.PI, radius]);
        treeLayout(root);

        root.descendants().forEach(d => {
            const startYear = getYear(d.data.start);
            d.y = radiusScale(Math.max(1991, Math.min(2026, startYear)));
        });

        // Year Rings
        const yearsToDraw = d3.range(1991, currentYear + 1, 5);
        const yearCircles = gYearLines.selectAll('circle.year-circle').data(yearsToDraw);
        yearCircles.enter().append("circle").attr("class", "year-circle")
            .attr("fill", "none").attr("stroke", "#ffffff").attr("stroke-opacity", 0.05).attr("stroke-dasharray", "2,2")
            .merge(yearCircles as any).attr("r", (d: number) => radiusScale(d));

        const yearLabels = gYearLines.selectAll('text.year-label').data(yearsToDraw);
        yearLabels.enter().append("text").attr("class", "year-label")
            .attr("dy", "0.35em").attr("text-anchor", "middle").attr("fill", "#ffffff").attr("fill-opacity", 0.3)
            .style("font-size", "10px").style("font-weight", "bold").style("pointer-events", "none")
            .merge(yearLabels as any).attr("y", (d: number) => -radiusScale(d)).text((d: number) => d);

        // Links
        const links = root.links();
        const linkSelection = gLink.selectAll("path").data(links, (d: any) => d.target.id);
        linkSelection.exit().transition().duration(duration).attr("stroke-opacity", 0).remove();
        linkSelection.enter().append("path")
            .attr("stroke", "#334155").attr("stroke-opacity", 0).attr("stroke-width", 1.5)
            .attr("d", (d: any) => { const o = { x: d.source.x, y: d.source.y }; return diagonal({ source: o, target: o } as any); })
            .merge(linkSelection as any).transition().duration(duration)
            .attr("d", diagonal as any)
            .attr("stroke", "#06b6d4")
            .attr("stroke-opacity", (search || focusId) ? 1 : 0.4);

        // Nodes
        const nodes = root.descendants().reverse();
        const nodeSelection = gNode.selectAll("g.node-group").data(nodes, (d: any) => d.id);
        nodeSelection.exit().transition().duration(duration).attr("fill-opacity", 0).remove();
        
        const nodeEnter = nodeSelection.enter().append("g").attr("class", "node-group")
            .attr("transform", (d: any) => `rotate(${(d.x * 180 / Math.PI - 90)}) translate(${d.y},0)`)
            .attr("fill-opacity", 0)
            .on("click", (event: any, d: any) => { setSelectedNode(d.data); event.stopPropagation(); });

        nodeEnter.append("circle").attr("r", 6).attr("stroke", "#06b6d4").attr("stroke-width", 2);
        nodeEnter.append("text").attr("dy", "0.31em").style("font-size", "10px").style("font-weight", "600");

        const nodeUpdate = nodeSelection.merge(nodeEnter as any).transition().duration(duration)
            .attr("transform", (d: any) => `rotate(${(d.x * 180 / Math.PI - 90)}) translate(${d.y},0)`)
            .attr("fill-opacity", 1);

        nodeUpdate.select("circle")
            .attr("fill", (d: any) => {
                if (d.data.id === 'Linux_Original') return '#64748b';
                if ((search && d.data.name.toLowerCase().includes(search)) || (focusId === d.id)) return "#facc15";
                if (d.data.stop) return '#ef4444';
                let family = d;
                while (family.parent && family.parent.data.id !== 'Linux_Original') { family = family.parent; }
                return colorScale(family.data.id);
            })
            .attr("r", (d: any) => (search && d.data.name.toLowerCase().includes(search)) || (focusId === d.id) ? 10 : 6);

        nodeUpdate.select("text")
            .attr("transform", (d: any) => d.x >= Math.PI ? "rotate(180)" : null)
            .attr("x", (d: any) => d.x >= Math.PI ? -8 : 8)
            .attr("text-anchor", (d: any) => d.x >= Math.PI ? "end" : "start")
            .style("paint-order", "stroke").style("stroke", "#0f172a").style("stroke-width", "3px")
            .attr("fill", (d: any) => (search && d.data.name.toLowerCase().includes(search)) || (focusId === d.id) ? "#facc15" : "#cbd5e1")
            .text((d: any) => d.data.name);

    }, [distroData, searchTerm, selectedNode, showAll, getYear, parseDate, timelineYear, currentYear]);

    const handleResetZoom = () => {
        if (!svgRef.current || !containerRef.current || !zoomRef.current) return;
        d3.select(svgRef.current).transition().duration(750).call(zoomRef.current.transform, d3.zoomIdentity.translate(containerRef.current!.clientWidth / 2, containerRef.current!.clientHeight / 2).scale(0.1));
    };

    const handleReset = () => {
        setSearchTerm('');
        setShowAll(false);
        setSelectedNode(null);
        setTimelineYear(currentYear);
        handleResetZoom();
    };

    if (isLoading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div></div>;

    return (
        <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-[#0f172a]">
            <div className="absolute top-8 left-8 z-20 flex flex-col gap-6">
                <div className="flex items-center gap-6">
                    <div className="relative group w-96">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-cyan-500 transition-colors" />
                        <input
                            type="text" placeholder="Research distribution origins..."
                            className="w-full bg-slate-900/40 backdrop-blur-3xl border border-slate-700/50 rounded-2xl py-4.5 pl-14 pr-14 text-sm focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 transition-all text-white shadow-2xl"
                            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {(searchTerm || selectedNode) && (
                            <button onClick={() => { setSearchTerm(''); setSelectedNode(null); }} className="absolute right-4 top-1/2 -translate-y-1/2 bg-rose-500 p-2 rounded-xl text-white hover:bg-rose-400 shadow-lg">
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    <div className="flex bg-slate-900/40 backdrop-blur-3xl border border-slate-700/50 rounded-2xl p-1.5 shadow-2xl">
                        <button onClick={() => setShowAll(false)} className={`px-6 py-3 rounded-xl text-xs font-black transition-all ${!showAll ? 'bg-cyan-500 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>ACTIVE ONLY</button>
                        <button onClick={() => setShowAll(true)} className={`px-6 py-3 rounded-xl text-xs font-black transition-all ${showAll ? 'bg-cyan-500 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>SHOW ALL</button>
                        <button onClick={handleReset} className="px-6 py-3 rounded-xl text-xs font-black text-rose-500 hover:bg-rose-500/10 transition-all border-l border-slate-700/50">RESET</button>
                    </div>
                </div>
                <div className="w-[32rem]">
                    <TimelineControls minYear={1991} maxYear={currentYear} currentYear={timelineYear} onYearChange={setTimelineYear} />
                </div>
            </div>
            <div className="absolute top-8 right-8 z-20">
                <button onClick={handleResetZoom} className="p-4 bg-slate-900/40 backdrop-blur-3xl border border-slate-700/50 rounded-2xl text-slate-400 hover:text-white transition-all shadow-2xl">
                    <Maximize2 className="w-6 h-6" />
                </button>
            </div>
            <svg ref={svgRef} className="w-full h-full" />
            <AnimatePresence>
                {selectedNode && (
                    <motion.div initial={{ opacity: 0, x: 100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 100 }} className="absolute bottom-8 right-8 z-30 w-96 bg-slate-950/90 backdrop-blur-3xl border border-white/10 rounded-[3rem] shadow-2xl p-10 overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-3" style={{ backgroundColor: selectedNode.color || '#06b6d4' }}></div>
                        <div className="flex items-start gap-8 mb-10">
                            <div className="flex-1">
                                <h2 className="text-4xl font-black text-white leading-[0.9] mb-4">{selectedNode.name}</h2>
                                <p className="text-[10px] text-cyan-400 font-black tracking-[0.3em] uppercase opacity-70">{selectedNode.parent ? `Ancestor: ${selectedNode.parent}` : 'Origin Project'}</p>
                            </div>
                            <div className="bg-white p-4 rounded-3xl shadow-2xl flex items-center justify-center w-24 h-24 relative overflow-hidden">
                                <img src={getLogoUrl(selectedNode)} alt="" className="w-20 h-20 object-contain z-10" onError={(e) => { (e.target as HTMLImageElement).src = 'https://distrowatch.com/images/y9go/linux.png'; }} />
                                {selectedNode.popularity && <div className="absolute top-0 right-0 bg-yellow-400 text-slate-900 text-[8px] font-black px-2 py-1 rounded-bl-xl z-20 shadow-sm">#{selectedNode.popularity}</div>}
                            </div>
                        </div>
                        <div className="space-y-8 mb-12">
                            <div className="flex items-center gap-6">
                                <div className="p-4 bg-white/5 rounded-3xl text-cyan-400"><Calendar className="w-7 h-7" /></div>
                                <div>
                                    <p className="text-white font-black text-xl leading-none mb-1">{selectedNode.start || 'Unknown Release'}</p>
                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest leading-none">{selectedNode.stop ? `Retired ${selectedNode.stop}` : 'In Active Production'}</p>
                                </div>
                            </div>
                        </div>
                        <div className="text-sm text-slate-300 leading-relaxed max-h-48 overflow-y-auto mb-10 pr-4 scrollbar-thin scrollbar-thumb-slate-800">
                            {selectedNode.description || 'Historical data indexing in progress.'}
                        </div>
                        <a href={`https://distrowatch.com/table.php?distribution=${selectedNode.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-3 w-full py-5 bg-cyan-500 hover:bg-cyan-400 text-white rounded-[2rem] font-black text-xs tracking-widest transition-all shadow-2xl shadow-cyan-500/20">
                            VIEW PROJECT ORIGINS
                            <ExternalLink className="w-4 h-4" />
                        </a>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default RadialTree;
