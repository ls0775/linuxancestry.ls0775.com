# Product Requirement Document (PRD): Interactive Linux Distro Map

## 1. Project Overview
The **Interactive Linux Distro Map** is a modern, web-based visualization tool designed to replace the legacy static SVG/CSV generation system. It provides an interactive, collapsible family tree of Linux distributions, allowing users to explore the complex history and lineage of the Linux ecosystem.

## 2. User Objectives
- **Explore Lineage**: Visualize how distributions are related (e.g., Debian -> Ubuntu -> Mint).
- **Interactive Navigation**: Seamlessly zoom, pan, and expand/collapse branches of the tree.
- **Historical Context**: View chronological data and birth dates of distributions.
- **Modern Performance**: Ensure smooth transitions and fast rendering even with hundreds of nodes.
- **Cross-Browser Compatibility**: Work reliably across Chrome, Firefox, Safari, and Edge.

## 3. Core Features
### 3.1. Hierarchical Visualization
- **D3.js Tree Layout**: A horizontal tree structure representing the distribution families.
- **Collapsible Nodes**: Nodes can be clicked to expand or collapse their children, managing visual complexity.
- **Sorted Roots**: The root distributions are sorted chronologically (oldest first) to provide a logical starting point.

### 3.2. Visualization Modes
The application provides **4 distinct visualization modes**, each optimized for different exploration patterns:

1. **Timeline View**: Horizontal tree layout with vertical year gridlines from 1991 to present. Distributions are positioned by release date (X-axis) and family depth (Y-axis).
2. **Radial View**: Concentric circles representing years, with an interactive timeline scrubber for historical exploration.
3. **Sunburst View**: Hierarchical partition where inner rings = earlier generations, arc size = descendant count. Click to focus on families.
4. **List View**: Traditional collapsible tree with inline metadata (year, status, child count) and sortable columns.

All modes share unified search, filtering, and detail panel functionality.

### 3.3. User Interaction
- **Zoom & Pan**: Full support for mouse wheel zooming and click-and-drag panning.
- **Search System & Path Highlighting**: A persistent search bar that highlights matching nodes. When a node is searched or selected, the entire lineage path (from root to node) is highlighted in bright cyan while other branches are dimmed.
- **Status Filtering**: A toggle to switch between "Active Only" (default) and "Showing All" distributions.
- **Information Panel**: A detailed glassmorphism-styled sidebar that displays selected distribution metadata (Name, Parent, Dates, Icon, URL) and direct links to official websites and DistroWatch profiles.

### 3.4. Visual Design
- **Lineage Focus**: Dynamic opacity and stroke-width adjustments to emphasize selected family trees.
- **Dark Theme Palette**: Deep slate backgrounds (`#0f172a`) with cyan accents (`#06b6d4`) for hierarchy and yellow (`#facc15`) for search matches.
- **Ecosystem Timeline**: A high-performance radial scrubber allowing users to visualize the state of the Linux world at any year from 1991 to present.
- **Status Filtering**: Instant toggle between "Active Only" and "Show All" distributions, handling over 1,100 nodes.
- **Information Panel**: Premium glassmorphism UI displaying scraped logos, popularity ranking (#), and historical descriptions.

## 4. Technical Decisions
- **D3.js Tree with Stratification**: Uses `d3.stratify` to handle flat JSON data flexibly.
- **Strict Isolation Logic**: Search and selection re-stratify the tree to show ONLY the relevant lineage sub-tree, eliminating visual clutter.
- **Interactive Timeline**: Real-time D3 re-rendering optimized for temporal scrubbing.
- **Framer Motion**: Smooth UI transitions for panels and overlays.
- **Path Traversal Logic**: Uses a React `useMemo` hook to calculate ancestor paths on-the-fly when the selection or search term changes.

## 5. Constraint & Compatibility
- **Browser Support**: Optimized for modern engines. Fixed specific Firefox rendering issues by avoiding absolute `viewBox` calculations during layout shifts and using explicit width/height on the SVG container.
- **Responsive Design**: The app fills the entire viewport, with UI overlays adapting to screen size.

- **Automated Data Pipeline**: A robust Python-based scraper that handles DistroWatch anti-bot measures, connection retries, and data repair.
- **Radial vs Tree Toggle**: Support for both traditional horizontal tree layouts and modern concentric radial visualizations.
- **Family Distribution**: Intelligent family coloring based on upstream parents (Debian, Red Hat, Arch, etc.).

## 6. Future Roadmap
- **Manual Relationship Overrides**: A configuration layer to manually correct family ties where DistroWatch metadata is ambiguous.
- **Logo Asset Local Storage**: Automatically download and serve logo assets locally to avoid DistroWatch hotlinking limitations.
- **SVG Export**: High-resolution export for community sharing.

---
*This document is maintained as a living record of the project requirements and evolution.*
