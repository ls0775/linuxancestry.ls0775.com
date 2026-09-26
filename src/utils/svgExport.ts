import { getVizTheme } from './theme';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface ExportFrame {
    x: number;
    y: number;
    width: number;
    height: number;
    /** Output pixels per SVG unit. */
    scale: number;
}

/** Clone the live SVG into a standalone document with a page-coloured background. */
export function cloneForExport(svg: SVGSVGElement, frame: ExportFrame): SVGSVGElement {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', SVG_NS);
    clone.setAttribute('width', String(Math.round(frame.width * frame.scale)));
    clone.setAttribute('height', String(Math.round(frame.height * frame.scale)));
    clone.setAttribute('viewBox', `${frame.x} ${frame.y} ${frame.width} ${frame.height}`);
    clone.removeAttribute('class');
    clone.removeAttribute('tabindex');

    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', String(frame.x));
    bg.setAttribute('y', String(frame.y));
    bg.setAttribute('width', String(frame.width));
    bg.setAttribute('height', String(frame.height));
    bg.setAttribute('fill', getVizTheme().bg);
    clone.insertBefore(bg, clone.firstChild);
    return clone;
}

export function addTitle(clone: SVGSVGElement, frame: ExportFrame, text: string) {
    const theme = getVizTheme();
    const el = document.createElementNS(SVG_NS, 'text');
    el.setAttribute('x', String(Math.round(frame.x + frame.width / 2)));
    el.setAttribute('y', String(Math.round(frame.y + 20 / frame.scale)));
    el.setAttribute('text-anchor', 'middle');
    el.setAttribute('fill', theme.muted);
    el.setAttribute('font-family', theme.font);
    el.setAttribute('font-weight', '400');
    el.style.fontSize = `${Math.round(18 / frame.scale)}px`;
    el.textContent = text;
    clone.appendChild(el);
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
