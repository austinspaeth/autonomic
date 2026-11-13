#!/bin/bash
# Capture one marketing shot from the dedicated "Autonomic Shots" simulator.
#
#   ./capture.sh <shot-id> [settle-ms]
#
# The status bar is overridden to full signal, full battery and THE REAL LOCAL
# TIME. Not 9:41: the app's own copy names the hour ("Pacing well for 7:59pm",
# "this morning"), so a cosmetic clock would contradict the screen it sits above
# — and a screenshot that contradicts itself is the one thing a viewer notices.
#
# The app must already be installed on that simulator and able to reach Metro,
# running a build that carries the dev-only shot registry. That harness is NOT
# committed (it needs changes under `mobile/`, and a push to `main` touching
# `mobile/**` publishes a production OTA), so this script does nothing on its
# own against a stock build.
set -e
SIM="${SHOT_SIM:-$(xcrun simctl list devices | grep "Autonomic Shots" | grep -o '[0-9A-F-]\{36\}' | head -1)}"
ID="$1"; SETTLE="${2:-8000}"
DIR="$(cd "$(dirname "$0")" && pwd)"
[ -n "$ID" ] || { echo "usage: capture.sh <shot-id> [settle-ms]" >&2; exit 1; }

xcrun simctl status_bar "$SIM" override \
  --time "$(date +'%-l:%M')" \
  --batteryState charged --batteryLevel 100 \
  --cellularMode active --cellularBars 4 \
  --wifiMode active --wifiBars 3 --dataNetwork wifi >/dev/null

xcrun simctl openurl "$SIM" "autonomic://?shot=$ID" >/dev/null
python3 -c "import time;time.sleep($SETTLE/1000)"
xcrun simctl io "$SIM" screenshot --type=png "$DIR/$ID.png" >/dev/null 2>&1
echo "$DIR/$ID.png"
