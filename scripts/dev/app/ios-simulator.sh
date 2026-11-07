#!/usr/bin/env bash
# The iPhone app in the iOS simulator, on a Mac with Xcode. It builds the app (no signing), runs it against a website on
# this Mac, and checks what can be checked without a finger:
#   - Flossify's own Swift builds, and its warnings are listed;
#   - the app starts and keeps running on each page;
#   - the page reaches the native side (a debug build logs every bridge call: FlossifyShell.setChrome, .ready);
#   - the launch screen gives way to the page, also on a slow line (an address that answers after 7 s);
#   - with the site unreachable, the app's own offline page shows;
#   - each screen is photographed, on an iPhone and an iPad, light and dark (/app/, /find/, the staff entrance, offline).
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
LIMIT=${LIMIT:-40}
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
echo "== built for: $(lipo -archs "$APP/App" 2>/dev/null || echo '?')"

# A copy that opens https://flossify.ph, for anyone's Mac with Xcode, no build needed: unzip, then drag Flossify.app onto
# a running Simulator (mobile/README.md, "Try it without building"). The same build, with the address and allowed hosts
# that `npx cap sync` wrote before use-local.mjs pointed this one at this Mac. Zipped with ditto, which keeps the
# executable bit that a plain upload drops.
rm -rf "$OUT/live" && mkdir -p "$OUT/live"
cp -R "$APP" "$OUT/live/Flossify.app"
node -e '
  const fs = require("fs"); const [file, shipped] = process.argv.slice(1);
  const c = JSON.parse(fs.readFileSync(file, "utf8")); const s = JSON.parse(fs.readFileSync(shipped, "utf8"));
  c.server = { ...c.server, url: s.server.url, allowNavigation: s.server.allowNavigation };
  fs.writeFileSync(file, JSON.stringify(c, null, "\t") + "\n");
  console.log("== Flossify-simulator.zip opens " + c.server.url);' "$OUT/live/Flossify.app/capacitor.config.json" "$ROOT/mobile/capacitor.config.json"
(cd "$OUT/live" && ditto -c -k --keepParent Flossify.app "$OUT/Flossify-simulator.zip")

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

# The installed app's own copy of the config (read at each launch): where it opens, and any setting a check varies, as
# a JSON object merged in (e.g. '{"ios":{"limitsNavigationsToAppBoundDomains":false}}').
setConfig() { # file, url, patch
  node -e '
    const fs = require("fs"); const [file, url, patch] = process.argv.slice(1);
    const base = JSON.parse(fs.readFileSync(file + ".orig", "utf8"));
    const merge = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === "object" && !Array.isArray(v) ? merge(a[k] || {}, v) : v; return a; };
    const c = merge(base, JSON.parse(patch || "{}"));
    c.server.url = url;
    fs.writeFileSync(file, JSON.stringify(c, null, "\t"));' "$1" "$2" "${3:-}"
}

