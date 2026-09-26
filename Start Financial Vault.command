#!/bin/bash
# Double-click this file to start Financial Vault. The first time, it
# installs what it needs (a few minutes) and puts a Financial Vault icon on
# the desktop — use that icon from then on. It opens in its own window;
# closing that window stops Financial Vault.

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js isn't installed yet."
  echo "1. Go to https://nodejs.org"
  echo "2. Download and install the LTS version"
  echo "3. Double-click this file again"
  read -r -p "Press Enter to close this window..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "First run — installing everything (this can take a few minutes)..."
  npm install --no-audit --no-fund || { read -r -p "Installing failed — see above. Press Enter to close..."; exit 1; }
fi

# "exec" so an update can safely replace this file while Financial Vault runs.
exec node launcher/launch.mjs
