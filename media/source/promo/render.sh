#!/bin/sh
# Render every promo scene to PNG at its exact size. Needs the site served on :5179 and Chrome.
CHROME=${CHROME:-"/c/Program Files/Google/Chrome/Application/chrome.exe"}
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
OUT="$ROOT/media/promo"; mkdir -p "$OUT"
shot() { "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --virtual-time-budget=6000 --window-size="$2" --screenshot="$3" "http://localhost:5179/media/source/promo/promo.html?s=$1" >/dev/null 2>&1; }
shot pfp 1000,1000 "$OUT/lacuna-pfp-1000.png"
shot banner 1500,500 "$OUT/lacuna-banner-1500x500.png"
for s in hero private audit near; do shot $s 1600,900 "$OUT/lacuna-promo-$s.png"; done
ls -la "$OUT"
