#!/bin/bash
# Update distros.json with latest data from DistroWatch

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "======================================"
echo "DistroWatch Data Update Script"
echo "======================================"
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is required but not installed."
    exit 1
fi

# Check if dependencies are installed
echo "Checking dependencies..."
if ! python3 -c "import bs4, requests" 2>/dev/null; then
    echo "Installing dependencies..."
    pip3 install -r requirements.txt
fi

# Step 1: Fetch data
echo ""
echo "Step 1: Fetching distribution data from DistroWatch..."
echo "DistroWatch asks for a 15s crawl delay, so a full run takes about 5 hours."
echo "Progress is cached in distrowatch_cache.json; re-run with --use-cache to resume."
echo ""

DELAY=15
REPAIR=""
if [[ "$*" == *"--delay"* ]]; then
    # Extract delay value if provided: --delay 5.0
    DELAY=$(echo "$*" | sed -n 's/.*--delay \([0-9.]*\).*/\1/p')
    DELAY=${DELAY:-15}
fi

if [[ "$*" == *"--repair"* ]]; then
    REPAIR="--repair"
    echo "Repair mode enabled: Will re-fetch incomplete records."
fi

if [ "$1" == "--use-cache" ]; then
    echo "Using cached data if available..."
    python3 fetch_distros_modern.py --output distros_raw.json --delay "$DELAY" $REPAIR
else
    echo "Fetching fresh data (ignoring cache)..."
    echo "Using a delay of ${DELAY}s between requests (DistroWatch robots.txt Crawl-Delay)."
    python3 fetch_distros_modern.py --output distros_raw.json --no-cache --delay "$DELAY" $REPAIR
fi

# Check if fetch was successful
if [ ! -f "distros_raw.json" ]; then
    echo "Error: Failed to fetch distribution data"
    exit 1
fi

# Step 2: Transform data
echo ""
echo "Step 2: Transforming data to React app format..."
echo ""

python3 transform_data.py \
    --input distros_raw.json \
    --output ../public/distros.json \
    --merge

# Step 3: Download distro logos
echo ""
echo "Step 3: Downloading distro logos to public/logos/..."
echo ""

python3 download_logos.py

# Step 4: Fetch popularity rankings (Last 3 months from DistroWatch)
echo ""
echo "Step 4: Fetching popularity rankings from DistroWatch..."
echo ""

python3 fetch_popularity.py

# Verify output
if [ -f "../public/distros.json" ]; then
    DISTRO_COUNT=$(python3 -c "import json; data = json.load(open('../public/distros.json')); print(len(data))")
    echo ""
    echo "======================================"
    echo "Success"
    echo "======================================"
    echo "Updated distros.json with $DISTRO_COUNT distributions"
    echo ""
    echo 'Next steps:'
    echo '  1. Review the changes: git diff ../public/distros.json'
    echo '  2. Test the app: cd .. && npm run dev'
    echo "  3. Commit if satisfied: git add ../public/distros.json ../public/logos/ && git commit -m 'Update distros data'"
else
    echo "Error: Failed to generate distros.json"
    exit 1
fi
