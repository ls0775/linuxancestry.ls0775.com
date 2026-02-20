# Copilot Instructions

## Commands

```bash
npm run dev          # Start Vite dev server
npm run build        # Production build → dist/
npm run lint         # TypeScript check + ESLint (tsc -b && eslint .)
npm run preview      # Preview production build locally
```

No test suite exists for the frontend.

### Data Pipeline (Python)

```bash
cd scraper
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Regenerate public/distros.json from raw scrape data
python3 transform_data.py --input distros_raw.json --output ../public/distros.json

# Merge with existing, preserving manual edits
python3 transform_data.py --input distros_raw.json --output ../public/distros.json --merge
```

## Architecture

The app is a single-page React 19 + Vite + TypeScript app that visualizes ~1,100 Linux distributions as a family tree.

**Data flow:**
1. `scraper/fetch_distros_modern.py` scrapes DistroWatch → `scraper/distros_raw.json`
2. `scraper/transform_data.py` transforms and sanitizes it → `public/distros.json`
3. The `useDistroData` hook (`src/hooks/useDistroData.ts`) fetches `/distros.json` at runtime and exposes `{ data, isLoading, error }`
4. `App.tsx` lazy-loads either `FamilyTree` (Timeline view) or `RadialTree` (Radial view) based on `viewMode` state

**Two visualization components**, both following the same internal pattern:
- `FamilyTree.tsx` — horizontal tidy tree with an x-axis mapped to years (1991–present); canvas size is 32,000×40,000px, navigated via D3 zoom
- `RadialTree.tsx` — concentric radial layout where radius encodes the year of a distro's birth

**Shared D3 "persistence" pattern** (critical to understand):  
Both components initialize SVG groups once into a `groupsRef` (on the first render with data). Subsequent state changes re-run the update `useEffect` which performs D3 enter/update/exit transitions on the *existing* groups — they never tear down and rebuild the SVG. Breaking this pattern (e.g., clearing `groupsRef.current` on re-render) causes the entire visualization to reset.

**Virtual root node:**  
Both components inject a synthetic `{ id: "Linux_Original", name: "Linux" }` node as the stratify root at render time. Orphaned distributions (whose declared parent isn't in the current filtered set) are re-parented to `Linux_Original` automatically.

**Deployment:** Push to `master` → GitHub Actions → Azure Static Web Apps (see `.github/workflows/`).

## Key Conventions

**Date format:** Dates in `distros.json` are `YYYY.MM.DD` (dots). `parseDate()` in both visualization components splits on `/[.-]/` so it handles both dots and dashes. Sentinel value `9999` means "no date / still active".

**`DistroNode` schema** (defined in `src/hooks/useDistroData.ts`):  
`id`, `name`, `parent` (nullable string referencing another `id`), `start` / `stop` (dot-separated date strings), `color`, `icon`/`logo` (URL), `popularity`, `description`, `based_on`, `architecture`, `desktop`, `category`, `origin`, `status`.

**Lineage highlighting:**  
`activeHighlightNode` is computed from whichever is set first: `selectedNode` (click) or an exact-match search. Highlighted nodes/links render in yellow (`#facc15`); non-related nodes drop to `opacity: 0.1`.

**Node coloring logic (both views):**
- Highlighted (in lineage): `#facc15` (yellow)
- Discontinued (`d.stop` is set): `#ef4444` (red)
- Active: color of the top-level family ancestor via `d3.scaleOrdinal(d3.schemeCategory10)`
- `Linux_Original` root: `#64748b` (slate)

**Logo fallback:** `getLogoUrl()` tries `node.logo`, then `node.icon`, then constructs `https://distrowatch.com/images/y9go/{slug}.png`. Image `onError` falls back to `linux.png`.

**Tailwind CSS v4** is used via the `@tailwindcss/postcss` plugin — configuration is in `tailwind.config.js` and `postcss.config.js`. This is different from the v3 `@apply`-based approach; utility classes are used directly in JSX.

**Vendor chunking:** `vite.config.ts` splits `d3` into `d3-vendor` and `framer-motion` into `animation-vendor` to keep the initial bundle small.
