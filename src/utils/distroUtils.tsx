/**
 * Shared utilities for distro visualisation components.
 * Import from here instead of duplicating in FamilyTree / RadialTree.
 */

import React from 'react';
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

// ─── Shared UI components ─────────────────────────────────────────────────────

interface PopularityBadgeProps {
    node: DistroNode;
    /** 'inline' renders a small yellow pill; 'corner' renders an absolute-positioned corner badge */
    variant?: 'inline' | 'corner';
}

export const PopularityBadge: React.FC<PopularityBadgeProps> = ({ node, variant = 'inline' }) => {
    if (!node.popularity) return null;
    if (variant === 'corner') {
        return (
            <div className="absolute top-0 right-0 bg-yellow-400 text-slate-900 text-[8px] font-black px-2 py-1 rounded-bl-xl z-20 shadow-sm">
                #{node.popularity}
            </div>
        );
    }
    return (
        <span className="text-[11px] font-black bg-yellow-400 text-slate-900 rounded-lg px-2 py-0.5 whitespace-nowrap">
            #{node.popularity} popularity
        </span>
    );
};

interface HoverTooltipProps {
    node: DistroNode;
    x: number;
    y: number;
}

export const HoverTooltip: React.FC<HoverTooltipProps> = ({ node, x, y }) => (
    <div
        className="fixed z-50 pointer-events-none bg-slate-900/95 border border-slate-700/50 rounded-lg px-3 py-2 shadow-xl"
        style={{ left: x + 14, top: y - 40 }}
    >
        <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-white">{node.name}</p>
            {node.popularity && (
                <span className="text-[10px] font-black bg-yellow-400 text-slate-900 rounded px-1.5 py-0.5">
                    #{node.popularity}
                </span>
            )}
        </div>
        <p className="text-xs text-slate-400">
            {node.start?.slice(0, 4) ?? '?'}
            {node.stop ? ` – ${node.stop.slice(0, 4)}` : ' – present'}
        </p>
    </div>
);

interface AncestryBreadcrumbProps {
    path: string[];
}

export const AncestryBreadcrumb: React.FC<AncestryBreadcrumbProps> = ({ path }) => {
    if (path.length <= 1) return null;
    return (
        <div className="flex flex-wrap items-center gap-1 mt-2">
            {path.map((name, i) => (
                <span key={name} className="flex items-center gap-1 text-[10px]">
                    {i > 0 && <span className="text-slate-700">›</span>}
                    <span className={i === path.length - 1 ? 'text-cyan-400 font-bold' : 'text-slate-500'}>
                        {name}
                    </span>
                </span>
            ))}
        </div>
    );
};
