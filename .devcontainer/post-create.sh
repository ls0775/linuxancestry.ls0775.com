#!/usr/bin/env bash
# Runs once after the container is created. Installs frontend and scraper dependencies.
set -euo pipefail

npm ci

python3 -m venv scraper/.venv
scraper/.venv/bin/pip install --quiet --upgrade pip
scraper/.venv/bin/pip install --quiet -r scraper/requirements.txt
