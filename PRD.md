# Product requirements: Linux Ancestry

## 1. Overview

Linux Ancestry is a web visualisation of the Linux distribution ecosystem from 1991 to the present. It lets people explore roughly 1,100 distributions by lineage and by time. It replaces an earlier static-image generator with an interactive page.

## 2. User goals

- **Trace lineage** — see how one distribution descends from another (Debian → Ubuntu → Linux Mint) and which distributions share a family.
- **Move through time** — scrub or play through the years to see when families appeared and which distributions were alive at any point.
- **Find a distribution quickly** — search by name and land on it with its ancestry highlighted.
- **Use it anywhere** — keyboard, mouse and touch; desktop and phone; screen readers can reach the main controls.

## 3. Features

### 3.1 Views

Two views share the same data, search, filters and detail panel:

- **Timeline** — a horizontal tidy tree where x is the year of first release. Top-level families are laid out in separate vertical bands so they do not interleave. A sticky year axis stays at the top while panning.
- **Radial** — a concentric layout where radius is the year of first release. Rings mark every five years.

### 3.2 Structure

- Every distribution is attached to a virtual **Linux** root. A distribution whose parent is filtered out or unknown is attached to the root so the tree always renders.
- The data pipeline (`scraper/transform_data.py`) normalises dates, breaks parent cycles and resolves aliases before the JSON reaches the browser.

### 3.3 Interaction

- **Search** — a combobox with keyboard navigation. An exact match narrows the tree to that lineage.
- **Selection** — clicking (or Enter/Space on a focused node) opens the detail panel and highlights the ancestry and descendants; everything else recedes.
- **Timeline scrubber** — year slider with Play, Pause and Rewind; the counts of existing and active distributions update live.
- **Active / All** — hide or show distributions that had already stopped by the selected year.
- **Reset** — clears search, selection, filter and year, and refits the view.
- **Fit / Export SVG** — refit the view, or download a standalone SVG of the whole tree or the selected lineage.
- **Detail panel** — name, popularity rank, ancestry, dates, parent, description and a DistroWatch link.

### 3.4 Architecture

- `useDistroData` loads `/distros.json` once at the app root and surfaces loading and error states.
- `useTreeState` holds the UI state shared by both views and derives visible nodes, highlighted ids, ancestry and statistics from pure helpers in `src/utils/lineage.ts`.
- Each view initialises its SVG groups once and thereafter performs D3 enter/update/exit on the existing groups; they never rebuild the SVG.
- Views are lazy-loaded; D3 is split into its own chunk.
- Unit tests (Vitest) cover the date and lineage helpers.

## 4. Deployment

- GitHub Actions runs lint, tests and the production build on Node from `.nvmrc`, then uploads `dist/` to Azure Static Web Apps.
- `public/staticwebapp.config.json` sets the SPA fallback, long-lived caching for hashed assets, fonts and logos, and a strict content security policy.
- Logos are served locally from `public/logos/`, falling back to DistroWatch only when missing.

## 5. Visual design

Follows [DESIGN.md](./DESIGN.md): warm off-white page, dark grey text, low-chroma family colours. The selected lineage is drawn in the text colour and everything else recedes. Panels are flat with hairline rules; controls are plain text. Nothing animates unless the user moves it.

## 6. Roadmap

- Community corrections to relationships.
- Touch gestures (pinch and swipe) tuned for the tree views.
- Optional split of long descriptions out of the main data file.
