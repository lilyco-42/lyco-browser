#!/usr/bin/env bash
set -euo pipefail
[[ ${GITHUB_ACTIONS:-} == true ]] || { echo 'Native proxy investigation runs on Actions only' >&2; exit 2; }
root=$(cd "$(dirname "$0")" && pwd)
evidence="$RUNNER_TEMP/lyco-ios-proxy-probe"
app="$RUNNER_TEMP/LYCOProxyProbe.app"
mkdir -p "$evidence" "$app" "$RUNNER_TEMP/probe-core"
stage() { date -u '+%Y-%m-%dT%H:%M:%SZ' | tr '\n' ' '; echo "$1"; }
stage 'Extract native core' | tee -a "$evidence/stages.txt"
tar xzf "$RUNNER_TEMP/lyco-tunnel-apple.tar.gz" -C "$RUNNER_TEMP/probe-core"
framework=$(python3 - <<'PY'
import os,plistlib
from pathlib import Path
root=Path(os.environ['RUNNER_TEMP'])/'probe-core/Lycotunnel.xcframework'
info=plistlib.loads((root/'Info.plist').read_bytes())
libraries=[x for x in info['AvailableLibraries'] if x.get('SupportedPlatformVariant')=='simulator' and x['SupportedPlatform']=='ios']
assert len(libraries)==1
print(root/libraries[0]['LibraryIdentifier'])
PY
)
sdk=$(xcrun --sdk iphonesimulator --show-sdk-path)
arch=$(uname -m)
stage 'Compile minimal UIKit application' | tee -a "$evidence/stages.txt"
xcrun --sdk iphonesimulator swiftc -swift-version 5 -target "$arch-apple-ios17.0-simulator" -sdk "$sdk" \
  -F "$framework" -framework Lycotunnel -framework UIKit -framework WebKit -framework Network \
  -framework Foundation -framework Security -framework CFNetwork -framework CoreFoundation -lresolv \
  "$root/ios-proxy-probe.swift" -o "$app/LYCOProxyProbe"
stage 'Compiled application; prepare metadata' | tee -a "$evidence/stages.txt"
python3 - "$app/Info.plist" <<'PY'
import plistlib,sys
from pathlib import Path
Path(sys.argv[1]).write_bytes(plistlib.dumps({
 'CFBundleIdentifier':'top.lain42.lycoproxyprobe','CFBundleName':'LYCO Proxy Probe',
 'CFBundleExecutable':'LYCOProxyProbe','CFBundlePackageType':'APPL',
 'CFBundleVersion':'1','CFBundleShortVersionString':'1.0','MinimumOSVersion':'17.0',
 'CFBundleSupportedPlatforms':['iPhoneSimulator'],'UIDeviceFamily':[1,2],
 'LSRequiresIPhoneOS':True,'NSAppTransportSecurity':{'NSAllowsArbitraryLoadsInWebContent':True},
}))
PY
xcrun simctl list devices available --json > "$evidence/simulators.json"
xcodebuild -version > "$evidence/xcode-version.txt"
xcrun --sdk iphonesimulator --show-sdk-version > "$evidence/sdk-version.txt"
device=$(python3 - "$evidence/simulators.json" <<'PY'
import json,sys
devices=json.load(open(sys.argv[1]))['devices']
print(next(d['udid'] for group in devices.values() for d in group if d['name'].startswith('iPhone') and d.get('isAvailable')))
PY
)
echo "$device" > "$evidence/simulator-udid.txt"
python3 "$root/proxy-probe-fixture.py" "$evidence" > "$evidence/fixture.log" 2>&1 &
fixture_pid=$!
trap 'kill "$fixture_pid" 2>/dev/null || true' EXIT
stage 'Boot simulator' | tee -a "$evidence/stages.txt"
xcrun simctl boot "$device" || true
xcrun simctl bootstatus "$device" -b
stage 'Install minimal application' | tee -a "$evidence/stages.txt"
xcrun simctl install "$device" "$app"
stage 'Launch minimal application' | tee -a "$evidence/stages.txt"
xcrun simctl launch "$device" top.lain42.lycoproxyprobe > "$evidence/launch.txt"
container=$(xcrun simctl get_app_container "$device" top.lain42.lycoproxyprobe data)
for attempt in $(seq 1 180); do
  if [[ -s "$container/Documents/results.json" ]]; then break; fi
  sleep 1
done
stage 'Collect application observations' | tee -a "$evidence/stages.txt"
cp "$container/Documents/results.json" "$evidence/results.json"
python3 - "$evidence" <<'PY'
import json,os,sys
from pathlib import Path
root=Path(sys.argv[1]);rows=json.loads((root/'results.json').read_text());events=json.loads((root/'network.json').read_text())
assert len(rows)==22, 'All proxy modes and their independent phases must finish'
baseline=[e for e in events if e['case']=='direct-control-local']
assert baseline and all(not e['viaProxy'] for e in baseline), 'Direct positive control did not reach the same live origin'
safe=[];modes=sorted({row['mode'] for row in rows if row['mode']!='direct-control'})
for mode in modes:
    probes=[row for row in rows if row['mode']==mode]
    healthy=all(row['result']=='loaded' and row.get('originContent') and
                any(e['case']==row['case'] and e['viaProxy'] for e in events) and
                not any(e['case']==row['case'] and not e['viaProxy'] for e in events)
                for row in probes if row['phase']!='stopped-local')
    stopped=not any(e['case']==mode+'-stopped-local' for e in events)
    if healthy and stopped:safe.append(mode)
summary={'commit':os.environ['GITHUB_SHA'],'run':os.environ['GITHUB_RUN_ID'],
         'scope':'Isolated iOS public-API investigation; not product acceptance or device certification',
         'safeModesForTheseCases':safe,'modes':modes,'originRequests':len(events)}
(root/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
if not safe:raise SystemExit('No tested public proxy configuration passed both healthy routing and stopped local negative control')
PY
