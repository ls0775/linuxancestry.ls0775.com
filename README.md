# Interactive Linux Distro Map

A high-performance, modern visualization of the Linux distribution family tree, tracing the lineage of over 1,100 distributions from 1991 to the present.

## 🌟 Inspiration & Credits
This project is a modern reimagining of the classic Linux lineage visualizations. We owe our inspiration and data structure patterns to these incredible community resources:
- **[LinuxTimeline (GitHub)](https://github.com/ls0775/LinuxTimeline)**: The foundation for chronological distribution tracking.
- **[LinuxAncestry (GitHub)](https://github.com/ls0775/linuxancestry.ls0775.com)**: For pioneering the interactive exploration of distro origins.
- **[DistroWatch Family Tree](https://distrowatch.com/dwres.php?resource=family-tree)**: The gold standard for Linux distribution metadata and relationship mapping.
- **[Wikipedia: Linux Distribution](https://en.wikipedia.org/wiki/Linux_distribution)**: For the historical context of the ecosystem's "Big Bang" moments.

## 🚀 Features
- **4 Interactive Visualization Modes**: 
  - **Timeline View** - Technical Tidy Tree with orthogonal links and smart-scaling years.
  - **Radial View** - Concentric "DNA" map with an interactive temporal scrubber.
  - **Sunburst View** - Generational overview showing family proportions.
  - **Density View** - High-density Icicle plot for side-by-side family comparison.
- **Automated ETL Pipeline**: Robust Python engine that scrapes, repairs, and sanitizes 1,100+ records from DistroWatch.
- **Global Reset**: Unified state management to instantly clear complex filters and zoom states.
- **Performance Optimized**: Code-splitting, vendor chunking, and lazy loading for a sub-second initial interactive state.

## 📄 Documentation
- **[Product Requirement Document (PRD)](./PRD.md)**: Detailed technical architecture and feature specifications.
- **[Data Pipeline (Scraper)](./scraper/README.md)**: Deep dive into the DistroWatch scraping engine.

## 🛠️ Tech Stack
- **React 19** + **Vite** + **TypeScript**
- **D3.js** (Professional Data Visualization)
- **Tailwind CSS 4** (Modern Styling)
- **Framer Motion** (Fluid UI Transitions)
- **Azure Static Web Apps** (Cloud Hosting & CI/CD)

## 🏗️ Development Setup

### 1. Data Pipeline (Optional)
```bash
cd scraper
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Regenerate sanitized distros.json
python3 transform_data.py --input distros_raw.json --output ../public/distros.json
```

### 2. Frontend
```bash
npm install
npm run dev
```

## 📜 License
This project is maintained for historical and educational purposes, following the data attribution guidelines of DistroWatch.com.
