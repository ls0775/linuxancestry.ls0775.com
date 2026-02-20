/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { Search, Info, X, Maximize2, Download } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import TimelineControls from './TimelineControls';
import { useDistroData, type DistroNode } from '../hooks/useDistroData';
import {
    parseDate, getYear, getLogoUrl, getFallbackLogoUrl,
    getPopularityRank, isPrimaryDistro,
    HoverTooltip, PopularityBadge, AncestryBreadcrumb,
} from '../utils/distroUtils';

const CHART_WIDTH = 32000;
const CHART_HEIGHT = 40000;

const FamilyTree: React.FC = () => {
    const { data: distroData, isLoading } = useDistroData();
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // State
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedNode, setSelectedNode] = useState<DistroNode | null>(null);
    const [showAll, setShowAll] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
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
                direct.forEach(child => { total += countDescendants(child.id); });
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

    // Escape key: close panel + clear search
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
    const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const groupsRef = useRef<{
        gZoom: any,
        gGrid: any,
        gLink: any,
        gNode: any,
        gStickyAxis: any,
        xScale: any,
        treeLayout: any,
        margin: any
    } | null>(null);

    const fitAll = useCallback(() => {
        if (!svgRef.current || !containerRef.current || !zoomRef.current) return;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        const scale = Math.min((w - 80) / CHART_WIDTH, (h - 80) / CHART_HEIGHT);
        const tx = (w - CHART_WIDTH * scale) / 2;
        const ty = (h - CHART_HEIGHT * scale) / 2;
        d3.select(svgRef.current).transition().duration(750).call(
            zoomRef.current.transform,
            d3.zoomIdentity.translate(tx, ty).scale(scale)
        );
    }, []);

    const handleReset = () => {
        setSearchTerm('');
        setShowAll(false);
        setSelectedNode(null);
        setTimelineYear(currentYear);
        fitAll();
    };

    const exportImage = useCallback(() => {
        if (!svgRef.current || !groupsRef.current) return;
        const { gNode } = groupsRef.current;
        const isFiltered = !!(searchTerm.trim() && activeHighlightNode);

        // Bounding box of currently visible nodes in SVG coordinate space
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        let nodeCount = 0;
        (gNode.selectAll('g.node-group').nodes() as SVGGElement[]).forEach(el => {
            const d = d3.select(el).datum() as any;
            if (d) {
                minX = Math.min(minX, d.x); maxX = Math.max(maxX, d.x);
                minY = Math.min(minY, d.y); maxY = Math.max(maxY, d.y);
                nodeCount++;
            }
        });

        const PAD = 600;
        const vx = isFiltered ? Math.max(0, minX - PAD) : 0;
        const vy = isFiltered ? Math.max(-200, minY - PAD) : -200;
        const vw = isFiltered ? (maxX - minX + PAD * 2) : CHART_WIDTH;
        const vh = isFiltered ? (maxY - minY + PAD * 2) : CHART_HEIGHT + 400;

        // Scale to guarantee readable, non-overlapping labels.
        // Each node needs at least DESIRED_PX_PER_NODE px of vertical space in output.
        const DESIRED_PX_PER_NODE = 22;
        const DESIRED_FONT_PX = 13;
        const baseScale = 3520 / vw;                           // Wikipedia reference width
        const readScale = (nodeCount * DESIRED_PX_PER_NODE) / vh; // min for no-overlap
        const es = Math.max(baseScale, readScale);
        const TARGET_W = Math.round(vw * es);
        const TARGET_H = Math.round(vh * es);

        const svgClone = svgRef.current.cloneNode(true) as SVGSVGElement;
        svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svgClone.setAttribute('width', String(TARGET_W));
        svgClone.setAttribute('height', String(TARGET_H));
        svgClone.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);

        // Remove D3 zoom transform
        const gZoomEl = svgClone.querySelector('g') as SVGGElement | null;
        if (gZoomEl) gZoomEl.removeAttribute('transform');

        // Dark background
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('x', String(vx)); bg.setAttribute('y', String(vy));
        bg.setAttribute('width', String(vw)); bg.setAttribute('height', String(vh));
        bg.setAttribute('fill', '#0f172a');
        svgClone.insertBefore(bg, svgClone.firstChild);

        // Font in SVG units = desired screen px / export scale
        const labelFontSVG = Math.round(DESIRED_FONT_PX / es);
        const CIRCLE_R = 24;

        // All node labels: anchor to the RIGHT of the circle so vertical overlap
        // is impossible (each node has a unique y in the tidy tree layout).
        svgClone.querySelectorAll('g.node-group').forEach(el => {
            const textEl = el.querySelector('text') as SVGElement | null;
            if (textEl) {
                textEl.style.fontSize = `${labelFontSVG}px`;
                textEl.style.display = '';
                textEl.setAttribute('text-anchor', 'start');
                textEl.setAttribute('x', String(CIRCLE_R + 8));
                textEl.removeAttribute('dy');
                textEl.setAttribute('dominant-baseline', 'middle');
                textEl.setAttribute('font-family', 'system-ui, sans-serif');
                textEl.setAttribute('font-weight', '700');
            }
        });

        // Title
        const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        titleEl.setAttribute('x', String(Math.round(vx + vw / 2)));
        titleEl.setAttribute('y', String(Math.round(vy + Math.round(20 / es))));
        titleEl.setAttribute('text-anchor', 'middle');
        titleEl.setAttribute('fill', '#94a3b8');
        titleEl.style.fontSize = `${Math.round(18 / es)}px`;
        titleEl.setAttribute('font-weight', '700');
        titleEl.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
        titleEl.textContent = isFiltered
            ? `${activeHighlightNode!.name} — Linux Distribution Family`
            : 'Linux Distribution Timeline';
        svgClone.appendChild(titleEl);

        const xml = new XMLSerializer().serializeToString(svgClone);
        const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n', xml], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const slug = isFiltered
            ? activeHighlightNode!.name.toLowerCase().replace(/\s+/g, '-')
            : 'full';
        a.download = `linux-ancestry-${slug}.svg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [searchTerm, activeHighlightNode]);

    // Unified Initialization and Update Effect
    useEffect(() => {
        if (!svgRef.current || !containerRef.current || !distroData.length) return;

        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        if (width === 0 || height === 0) return;

        const margin = { top: 100, right: 100, bottom: 100, left: 100 };

        if (!groupsRef.current) {
            const svg = d3.select(svgRef.current).attr('width', width).attr('height', height);
            svg.selectAll('*').remove();
            const gZoom = svg.append('g');
            // Sticky axis lives outside gZoom so it stays at fixed screen position
            const gStickyAxis = svg.append('g').attr('class', 'sticky-axis').attr('pointer-events', 'none');

            const xScale = d3.scaleLinear().domain([1991, 2026]).range([0, CHART_WIDTH]);
            const gGrid = gZoom.append('g').attr('class', 'year-grid');
            const gLink = gZoom.append('g').attr('class', 'links');
            const gNode = gZoom.append('g').attr('class', 'nodes');

            const updateStickyAxis = (transform: d3.ZoomTransform) => {
                const k = transform.k;
                const tx = transform.x;
                const years = d3.range(1991, 2027);
                const labels = gStickyAxis.selectAll<SVGTextElement, number>('text').data(years);
                labels.enter().append('text')
                    .attr('text-anchor', 'middle')
                    .attr('fill', '#94a3b8')
                    .style('pointer-events', 'none')
                    .merge(labels as any)
                    .attr('x', (y: number) => xScale(y) * k + tx)
                    .attr('y', 28)
                    .style('font-size', (y: number) => (y % 5 === 0 ? '13' : '10') + 'px')
                    .style('font-weight', (y: number) => y % 5 === 0 ? '700' : '400')
                    .style('fill', (y: number) => y % 5 === 0 ? '#cbd5e1' : '#475569')
                    .style('display', function(y: number) {
                        const screenSpacing = xScale(1992) * k - xScale(1991) * k;
                        if (y % 5 === 0) return screenSpacing >= 8 ? null : 'none';
                        return screenSpacing >= 30 ? null : 'none';
                    })
                    .text((y: number) => y);
            };

            const zoom = d3.zoom<SVGSVGElement, unknown>()
                .scaleExtent([0.001, 4])
                .on('zoom', (event) => {
                    const k = event.transform.k;
                    gZoom.attr('transform', event.transform);
                    updateStickyAxis(event.transform);
                    gZoom.selectAll('.node-label')
                        .style('font-size', function(d: any) {
                            const rank = d?.data?.id === 'Linux_Original' ? 0 : (d?.data?.popularity ? parseInt(d.data.popularity) : 9999);
                            return ((rank <= 100 ? 12 : 9) / k) + 'px';
                        })
                        .style('display', function(d: any) {
                            const rank = d?.data?.id === 'Linux_Original' ? 0 : (d?.data?.popularity ? parseInt(d.data.popularity) : 9999);
                            return (rank <= 100 ? true : k >= 0.12) ? null : 'none';
                        } as any);
                    gZoom.selectAll('.node-logo, .node-logo-bg')
                        .style('display', (k >= 0.4 ? '' : 'none') as any);
                });
            zoomRef.current = zoom;
            svg.call(zoom).on('click', () => { setSelectedNode(null); });

            // Fit full extent on init
            const initScale = Math.min((width - 80) / CHART_WIDTH, (height - 80) / CHART_HEIGHT);
            const initTx = (width - CHART_WIDTH * initScale) / 2;
            const initTy = (height - CHART_HEIGHT * initScale) / 2;
            const initTransform = d3.zoomIdentity.translate(initTx, initTy).scale(initScale);
            svg.call(zoom.transform as any, initTransform);
            updateStickyAxis(initTransform);

            const treeLayout = d3.tree<DistroNode>().size([CHART_HEIGHT, CHART_WIDTH]).separation((a, b) => (a.parent === b.parent ? 15 : 30));

            groupsRef.current = { gZoom, gGrid, gLink, gNode, gStickyAxis, xScale, treeLayout, margin };
        }

        // Perform Update
        const { gGrid, gLink, gNode, xScale, treeLayout } = groupsRef.current;
        const duration = 400;
        const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
        const search = searchTerm.trim().toLowerCase();

        // Popularity rank helper — Linux_Original is rank 0 (always primary)
        const getRank = (d: any): number => d?.data?.id === 'Linux_Original' ? 0 : getPopularityRank(d?.data ?? {});

        // Grid Update
        const yearsToDraw = d3.range(1991, 2027, 1);
        const gridLines = gGrid.selectAll('line').data(yearsToDraw);
        gridLines.enter().append('line')
            .attr('stroke', '#1e293b')
            .attr('stroke-width', (d: any) => d % 5 === 0 ? 8 : 2)
            .attr('stroke-opacity', (d: any) => d % 5 === 0 ? 0.5 : 0.2)
            .merge(gridLines as any)
            .attr('x1', (d: any) => xScale(d)).attr('x2', (d: any) => xScale(d))
            .attr('y1', -200).attr('y2', CHART_HEIGHT + 200);

        // Sync minor label visibility with current zoom (handles re-renders mid-zoom)
        const currentK = d3.zoomTransform(svgRef.current!).k;

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
                (childrenMap.get(pid) ?? []).forEach(child => {
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
        const dataForStratify = [
            linuxRootNode,
            ...filteredData.map((d) => ({
                ...d,
                parentId: (d.parent && nodeIds.has(d.parent)) ? d.parent : linuxRootNode.id
            }))
        ].sort((a, b) => parseDate(a.start).getTime() - parseDate(b.start).getTime());

        const currentVisibleIds = new Set(dataForStratify.map(d => d.id));
        const finalStratify = d3.stratify<DistroNode>().id(d => d.id).parentId(d => (d.id === 'Linux_Original') ? null : (d.parent && currentVisibleIds.has(d.parent) ? d.parent : 'Linux_Original'));

        let root: d3.HierarchyNode<DistroNode>;
        try { root = finalStratify(dataForStratify); } catch { return; }

        treeLayout(root);

        // ── Family Band Layout ────────────────────────────────────────────────
        // d3.tree assigns vertical positions (node.x) globally, causing Slackware,
        // Debian, etc. branches to interleave. Remap each node into its own
        // non-overlapping vertical band BEFORE the axis swap.
        const getFamilyId = (node: any): string => {
            let n = node;
            while (n.parent && n.parent.data.id !== 'Linux_Original') n = n.parent;
            return n.data.id;
        };

        // Collect vertical extent per family (using tidy-tree's node.x = vertical pos)
        const familyExtents = new Map<string, { min: number; max: number }>();
        root.descendants().forEach((node: any) => {
            if (node.data.id === 'Linux_Original') return;
            const fid = getFamilyId(node);
            const ext = familyExtents.get(fid) ?? { min: Infinity, max: -Infinity };
            ext.min = Math.min(ext.min, node.x);
            ext.max = Math.max(ext.max, node.x);
            familyExtents.set(fid, ext);
        });

        // Sort families by their tidy-tree centroid so overall order is preserved
        const FAMILY_GAP = 1200;
        const sortedFamilies = [...familyExtents.entries()]
            .sort((a, b) => (a[1].min + a[1].max) / 2 - (b[1].min + b[1].max) / 2);

        let bandCursor = 0;
        const bandMap = new Map<string, { start: number; originalMin: number }>();
        for (const [fid, ext] of sortedFamilies) {
            bandMap.set(fid, { start: bandCursor, originalMin: ext.min });
            bandCursor += (ext.max - ext.min) + FAMILY_GAP;
        }
        const totalBandHeight = bandCursor;

        // Remap node.x to banded vertical position, then do the axis swap
        root.descendants().forEach((node: any) => {
            if (node.data.id === 'Linux_Original') {
                node.y = totalBandHeight / 2;
            } else {
                const band = bandMap.get(getFamilyId(node))!;
                node.y = band.start + (node.x - band.originalMin);
            }
            node.x = xScale(getYear(node.data.start));
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
                if (svgRef.current && containerRef.current && zoomRef.current) {
                    const w = containerRef.current.clientWidth;
                    const h = containerRef.current.clientHeight;
                    const k = Math.max(d3.zoomTransform(svgRef.current).k, 0.25);
                    d3.select(svgRef.current).transition().duration(600).call(
                        zoomRef.current.transform,
                        d3.zoomIdentity.translate(w / 2 - d.x * k, h / 2 - d.y * k).scale(k)
                    );
                }
            });

        nodeEnter
            .on('mouseenter', (event: any, d: any) => {
                if (d.data.id === 'Linux_Original') return;
                setHoverInfo({ node: d.data, x: event.clientX, y: event.clientY });
            })
            .on('mousemove', (event: any) => {
                setHoverInfo(prev => prev ? { ...prev, x: event.clientX, y: event.clientY } : null);
            })
            .on('mouseleave', () => setHoverInfo(null));

        nodeEnter.append('circle').attr('r', 24).attr('stroke-width', 8);

        // Logo tile — white rounded-rect card matching the detail panel style, hidden until k >= 0.4
        nodeEnter.append('clipPath')
            .attr('id', (d: any) => `logo-clip-${d.data.id}`)
            .append('rect')
            .attr('x', -48).attr('y', -48)
            .attr('width', 96).attr('height', 96)
            .attr('rx', 20).attr('ry', 20);
        nodeEnter.append('rect')
            .attr('class', 'node-logo-bg')
            .attr('x', -48).attr('y', -48)
            .attr('width', 96).attr('height', 96)
            .attr('rx', 20).attr('ry', 20)
            .attr('fill', 'white')
            .style('display', 'none')
            .style('pointer-events', 'none');
        // Image inset 12px each side for clean padding
        nodeEnter.append('image')
            .attr('class', 'node-logo')
            .attr('href', (d: any) => `/logos/${d.data.id}.png`)
            .attr('x', -36).attr('y', -36)
            .attr('width', 72).attr('height', 72)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .attr('clip-path', (d: any) => `url(#logo-clip-${d.data.id})`)
            .style('display', 'none')
            .style('pointer-events', 'none');
        nodeEnter.append('text').attr('text-anchor', 'start').attr('dominant-baseline', 'middle').attr('x', 52).attr('fill', '#e2e8f0').style('pointer-events', 'none');

        // Assign single class to all node labels
        nodeSelection.merge(nodeEnter as any).select('text')
            .attr('class', 'node-label');

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
            .attr('font-weight', (d: any) => getRank(d) <= 100 ? '900' : '500')
            .attr('fill', (d: any) => {
                if (d.data.id === 'Linux_Original') return '#ffffff';
                return activeHighlightNode && relatedIds.has(d.data.id) ? '#facc15' : '#e2e8f0';
            })
            .text((d: any) => d.data.name);

        // Two-phase label cull:
        //   Phase 1 — top-100 by popularity rank: always visible, never culled
        //   Phase 2 — secondary: shown only if they don't overlap any visible label
        const PRIMARY_RANK = 100;
        const visibleScreenYs: { y: number; h: number }[] = [];
        const cullCandidates: { svgY: number; el: SVGElement; rank: number }[] = [];
        (gNode.selectAll('g.node-group').nodes() as SVGGElement[]).forEach(el => {
            const d = d3.select(el).datum() as any;
            const textEl = el.querySelector('text.node-label') as SVGElement | null;
            if (textEl && d) cullCandidates.push({ svgY: d.y, el: textEl, rank: getRank(d) });
        });

        if (currentK < 0.005) {
            cullCandidates.forEach(({ el }) => { el.style.display = 'none'; });
        } else {
            // Phase 1: top-100 always shown at any zoom level
            cullCandidates.forEach(({ svgY, el, rank }) => {
                if (rank <= PRIMARY_RANK) {
                    el.style.display = '';
                    visibleScreenYs.push({ y: svgY * currentK, h: 20 });
                }
            });
            // Phase 2: secondary shown only if clear of all visible labels
            cullCandidates.sort((a, b) => a.svgY - b.svgY);
            cullCandidates.forEach(({ svgY, el, rank }) => {
                if (rank > PRIMARY_RANK) {
                    if (currentK < 0.12) { el.style.display = 'none'; return; }
                    const screenY = svgY * currentK;
                    const overlaps = visibleScreenYs.some(v => Math.abs(screenY - v.y) < v.h + 10);
                    el.style.display = overlaps ? 'none' : '';
                    if (!overlaps) visibleScreenYs.push({ y: screenY, h: 12 });
                }
            });
        }

        // Sync node label font size with current zoom (handles re-renders mid-zoom)
        gNode.selectAll('.node-label')
            .style('font-size', function(d: any) {
                const rank = d?.data?.id === 'Linux_Original' ? 0 : (d?.data?.popularity ? parseInt(d.data.popularity) : 9999);
                return ((rank <= 100 ? 12 : 9) / currentK) + 'px';
            })
            .style('font-weight', function(d: any) {
                const rank = d?.data?.id === 'Linux_Original' ? 0 : (d?.data?.popularity ? parseInt(d.data.popularity) : 9999);
                return rank <= 100 ? '900' : '500';
            });

        // Sync logo visibility with current zoom
        gNode.selectAll('.node-logo, .node-logo-bg')
            .style('display', (currentK >= 0.4 ? '' : 'none') as any);

        // Auto-pan when a new highlight node is selected (search or click)
        const newHighlightId = activeHighlightNode?.id ?? null;
        if (newHighlightId && newHighlightId !== prevHighlightIdRef.current) {
            const target = root.descendants().find((d: any) => d.data.id === newHighlightId) as any;
            if (target && svgRef.current && containerRef.current && zoomRef.current) {
                const w = containerRef.current.clientWidth;
                const h = containerRef.current.clientHeight;
                const scale = 0.3;
                d3.select(svgRef.current).transition().duration(750).call(
                    zoomRef.current.transform,
                    d3.zoomIdentity.translate(w / 2 - target.x * scale, h / 2 - target.y * scale).scale(scale)
                );
            }
        }
        prevHighlightIdRef.current = newHighlightId;

    }, [distroData, timelineYear, searchTerm, showAll, selectedNode, currentYear, activeHighlightNode, childrenMap]);

    if (isLoading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div></div>;

    return (
        <div ref={containerRef} className="w-full h-full relative bg-[#0f172a]">
            <div className="absolute top-4 left-4 z-10 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search distributions..."
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setShowSuggestions(true); }}
                            onFocus={() => setShowSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                            className="pl-10 pr-4 py-2 bg-slate-800/90 backdrop-blur-md border border-slate-700/50 rounded-xl text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 w-64"
                        />
                        {showSuggestions && suggestions.length > 0 && (
                            <div className="absolute top-full left-0 mt-1 w-64 bg-slate-900 border border-slate-700/50 rounded-xl shadow-2xl z-50 overflow-hidden">
                                {suggestions.map(s => (
                                    <button
                                        key={s.id}
                                        onMouseDown={() => { setSearchTerm(s.name); setShowSuggestions(false); }}
                                        className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700/60 flex items-center justify-between gap-2"
                                    >
                                        <span className="truncate">{s.name}</span>
                                        <span className="text-xs text-slate-500 shrink-0">{s.start?.slice(0, 4)}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex bg-slate-800/90 backdrop-blur-md rounded-xl border border-slate-700/50 overflow-hidden">
                        <button onClick={() => setShowAll(false)} className={`px-6 py-3 rounded-xl text-xs font-black transition-all ${!showAll ? 'bg-cyan-500 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>{`ACTIVE ${timelineYear}`}</button>
                        <button onClick={() => setShowAll(true)} className={`px-6 py-3 rounded-xl text-xs font-black transition-all ${showAll ? 'bg-cyan-500 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>SHOW ALL</button>
                        <button onClick={handleReset} className="px-6 py-3 rounded-xl text-xs font-black text-rose-500 hover:bg-rose-500/10 transition-all border-l border-slate-700/50">RESET</button>
                    </div>
                </div>
                <div className="w-[30rem]"><TimelineControls minYear={1991} maxYear={currentYear} currentYear={timelineYear} onYearChange={setTimelineYear} stats={stats} /></div>
            </div>
            <svg ref={svgRef} className="w-full h-full" />
            <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                <button onClick={fitAll} title="Fit all" className="p-3 bg-slate-800/90 backdrop-blur-md border border-slate-700/50 rounded-xl text-slate-400 hover:text-white transition-all shadow-lg">
                    <Maximize2 className="w-5 h-5" />
                </button>
                <button onClick={exportImage} title="Export SVG" className="p-3 bg-slate-800/90 backdrop-blur-md border border-slate-700/50 rounded-xl text-slate-400 hover:text-cyan-400 transition-all shadow-lg">
                    <Download className="w-5 h-5" />
                </button>
            </div>
            <AnimatePresence>
                {selectedNode && (
                    <motion.div initial={{ x: 400, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 400, opacity: 0 }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="absolute bottom-4 right-4 w-96 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden z-20">
                        <div className="p-8">
                            <button onClick={() => setSelectedNode(null)} className="absolute top-6 right-6 text-slate-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
                            <div className="flex items-start gap-6 mb-8">
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h2 className="text-2xl font-black text-white leading-tight">{selectedNode.name}</h2>
                                        <PopularityBadge node={selectedNode} />
                                    </div>
                                    <p className="text-xs text-slate-400 font-medium uppercase mt-1">{selectedNode.parent ? `Ancestor: ${selectedNode.parent}` : 'Origin Project'}</p>
                                    <AncestryBreadcrumb path={ancestryPath} />
                                </div>
                                <div className="bg-white p-4 rounded-3xl shadow-2xl w-24 h-24 flex-shrink-0 flex items-center justify-center overflow-hidden">
                                    <img src={getLogoUrl(selectedNode)} alt="" className="w-20 h-20 object-contain z-10" onError={(e) => { const t = e.target as HTMLImageElement; t.onerror = null; t.src = getFallbackLogoUrl(selectedNode); }} />
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
            {hoverInfo && <HoverTooltip node={hoverInfo.node} x={hoverInfo.x} y={hoverInfo.y} />}
        </div>
    );
};

export default FamilyTree;
