import { useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { Search, ChevronRight, ChevronDown, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import distroData from '../data/distros.json';

interface DistroNode {
    id: string;
    name: string;
    color?: string;
    parent?: string | null;
    start?: string;
    stop?: string;
    icon?: string;
    logo?: string;
    url?: string;
    popularity?: string | null;
    description?: string | null;
    based_on?: string;
}

interface TreeNode extends DistroNode {
    children: TreeNode[];
    isExpanded: boolean;
}

const IndentedList: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedNode, setSelectedNode] = useState<DistroNode | null>(null);
    const [showAll, setShowAll] = useState(false);
    const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['__virtual_root__']));

    const getDistroWatchUrl = (name: string, url?: string) => {
        if (url && url.includes('distrowatch.com')) return url;
        const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return `https://distrowatch.com/table.php?distribution=${slug}`;
    };

    const getLogoUrl = (node: DistroNode) => {
        if (node.logo) return node.logo;
        if (node.icon) return node.icon;
        const slug = node.id.toLowerCase().replace(/[^a-z0-9]/g, '');
        return `https://distrowatch.com/images/y9go/${slug}.png`;
    };

    const parseDate = useCallback((d?: string) => {
        if (!d) return new Date(8640000000000000);
        const parts = d.split(/[.-]/);
        const year = parseInt(parts[0]);
        const month = parts[1] ? parseInt(parts[1]) - 1 : 0;
        const day = parts[2] ? parseInt(parts[2]) : 1;
        return new Date(year, month, day);
    }, []);

    const getYear = useCallback((d?: string | null) => {
        if (!d) return 9999;
        const match = d.match(/^(\d{4})/);
        return match ? parseInt(match[1]) : 9999;
    }, []);

    // Sanitize data
    const fixedData = useMemo(() => {
        const data = (distroData as DistroNode[]).map(d => ({ ...d }));
        const idMap = new Map(data.map(d => [d.id, d]));

        // Fix Ubuntu parent if broken
        const ubuntu = idMap.get('ubuntu');
        if (ubuntu && ubuntu.parent !== 'debian') {
            ubuntu.parent = 'debian';
        }

        // Fix Ubuntu-based distros incorrectly pointing to Debian
        data.forEach(d => {
            if (d.id === 'ubuntu') return;
            const basedOn = d.based_on || '';
            const desc = d.description || '';
            if (basedOn.includes('Ubuntu') || desc.includes('Ubuntu-based') || desc.includes('based on Ubuntu')) {
                if (d.parent !== 'ubuntu') d.parent = 'ubuntu';
            }
        });
        return data;
    }, []);

    // Build tree structure
    const treeData = useMemo(() => {
        const now = new Date();
        let filteredData = fixedData.filter(d => {
            if (!showAll && d.stop && parseDate(d.stop) < now) return false;
            if (searchTerm) {
                return d.name.toLowerCase().includes(searchTerm.toLowerCase());
            }
            return true;
        });

        // Create a map for quick lookup
        const nodeMap = new Map<string, TreeNode>();

        // Add virtual root
        const root: TreeNode = {
            id: '__virtual_root__',
            name: 'Linux Origins',
            parent: null,
            children: [],
            isExpanded: true,
            start: '1991-01-01'
        };
        nodeMap.set('__virtual_root__', root);

        // First pass: create all nodes
        filteredData.forEach(d => {
            nodeMap.set(d.id, {
                ...d,
                children: [],
                isExpanded: expandedNodes.has(d.id)
            });
        });

        // Cycle breaking
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const hasCycle = (nodeId: string): boolean => {
            if (recursionStack.has(nodeId)) return true;
            if (visited.has(nodeId)) return false;

            visited.add(nodeId);
            recursionStack.add(nodeId);

            const node = nodeMap.get(nodeId);
            // node.parent is the ID string in DistroNode
            if (node && node.parent && node.parent !== '__virtual_root__') {
                if (hasCycle(node.parent)) {
                    // Auto-fix cycle
                    node.parent = '__virtual_root__';
                }
            }

            recursionStack.delete(nodeId);
            return false;
        };

        // Check all nodes
        for (const id of nodeMap.keys()) {
            if (id !== '__virtual_root__') hasCycle(id);
        }

        // Second pass: build tree
        filteredData.forEach(d => {
            const node = nodeMap.get(d.id)!;
            let parentId = node.parent || '__virtual_root__'; // Use sanitized parent from nodeMap

            // If parent is not in the map (filtered out), default to root
            if (parentId !== '__virtual_root__' && !nodeMap.has(parentId)) {
                parentId = '__virtual_root__';
            }

            const parent = nodeMap.get(parentId);
            if (parent) {
                parent.children.push(node);
            }
        });

        // Sort children by start date
        const sortChildren = (node: TreeNode) => {
            node.children.sort((a, b) => getYear(a.start) - getYear(b.start));
            node.children.forEach(sortChildren);
        };
        sortChildren(root);

        return root;
    }, [showAll, searchTerm, expandedNodes, parseDate, getYear]);

    const toggleNode = (nodeId: string) => {
        setExpandedNodes(prev => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            return next;
        });
    };

    const colorScale = useMemo(() => d3.scaleOrdinal(d3.schemeCategory10), []);

    const renderNode = (node: TreeNode, depth: number = 0, familyColor?: string): React.ReactElement => {
        const hasChildren = node.children.length > 0;
        const isExpanded = expandedNodes.has(node.id);
        const isRoot = node.id === '__virtual_root__';

        // Determine color
        let myColor = familyColor;
        if (!isRoot && depth === 1) {
            // New family root
            myColor = colorScale(node.id);
        }

        // Display color: Red if stopped; Grey if leaf (no children); otherwise Family Color
        let displayColor = node.stop ? '#ef4444' : (hasChildren ? (myColor || '#06b6d4') : '#94a3b8');

        return (
            <div key={node.id}>
                <div
                    className={`flex items-center gap-2 py-2 px-3 hover:bg-slate-800/50 rounded-lg transition-colors cursor-pointer group ${(selectedNode?.id === node.id || focusedNodeId === node.id) ? 'bg-slate-800/70' : ''
                        }`}
                    style={{ paddingLeft: `${depth * 24 + 12}px` }}
                    onClick={() => {
                        if (!isRoot) {
                            setFocusedNodeId(node.id);
                        }
                    }}
                >
                    {/* Expand/Collapse Icon */}
                    {hasChildren ? (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleNode(node.id);
                            }}
                            className="text-slate-500 hover:text-cyan-400 transition-colors"
                        >
                            {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                            ) : (
                                <ChevronRight className="w-4 h-4" />
                            )}
                        </button>
                    ) : (
                        <div className="w-4" />
                    )}

                    {/* Info Button */}
                    {!isRoot && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelectedNode(node);
                                setFocusedNodeId(node.id);
                            }}
                            className="w-4 h-4 rounded-full border border-slate-600 flex items-center justify-center hover:bg-cyan-500 hover:border-cyan-500 hover:text-white transition-colors group/info"
                        >
                            <span className="text-[10px] font-bold font-serif italic leading-none">i</span>
                        </button>
                    )}

                    {/* Color Indicator */}
                    <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: displayColor }}
                    />

                    {/* Name */}
                    <div className="flex-1 flex items-center gap-3">
                        <span className={`text-sm ${isRoot ? 'font-bold text-slate-300' : 'text-slate-200'}`}>
                            {node.name}
                        </span>
                        {node.popularity && (
                            <span className="text-[10px] bg-yellow-400/20 text-yellow-400 px-2 py-0.5 rounded-full font-bold">
                                #{node.popularity}
                            </span>
                        )}
                    </div>

                    {/* Metadata */}
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                        {node.start && (
                            <span className="font-mono">{getYear(node.start)}</span>
                        )}
                        {node.stop && (
                            <span className="text-red-400 font-mono">✕ {getYear(node.stop)}</span>
                        )}
                        {hasChildren && (
                            <span className="text-slate-600">({node.children.length})</span>
                        )}
                    </div>
                </div>

                {/* Children */}
                {hasChildren && isExpanded && (
                    <div>
                        {node.children.map(child => renderNode(child, depth + 1, myColor))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="w-full h-full relative flex">
            {/* Main List */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-5xl mx-auto p-6">
                    {/* Header */}
                    <div className="sticky top-0 bg-[#0f172a] z-10 pb-4 mb-4 border-b border-slate-800">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search distributions..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-slate-800/90 backdrop-blur-md border border-slate-700/50 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                                />
                            </div>

                            <div className="flex bg-slate-800/90 backdrop-blur-md rounded-xl border border-slate-700/50 overflow-hidden">
                                <button
                                    onClick={() => setShowAll(false)}
                                    className={`px-6 py-3 rounded-xl text-xs font-black transition-all ${!showAll ? 'bg-cyan-500 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                                >
                                    ACTIVE ONLY
                                </button>
                                <button
                                    onClick={() => setShowAll(true)}
                                    className={`px-6 py-3 rounded-xl text-xs font-black transition-all ${showAll ? 'bg-cyan-500 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                                >
                                    SHOW ALL
                                </button>
                            </div>
                        </div>

                        {/* Column Headers */}
                        <div className="flex items-center gap-2 px-3 text-xs text-slate-500 font-bold uppercase tracking-wider">
                            <div className="w-4" />
                            <div className="w-3" />
                            <div className="flex-1">Distribution</div>
                            <div className="flex items-center gap-4">
                                <span className="w-12 text-center">Year</span>
                                <span className="w-12 text-center">End</span>
                                <span className="w-12 text-center">Count</span>
                            </div>
                        </div>
                    </div>

                    {/* Tree */}
                    <div className="space-y-1">
                        {renderNode(treeData)}
                    </div>
                </div>
            </div>

            {/* Info Panel */}
            <AnimatePresence>
                {selectedNode && (
                    <motion.div
                        initial={{ x: 400, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 400, opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="w-96 bg-slate-900/95 backdrop-blur-xl border-l border-slate-700/50 shadow-2xl overflow-y-auto"
                    >
                        <div className="p-8">
                            <button
                                onClick={() => setSelectedNode(null)}
                                className="absolute top-6 right-6 text-slate-400 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <div className="flex items-start gap-6 mb-8">
                                <div>
                                    <h2 className="text-2xl font-black text-white mb-2 leading-tight">
                                        {selectedNode.name}
                                    </h2>
                                    <p className="text-xs text-slate-400 font-medium tracking-wide uppercase">
                                        {selectedNode.parent ? `Ancestor: ${selectedNode.parent}` : 'Origin Project'}
                                    </p>
                                </div>
                                <div className="bg-white p-4 rounded-3xl shadow-2xl flex items-center justify-center w-24 h-24 relative overflow-hidden">
                                    <img
                                        src={getLogoUrl(selectedNode)}
                                        alt=""
                                        className="w-20 h-20 object-contain z-10"
                                        onError={(e) => { (e.target as HTMLImageElement).src = 'https://distrowatch.com/images/y9go/linux.png'; }}
                                    />
                                    {selectedNode.popularity && (
                                        <div className="absolute top-0 right-0 bg-yellow-400 text-slate-900 text-[8px] font-black px-2 py-1 rounded-bl-xl z-20 shadow-sm">
                                            #{selectedNode.popularity}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-4 mb-8">
                                <div>
                                    <div className="text-[10px] text-slate-500 font-black tracking-widest uppercase mb-1">Release Date</div>
                                    <div className="text-sm text-slate-300 font-medium">{selectedNode.start || 'Unknown'}</div>
                                </div>
                                {selectedNode.stop && (
                                    <div>
                                        <div className="text-[10px] text-slate-500 font-black tracking-widest uppercase mb-1">Discontinued</div>
                                        <div className="text-sm text-red-400 font-medium">{selectedNode.stop}</div>
                                    </div>
                                )}
                            </div>

                            {selectedNode.description && (
                                <p className="text-slate-400 text-[11px] leading-relaxed mb-10 line-clamp-4 font-medium italic opacity-80">
                                    "{selectedNode.description}"
                                </p>
                            )}

                            <div className="flex flex-col gap-3">
                                <a href={getDistroWatchUrl(selectedNode.name, selectedNode.url)} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-[1.5rem] py-5 text-sm font-black tracking-tight transition-all shadow-glow"
                                >
                                    DISTROWATCH
                                    <Info className="w-5 h-5" />
                                </a>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default IndentedList;
