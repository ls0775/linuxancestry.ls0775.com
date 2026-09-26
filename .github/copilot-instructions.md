# Copilot Instructions

## Commands

```bash
npm run dev          # Start Vite dev server
npm run build        # Production build → dist/
npm run lint         # TypeScript check + ESLint (tsc -b && eslint .)
npm test             # Vitest unit tests (src/utils/__tests__)
npm run preview      # Preview production build locally
```

Tests cover the pure helpers (`distroUtils.ts`, `lineage.ts`). The visual components have no automated tests; verify them in a browser.

### Data Pipeline (Python)

```bash
cd scraper
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Regenerate public/distros.json from raw scrape data
python3 transform_data.py --input distros_raw.json --output ../public/distros.json

# Merge with existing. Curated fields (description, parent, start, name, icon, color)
# keep their existing value; volatile fields (status, stop, popularity, ...) are refreshed.
# DistroWatch robots.txt Crawl-Delay is 15s; the fetcher enforces it (full run ~5h).
python3 transform_data.py --input distros_raw.json --output ../public/distros.json --merge

# Scraper unit tests
python3 -m pytest tests
```

## Architecture

The app is a single-page React 19 + Vite + TypeScript app that visualizes ~1,100 Linux distributions as a family tree.

**Data flow:**
1. `scraper/fetch_distros_modern.py` scrapes DistroWatch → `scraper/distros_raw.json`
2. `scraper/transform_data.py` transforms and sanitizes it → `public/distros.json`
3. `App.tsx` calls `useDistroData()` (`src/hooks/useDistroData.ts`) once; it fetches `/distros.json` and exposes `{ data, isLoading, error, reload }`. App renders the loading/error notice and passes `data` down as a prop.
4. `App.tsx` lazy-loads either `FamilyTree` (Timeline view) or `RadialTree` (Radial view) based on `viewMode` state

**Shared state and helpers (use these, do not re-implement in a view):**
- `src/hooks/useTreeState.ts` — search term, selection, Active/All, timeline year, hover; derives `suggestions`, `activeHighlightNode`, `relatedIds`, `ancestryPath`, `visibleNodes`, `stats`, `reset`. Also owns the Escape handler (ignored while focus is in a form control).
- `src/utils/lineage.ts` — pure functions: `buildIndex`, `filterByTimeline` (the single definition of "existed in year Y"), `getAncestryPath`, `getRelatedIds`, `computeStats`, `buildHierarchy` (stratify under the virtual root), `getFamilyId`, plus `MIN_YEAR` and `ROOT_ID`.
- `src/components/TreeToolbar.tsx` — the search/filter panel and Fit / Export SVG buttons; `SearchBox.tsx` — ARIA combobox.
- `src/utils/svgExport.ts` — `exportViewport` (what-you-see export: keeps the live zoom transform, label culling and highlight state, crops the area under an open detail panel, adds a footer with title/subtitle/credit), `downloadSvg`, `slugify`, `dateStamp`.
- `src/hooks/useSvgSize.ts` — keeps the SVG width/height in sync with its container (ResizeObserver).

**Two visualization components**, both following the same internal pattern:
- `FamilyTree.tsx` — horizontal tidy tree with an x-axis mapped to years (1991–present); canvas size is 48,000×30,000px (≈16:10 so fit-all fills a landscape viewport), navigated via D3 zoom
- `RadialTree.tsx` — concentric radial layout where radius encodes the year of a distro's birth

**Shared D3 "persistence" pattern** (critical to understand):  
Both components initialize SVG groups once into a `groupsRef` (on the first render with data). Subsequent state changes re-run the update `useEffect` which performs D3 enter/update/exit transitions on the *existing* groups — they never tear down and rebuild the SVG. Breaking this pattern (e.g., clearing `groupsRef.current` on re-render) causes the entire visualization to reset.

