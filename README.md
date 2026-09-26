# Interactive Linux Distro Map

A high-performance, modern visualization of the Linux distribution family tree, tracing the lineage of over 1,100 distributions from 1991 to the present.

## 🌟 Inspiration & Credits
This project is a modern reimagining of the classic Linux lineage visualizations. We owe our inspiration and data structure patterns to these incredible community resources:
- **[jappeace/distrowatch1graph1svg](https://github.com/jappeace/distrowatch1graph1svg)**: The original project that pioneered SVG-based Linux family tree generation from DistroWatch data.
- **[LinuxTimeline (GitHub)](https://github.com/ls0775/LinuxTimeline)**: The foundation for chronological distribution tracking.
- **[DistroWatch Family Tree](https://distrowatch.com/dwres.php?resource=family-tree)**: The gold standard for Linux distribution metadata and relationship mapping.
- **[Wikipedia: Linux Distribution](https://en.wikipedia.org/wiki/Linux_distribution)**: For the historical context of the ecosystem's "Big Bang" moments.

## 🚀 Features
- **Interactive Visualization Modes**: 
  - **Timeline View** - Technical Tidy Tree with orthogonal links and smart-scaling years.
  - **Radial View** - Concentric "DNA" map with an interactive temporal scrubber.
- **Automated ETL Pipeline**: Robust Python engine that scrapes, repairs, and sanitizes 1,100+ records from DistroWatch.
- **Global Reset**: Unified state management to instantly clear complex filters and zoom states.
- **Performance Optimized**: Code-splitting, vendor chunking, and lazy loading for a sub-second initial interactive state.

## 📄 Documentation
- **[Design system](./DESIGN.md)**: Calm, light, flat. Tokens and rules for all UI.
- **[Product Requirement Document (PRD)](./PRD.md)**: Detailed technical architecture and feature specifications.
- **[Data Pipeline (Scraper)](./scraper/README.md)**: Deep dive into the DistroWatch scraping engine.

## 🛠️ Tech Stack
- **React 19** + **Vite** + **TypeScript**
- **D3.js** (Professional Data Visualization)
- **Tailwind CSS 4** with a token-based design system — see [DESIGN.md](./DESIGN.md)
- **Azure Static Web Apps** (Cloud Hosting & CI/CD)

## 🏗️ Development Setup

### Dev container (recommended)
The repo ships a [Dev Container](https://containers.dev/) (`.devcontainer/`) with Node 24, Python 3.12, and the GitHub CLI. Opening it installs everything for you:

- **VS Code**: install the *Dev Containers* extension, open the folder, and choose **Reopen in Container**.
- **GitHub Codespaces**: *Code → Create codespace on master*.
- **CLI**: `npm i -g @devcontainers/cli && devcontainer up --workspace-folder . && devcontainer exec --workspace-folder . npm run dev`

`postCreateCommand` runs `npm ci` and creates `scraper/.venv` with the scraper requirements. Port 5173 is forwarded automatically.

### Manual setup
Requires Node ≥ 20.19 (see `.nvmrc`) and Python 3.

#### 1. Data Pipeline (Optional)
```bash
cd scraper
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Regenerate sanitized distros.json
python3 transform_data.py --input distros_raw.json --output ../public/distros.json
```

#### 2. Frontend
```bash
npm install
npm run dev
```

## 📜 License
This project is maintained for historical and educational purposes, following the data attribution guidelines of DistroWatch.com.
