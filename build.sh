#!/bin/sh
# Copy the site into dist/. Unused source photos are not shipped.
set -e
cd "$(dirname "$0")"
rm -rf dist
mkdir -p dist/assets
cp index.html styles.css config.js app.js 404.html robots.txt sitemap.xml favicon.ico apple-touch-icon.png dist/
cp assets/logo-badge.svg \
  assets/logo-icon.svg \
  assets/hero-tamales.webp \
  assets/hero-tamales-640.webp \
  assets/green-chicken.webp \
  assets/red-pork.webp \
  assets/catering-festive.webp \
  assets/catering-festive-720.webp \
  assets/steaming-pot.webp \
  assets/tamale-flavors.webp \
  assets/catering-buffet-setup.jpg \
  assets/og-image.jpg \
  dist/assets/
echo "Built static site in dist/"
