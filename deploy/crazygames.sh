#!/usr/bin/env bash
# Builds the game as CrazyGames wants it in build/crazygames: their SDK, their adverts, no AdSense.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/build/crazygames"

rm -rf "$out"
mkdir -p "$out"
cp -r "$root/web/." "$out/"
rm -f "$out/ads.txt"
cp "$root/deploy/crazygames.config.js" "$out/js/config.js"

# the SDK goes in front of the config, so it is there when the game starts
sdk='  <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>'
awk -v sdk="$sdk" '/<script src="js\/config.js"><\/script>/ { print sdk } { print }' "$root/web/index.html" > "$out/index.html"

grep -q 'crazygames-sdk-v3.js' "$out/index.html" || { echo "Could not add the CrazyGames SDK to index.html" >&2; exit 1; }
if grep -q 'googlesyndication' "$out/index.html" "$out/js/config.js"; then echo "AdSense must not be in the CrazyGames package" >&2; exit 1; fi

echo "Built $out"
