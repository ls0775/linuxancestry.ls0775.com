import { describe, expect, it } from 'vitest';
import type { DistroNode } from '../../hooks/useDistroData';
import {
    buildHierarchy, buildIndex, computeStats, countDescendants, filterByTimeline,
    getAncestryPath, getFamilyId, getRelatedIds, ROOT_ID,
} from '../lineage';

const data: DistroNode[] = [
    { id: 'debian', name: 'Debian', parent: null, start: '1993.08.16', stop: '' },
    { id: 'ubuntu', name: 'Ubuntu', parent: 'debian', start: '2004.10.20', stop: '' },
    { id: 'mint', name: 'Linux Mint', parent: 'ubuntu', start: '2006.08.27', stop: '' },
    { id: 'corel', name: 'Corel Linux', parent: 'debian', start: '1999.11.15', stop: '2001.06.01' },
    { id: 'slackware', name: 'Slackware', parent: null, start: '1993.07.17', stop: '' },
    { id: 'orphan', name: 'Orphan', parent: 'missing', start: '2010.01.01', stop: '' },
];
const index = buildIndex(data);

describe('buildIndex', () => {
    it('indexes by id and by parent', () => {
        expect(index.byId.get('mint')?.name).toBe('Linux Mint');
        expect(index.childrenOf.get('debian')?.map(d => d.id)).toEqual(['ubuntu', 'corel']);
    });
});

describe('filterByTimeline', () => {
    it('includes distros that began in the selected year', () => {
        expect(filterByTimeline(data, 2004, false).map(d => d.id)).toContain('ubuntu');
        expect(filterByTimeline(data, 2003, false).map(d => d.id)).not.toContain('ubuntu');
    });
    it('hides distros that stopped before the selected year unless showAll', () => {
        expect(filterByTimeline(data, 2001, false).map(d => d.id)).toContain('corel');
        expect(filterByTimeline(data, 2002, false).map(d => d.id)).not.toContain('corel');
        expect(filterByTimeline(data, 2002, true).map(d => d.id)).toContain('corel');
    });
});

describe('lineage', () => {
    it('builds the ancestry path root-first', () => {
        expect(getAncestryPath(index.byId.get('mint')!, index)).toEqual(['Debian', 'Ubuntu', 'Linux Mint']);
    });
    it('collects ancestors and descendants', () => {
        expect([...getRelatedIds(index.byId.get('ubuntu')!, index)].sort()).toEqual(['debian', 'mint', 'ubuntu']);
    });
    it('does not loop on cycles', () => {
        const cyc: DistroNode[] = [
            { id: 'a', name: 'A', parent: 'b', start: '2000' },
            { id: 'b', name: 'B', parent: 'a', start: '2000' },
        ];
        const ci = buildIndex(cyc);
        expect(getAncestryPath(cyc[0], ci)).toEqual(['B', 'A']);
        expect(getRelatedIds(cyc[0], ci).size).toBe(2);
    });
    it('counts descendants within a subset', () => {
        expect(countDescendants('debian', data)).toBe(3);
        expect(countDescendants('debian', filterByTimeline(data, 2005, false))).toBe(1);
    });
});

describe('computeStats', () => {
    it('reports totals and highlighted descendants', () => {
        const s = computeStats(data, 2010, false, index.byId.get('debian')!);
        expect(s.total).toBe(6);
        expect(s.active).toBe(5);
        expect(s.selectedName).toBe('Debian');
        expect(s.selectedChildren).toBe(2);
    });
});

describe('buildHierarchy', () => {
    it('roots everything under the virtual Linux node and re-parents orphans', () => {
        const root = buildHierarchy(data)!;
        expect(root.data.id).toBe(ROOT_ID);
        expect(root.children?.map(c => c.data.id).sort()).toEqual(['debian', 'orphan', 'slackware']);
        const mint = root.descendants().find(d => d.data.id === 'mint')!;
        expect(getFamilyId(mint)).toBe('debian');
    });
    it('re-parents when the parent is filtered out', () => {
        const root = buildHierarchy(data.filter(d => d.id !== 'ubuntu'))!;
        const mint = root.descendants().find(d => d.data.id === 'mint')!;
        expect(mint.parent?.data.id).toBe(ROOT_ID);
    });
});
