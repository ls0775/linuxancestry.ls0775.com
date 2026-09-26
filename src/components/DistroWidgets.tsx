import React from 'react';
import type { DistroNode } from '../hooks/useDistroData';

interface PopularityBadgeProps {
    node: DistroNode;
}

/** Popularity rank as quiet muted text, e.g. "No. 12". */
export const PopularityBadge: React.FC<PopularityBadgeProps> = ({ node }) => {
    if (!node.popularity) return null;
    return <span className="text-[0.95rem] font-light text-muted whitespace-nowrap">No. {node.popularity}</span>;
};

interface HoverTooltipProps {
    node: DistroNode;
    x: number;
    y: number;
}

export const HoverTooltip: React.FC<HoverTooltipProps> = ({ node, x, y }) => (
    <div
        className="panel fixed z-50 pointer-events-none px-3 py-2 leading-snug"
        style={{ left: x + 14, top: y - 40 }}
    >
        <p className="text-[0.95rem]">
            {node.name}
            {node.popularity && <span className="text-muted font-light"> · No. {node.popularity}</span>}
        </p>
        <p className="text-[0.8rem] text-muted font-light tabular-nums">
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
        <p className="text-[0.8rem] font-light text-muted mt-1 leading-relaxed">
            {path.map((name, i) => (
                <React.Fragment key={name}>
                    {i > 0 && ' › '}
                    <span className={i === path.length - 1 ? 'text-text' : undefined}>{name}</span>
                </React.Fragment>
            ))}
        </p>
    );
};
