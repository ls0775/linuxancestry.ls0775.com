import { useCallback, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import DetailPanel from './DetailPanel';
import TreeToolbar from './TreeToolbar';
import { HoverTooltip } from './DistroWidgets';
import { getVizTheme } from '../utils/theme';
import { getYear, getPopularityRank } from '../utils/distroUtils';
import { buildHierarchy, getFamilyId, MIN_YEAR, ROOT_ID } from '../utils/lineage';
import { cloneForExport, downloadSvg, slugify } from '../utils/svgExport';
import { cullLabels, estimateTextWidth, frameThrottle, rankLimitForZoom, rotatedLabelBox, type LabelCandidate } from '../utils/labelCulling';
import { useSvgSize } from '../hooks/useSvgSize';
import { useTreeState } from '../hooks/useTreeState';
import type { DistroNode } from '../hooks/useDistroData';

const RADIUS = 2500;
const PRIMARY_RANK = 50;
const fitScaleFor = (w: number, h: number): number => Math.min((w - 80) / (RADIUS * 2), (h - 80) / (RADIUS * 2));
const NODE_R = 6;
const LABEL_OFFSET = 8;
const PRIMARY_FONT = 13;
const SECONDARY_FONT = 9;
/** Minimum on-screen sizes so nodes stay visible and clickable at any zoom. */
const MIN_DOT_PX = 3.5;
const HIT_PX = 11;
const LINK_HIT_PX = 10;

type HNode = d3.HierarchyPointNode<DistroNode>;
type HLink = d3.HierarchyPointLink<DistroNode>;
type G = d3.Selection<SVGGElement, unknown, null, undefined>;

interface Groups {
    gZoom: G;
    gYearLines: G;
    gLink: G;
    gNode: G;
    radiusScale: d3.ScaleLinear<number, number>;
    treeLayout: d3.TreeLayout<DistroNode>;
    diagonal: d3.LinkRadial<unknown, HLink, HNode>;
    applyZoomLevel: () => void;
}

const rankOf = (d: HNode): number => (d.data.id === ROOT_ID ? 0 : getPopularityRank(d.data));
const isPrimary = (d: HNode): boolean => rankOf(d) <= PRIMARY_RANK;
const fontFor = (d: HNode): number => (isPrimary(d) ? PRIMARY_FONT : SECONDARY_FONT);
const toCartesian = (d: HNode) => ({ x: d.y * Math.cos(d.x - Math.PI / 2), y: d.y * Math.sin(d.x - Math.PI / 2) });

interface RadialTreeProps {
    data: DistroNode[];
}

const RadialTree: React.FC<RadialTreeProps> = ({ data }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const groupsRef = useRef<Groups | null>(null);
    const prevHighlightIdRef = useRef<string | null>(null);
    const highlightRef = useRef<(id: string) => boolean>(() => false);

    const state = useTreeState(data);
    const {
        currentYear, searchTerm, selectedNode, setSelectedNode,
        activeHighlightNode, relatedIds, visibleNodes, hoverInfo, setHoverInfo, ancestryPath,
    } = state;
    const maxYear = currentYear + 1;

    useSvgSize(containerRef, svgRef);

    const fitAll = useCallback(() => {
        if (!svgRef.current || !containerRef.current || !zoomRef.current) return;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        const scale = fitScaleFor(w, h);
        d3.select(svgRef.current).transition().duration(750).call(
            zoomRef.current.transform,
            d3.zoomIdentity.translate(w / 2, h / 2).scale(scale),
        );
    }, []);

    const zoomToNode = useCallback((d: HNode, scale: number, floor = false) => {
        if (!svgRef.current || !containerRef.current || !zoomRef.current) return;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        const k = floor ? Math.max(d3.zoomTransform(svgRef.current).k, scale) : scale;
        const c = toCartesian(d);
        d3.select(svgRef.current).transition().duration(600).call(
            zoomRef.current.transform,
            d3.zoomIdentity.translate(w / 2 - c.x * k, h / 2 - c.y * k).scale(k),
        );
    }, []);

    const exportImage = useCallback(() => {
        if (!svgRef.current) return;
        const isFiltered = !!(searchTerm.trim() && activeHighlightNode);
        const PAD = 200;
        const size = (RADIUS + PAD) * 2;
        const frame = { x: -RADIUS - PAD, y: -RADIUS - PAD, width: size, height: size, scale: 3520 / size };

        const clone = cloneForExport(svgRef.current, frame);
        clone.querySelector('g')?.removeAttribute('transform');
        clone.querySelectorAll('.node-hit, .link-hit').forEach(el => el.remove());
        clone.querySelectorAll('circle.node-dot').forEach(c => c.setAttribute('r', String(NODE_R)));

        const theme = getVizTheme();
        const px = (n: number) => `${Math.round(n / frame.scale)}px`;
        clone.querySelectorAll<SVGTextElement>('text.node-label').forEach(t => {
            t.style.fontSize = px(10);
            t.style.display = '';
            t.setAttribute('font-family', theme.font);
        });
        clone.querySelectorAll<SVGTextElement>('text.year-label').forEach(t => {
            t.style.fontSize = px(12);
            t.setAttribute('font-family', theme.font);
        });
        downloadSvg(clone, `linux-ancestry-${isFiltered ? slugify(activeHighlightNode!.name) : 'radial-full'}.svg`);
    }, [searchTerm, activeHighlightNode]);

    // Initialise once, then enter/update/exit on the persisted groups.
    useEffect(() => {
        if (!svgRef.current || !containerRef.current || !data.length) return;
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        if (width === 0 || height === 0) return;

        const theme = getVizTheme();

        if (!groupsRef.current) {
            const svg = d3.select(svgRef.current).style('user-select', 'none');
            svg.selectAll('*').remove();
            const gZoom = svg.append('g');

            const radiusScale = d3.scaleLinear().domain([MIN_YEAR, maxYear + 1]).range([0, RADIUS - 100]);
            const gYearLines = gZoom.append('g').attr('class', 'year-lines');
            const gLink = gZoom.append('g').attr('fill', 'none');
            const gNode = gZoom.append('g').attr('cursor', 'pointer').attr('pointer-events', 'all');

            // Zoom-dependent sizing and label occlusion, shared by the zoom handler and the update effect.
            const applyZoomLevel = () => {
                if (!svgRef.current || !containerRef.current) return;
                const t = d3.zoomTransform(svgRef.current);
                const k = t.k;
                const viewport = { width: containerRef.current.clientWidth, height: containerRef.current.clientHeight };
                const highlightedNow = highlightRef.current;
                const rankLimit = rankLimitForZoom(k / fitScaleFor(viewport.width, viewport.height), PRIMARY_RANK);

                gNode.selectAll<SVGCircleElement, HNode>('circle.node-dot')
                    .attr('r', d => Math.max(highlightedNow(d.data.id) ? NODE_R * 1.33 : NODE_R, MIN_DOT_PX / k));
                gNode.selectAll<SVGCircleElement, HNode>('circle.node-hit').attr('r', HIT_PX / k);
                gLink.selectAll('path.link-hit').attr('stroke-width', Math.max(3, LINK_HIT_PX / k));
                gZoom.selectAll('text.year-label').style('font-size', `${10 / k}px`);

                const candidates: LabelCandidate[] = [];
                gNode.selectAll<SVGTextElement, HNode>('text.node-label').each(function (d) {
                    const font = fontFor(d);
                    this.style.fontSize = `${font / k}px`;
                    const lit = highlightedNow(d.data.id);
                    if (!lit && rankOf(d) > rankLimit) {
                        this.style.display = 'none';
                        return;
                    }
                    const c = toCartesian(d);
                    const angle = d.x - Math.PI / 2;
                    candidates.push({
                        el: this,
                        box: rotatedLabelBox(t.applyX(c.x), t.applyY(c.y), angle, LABEL_OFFSET * k, estimateTextWidth(d.data.name, font), font),
                        priority: (lit ? 0 : isPrimary(d) ? 10_000 : 20_000) + rankOf(d),
                    });
                });
                cullLabels(candidates, viewport);
            };
            const applyZoomLevelThrottled = frameThrottle(applyZoomLevel);

            const zoom = d3.zoom<SVGSVGElement, unknown>()
                .scaleExtent([0.01, 4])
                .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
                    gZoom.attr('transform', event.transform.toString());
                    applyZoomLevelThrottled();
                });
            zoomRef.current = zoom;
            svg.call(zoom).on('click', () => setSelectedNode(null));

            const initScale = fitScaleFor(width, height);
            svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(initScale));

            const treeLayout = d3.tree<DistroNode>()
                .size([2 * Math.PI, RADIUS])
                .separation((a, b) => (a.parent === b.parent ? 4 : 8));
            const diagonal = d3.linkRadial<HLink, HNode>().angle(d => d.x).radius(d => d.y);

            groupsRef.current = { gZoom, gYearLines, gLink, gNode, radiusScale, treeLayout, diagonal, applyZoomLevel };
        }

        const { gNode, gLink, gYearLines, radiusScale, treeLayout, diagonal, applyZoomLevel } = groupsRef.current;
        const duration = 400;
        const colorScale = d3.scaleOrdinal<string>(theme.families);
        const highlighted = (id: string) => !!activeHighlightNode && !!relatedIds?.has(id);
        highlightRef.current = highlighted;

        const hierarchy = buildHierarchy(visibleNodes);
        if (!hierarchy) return;
        const root = treeLayout(hierarchy);
        for (const d of root.descendants()) {
            d.y = radiusScale(Math.max(MIN_YEAR, Math.min(maxYear, getYear(d.data.start))));
        }

        const ringYears = d3.range(MIN_YEAR, currentYear + 1, 5);
        gYearLines.selectAll<SVGCircleElement, number>('circle.year-circle').data(ringYears)
            .join(enter => enter.append('circle').attr('class', 'year-circle')
                .attr('fill', 'none').attr('stroke', theme.grid).attr('stroke-width', 1.5))
            .attr('r', y => radiusScale(y));
        gYearLines.selectAll<SVGTextElement, number>('text.year-label').data(ringYears)
            .join(enter => enter.append('text').attr('class', 'year-label')
                .attr('dy', '0.35em').attr('text-anchor', 'middle').attr('fill', theme.axis)
                .style('font-size', '10px').style('font-family', theme.font).style('pointer-events', 'none'))
            .attr('y', y => -radiusScale(y))
            .text(y => y);

        const select = (d: HNode) => {
            if (d.data.id === ROOT_ID) return;
            setSelectedNode(d.data);
            zoomToNode(d, 0.3, true);
        };

        const links = gLink.selectAll<SVGPathElement, HLink>('path.radial-link').data(root.links(), d => d.target.data.id);
        links.exit().transition().duration(duration).attr('stroke-opacity', 0).remove();
        links.enter().append('path').attr('class', 'radial-link')
            .attr('stroke-width', 1.5).attr('stroke-opacity', 0)
            .attr('d', d => diagonal({ source: d.source, target: d.source } as HLink))
            .merge(links)
            .transition().duration(duration)
            .attr('d', diagonal)
            .attr('stroke', d => (highlighted(d.target.data.id) ? theme.linkHighlight : theme.link))
            .attr('stroke-opacity', d => (!activeHighlightNode ? 1 : highlighted(d.target.data.id) ? 1 : 0.15))
            .attr('stroke-width', d => (highlighted(d.target.data.id) ? 2.5 : 1.5));

        // Invisible wide strokes so a branch can be grabbed, not just its endpoint.
        const linkHits = gLink.selectAll<SVGPathElement, HLink>('path.link-hit').data(root.links(), d => d.target.data.id);
        linkHits.exit().remove();
        linkHits.enter().append('path').attr('class', 'link-hit')
            .attr('stroke', 'transparent').attr('pointer-events', 'stroke').attr('cursor', 'pointer')
            .on('click', (event: MouseEvent, d) => { event.stopPropagation(); select(d.target); })
            .on('mouseenter', (event: MouseEvent, d) => setHoverInfo({ node: d.target.data, x: event.clientX, y: event.clientY }))
            .on('mousemove', (event: MouseEvent) => setHoverInfo(prev => (prev ? { ...prev, x: event.clientX, y: event.clientY } : null)))
            .on('mouseleave', () => setHoverInfo(null))
            .merge(linkHits)
            .attr('d', diagonal);

        const nodes = gNode.selectAll<SVGGElement, HNode>('g.node-group').data(root.descendants().reverse(), d => d.data.id);
        nodes.exit().transition().duration(duration).attr('fill-opacity', 0).remove();

        const placement = (d: HNode) => `rotate(${(d.x * 180) / Math.PI - 90}) translate(${d.y},0)`;

        const nodeEnter = nodes.enter().append('g')
            .attr('class', 'node-group')
            .attr('transform', placement)
            .attr('fill-opacity', 0)
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
        nodeEnter.append('circle').attr('class', 'node-dot').attr('r', NODE_R);
        nodeEnter.append('text').attr('class', 'node-label').attr('dy', '0.31em')
            .style('paint-order', 'stroke').style('stroke', theme.bg).style('stroke-width', '3px')
            .style('font-weight', '400');

        const nodeMerge = nodes.merge(nodeEnter);
        const nodeUpdate = nodeMerge.transition().duration(duration)
            .attr('transform', placement)
            .attr('fill-opacity', d => (!activeHighlightNode || highlighted(d.data.id) ? 1 : 0.1));

        nodeUpdate.select('circle.node-dot')
            .attr('fill', d => {
                if (highlighted(d.data.id)) return theme.linkHighlight;
                if (d.data.id === ROOT_ID) return theme.nodeRoot;
                if (d.data.stop) return theme.nodeDiscontinued;
                return colorScale(getFamilyId(d));
            });

        nodeUpdate.select('text')
            .attr('transform', d => (d.x >= Math.PI ? 'rotate(180)' : null))
            .attr('x', d => (d.x >= Math.PI ? -LABEL_OFFSET : LABEL_OFFSET))
            .attr('text-anchor', d => (d.x >= Math.PI ? 'end' : 'start'))
            .attr('fill', d => {
                if (highlighted(d.data.id)) return theme.labelHighlight;
                return isPrimary(d) ? theme.text : theme.label;
            })
            .text(d => d.data.name);

        applyZoomLevel();

        // Pan to a newly highlighted node.
        const newHighlightId = activeHighlightNode?.id ?? null;
        if (newHighlightId && newHighlightId !== prevHighlightIdRef.current) {
            const target = root.descendants().find(d => d.data.id === newHighlightId);
            if (target) zoomToNode(target, 0.4);
        }
        prevHighlightIdRef.current = newHighlightId;
    }, [data, visibleNodes, activeHighlightNode, relatedIds, maxYear, currentYear, setSelectedNode, setHoverInfo, zoomToNode]);

    return (
        <div ref={containerRef} className="relative w-full h-full overflow-hidden">
            <TreeToolbar state={state} onFit={fitAll} onExport={exportImage} />
            <svg ref={svgRef} className="w-full h-full" role="group" aria-label="Linux distribution family tree, radial layout" />
            {selectedNode && <DetailPanel node={selectedNode} ancestryPath={ancestryPath} onClose={() => setSelectedNode(null)} />}
            {hoverInfo && <HoverTooltip node={hoverInfo.node} x={hoverInfo.x} y={hoverInfo.y} />}
        </div>
    );
};

export default RadialTree;
