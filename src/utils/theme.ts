/**
 * Resolves design tokens from `:root` (see src/index.css and docs/design.md).
 * D3 sets SVG presentation attributes, and the SVG export serialises them,
 * so we resolve to concrete values here rather than embedding `var()`.
 */
const read = (name: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export interface VizTheme {
    bg: string;
    text: string;
    muted: string;
    rule: string;
    link: string;
    linkHighlight: string;
    nodeActive: string;
    nodeDiscontinued: string;
    nodeRoot: string;
    label: string;
    labelHighlight: string;
    labelMuted: string;
    grid: string;
    gridMajor: string;
    axis: string;
    axisMajor: string;
    families: string[];
    font: string;
}

export function getVizTheme(): VizTheme {
    return {
        bg: read('--bg'),
        text: read('--text'),
        muted: read('--muted'),
        rule: read('--rule'),
        link: read('--viz-link'),
        linkHighlight: read('--viz-link-highlight'),
        nodeActive: read('--viz-node-active'),
        nodeDiscontinued: read('--viz-node-discontinued'),
        nodeRoot: read('--viz-node-root'),
        label: read('--viz-label'),
        labelHighlight: read('--viz-label-highlight'),
        labelMuted: read('--viz-label-muted'),
        grid: read('--viz-grid'),
        gridMajor: read('--viz-grid-major'),
        axis: read('--viz-axis'),
        axisMajor: read('--viz-axis-major'),
        families: Array.from({ length: 10 }, (_, i) => read(`--viz-family-${i}`)),
        font: read('--font'),
    };
}
