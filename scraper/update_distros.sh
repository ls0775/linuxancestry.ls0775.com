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
echo "This may take 10-30 minutes. Please be patient."
echo ""

DELAY=2.0
REPAIR=""
if [[ "$*" == *"--delay"* ]]; then
    # Extract delay value if provided: --delay 5.0
    DELAY=$(echo "$*" | grep -oP '(?<=--delay )\d+(\.\d+)?' || echo "2.0")
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
    echo "Using a delay of ${DELAY}s between requests to avoid DistroWatch throttling."
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
    --output ../src/data/distros.json \
    --merge

# Verify output
if [ -f "../src/data/distros.json" ]; then
    DISTRO_COUNT=$(python3 -c "import json; data = json.load(open('../src/data/distros.json')); print(len(data))")
    echo ""
    echo "======================================"
    echo "✓ Success!"
    echo "======================================"
    echo "Updated distros.json with $DISTRO_COUNT distributions"
    echo ""
    echo 'Next steps:'
    echo '  1. Review the changes: git diff ../src/data/distros.json'
    echo '  2. Test the app: cd .. && npm run dev'
    echo "  3. Commit if satisfied: git add ../src/data/distros.json && git commit -m 'Update distros data'"
else
    echo "Error: Failed to generate distros.json"
    exit 1
fi
