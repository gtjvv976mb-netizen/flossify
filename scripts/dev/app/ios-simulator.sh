#!/usr/bin/env bash
# The iPhone app in the iOS simulator, on a Mac with Xcode. It builds the app (no signing), runs it against a website on
# this Mac, and checks what can be checked without a finger:
#   - Flossify's own Swift builds, and its warnings are listed;
#   - the app starts and keeps running on each page;
#   - the page reaches the native side (a debug build logs every bridge call: SplashScreen.hide, FlossifyShell.setChrome);
#   - with the site unreachable, the app's own offline page shows;
#   - each screen is photographed, on an iPhone and an iPad, light and dark.
# GitHub Actions runs it on a Mac (.github/workflows/ios-app.yml); the owner can run it too.
#
#   npm run dev                                   # first, in the repo's root: the website on http://localhost:4321
#   scripts/dev/app/ios-simulator.sh              # then this; screenshots and logs go to ./ios-shots
#   SITE=http://localhost:4321 OUT=/tmp/shots scripts/dev/app/ios-simulator.sh
set -euo pipefail

SITE=${SITE:-http://localhost:4321}
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
OUT=${OUT:-$PWD/ios-shots}
BUNDLE=ph.flossify.app
WAIT=${WAIT:-14}
mkdir -p "$OUT"
no() { echo "ios-simulator.sh: $*" >&2; exit 1; }

case $SITE in http://localhost:*) ;; *) no "SITE must be http://localhost:<port>: the app goes only to its bound domains (Info.plist)" ;; esac
command -v xcodebuild >/dev/null || no "this needs Xcode, on a Mac"
curl -fsS -o /dev/null --max-time 15 "$SITE/healthz" || no "nothing answers at $SITE/healthz: start the website first (npm run dev)"
# A dev server compiles each page on its first request: ask for each once, so the app's first look is not that wait.
for path in /app/ /find/ /auth/login/; do curl -s -o /dev/null --max-time 120 -A "warm FlossifyApp/1" "$SITE$path" || true; done

# --- the app, pointed at this Mac's website, built for the simulator -------------------------------------------------
cd "$ROOT/mobile"
[ -d node_modules ] || npm ci
npx cap sync ios
FLOSSIFY_APP_URL="$SITE/app/" node scripts/use-local.mjs
cd ios/App
echo "== building (log: $OUT/build.log)"
if ! xcodebuild -project App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath "$OUT/derived" CODE_SIGNING_ALLOWED=NO build \
  >"$OUT/build.log" 2>&1; then
  grep -E "error:|\*\* BUILD" "$OUT/build.log" | sort -u | head -60
  no "the build failed (log: $OUT/build.log)"
fi
grep -E "(FlossifyShell|SceneDelegate|AppDelegate)\.swift:[0-9]+:[0-9]+: warning:" "$OUT/build.log" | sort -u >"$OUT/warnings.txt" || true
echo "== built; warnings in Flossify's own Swift: $(wc -l <"$OUT/warnings.txt" | tr -d ' ')"
cat "$OUT/warnings.txt"
APP="$OUT/derived/Build/Products/Debug-iphonesimulator/App.app"
[ -d "$APP" ] || no "no App.app after the build"

# --- the simulators: the newest iPhone Pro and iPad Pro this Xcode has ------------------------------------------------
pick() { # a name pattern -> the udid of the matching device in the newest iOS runtime
  xcrun simctl list devices available -j | node -e '
    const want = new RegExp(process.argv[1]); let best = null;
    const all = JSON.parse(require("fs").readFileSync(0, "utf8")).devices;
    for (const [rt, list] of Object.entries(all)) {
      const m = /iOS-(\d+)-(\d+)/.exec(rt); if (!m) continue;
      const v = Number(m[1]) * 100 + Number(m[2]);
      for (const d of list) if (want.test(d.name) && (!best || v > best.v || (v === best.v && d.name > best.name))) best = { v, udid: d.udid, name: d.name };
    }
    if (best) console.log(best.udid + "\t" + best.name);' "$1"
}

fails=0
note() { echo "   $*"; }
bad() { echo "   FAIL $*"; fails=$((fails + 1)); }

setURL() { # the installed app's own copy of the config: where it opens
  node -e '
    const fs = require("fs"); const [file, url] = process.argv.slice(1);
    const c = JSON.parse(fs.readFileSync(file, "utf8"));
    c.server.url = url;
    fs.writeFileSync(file, JSON.stringify(c, null, "\t"));' "$1" "$2"
}

run_page() { # udid, tag, url, name
  local udid=$1 tag=$2 url=$3 name=$4 log="$OUT/$2-$4.log"
  local container; container=$(xcrun simctl get_app_container "$udid" "$BUNDLE" app)
  setURL "$container/capacitor.config.json" "$url"
  xcrun simctl terminate "$udid" "$BUNDLE" >/dev/null 2>&1 || true
  xcrun simctl launch --console-pty "$udid" "$BUNDLE" >"$log" 2>&1 &
  local pid=$!
  sleep "$WAIT"
  xcrun simctl io "$udid" screenshot "$OUT/$tag-$name.png" >/dev/null 2>&1 || bad "$tag $name: no screenshot"
  if kill -0 "$pid" 2>/dev/null; then note "$tag $name: running"; else bad "$tag $name: the app stopped (log: $log)"; tail -20 "$log"; fi
  xcrun simctl terminate "$udid" "$BUNDLE" >/dev/null 2>&1 || true
  wait "$pid" 2>/dev/null || true
}

bridge() { # a log, the page's name: the page reached the native side
  local log=$1 name=$2
  if grep -Eq "To Native ->[[:space:]]+SplashScreen[[:space:]]+hide" "$log" && grep -Eq "To Native ->[[:space:]]+FlossifyShell[[:space:]]+setChrome" "$log"; then
    note "$name: the page reached the native side (SplashScreen.hide, FlossifyShell.setChrome)"
  else
    bad "$name: no bridge calls in the log ($log)"; grep -E "To Native|ERROR|Error" "$log" | head -10 || true
  fi
}

for kind in "iPhone [0-9]+ Pro$" "iPad Pro 13-inch"; do
  read -r udid label < <(pick "$kind") || true
  if [ -z "${udid:-}" ]; then note "no simulator matching $kind: skipped"; continue; fi
  tag=$(echo "$label" | tr ' ()' '---' | tr -s '-' | sed 's/-$//')
  echo "== $label ($udid)"
  xcrun simctl boot "$udid" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "$udid" -b >/dev/null
  xcrun simctl status_bar "$udid" override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3 >/dev/null 2>&1 || true
  xcrun simctl install "$udid" "$APP"
  for look in light dark; do
    xcrun simctl ui "$udid" appearance "$look"
    run_page "$udid" "$tag" "$SITE/app/" "app-$look"
    bridge "$OUT/$tag-app-$look.log" "$tag /app/ ($look)"
  done
  xcrun simctl ui "$udid" appearance light
  run_page "$udid" "$tag" "$SITE/find/" "find"
  run_page "$udid" "$tag" "$SITE/auth/login/" "staff-entrance"
  # Nothing listens on port 9: the app's own offline page (capacitor.config.json errorPath).
  run_page "$udid" "$tag" "http://localhost:9/app/" "offline"
  xcrun simctl shutdown "$udid" >/dev/null 2>&1 || true
done

echo "== screenshots and logs: $OUT"
ls "$OUT"/*.png 2>/dev/null | sed 's/^/   /'
[ "$fails" = 0 ] && echo "all passed" || { echo "$fails failed"; exit 1; }