**Virtual root node:**  
`buildHierarchy()` injects `LINUX_ROOT` (`{ id: "Linux_Original", name: "Linux" }`) as the stratify root. Orphaned distributions (whose declared parent isn't in the current filtered set) are re-parented to the root automatically.

**Years:** never hardcode the current year. Views use `MIN_YEAR` (1991) and `currentYear + 1` from `useTreeState` for scale domains and axes.

**Typing:** D3 hierarchy nodes are `d3.HierarchyPointNode<DistroNode>`; selections are typed. Do not reintroduce `any` or `eslint-disable` for it.

**Deployment:** Push to `master` → GitHub Actions → Azure Static Web Apps (see `.github/workflows/`).

## Key Conventions

**Date format:** Dates in `distros.json` are `YYYY.MM.DD` (dots). `parseDate()` (`src/utils/distroUtils.ts`) splits on `/[.-]/` so it handles both dots and dashes. `getYear()` returns `9999` for "no date / still active".

**`DistroNode` schema** (defined in `src/hooks/useDistroData.ts`):  
`id`, `name`, `parent` (nullable string referencing another `id`), `start` / `stop` (dot-separated date strings), `color`, `icon`/`logo` (URL), `url` (DistroWatch page), `popularity`, `description`, `based_on`, `architecture`, `desktop`, `category`, `origin`, `status`.

**Design system:** follow [`DESIGN.md`](../DESIGN.md) ("calm, light"). All colours are CSS tokens in `:root` (`src/index.css`); never hardcode a colour in a component. D3 code reads tokens at runtime via `getVizTheme()` (`src/utils/theme.ts`) so the SVG export stays self-contained. No framer-motion, no entrance animations, no shadows/gradients/blur; buttons are plain text (`.textbtn`), inputs are underlined (`.field`), floating surfaces use `.panel` (bg + hairline).

**Lineage highlighting:**  
`activeHighlightNode` is computed from whichever is set first: `selectedNode` (click) or an exact-match search. Highlighted nodes/links render in `--viz-link-highlight` (= `--text`); non-related nodes drop to `opacity: 0.1`.

**Node coloring logic (both views):**
- Highlighted (in lineage): `--viz-link-highlight`
- Discontinued (`d.stop` is set): hollow ring — fill `--viz-bg`, stroke `--viz-node-discontinued` (constant ~1.25 px on screen via `RING_PX / k`), label `--viz-label-muted`
- Active: colour of the top-level family ancestor via `d3.scaleOrdinal(theme.families)` (`--viz-family-0..9`, low-chroma)
- `Linux_Original` root: `--viz-node-root`

**Logos:** `getLogoUrl()` returns the local `/logos/{id}.png`; `getFallbackLogoUrl()` (used on `onError`) returns `node.icon` or a constructed DistroWatch URL. The CSP `img-src` allows `distrowatch.com` for that fallback only. In both tree views a round `circle.node-logo-bg` + `image.node-logo` (clipped to a circle via a shared `<clipPath>` in `<defs>`) per node are toggled in `applyZoomLevel` once `k / fitScale >= LOGO_ZOOM_FACTOR` (16, `labelCulling.ts`), so logos appear at the same relative zoom in Timeline and Radial. In the radial view they sit in `g.node-logo-wrap`, counter-rotated so logos stay upright.

**Labels (both views):** `applyZoomLevel` (stored on `groupsRef`, run on zoom and after each data update) sizes dots/hit targets and culls labels via `src/utils/labelCulling.ts`. At fit-all scale only the top-50 (`PRIMARY_RANK`) names are eligible; `rankLimitForZoom` widens that quadratically with zoom so all names are eligible after ~5×. Eligible labels are then greedily placed (highlighted > primary > secondary) and any that would overlap are hidden. Transparent `circle.node-hit` and `path.link-hit` shapes provide the click targets; export strips them.

**Selection in the timeline:** when a lineage is highlighted (click or exact search match) `FamilyTree` re-lays out just the lineage nodes over the full canvas height (`d3.tree` on a filtered sub-hierarchy) and calls `fitToBox` so the family fills the viewport left of the detail panel; other nodes stay in place at 0.1 opacity. Clearing the selection (Escape, Reset, panel close) calls `fitAll`.

**Accessibility:** node groups carry `role="button"`, `aria-label` and `tabindex` (0 for top-50 by popularity, -1 otherwise); Enter/Space selects. Keep the search combobox ARIA intact.

**Hosting config:** `public/staticwebapp.config.json` (copied into `dist/`) holds the SPA fallback, cache headers and CSP. Production needs no `unsafe-eval`/inline scripts — do not loosen the policy.

**Tailwind CSS v4** is used via the `@tailwindcss/postcss` plugin — configuration is in `tailwind.config.js` and `postcss.config.js`. This is different from the v3 `@apply`-based approach; utility classes are used directly in JSX.

**Vendor chunking:** `vite.config.ts` splits `d3` into `d3-vendor` to keep the initial bundle small.
