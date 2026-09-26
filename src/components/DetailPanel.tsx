import React from 'react';
import type { DistroNode } from '../hooks/useDistroData';
import { getLogoUrl, getFallbackLogoUrl } from '../utils/distroUtils';
import { PopularityBadge, AncestryBreadcrumb } from './DistroWidgets';

interface DetailPanelProps {
    node: DistroNode;
    ancestryPath: string[];
    onClose: () => void;
}

const DetailPanel: React.FC<DetailPanelProps> = ({ node, ancestryPath, onClose }) => {
    const parentName = ancestryPath.length > 1 ? ancestryPath[ancestryPath.length - 2] : node.parent;
    return (
    <aside className="panel absolute bottom-4 right-4 z-20 w-[22rem] max-w-[calc(100%-2rem)] max-h-[calc(100%-2rem)] overflow-y-auto p-5 flex flex-col gap-4" aria-label={node.name}>
        <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
                <div className="flex items-baseline gap-3 flex-wrap">
                    <h2 className="text-2xl font-normal leading-tight">{node.name}</h2>
                    <PopularityBadge node={node} />
                </div>
                <AncestryBreadcrumb path={ancestryPath} />
            </div>
            <img
                src={getLogoUrl(node)}
                alt=""
                className="w-12 h-12 object-contain shrink-0"
                onError={(e) => { const t = e.target as HTMLImageElement; t.onerror = null; t.src = getFallbackLogoUrl(node); }}
            />
        </div>

        <dl className="flex gap-6 text-[0.95rem] pt-3 border-t border-rule">
            <div>
                <dt className="label">Began</dt>
                <dd className="tabular-nums">{node.start || 'Unknown'}</dd>
            </div>
            <div>
                <dt className="label">{node.stop ? 'Ended' : 'Status'}</dt>
                <dd className="tabular-nums">{node.stop || 'Active'}</dd>
            </div>
            {parentName && (
                <div className="min-w-0">
                    <dt className="label">Based on</dt>
                    <dd className="truncate">{parentName}</dd>
                </div>
            )}
        </dl>

        {node.description && (
            <p className="text-[0.95rem] font-light text-muted leading-relaxed max-h-40 overflow-y-auto">{node.description}</p>
        )}

        <div className="flex items-baseline justify-between gap-4 text-[0.95rem] pt-3 border-t border-rule">
            <a href={node.url || `https://distrowatch.com/table.php?distribution=${node.id}`} target="_blank" rel="noopener noreferrer">View on DistroWatch</a>
            <button type="button" onClick={onClose} className="textbtn">Close</button>
        </div>
    </aside>
    );
};

export default DetailPanel;