# A screen with the page on it: not one colour over the page (the status bar's band excepted). Prints the share of the
# commonest colour; fails above 97 %, so the launch screen (one colour and the small mark: 98 to 99 %) counts as not yet
# there. The sparest page measured, /app/ on an iPad, is 92 %.
blank() { # png
  (cd "$ROOT/mobile" && node -e '
    const sharp = require("sharp");
    sharp(process.argv[1]).raw().toBuffer({ resolveWithObject: true }).then(({ data, info }) => {
      const seen = new Map(); let n = 0;
      for (let y = Math.round(info.height * 0.1); y < info.height * 0.92; y += 23) for (let x = 0; x < info.width; x += 17) {
        const i = (y * info.width + x) * info.channels; const k = (data[i] >> 2) + "," + (data[i + 1] >> 2) + "," + (data[i + 2] >> 2);
        seen.set(k, (seen.get(k) || 0) + 1); n++;
      }
      const top = Math.max(...seen.values()) / n;
      console.log((top * 100).toFixed(1)); process.exit(top > 0.97 ? 1 : 0);
    });' "$1")
}

# A slow line, on purpose: an address on this Mac that answers after 7 s, sending the app on to the real page. The
# splash screen's own timer (4 s) runs out first, as it would on a slow clinic connection.
node -e '
  const [site] = process.argv.slice(1);
  require("http").createServer((q, r) => setTimeout(() => { r.writeHead(302, { Location: site + q.url }); r.end(); }, 7000)).listen(4399, "localhost");' "$SITE" &
SLOW_PID=$!
trap 'kill $SLOW_PID 2>/dev/null' EXIT
SLOW=http://localhost:4399

run_page() { # udid, tag, url, name, [config patch]
  local udid=$1 tag=$2 url=$3 name=$4 patch=${5:-} log="$OUT/$2-$4.log"
  local container; container=$(xcrun simctl get_app_container "$udid" "$BUNDLE" app)
  [ -f "$container/capacitor.config.json.orig" ] || cp "$container/capacitor.config.json" "$container/capacitor.config.json.orig"
  setConfig "$container/capacitor.config.json" "$url" "$patch"
  xcrun simctl terminate "$udid" "$BUNDLE" >/dev/null 2>&1 || true
  sleep 1
  local since; since=$(date '+%Y-%m-%d %H:%M:%S')
  xcrun simctl launch --console-pty "$udid" "$BUNDLE" >"$log" 2>&1 &
  local pid=$!
  sleep 6
  xcrun simctl io "$udid" screenshot "$OUT/$tag-$name-early.png" >/dev/null 2>&1 || true
  # Then a look every 2 s until something is on screen, for at most LIMIT seconds: a slow simulator is told apart from a
  # screen that stays blank. The launch screen itself (one colour and the mark) counts as blank.
  local waited=6 share=100 seen=0
  while [ "$waited" -lt "$LIMIT" ]; do
    sleep 2; waited=$((waited + 2))
    xcrun simctl io "$udid" screenshot "$OUT/$tag-$name.png" >/dev/null 2>&1 || continue
    if share=$(blank "$OUT/$tag-$name.png"); then seen=1; break; fi
  done
  # The console stays attached after the app itself has gone, and the home screen is not blank: so ask launchd whether
  # the app still has a process (UIKitApplication:<bundle> with a number, not "-").
  local alive; alive=$(xcrun simctl spawn "$udid" launchctl list 2>/dev/null | awk -v b="UIKitApplication:$BUNDLE" 'index($3, b) == 1 && $1 != "-" { print $1 }' | head -1)
  if ! kill -0 "$pid" 2>/dev/null || [ -z "$alive" ]; then
    bad "$tag $name: the app stopped (log: $log)"; tail -30 "$log"
    xcrun simctl spawn "$udid" log show --style compact --start "$since" \
      --predicate 'process == "App" OR process BEGINSWITH "com.apple.WebKit" OR (process == "SpringBoard" AND eventMessage CONTAINS[c] "flossify") OR eventMessage CONTAINS[c] "jetsam" OR eventMessage CONTAINS[c] "crash"' \
      2>/dev/null | grep -v -i "debug" | tail -60 || true
    ls -t ~/Library/Logs/DiagnosticReports/App-*.ips 2>/dev/null | head -1 | xargs -I{} sh -c 'echo "   crash report: {}"; head -c 6000 "{}"' || true
  elif [ "$seen" = 1 ]; then note "$tag $name: running; the page on screen after ${waited} s (commonest colour $share%)"
  else bad "$tag $name: running, but nothing on screen after ${LIMIT} s (one colour on $share% of it)"; fi
  # WebKit's and the app's own complaints from the simulator's system log: what the app's console does not show.
  xcrun simctl spawn "$udid" log show --style compact --start "$since" \
    --predicate '(process == "App" OR process BEGINSWITH "com.apple.WebKit") AND (messageType == error OR messageType == fault OR eventMessage CONTAINS[c] "bound" OR eventMessage CONTAINS[c] "navigation")' \
    >"$OUT/$tag-$name.syslog" 2>/dev/null || true
  xcrun simctl terminate "$udid" "$BUNDLE" >/dev/null 2>&1 || true
  wait "$pid" 2>/dev/null || true
}

bridge() { # a log, the page's name: the page reached the native side
  local log=$1 name=$2
  if grep -Eq "To Native ->[[:space:]]+FlossifyShell[[:space:]]+ready" "$log" && grep -Eq "To Native ->[[:space:]]+FlossifyShell[[:space:]]+setChrome" "$log"; then
    note "$name: the page reached the native side (FlossifyShell.setChrome, FlossifyShell.ready)"
  else
    bad "$name: no bridge calls in the log ($log)"; grep -E "To Native|ERROR|Error" "$log" | head -10 || true
  fi
}

look() { # udid, light|dark: the device's appearance, given time to settle before the next launch
  xcrun simctl ui "$1" appearance "$2"
  sleep 3
}

UNBOUND='{"ios":{"limitsNavigationsToAppBoundDomains":false}}'

# DEVICES (name patterns separated by ";") picks other simulators: the App Store's screenshots are taken on the biggest
# iPhone and iPad ("iPhone [0-9]+ Pro Max$;iPad Pro 13-inch", Actions → iOS app → Run workflow → App Store sizes).
IFS=';' read -r -a KINDS <<<"${DEVICES:-iPhone [0-9]+ Pro\$;iPad Pro 13-inch}"
for kind in "${KINDS[@]}"; do
  read -r udid label < <(pick "$kind") || true
  if [ -z "${udid:-}" ]; then note "no simulator matching $kind: skipped"; continue; fi
  tag=$(echo "$label" | tr ' ()' '---' | tr -s '-' | sed 's/-$//')
  echo "== $label ($udid)"
  xcrun simctl boot "$udid" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "$udid" -b >/dev/null
  xcrun simctl status_bar "$udid" override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3 >/dev/null 2>&1 || true
  xcrun simctl install "$udid" "$APP"
  look "$udid" light
  run_page "$udid" "$tag" "$SITE/app/" "app-light-first"
  run_page "$udid" "$tag" "$SITE/app/" "app-light"
  bridge "$OUT/$tag-app-light.log" "$tag /app/ (light)"
  look "$udid" dark
  run_page "$udid" "$tag" "$SITE/app/" "app-dark"
  bridge "$OUT/$tag-app-dark.log" "$tag /app/ (dark)"
  # The patients' and the staff's ways in, and the offline page, dark too.
  run_page "$udid" "$tag" "$SITE/find/" "find-dark"
  run_page "$udid" "$tag" "$SITE/auth/login/" "staff-entrance-dark"
  run_page "$udid" "$tag" "http://localhost:4398/app/" "offline-dark"
  look "$udid" light
  # A slow line: the page arrives after 7 s; the launch screen waits for it.
  run_page "$udid" "$tag" "$SLOW/app/" "slow-line"
  run_page "$udid" "$tag" "$SITE/find/" "find"
  run_page "$udid" "$tag" "$SITE/auth/login/" "staff-entrance"
  # Nothing listens on port 4398: the app's own offline page (capacitor.config.json errorPath), then the same with the
  # navigations not limited to the app-bound domains (the offline page lives at capacitor://localhost).
  run_page "$udid" "$tag" "http://localhost:4398/app/" "offline"
  run_page "$udid" "$tag" "http://localhost:4398/app/" "offline-unbound" "$UNBOUND"
  xcrun simctl shutdown "$udid" >/dev/null 2>&1 || true
done

echo "== screenshots and logs: $OUT"
ls "$OUT"/*.png 2>/dev/null | sed 's/^/   /'
[ "$fails" = 0 ] && echo "all passed" || { echo "$fails failed"; exit 1; }
