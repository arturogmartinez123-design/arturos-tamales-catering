#!/bin/sh
set -e
rm -rf dist
mkdir -p dist/assets
cp index.html styles.css config.js app.js dist/
cp assets/* dist/assets/
echo "Built static site in dist/"
