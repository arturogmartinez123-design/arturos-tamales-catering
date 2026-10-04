#!/bin/sh
# Copy the site into dist/. Unused source photos are not shipped.
set -e
cd "$(dirname "$0")"
rm -rf dist
mkdir -p dist/assets
cp index.html styles.css config.js app.js 404.html robots.txt sitemap.xml favicon.ico apple-touch-icon.png dist/
cp assets/brand-mark.svg \
  assets/tamale-flavors.webp \
  assets/catering-tamale-tray.jpg \
  assets/catering-buffet-setup.jpg \
  assets/catering-serving-tamales.jpg \
  assets/og-image.jpg \
  dist/assets/
echo "Built static site in dist/"
