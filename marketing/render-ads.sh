#!/usr/bin/env bash
# Re-render the ad creatives from their HTML sources.
#
# Each HTML file is fully self-contained (fonts embedded as base64 woff2, all art
# is inline SVG/CSS), so it renders identically with no network. Edit the HTML,
# run this, commit both files.
#
# Outputs are 2x the CSS size — downscale as needed per network.
#   ad-square-1x1  1080x1080 css -> 2160x2160 png   (feed / square placements)
#   ad-4x3-thumb   1200x900  css -> 2400x1800 png   (thumbnail / 4:3 placements)
set -euo pipefail
cd "$(dirname "$0")"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

render() { # name width height
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=2 --window-size="$2,$3" \
    --virtual-time-budget=4000 \
    --screenshot="$PWD/$1.png" "file://$PWD/$1.html" 2>/dev/null
  echo "wrote $PWD/$1.png"
}

render ad-square-1x1 1080 1080
render ad-4x3-thumb  1200 900
