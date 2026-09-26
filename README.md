# Linux Ancestry

A family tree of Linux distributions, 1991 to today. About 1,100 distributions from DistroWatch, drawn as a timeline tree and as a radial map.

Live: https://linuxancestry.ls0775.com

## Documentation

- [Design system](./DESIGN.md) — calm, light, flat. Tokens and rules for all UI.
- [Product requirements](./PRD.md) — architecture and feature specification.
- [Data pipeline](./scraper/README.md) — the DistroWatch scraper and transform.

## Credits

- [jappeace/distrowatch1graph1svg](https://github.com/jappeace/distrowatch1graph1svg) — the original SVG family tree generated from DistroWatch data.
- [ls0775/LinuxTimeline](https://github.com/ls0775/LinuxTimeline) — the earlier chronological tracker this project grew from.
- [DistroWatch family tree](https://distrowatch.com/dwres.php?resource=family-tree) — the source of distribution metadata and relationships.

## Stack

React 19, Vite, TypeScript, D3, Tailwind CSS 4. Hosted on Azure Static Web Apps; deployed from GitHub Actions on push to `master`.

## Development

### Dev container (recommended)

The repo ships a [Dev Container](https://containers.dev/) (`.devcontainer/`) with Node 24, Python 3.12 and the GitHub CLI.

- **VS Code**: install the *Dev Containers* extension, open the folder, choose **Reopen in Container**.
- **GitHub Codespaces**: *Code → Create codespace on master*.
- **CLI**: `npm i -g @devcontainers/cli && devcontainer up --workspace-folder . && devcontainer exec --workspace-folder . npm run dev`

`postCreateCommand` runs `npm ci` and creates `scraper/.venv` with the scraper requirements. Port 5173 is forwarded.

### Manual setup

Requires Node ≥ 20.19 (see `.nvmrc`) and Python 3.

```bash
npm install
npm run dev        # Vite dev server
npm run lint       # tsc + eslint
npm test           # vitest
npm run build      # production build → dist/
```

Regenerating the data (optional):

```bash
cd scraper
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 transform_data.py --input distros_raw.json --output ../public/distros.json
```

## Licence

Maintained for historical and educational purposes, following the data attribution guidelines of DistroWatch.com.
