import { describe, expect, it } from 'vitest';
import { cullLabels, estimateTextWidth, rotatedLabelBox, type LabelCandidate } from '../labelCulling';

const fakeText = () => ({ style: { display: '' } }) as unknown as SVGTextElement;

const candidate = (x: number, y: number, priority: number, w = 50, h = 12): LabelCandidate => ({
    el: fakeText(),
    box: { x, y, w, h },
    priority,
});

const viewport = { width: 800, height: 600 };

describe('cullLabels', () => {
    it('shows non-overlapping labels', () => {
        const a = candidate(10, 10, 1);
        const b = candidate(10, 100, 2);
        expect(cullLabels([a, b], viewport)).toBe(2);
        expect(a.el.style.display).toBe('');
        expect(b.el.style.display).toBe('');
    });

    it('hides the lower-priority label of an overlapping pair regardless of input order', () => {
        const important = candidate(10, 10, 1);
        const minor = candidate(20, 14, 5);
        cullLabels([minor, important], viewport);
        expect(important.el.style.display).toBe('');
        expect(minor.el.style.display).toBe('none');
    });

    it('treats labels within the padding as overlapping', () => {
        const a = candidate(10, 10, 1);
        const b = candidate(10, 10 + 12 + 2, 2);
        expect(cullLabels([a, b], viewport, 3)).toBe(1);
    });

    it('hides labels outside the viewport without reserving space', () => {
        const off = candidate(-200, -200, 1);
        const on = candidate(10, 10, 2);
        expect(cullLabels([off, on], viewport)).toBe(1);
        expect(off.el.style.display).toBe('none');
        expect(on.el.style.display).toBe('');
    });
});

describe('rotatedLabelBox', () => {
    it('extends to the right for angle 0', () => {
        const box = rotatedLabelBox(100, 100, 0, 8, 50, 10);
        expect(box.x).toBeCloseTo(108);
        expect(box.w).toBeCloseTo(50);
        expect(box.y).toBeCloseTo(95);
        expect(box.h).toBeCloseTo(10);
    });

    it('extends downward for angle pi/2', () => {
        const box = rotatedLabelBox(100, 100, Math.PI / 2, 8, 50, 10);
        expect(box.y).toBeCloseTo(108);
        expect(box.h).toBeCloseTo(50);
        expect(box.x).toBeCloseTo(95);
        expect(box.w).toBeCloseTo(10);
    });
});

describe('estimateTextWidth', () => {
    it('scales with length and font size', () => {
        expect(estimateTextWidth('Ubuntu', 12)).toBeGreaterThan(estimateTextWidth('Ubuntu', 9));
        expect(estimateTextWidth('Ubuntu Studio', 12)).toBeGreaterThan(estimateTextWidth('Ubuntu', 12));
    });
});
