#!/bin/bash
# Double-click this file to start Financial Vault.
# The first run installs everything and can take a few minutes; after that
# it starts in a few seconds. Close this window (or press Ctrl+C) to stop
# the app — nothing keeps running in the background once it's closed.

set -e
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
  npm install
fi

if [ ! -f "server/.env" ]; then
  cp server/.env.example server/.env
fi

echo "Setting up the database..."
(cd server && npx prisma generate && npx prisma migrate deploy && npm run prisma:seed)

echo "Building the app..."
npm run build

echo "Starting Financial Vault — opening it in your browser..."
(sleep 2 && open "http://localhost:4000") &
node server/dist/index.js
