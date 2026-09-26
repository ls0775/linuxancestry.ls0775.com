/**
 * Pure helpers for filtering distributions and computing lineage.
 * Both visualisations use these so the timeline semantics are identical.
 */

import * as d3 from 'd3';
import type { DistroNode } from '../hooks/useDistroData';
import { getYear, parseDate } from './distroUtils';

export const MIN_YEAR = 1991;
export const ROOT_ID = 'Linux_Original';

export const LINUX_ROOT: DistroNode = { id: ROOT_ID, name: 'Linux', parent: null, start: '1991.09.17' };

export interface DistroIndex {
    byId: Map<string, DistroNode>;
    childrenOf: Map<string, DistroNode[]>;
}

export function buildIndex(data: DistroNode[]): DistroIndex {
    const byId = new Map<string, DistroNode>();
    const childrenOf = new Map<string, DistroNode[]>();
    for (const d of data) {
        byId.set(d.id, d);
        if (d.parent) {
            const list = childrenOf.get(d.parent);
            if (list) list.push(d); else childrenOf.set(d.parent, [d]);
        }
    }
    return { byId, childrenOf };
}

/**
 * Distros that existed in `year`: began on or before the end of that year and,
 * unless `showAll`, had not stopped before the year began.
 */
export function filterByTimeline(data: DistroNode[], year: number, showAll: boolean): DistroNode[] {
    return data.filter(d => {
        if (getYear(d.start) >= year + 1) return false;
        if (showAll || !d.stop) return true;
        return getYear(d.stop) >= year;
    });
}

/** Names from the root-most ancestor down to `node`, capped at `maxDepth`. */
export function getAncestryPath(node: DistroNode, index: DistroIndex, maxDepth = 8): string[] {
    const path: string[] = [];
    const seen = new Set<string>();
    let curr: DistroNode | undefined = node;
    while (curr && path.length < maxDepth && !seen.has(curr.id)) {
        seen.add(curr.id);
        path.unshift(curr.name);
        curr = curr.parent ? index.byId.get(curr.parent) : undefined;
    }
    return path;
}

/** Ids of `node`, all of its ancestors and all of its descendants. */
export function getRelatedIds(node: DistroNode, index: DistroIndex): Set<string> {
    const related = new Set<string>();
    let curr: DistroNode | undefined = node;
    while (curr && !related.has(curr.id)) {
        related.add(curr.id);
        curr = curr.parent ? index.byId.get(curr.parent) : undefined;
    }
    const stack = [node.id];
    while (stack.length) {
        const pid = stack.pop()!;
        for (const child of index.childrenOf.get(pid) ?? []) {
            if (related.has(child.id)) continue;
            related.add(child.id);
            stack.push(child.id);
        }
    }
    return related;
}

/** Number of descendants of `id` within `subset`. */
export function countDescendants(id: string, subset: DistroNode[]): number {
    const { childrenOf } = buildIndex(subset);
    let total = 0;
    const stack = [id];
    const seen = new Set<string>();
    while (stack.length) {
        const pid = stack.pop()!;
        for (const child of childrenOf.get(pid) ?? []) {
            if (seen.has(child.id)) continue;
            seen.add(child.id);
            total++;
            stack.push(child.id);
        }
    }
    return total;
}

export interface TreeStats {
    total: number;
    active: number;
    selectedChildren?: number;
    selectedName?: string;
}

export function computeStats(data: DistroNode[], year: number, showAll: boolean, highlight: DistroNode | null): TreeStats {
    const existed = data.filter(d => getYear(d.start) < year + 1);
    const stats: TreeStats = {
        total: existed.length,
        active: existed.filter(d => !d.stop).length,
    };
    if (highlight) {
        stats.selectedName = highlight.name;
        stats.selectedChildren = countDescendants(highlight.id, filterByTimeline(data, year, showAll));
    }
    return stats;
}

/**
 * Build a d3 hierarchy rooted at the virtual Linux node. Distros whose parent
 * is not in `nodes` are re-parented to the root. Returns null if stratify fails.
 */
export function buildHierarchy(nodes: DistroNode[]): d3.HierarchyNode<DistroNode> | null {
    const ids = new Set(nodes.map(d => d.id));
    const rows = [LINUX_ROOT, ...nodes]
        .sort((a, b) => parseDate(a.start).getTime() - parseDate(b.start).getTime());
    const stratify = d3.stratify<DistroNode>()
        .id(d => d.id)
        .parentId(d => d.id === ROOT_ID ? null : (d.parent && ids.has(d.parent) ? d.parent : ROOT_ID));
    try {
        return stratify(rows);
    } catch {
        return null;
    }
}

/** Id of the top-level family (direct child of the root) a hierarchy node belongs to. */
export function getFamilyId(node: d3.HierarchyNode<DistroNode>): string {
    let n = node;
    while (n.parent && n.parent.data.id !== ROOT_ID) n = n.parent;
    return n.data.id;
}
