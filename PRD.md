# Product Requirement Document (PRD): Interactive Linux Distro Map

## 1. Project Overview
The **Interactive Linux Distro Map** is a high-performance, web-based visualization tool that traces the evolution of the Linux ecosystem from 1991 to the present. It replaces legacy static generation systems with a dynamic, interactive experience that allows users to explore over 1,100 distributions through various hierarchical and temporal lenses.

## 2. User Objectives
- **Explore Lineage**: Visualize the "DNA" of Linux (e.g., Debian -> Ubuntu -> Mint) with high technical accuracy.
- **Interactive Navigation**: Seamlessly zoom, pan, and focus on specific families without losing historical context.
- **Temporal Research**: Scrub through time to see the state of the ecosystem in any given year.
- **Modern Performance**: Instant load times and smooth 60fps interactions, even with a massive 1,100+ node dataset.
- **Cross-Platform Accessibility**: Fully responsive and optimized for all modern browsers.

## 3. Core Features
### 3.1. Hierarchical Visualization
- **Orthogonal Tidy Tree**: A clean, "bracket-style" horizontal tree that ensures clear path tracing by avoiding diagonal line crossings.
- **Automatic Virtual Rooting**: A robust stratification engine that anchors "Independent" distributions to a single virtual project root, preventing rendering failures on filtered data.
- **Cycle-Resilient Architecture**: Pre-processed data pipeline that detects and breaks circular references (e.g., projects that point back to themselves).

### 3.2. Visualization Modes
The application provides **2 distinct high-performance visualization modes**:

1. **Timeline View (Tidy Tree)**: Horizontal tree layout with smart-scaling year gridlines. Uses orthogonal links for a professional, technical aesthetic. Optimized for tracing lineage over 30 years.
2. **Radial View (DNA Map)**: Concentric circles representing years (1991 outwards), featuring a temporal scrubber to "playback" Linux history in a compact, DNA-like spiral.

### 3.3. User Interaction
- **Global Reset System**: Dedicated "RESET" functionality in every view to instantly clear all filters, search terms, and zoom states.
- **Smart Timeline Scaling**: Year labels that dynamically adjust their font size and visibility based on the user's zoom level, ensuring "sticky" context.
- **Deep Search & Path Highlighting**: Real-time search that highlights matching nodes and their entire ancestry chain while dimming unrelated projects.
- **Premium Info Panel**: Glassmorphism-styled panel featuring scraped logos, DistroWatch popularity rankings, born/retired dates, and historical descriptions.

### 3.4. Technical Architecture
- **Centralized Data Pipeline**: A Python-based ETL process (`transform_data.py`) that handles all sanitization, cycle-breaking, and relationship normalization before the data reaches the browser.
- **Custom `useDistroData` Hook**: A unified React hook for data fetching and loading states, ensuring strict adherence to React Hook rules and consistent data across all views.
- **Performance Optimizations**: 
    - **Code Splitting**: Views are lazy-loaded via `React.lazy` and `Suspense`.
    - **Manual Chunking**: Heavy libraries (D3, Framer Motion) are split into cached vendor bundles.
    - **MIME-Safe Hosting**: Explicit absolute path routing and Azure-optimized navigation fallback rules.

## 4. Deployment & DevOps
- **Azure Static Web Apps**: Fully automated CI/CD pipeline via GitHub Actions.
- **Static Asset Strategy**: Data is served from the `public/` directory to enable independent browser caching and reduced initial bundle size.

## 5. Visual Design
- **Theme**: Follows [DESIGN.md](./DESIGN.md) — warm off-white background, dark grey text, low-chroma family colours; the selected lineage is drawn in the text colour and everything else recedes.
- **Consistency**: Flat, hairline-separated panels and plain text controls across all visualization modes. Nothing animates unless the user moves it.

## 6. Future Roadmap
- **Community Contributions**: Interface for users to submit relationship corrections.
- **Logo Localization**: Automated local asset mirroring to prevent DistroWatch hotlinking issues.
- **Mobile Touch Optimization**: Enhanced gesture support for pinching and swiping on the tree views.

---
*This document is maintained as a living record of the project requirements and evolution.*
