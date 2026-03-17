#!/usr/bin/env bash
set -e
if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi
echo "Starting server on http://localhost:3080"
node server.js
