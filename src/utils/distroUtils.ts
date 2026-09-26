/**
 * Shared utilities for distro visualisation components.
 * Import from here instead of duplicating in FamilyTree / RadialTree.
 * Shared UI pieces live in src/components/DistroWidgets.tsx.
 */

import type { DistroNode } from '../hooks/useDistroData';

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function parseDate(d?: string | null): Date {
    if (!d) return new Date(8640000000000000);
    const parts = d.split(/[.-]/);
    const year  = parseInt(parts[0], 10);
    if (isNaN(year)) return new Date(8640000000000000);
    const month = parts[1] ? parseInt(parts[1], 10) - 1 : 0;
    const day   = parts[2] ? parseInt(parts[2], 10) : 1;
    const date  = new Date(year, isNaN(month) ? 0 : month, isNaN(day) ? 1 : day);
    return isNaN(date.getTime()) ? new Date(8640000000000000) : date;
}

export function getYear(d?: string | null): number {
    if (!d) return 9999;
    const date = parseDate(d);
    const time = date.getTime();
    if (isNaN(time) || time >= 8640000000000000) return 9999;
    const fullYear = date.getFullYear();
    if (isNaN(fullYear) || fullYear > 3000) return 9999;
    const startOfYear = new Date(fullYear, 0, 1);
    const dayOfYear   = (time - startOfYear.getTime()) / 86400000;
    return fullYear + dayOfYear / 366;
}

// ─── Logo helpers ─────────────────────────────────────────────────────────────

/** Primary URL: locally cached logo. */
export function getLogoUrl(node: DistroNode): string {
    return `/logos/${node.id}.png`;
}

/** Fallback URL when local logo 404s. */
export function getFallbackLogoUrl(node: DistroNode): string {
    if (node.icon) return node.icon;
    const slug = node.id.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `https://distrowatch.com/images/y9go/${slug}.png`;
}

// ─── Popularity ───────────────────────────────────────────────────────────────

/** Popularity rank number (lower = more popular). Returns 9999 when unknown. */
export function getPopularityRank(node: DistroNode): number {
    return node.popularity ? parseInt(node.popularity) : 9999;
}

/** True if this distro is in the top-100 by DistroWatch page hits. */
export function isPrimaryDistro(node: DistroNode): boolean {
    return getPopularityRank(node) <= 100;
}
