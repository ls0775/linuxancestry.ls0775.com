import { useCallback, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import DetailPanel from './DetailPanel';
import TreeToolbar from './TreeToolbar';
import { HoverTooltip } from './DistroWidgets';
import { getVizTheme } from '../utils/theme';
import { getYear, getPopularityRank } from '../utils/distroUtils';
import { buildHierarchy, getFamilyId, MIN_YEAR, ROOT_ID } from '../utils/lineage';
import { dateStamp, exportViewport, slugify } from '../utils/svgExport';
import { cullLabels, estimateTextWidth, frameThrottle, rankLimitForZoom, type LabelCandidate } from '../utils/labelCulling';
import { useSvgSize } from '../hooks/useSvgSize';
import { useTreeState } from '../hooks/useTreeState';
import type { DistroNode } from '../hooks/useDistroData';

const CHART_WIDTH = 48000;
const CHART_HEIGHT = 30000;
const PRIMARY_RANK = 50;
const FAMILY_GAP = 1200;
const fitScaleFor = (w: number, h: number): number => Math.min((w - 80) / CHART_WIDTH, (h - 80) / CHART_HEIGHT);
const NODE_R = 24;
const LABEL_OFFSET = 52;
const PRIMARY_FONT = 12;
const SECONDARY_FONT = 9;
/** Minimum on-screen sizes so nodes stay visible and clickable at any zoom. */
const MIN_DOT_PX = 2.5;
const PANEL_WIDTH_PX = 22 * 16 + 32;
const FIT_PAD_PX = 40;
const MAX_FIT_SCALE = 0.6;
const HIT_PX = 12;
const LINK_HIT_PX = 10;

type HNode = d3.HierarchyPointNode<DistroNode>;
type HLink = d3.HierarchyPointLink<DistroNode>;
type G = d3.Selection<SVGGElement, unknown, null, undefined>;

interface Groups {
    gZoom: G;
    gGrid: G;
    gLink: G;
    gNode: G;
    xScale: d3.ScaleLinear<number, number>;
    treeLayout: d3.TreeLayout<DistroNode>;
    applyZoomLevel: () => void;
}

const rankOf = (d: HNode): number => (d.data.id === ROOT_ID ? 0 : getPopularityRank(d.data));
const isPrimary = (d: HNode): boolean => rankOf(d) <= PRIMARY_RANK;
const fontFor = (d: HNode): number => (isPrimary(d) ? PRIMARY_FONT : SECONDARY_FONT);
const dotRadius = (k: number, isHighlighted: boolean): number =>
    Math.max(isHighlighted ? NODE_R * 1.25 : NODE_R, MIN_DOT_PX / k);

interface FamilyTreeProps {
    data: DistroNode[];
}

const FamilyTree: React.FC<FamilyTreeProps> = ({ data }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const groupsRef = useRef<Groups | null>(null);
    const prevHighlightIdRef = useRef<string | null>(null);
    const highlightRef = useRef<(id: string) => boolean>(() => false);

    const state = useTreeState(data);
    const {
        currentYear, timelineYear, selectedNode, setSelectedNode,
        activeHighlightNode, relatedIds, visibleNodes, hoverInfo, setHoverInfo, ancestryPath,
    } = state;
    // Seeded with the initial year so the view only pans when the user scrubs the slider.
    const prevTimelineYearRef = useRef<number>(timelineYear);
    const maxYear = currentYear + 1;

    useSvgSize(containerRef, svgRef);

    const fitAll = useCallback(() => {
        if (!svgRef.current || !containerRef.current || !zoomRef.current) return;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        const scale = fitScaleFor(w, h);
        d3.select(svgRef.current).transition().duration(750).call(
            zoomRef.current.transform,
            d3.zoomIdentity.translate((w - CHART_WIDTH * scale) / 2, (h - CHART_HEIGHT * scale) / 2).scale(scale),
        );
    }, []);

    // Keep the current year around 40% from the left while scrubbing or playing.
    useEffect(() => {
        if (!svgRef.current || !containerRef.current || !zoomRef.current || !groupsRef.current) return;
        if (prevTimelineYearRef.current === timelineYear) return;
        prevTimelineYearRef.current = timelineYear;

        const { xScale } = groupsRef.current;
        const t = d3.zoomTransform(svgRef.current);
        const w = containerRef.current.clientWidth;
        d3.select(svgRef.current).transition().duration(400).ease(d3.easeLinear).call(
            zoomRef.current.transform,
            d3.zoomIdentity.translate(w * 0.4 - xScale(timelineYear) * t.k, t.y).scale(t.k),
        );
    }, [timelineYear]);

    const exportImage = useCallback(() => {
        if (!svgRef.current || !containerRef.current) return;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        const panelOpen = !!selectedNode && w > PANEL_WIDTH_PX * 2;
        const subject = activeHighlightNode?.name;
        const k = d3.zoomTransform(svgRef.current).k;
        const yearsAcross = Math.round((w - (panelOpen ? PANEL_WIDTH_PX : 0)) / (k * (CHART_WIDTH / (maxYear - MIN_YEAR))));
        exportViewport(svgRef.current, {
            width: w,
            height: h,
            cropRight: panelOpen ? PANEL_WIDTH_PX : 0,
            title: subject ? `${subject} lineage — Linux Ancestry` : 'Linux Ancestry — timeline',
            subtitle: `${visibleNodes.length.toLocaleString()} distributions${subject ? `, ${visibleNodes.filter(n => relatedIds?.has(n.id)).length} in lineage` : ''} · ${yearsAcross} years across the view · ${dateStamp()}`,
            filename: `linux-ancestry-timeline-${subject ? slugify(subject) : 'view'}-${dateStamp()}.svg`,
            stripSelectors: ['.node-hit', '.link-hit'],
        });
    }, [selectedNode, activeHighlightNode, relatedIds, visibleNodes, maxYear]);

    // Fit a canvas-space box into the viewport, keeping the detail panel clear when it is open.
    const fitToBox = useCallback((box: { minX: number; maxX: number; minY: number; maxY: number }, panelOpen: boolean) => {
        if (!svgRef.current || !containerRef.current || !zoomRef.current) return;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        const rightInset = panelOpen && w > PANEL_WIDTH_PX * 2 ? PANEL_WIDTH_PX : 0;
        const availW = w - rightInset - FIT_PAD_PX * 2;
        const availH = h - FIT_PAD_PX * 2;
        const boxW = Math.max(box.maxX - box.minX, 1);
        const boxH = Math.max(box.maxY - box.minY, 1);
        const k = Math.min(availW / boxW, availH / boxH, MAX_FIT_SCALE);
        const cx = (box.minX + box.maxX) / 2;
        const cy = (box.minY + box.maxY) / 2;
        d3.select(svgRef.current).transition().duration(750).call(
            zoomRef.current.transform,
            d3.zoomIdentity.translate(FIT_PAD_PX + availW / 2 - cx * k, FIT_PAD_PX + availH / 2 - cy * k).scale(k),
        );
    }, []);

    // Initialise once, then enter/update/exit on the persisted groups.
    useEffect(() => {
        if (!svgRef.current || !containerRef.current || !data.length) return;
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        if (width === 0 || height === 0) return;

        const theme = getVizTheme();
        const years = d3.range(MIN_YEAR, maxYear + 1);

        if (!groupsRef.current) {
            const svg = d3.select(svgRef.current);
            svg.selectAll('*').remove();
            const gZoom = svg.append('g');
            const gStickyAxis = svg.append('g').attr('class', 'sticky-axis').attr('pointer-events', 'none');

            const xScale = d3.scaleLinear().domain([MIN_YEAR, maxYear]).range([0, CHART_WIDTH]);
            const gGrid = gZoom.append('g').attr('class', 'year-grid');
            const gLink = gZoom.append('g').attr('class', 'links');
            const gNode = gZoom.append('g').attr('class', 'nodes');

            const updateStickyAxis = (transform: d3.ZoomTransform) => {
                const { k, x: tx } = transform;
                const yearSpacing = (xScale(MIN_YEAR + 1) - xScale(MIN_YEAR)) * k;
                gStickyAxis.selectAll<SVGTextElement, number>('text').data(years)
                    .join(enter => enter.append('text')
                        .attr('text-anchor', 'middle')
                        .attr('y', 28)
                        .style('font-family', theme.font)
                        .style('font-weight', '400')
                        .text(y => y))
                    .attr('x', y => xScale(y) * k + tx)
                    .style('font-size', y => (y % 5 === 0 ? '12px' : '10px'))
                    .style('fill', y => (y % 5 === 0 ? theme.axisMajor : theme.axis))
                    .style('display', y => (yearSpacing >= (y % 5 === 0 ? 8 : 30) ? null : 'none'));
            };

            // Zoom-dependent sizing and label occlusion, shared by the zoom handler and the update effect.
            const applyZoomLevel = () => {
                if (!svgRef.current || !containerRef.current) return;
                const t = d3.zoomTransform(svgRef.current);
                const k = t.k;
                const viewport = { width: containerRef.current.clientWidth, height: containerRef.current.clientHeight };
                const highlightedNow = highlightRef.current;
                const rankLimit = rankLimitForZoom(k / fitScaleFor(viewport.width, viewport.height), PRIMARY_RANK);

                gNode.selectAll<SVGCircleElement, HNode>('circle.node-dot')
                    .attr('r', d => dotRadius(k, highlightedNow(d.data.id)));
                gNode.selectAll<SVGCircleElement, HNode>('circle.node-hit').attr('r', HIT_PX / k);
                gLink.selectAll('path.link-hit').attr('stroke-width', Math.max(6, LINK_HIT_PX / k));
                gNode.selectAll('.node-logo, .node-logo-bg').style('display', () => (k >= 0.4 ? null : 'none'));

                const candidates: LabelCandidate[] = [];
                gNode.selectAll<SVGTextElement, HNode>('text.node-label').each(function (d) {
                    const font = fontFor(d);
                    this.style.fontSize = `${font / k}px`;
                    const lit = highlightedNow(d.data.id);
                    if (!lit && rankOf(d) > rankLimit) {
                        this.style.display = 'none';
                        return;
                    }
                    const w = estimateTextWidth(d.data.name, font);
                    candidates.push({
                        el: this,
                        box: { x: t.applyX(d.x) + LABEL_OFFSET * k, y: t.applyY(d.y) - font / 2, w, h: font },
                        priority: (lit ? 0 : isPrimary(d) ? 10_000 : 20_000) + rankOf(d),
                    });
                });
                cullLabels(candidates, viewport);
            };
            const applyZoomLevelThrottled = frameThrottle(applyZoomLevel);

            const zoom = d3.zoom<SVGSVGElement, unknown>()
                .scaleExtent([0.001, 4])
                .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
                    gZoom.attr('transform', event.transform.toString());
                    updateStickyAxis(event.transform);
                    applyZoomLevelThrottled();
                });
            zoomRef.current = zoom;
            svg.call(zoom).on('click', () => setSelectedNode(null));

            const initScale = fitScaleFor(width, height);
            const initTransform = d3.zoomIdentity
                .translate((width - CHART_WIDTH * initScale) / 2, (height - CHART_HEIGHT * initScale) / 2)
                .scale(initScale);
            svg.call(zoom.transform, initTransform);
            updateStickyAxis(initTransform);

            const treeLayout = d3.tree<DistroNode>()
                .size([CHART_HEIGHT, CHART_WIDTH])
                .separation((a, b) => (a.parent === b.parent ? 15 : 30));

            groupsRef.current = { gZoom, gGrid, gLink, gNode, xScale, treeLayout, applyZoomLevel };
        }

        const { gGrid, gLink, gNode, xScale, treeLayout, applyZoomLevel } = groupsRef.current;
        const duration = 400;
        const colorScale = d3.scaleOrdinal<string>(theme.families);
        const highlighted = (id: string) => !!activeHighlightNode && !!relatedIds?.has(id);
        highlightRef.current = highlighted;

        gGrid.selectAll<SVGLineElement, number>('line').data(years)
            .join(enter => enter.append('line')
                .attr('stroke', y => (y % 5 === 0 ? theme.gridMajor : theme.grid))
                .attr('stroke-width', y => (y % 5 === 0 ? 4 : 2))
                .attr('y1', -200).attr('y2', CHART_HEIGHT + 200))
            .attr('x1', y => xScale(y)).attr('x2', y => xScale(y));

        const hierarchy = buildHierarchy(visibleNodes);
        if (!hierarchy) return;
        const root = treeLayout(hierarchy);

        // Family bands: d3.tree interleaves top-level families vertically. Remap each
        // family into its own contiguous band, then swap axes so x encodes the year.
        const extents = new Map<string, { min: number; max: number }>();
        for (const node of root.descendants()) {
            if (node.data.id === ROOT_ID) continue;
            const fid = getFamilyId(node);
            const ext = extents.get(fid) ?? { min: Infinity, max: -Infinity };
            ext.min = Math.min(ext.min, node.x);
            ext.max = Math.max(ext.max, node.x);
            extents.set(fid, ext);
        }
        const bands = new Map<string, { start: number; originalMin: number }>();
        let cursor = 0;
        for (const [fid, ext] of [...extents.entries()].sort((a, b) => (a[1].min + a[1].max) - (b[1].min + b[1].max))) {
            bands.set(fid, { start: cursor, originalMin: ext.min });
            cursor += ext.max - ext.min + FAMILY_GAP;
        }
        // Bands plus gaps usually exceed CHART_HEIGHT; normalise so the layout always fills the canvas.
        const totalHeight = Math.max(1, cursor - FAMILY_GAP);
        const yFactor = CHART_HEIGHT / totalHeight;
        for (const node of root.descendants()) {
            if (node.data.id === ROOT_ID) {
                node.y = CHART_HEIGHT / 2;
            } else {
                const band = bands.get(getFamilyId(node))!;
                node.y = (band.start + (node.x - band.originalMin)) * yFactor;
            }
            node.x = xScale(getYear(node.data.start));
        }

        // When a lineage is highlighted, re-lay it out over the full canvas height so the
        // selected family flares open; everything else stays put, faded, as context.
        const inLineage = (d: HNode) => d.data.id === ROOT_ID || !!relatedIds?.has(d.data.id);
        if (activeHighlightNode && relatedIds) {
            const sub = d3.hierarchy<HNode>(root, d => d.children?.filter(inLineage));
            d3.tree<HNode>().size([CHART_HEIGHT, CHART_WIDTH]).separation(() => 1)(sub);
            // The layout's first axis is vertical here (size is [height, width]).
            sub.each(s => { s.data.y = s.x ?? s.data.y; });
        }

        const select = (d: HNode) => {
            if (d.data.id === ROOT_ID) return;
            setSelectedNode(d.data);
        };

        const diagonal = d3.linkHorizontal<HLink, HNode>().x(d => d.x).y(d => d.y);
        const links = gLink.selectAll<SVGPathElement, HLink>('path.link-path').data(root.links(), d => d.target.data.id);
        links.exit().transition().duration(duration).attr('stroke-opacity', 0).remove();
        links.enter().append('path').attr('class', 'link-path')
            .attr('fill', 'none').attr('stroke-opacity', 0)
            .merge(links)
            .transition().duration(duration)
            .attr('stroke', d => (highlighted(d.target.data.id) ? theme.linkHighlight : theme.link))
            .attr('stroke-opacity', d => (!activeHighlightNode ? 1 : highlighted(d.target.data.id) ? 1 : 0.15))
            .attr('stroke-width', d => (highlighted(d.target.data.id) ? 10 : 6))
            .attr('d', diagonal);

        // Invisible wide strokes so a branch can be grabbed, not just its endpoint.
        const linkHits = gLink.selectAll<SVGPathElement, HLink>('path.link-hit').data(root.links(), d => d.target.data.id);
        linkHits.exit().remove();
        linkHits.enter().append('path').attr('class', 'link-hit')
            .attr('fill', 'none').attr('stroke', 'transparent').attr('pointer-events', 'stroke').attr('cursor', 'pointer')
            .on('click', (event: MouseEvent, d) => { event.stopPropagation(); select(d.target); })
            .on('mouseenter', (event: MouseEvent, d) => setHoverInfo({ node: d.target.data, x: event.clientX, y: event.clientY }))
            .on('mousemove', (event: MouseEvent) => setHoverInfo(prev => (prev ? { ...prev, x: event.clientX, y: event.clientY } : null)))
            .on('mouseleave', () => setHoverInfo(null))
            .merge(linkHits)
            .attr('d', diagonal);

        const nodes = gNode.selectAll<SVGGElement, HNode>('g.node-group').data(root.descendants(), d => d.data.id);
        nodes.exit().transition().duration(duration).attr('opacity', 0).remove();

        const nodeEnter = nodes.enter().append('g')
            .attr('class', 'node-group')
            .attr('cursor', 'pointer')
            .attr('opacity', 0)
            .attr('role', d => (d.data.id === ROOT_ID ? null : 'button'))
            .attr('tabindex', d => (d.data.id === ROOT_ID ? null : isPrimary(d) ? 0 : -1))
            .attr('aria-label', d => d.data.name)
            .on('click', (event: MouseEvent, d) => { event.stopPropagation(); select(d); })
            .on('keydown', (event: KeyboardEvent, d) => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(d); }
            })
            .on('mouseenter', (event: MouseEvent, d) => {
                if (d.data.id !== ROOT_ID) setHoverInfo({ node: d.data, x: event.clientX, y: event.clientY });
            })
            .on('mousemove', (event: MouseEvent) => {
                setHoverInfo(prev => (prev ? { ...prev, x: event.clientX, y: event.clientY } : null));
            })
            .on('mouseleave', () => setHoverInfo(null));

        nodeEnter.append('circle').attr('class', 'node-hit').attr('fill', 'transparent').attr('r', NODE_R);
        nodeEnter.append('circle').attr('class', 'node-dot').attr('r', NODE_R).attr('stroke-width', 6);
        // Logo tile — flat page-coloured square with a hairline, shown when zoomed in.
        nodeEnter.append('rect')
            .attr('class', 'node-logo-bg')
            .attr('x', -48).attr('y', -48).attr('width', 96).attr('height', 96)
            .attr('fill', theme.bg).attr('stroke', theme.rule).attr('stroke-width', 2)
            .style('display', 'none').style('pointer-events', 'none');
        nodeEnter.append('image')
            .attr('class', 'node-logo')
            .attr('href', d => `/logos/${d.data.id}.png`)
            .attr('x', -36).attr('y', -36).attr('width', 72).attr('height', 72)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .style('display', 'none').style('pointer-events', 'none');
        nodeEnter.append('text')
            .attr('class', 'node-label')
            .attr('text-anchor', 'start').attr('dominant-baseline', 'middle').attr('x', LABEL_OFFSET)
            .style('font-weight', '400');

        const nodeMerge = nodes.merge(nodeEnter);
        const nodeUpdate = nodeMerge.transition().duration(duration)
            .attr('opacity', d => (!activeHighlightNode || highlighted(d.data.id) ? 1 : 0.1))
            .attr('transform', d => `translate(${d.x},${d.y})`);

        nodeUpdate.select('circle.node-dot')
            .attr('fill', d => {
                if (highlighted(d.data.id)) return theme.linkHighlight;
                if (d.data.id === ROOT_ID) return theme.nodeRoot;
                if (d.data.stop) return theme.nodeDiscontinued;
                return colorScale(getFamilyId(d));
            })
            .attr('stroke', d => (activeHighlightNode?.id === d.data.id ? theme.bg : 'none'));

        nodeUpdate.select('text')
            .attr('fill', d => {
                if (d.data.id === ROOT_ID || highlighted(d.data.id)) return theme.labelHighlight;
                return isPrimary(d) ? theme.text : theme.label;
            })
            .text(d => d.data.name);

        applyZoomLevel();

        // Fit the highlighted lineage when it changes; return to the full view when it clears.
        const newHighlightId = activeHighlightNode?.id ?? null;
        if (newHighlightId !== prevHighlightIdRef.current) {
            if (newHighlightId && relatedIds) {
                const lineage = root.descendants().filter(d => d.data.id !== ROOT_ID && relatedIds.has(d.data.id));
                if (lineage.length) {
                    // Leave room for the label to the right of each node.
                    const labelW = Math.max(...lineage.map(d => estimateTextWidth(d.data.name, PRIMARY_FONT))) / 0.3;
                    fitToBox({
                        minX: Math.min(...lineage.map(d => d.x)),
                        maxX: Math.max(...lineage.map(d => d.x)) + LABEL_OFFSET + labelW,
                        minY: Math.min(...lineage.map(d => d.y)),
                        maxY: Math.max(...lineage.map(d => d.y)),
                    }, !!selectedNode);
                }
            } else if (prevHighlightIdRef.current) {
                fitAll();
            }
        }
        prevHighlightIdRef.current = newHighlightId;
    }, [data, visibleNodes, activeHighlightNode, relatedIds, maxYear, selectedNode, setSelectedNode, setHoverInfo, fitToBox, fitAll]);

    return (
        <div ref={containerRef} className="w-full h-full relative">
            <TreeToolbar state={state} onFit={fitAll} onExport={exportImage} />
            <svg ref={svgRef} className="w-full h-full" role="group" aria-label="Linux distribution family tree, timeline layout" />
            {selectedNode && <DetailPanel node={selectedNode} ancestryPath={ancestryPath} onClose={() => setSelectedNode(null)} />}
            {hoverInfo && <HoverTooltip node={hoverInfo.node} x={hoverInfo.x} y={hoverInfo.y} />}
        </div>
    );
};

export default FamilyTree;
