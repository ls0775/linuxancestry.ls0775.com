import { describe, expect, it } from 'vitest';
import { getFallbackLogoUrl, getLogoUrl, getPopularityRank, getYear, parseDate } from '../distroUtils';

describe('parseDate', () => {
    it('parses dotted and dashed dates', () => {
        expect(parseDate('2004.10.20')).toEqual(new Date(2004, 9, 20));
        expect(parseDate('1993-08-16')).toEqual(new Date(1993, 7, 16));
    });
    it('defaults missing month/day to 1 January', () => {
        expect(parseDate('2010')).toEqual(new Date(2010, 0, 1));
        expect(parseDate('2010.06')).toEqual(new Date(2010, 5, 1));
    });
    it('returns the far-future sentinel for empty or invalid input', () => {
        const sentinel = new Date(8640000000000000).getTime();
        expect(parseDate('').getTime()).toBe(sentinel);
        expect(parseDate(undefined).getTime()).toBe(sentinel);
        expect(parseDate('unknown').getTime()).toBe(sentinel);
    });
});

describe('getYear', () => {
    it('returns a fractional year', () => {
        expect(getYear('2004.01.01')).toBe(2004);
        expect(getYear('2004.07.01')).toBeGreaterThan(2004.4);
        expect(getYear('2004.07.01')).toBeLessThan(2004.6);
    });
    it('returns 9999 for missing or sentinel values', () => {
        expect(getYear('')).toBe(9999);
        expect(getYear(null)).toBe(9999);
        expect(getYear('9999')).toBe(9999);
    });
});

describe('logo helpers', () => {
    it('prefers the local logo and falls back to icon then DistroWatch', () => {
        expect(getLogoUrl({ id: 'ubuntu', name: 'Ubuntu' })).toBe('/logos/ubuntu.png');
        expect(getFallbackLogoUrl({ id: 'x', name: 'X', icon: 'https://e.g/x.png' })).toBe('https://e.g/x.png');
        expect(getFallbackLogoUrl({ id: 'Foo_Bar', name: 'Foo' })).toBe('https://distrowatch.com/images/y9go/foobar.png');
    });
});

describe('getPopularityRank', () => {
    it('parses the rank and defaults to 9999', () => {
        expect(getPopularityRank({ id: 'a', name: 'a', popularity: '12' })).toBe(12);
        expect(getPopularityRank({ id: 'a', name: 'a' })).toBe(9999);
    });
});
