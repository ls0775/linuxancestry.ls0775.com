import { getVizTheme } from './theme';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FOOTER_PX = 44;

export interface ViewportExportOptions {
    /** Screen-space width/height of the visible canvas (px). */
    width: number;
    height: number;
    /** Pixels to crop from the right edge, e.g. the area under an open detail panel. */
    cropRight?: number;
    /** Heading rendered in the footer strip. */
    title: string;
    /** Secondary line rendered under the title. */
    subtitle?: string;
    filename: string;
    /** CSS selectors for elements that must not appear in the export (hit targets etc.). */
    stripSelectors?: string[];
}

/**
 * Export exactly what is on screen: the clone keeps the live zoom transform,
 * the current label culling and highlight state, and is framed to the visible
 * viewport (minus any cropped region). A footer strip carries the title.
 */
export function exportViewport(svg: SVGSVGElement, opts: ViewportExportOptions): SVGSVGElement {
    const theme = getVizTheme();
    const width = Math.max(1, Math.round(opts.width - (opts.cropRight ?? 0)));
    const height = Math.round(opts.height);

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', SVG_NS);
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height + FOOTER_PX));
    clone.setAttribute('viewBox', `0 0 ${width} ${height + FOOTER_PX}`);
    clone.removeAttribute('class');
    clone.removeAttribute('tabindex');
    clone.removeAttribute('style');
    // Standalone SVGs have no page CSS, so inherit the site font from the root.
    clone.setAttribute('font-family', theme.font);
    clone.querySelectorAll(['[aria-hidden="true"]', ...(opts.stripSelectors ?? [])].join(',')).forEach(el => el.remove());
    clone.querySelectorAll('[role], [tabindex], [aria-label]').forEach(el => {
        el.removeAttribute('role'); el.removeAttribute('tabindex'); el.removeAttribute('aria-label');
    });
    clone.querySelectorAll<SVGElement>('[style*="cursor"]').forEach(el => { el.style.cursor = ''; });

    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('width', String(width));
    bg.setAttribute('height', String(height + FOOTER_PX));
    bg.setAttribute('fill', theme.bg);
    clone.insertBefore(bg, clone.firstChild);

    // Clip the drawing so nothing spills into the cropped region or the footer.
    const clipId = 'export-clip';
    const defs = document.createElementNS(SVG_NS, 'defs');
    const clip = document.createElementNS(SVG_NS, 'clipPath');
    clip.setAttribute('id', clipId);
    const clipRect = document.createElementNS(SVG_NS, 'rect');
    clipRect.setAttribute('width', String(width));
    clipRect.setAttribute('height', String(height));
    clip.appendChild(clipRect);
    defs.appendChild(clip);
    clone.insertBefore(defs, clone.firstChild);
    const drawing = document.createElementNS(SVG_NS, 'g');
    drawing.setAttribute('clip-path', `url(#${clipId})`);
    for (const child of [...clone.childNodes]) {
        if (child !== defs && child !== bg) drawing.appendChild(child);
    }
    clone.appendChild(drawing);

    const rule = document.createElementNS(SVG_NS, 'line');
    rule.setAttribute('x1', '0'); rule.setAttribute('x2', String(width));
    rule.setAttribute('y1', String(height + 0.5)); rule.setAttribute('y2', String(height + 0.5));
    rule.setAttribute('stroke', theme.gridMajor);
    clone.appendChild(rule);

    const title = document.createElementNS(SVG_NS, 'text');
    title.setAttribute('x', '16');
    title.setAttribute('y', String(height + (opts.subtitle ? 18 : 27)));
    title.setAttribute('fill', theme.text);
    title.setAttribute('font-family', theme.font);
    title.setAttribute('font-weight', '400');
    title.style.fontSize = '14px';
    title.textContent = opts.title;
    clone.appendChild(title);

    if (opts.subtitle) {
        const sub = document.createElementNS(SVG_NS, 'text');
        sub.setAttribute('x', '16');
        sub.setAttribute('y', String(height + 34));
        sub.setAttribute('fill', theme.muted);
        sub.setAttribute('font-family', theme.font);
        sub.style.fontSize = '11px';
        sub.textContent = opts.subtitle;
        clone.appendChild(sub);
    }

    const credit = document.createElementNS(SVG_NS, 'text');
    credit.setAttribute('x', String(width - 16));
    credit.setAttribute('y', String(height + 27));
    credit.setAttribute('text-anchor', 'end');
    credit.setAttribute('fill', theme.muted);
    credit.setAttribute('font-family', theme.font);
    credit.style.fontSize = '11px';
    credit.textContent = 'linuxancestry.ls0775.com · data: DistroWatch';
    clone.appendChild(credit);

    downloadSvg(clone, opts.filename);
    return clone;
}

export function downloadSvg(clone: SVGSVGElement, filename: string) {
    const xml = new XMLSerializer().serializeToString(clone);
    const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n', xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export function slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Human-readable date stamp for filenames, e.g. 2026-09-26. */
export const dateStamp = (d = new Date()): string => d.toISOString().slice(0, 10);
