#!/bin/sh
# Re-render the PNG brand files from their HTML sources. Needs the site served on :5179 and Chrome.
CHROME=${CHROME:-"/c/Program Files/Google/Chrome/Application/chrome.exe"}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
shot() { "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --default-background-color=00000000 --virtual-time-budget=5000 --window-size="$2" --screenshot="$3" "$1" >/dev/null 2>&1; }
shot "http://localhost:5179/media/source/banner.html" 1200,630 "$ROOT/media/banner.png"
shot "http://localhost:5179/media/source/icon.html?s=180" 180,180 "$ROOT/apple-touch-icon.png"
for s in 16 32 48; do shot "http://localhost:5179/media/source/icon.html?s=$s" $s,$s "$ROOT/media/source/icon-$s.png"; done
python -I "$ROOT/media/source/ico.py" "$ROOT/favicon.ico" "$ROOT"/media/source/icon-16.png "$ROOT"/media/source/icon-32.png "$ROOT"/media/source/icon-48.png
rm -f "$ROOT"/media/source/icon-*.png
