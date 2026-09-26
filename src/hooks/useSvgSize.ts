import { useEffect, type RefObject } from 'react';

/** Keep the SVG's width/height attributes in sync with its container. */
export function useSvgSize(containerRef: RefObject<HTMLElement | null>, svgRef: RefObject<SVGSVGElement | null>) {
    useEffect(() => {
        const el = containerRef.current;
        const svg = svgRef.current;
        if (!el || !svg) return;
        const apply = () => {
            svg.setAttribute('width', String(el.clientWidth));
            svg.setAttribute('height', String(el.clientHeight));
        };
        apply();
        const ro = new ResizeObserver(apply);
        ro.observe(el);
        return () => ro.disconnect();
    }, [containerRef, svgRef]);
}
