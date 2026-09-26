/** Axis-aligned box in screen pixels. */
export interface ScreenBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface LabelCandidate {
    el: SVGTextElement;
    box: ScreenBox;
    /** Lower values are placed first and therefore win collisions. */
    priority: number;
}

/** Rough on-screen width of a label at the given font size. */
export const estimateTextWidth = (text: string, fontPx: number): number => text.length * fontPx * 0.56;

const intersects = (a: ScreenBox, b: ScreenBox, pad: number): boolean =>
    a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

/**
 * Greedy occlusion culling. Candidates are placed in priority order; any label
 * whose box collides with one already placed, or that lies outside the
 * viewport, is hidden. Returns the number of labels shown.
 */
export function cullLabels(
    candidates: LabelCandidate[],
    viewport: { width: number; height: number },
    pad = 3,
): number {
    const placed: ScreenBox[] = [];
    const sorted = [...candidates].sort((a, b) => a.priority - b.priority);
    let shown = 0;

    for (const { el, box } of sorted) {
        const offscreen = box.x + box.w < 0 || box.y + box.h < 0 || box.x > viewport.width || box.y > viewport.height;
        if (offscreen) {
            el.style.display = 'none';
            continue;
        }
        const blocked = placed.some(p => intersects(p, box, pad));
        el.style.display = blocked ? 'none' : '';
        if (!blocked) {
            placed.push(box);
            shown++;
        }
    }
    return shown;
}

/**
 * Bounding box of a label that runs along a direction from an anchor point,
 * e.g. radial labels. `angle` is in radians, measured like SVG (clockwise
 * from +x). `offset` is the gap between anchor and text start.
 */
export function rotatedLabelBox(
    anchorX: number,
    anchorY: number,
    angle: number,
    offset: number,
    width: number,
    fontPx: number,
): ScreenBox {
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const px = -uy * (fontPx / 2);
    const py = ux * (fontPx / 2);
    const sx = anchorX + ux * offset;
    const sy = anchorY + uy * offset;
    const ex = sx + ux * width;
    const ey = sy + uy * width;
    const xs = [sx + px, sx - px, ex + px, ex - px];
    const ys = [sy + py, sy - py, ey + py, ey - py];
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

/** Coalesces repeated calls into one per animation frame. */
export function frameThrottle(fn: () => void): () => void {
    let pending = 0;
    return () => {
        if (pending) return;
        pending = requestAnimationFrame(() => {
            pending = 0;
            fn();
        });
    };
}
