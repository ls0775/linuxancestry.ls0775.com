/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import TimelineControls from './TimelineControls';
import DetailPanel from './DetailPanel';
import { getVizTheme } from '../utils/theme';
import { useDistroData, type DistroNode } from '../hooks/useDistroData';
import {
    parseDate, getYear,
    getPopularityRank,
} from '../utils/distroUtils';
import { HoverTooltip } from './DistroWidgets';

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

    // Pan to keep the current year centred when timeline year changes (play or scrub)
    const prevTimelineYearRef = useRef<number | null>(null);
    useEffect(() => {
        if (!svgRef.current || !containerRef.current || !zoomRef.current || !groupsRef.current) return;
        if (prevTimelineYearRef.current === timelineYear) return;
        prevTimelineYearRef.current = timelineYear;

        const { xScale } = groupsRef.current;
        const t = d3.zoomTransform(svgRef.current);
        const w = containerRef.current.clientWidth;
        // Keep year at 40% from left; preserve current k and vertical position
        const targetX = w * 0.4 - xScale(timelineYear) * t.k;
        d3.select(svgRef.current).transition().duration(400).ease(d3.easeLinear).call(
            zoomRef.current.transform,
            d3.zoomIdentity.translate(targetX, t.y).scale(t.k)
        );
    }, [timelineYear]);

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

        const theme = getVizTheme();
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('x', String(vx)); bg.setAttribute('y', String(vy));
        bg.setAttribute('width', String(vw)); bg.setAttribute('height', String(vh));
        bg.setAttribute('fill', theme.bg);
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
                textEl.setAttribute('font-family', theme.font);
                textEl.setAttribute('font-weight', '400');
            }
        });

        // Title
        const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        titleEl.setAttribute('x', String(Math.round(vx + vw / 2)));
        titleEl.setAttribute('y', String(Math.round(vy + Math.round(20 / es))));
        titleEl.setAttribute('text-anchor', 'middle');
        titleEl.setAttribute('fill', theme.muted);
        titleEl.style.fontSize = `${Math.round(18 / es)}px`;
        titleEl.setAttribute('font-weight', '400');
        titleEl.setAttribute('font-family', theme.font);
        titleEl.textContent = isFiltered
            ? `${activeHighlightNode!.name} — Linux Ancestry`
            : 'Linux Ancestry';
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
        const theme = getVizTheme();

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
                    .style('font-family', theme.font)
                    .style('font-weight', '400')
                    .style('pointer-events', 'none')
                    .merge(labels as any)
                    .attr('x', (y: number) => xScale(y) * k + tx)
                    .attr('y', 28)
                    .style('font-size', (y: number) => (y % 5 === 0 ? '12' : '10') + 'px')
                    .style('fill', (y: number) => y % 5 === 0 ? theme.axisMajor : theme.axis)
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
        const colorScale = d3.scaleOrdinal<string>(theme.families);
        const search = searchTerm.trim().toLowerCase();

        // Popularity rank helper — Linux_Original is rank 0 (always primary)
        const getRank = (d: any): number => d?.data?.id === 'Linux_Original' ? 0 : getPopularityRank(d?.data ?? {});

        // Grid Update
        const yearsToDraw = d3.range(1991, 2027, 1);
        const gridLines = gGrid.selectAll('line').data(yearsToDraw);
        gridLines.enter().append('line')
            .attr('stroke', (d: any) => d % 5 === 0 ? theme.gridMajor : theme.grid)
            .attr('stroke-width', (d: any) => d % 5 === 0 ? 4 : 2)
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
            .attr('stroke', (d: any) => activeHighlightNode && relatedIds.has(d.target.data.id) ? theme.linkHighlight : theme.link)
            .attr('stroke-opacity', (d: any) => !activeHighlightNode ? 1 : (relatedIds.has(d.target.data.id) ? 1 : 0.15))
            .attr('stroke-width', (d: any) => activeHighlightNode && relatedIds.has(d.target.data.id) ? 10 : 6)
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

        nodeEnter.append('circle').attr('r', 24).attr('stroke-width', 6);

        // Logo tile — flat page-coloured square with a hairline, hidden until k >= 0.4
        nodeEnter.append('rect')
            .attr('class', 'node-logo-bg')
            .attr('x', -48).attr('y', -48)
            .attr('width', 96).attr('height', 96)
            .attr('fill', theme.bg)
            .attr('stroke', theme.rule)
            .attr('stroke-width', 2)
            .style('display', 'none')
            .style('pointer-events', 'none');
        nodeEnter.append('image')
            .attr('class', 'node-logo')
            .attr('href', (d: any) => `/logos/${d.data.id}.png`)
            .attr('x', -36).attr('y', -36)
            .attr('width', 72).attr('height', 72)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .style('display', 'none')
            .style('pointer-events', 'none');
        nodeEnter.append('text').attr('text-anchor', 'start').attr('dominant-baseline', 'middle').attr('x', 52).style('pointer-events', 'none');

        // Assign single class to all node labels
        nodeSelection.merge(nodeEnter as any).select('text')
            .attr('class', 'node-label');

        const nodeUpdate = nodeSelection.merge(nodeEnter as any).transition().duration(duration)
            .attr('opacity', (d: any) => !activeHighlightNode || relatedIds.has(d.data.id) ? 1 : 0.1)
            .attr('transform', (d: any) => `translate(${d.x},${d.y})`);

        nodeUpdate.select('circle')
            .attr('fill', (d: any) => {
                if (activeHighlightNode && relatedIds.has(d.data.id)) return theme.linkHighlight;
                if (d.data.id === 'Linux_Original') return theme.nodeRoot;
                if (d.data.stop) return theme.nodeDiscontinued;
                let family = d;
                while (family.parent && family.parent.data.id !== 'Linux_Original') { family = family.parent; }
                return colorScale(family.data.id);
            })
            .attr('stroke', (d: any) => (selectedNode?.id === d.data.id || (search && activeHighlightNode?.id === d.data.id)) ? theme.bg : 'none')
            .attr('r', (d: any) => activeHighlightNode && relatedIds.has(d.data.id) ? 30 : 24);

        nodeUpdate.select('text')
            .attr('fill', (d: any) => {
                if (d.data.id === 'Linux_Original') return theme.labelHighlight;
                if (activeHighlightNode && relatedIds.has(d.data.id)) return theme.labelHighlight;
                return getRank(d) <= 100 ? theme.text : theme.label;
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
            .style('font-weight', '400');

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

    if (isLoading) return <p className="p-6 text-muted font-light">Loading…</p>;

    return (
        <div ref={containerRef} className="w-full h-full relative">
            <div className="panel absolute top-4 left-4 z-10 w-[26rem] max-w-[calc(100%-2rem)] p-5 flex flex-col gap-4">
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
            <svg ref={svgRef} className="w-full h-full" />
            <div className="absolute top-4 right-4 z-10 flex items-baseline gap-5 text-[0.95rem]">
                <button onClick={fitAll} className="textbtn">Fit</button>
                <button onClick={exportImage} className="textbtn">Export SVG</button>
            </div>
            {selectedNode && <DetailPanel node={selectedNode} ancestryPath={ancestryPath} onClose={() => setSelectedNode(null)} />}
            {hoverInfo && <HoverTooltip node={hoverInfo.node} x={hoverInfo.x} y={hoverInfo.y} />}
        </div>
    );
};

export default FamilyTree;
