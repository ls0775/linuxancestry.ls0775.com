# Interactive Linux Distro Map

A modern, interactive visualization of the Linux distribution family tree.

![Project Preview](https://via.placeholder.com/800x400.png?text=Interactive+Linux+Distro+Map+Preview)

## 🚀 Features
- **4 Visualization Modes**: 
  - **Timeline View** - Horizontal tree with year gridlines (1991-present)
  - **Radial View** - Concentric circles with interactive timeline scrubber
  - **Sunburst View** - Hierarchical rings showing family proportions
  - **List View** - Collapsible tree with metadata columns
- **Modern Scraper**: Custom Python engine fetching 1,100+ distros with logic for repairing missing data.
- **Rich Data**: Scrapes descriptions, logos, popularity rankings, and deep lineage from DistroWatch.
- **Smart Filtering**: Active/Discontinued toggle, search, and path highlighting.

## 📄 Documentation
- **[Product Requirement Document (PRD)](./PRD.md)**: Core features and technical decisions.
- **[Data Pipeline (Scraper)](./scraper/README.md)**: Details on the DistroWatch scraping engine.

## 🛠️ Tech Stack
- **React 19** + **Vite**
- **D3.js** (Visualization)
- **Tailwind CSS 4** (Styling)
- **Framer Motion** (Animations)
- **Lucide React** (Icons)

## 🏗️ Development Setup

### 1. Data Pipeline (Optional - Uses Cache)
```bash
cd scraper
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Fetch all 1,100+ distros and transform for React
./update_distros.sh --use-cache --repair
```

### 2. Frontend
```bash
# From root directory
npm install
npm run dev
```

## 📜 License
This project follows the original license of the DistroWatch information graph project.
