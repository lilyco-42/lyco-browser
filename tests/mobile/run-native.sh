#!/usr/bin/env bash
set -euo pipefail
export MAESTRO_CLI_NO_ANALYTICS=1
export MAESTRO_DRIVER_STARTUP_TIMEOUT=300000
[[ ${GITHUB_ACTIONS:-} == true ]] || { echo 'Actions only' >&2; exit 2; }
platform=${1:?android or ios}
root=$(cd "$(dirname "$0")" && pwd)
evidence="$RUNNER_TEMP/lyco-mobile-$platform"
mkdir -p "$evidence"
python3 "$root/fixture.py" --evidence "$evidence" > "$evidence/fixture.log" 2>&1 &
fixture_pid=$!
trap 'kill "$fixture_pid" 2>/dev/null || true' EXIT
python3 - "$evidence/network.json" <<'PY'
import sys,time
from pathlib import Path
for _ in range(600):
    if Path(sys.argv[1]).exists(): break
    time.sleep(.1)
else: raise SystemExit('Mobile network fixture did not start')
PY
if [[ "$platform" == android ]]; then
  adb install -r "$RUNNER_TEMP/LYCO-Browser-Android-preview.apk"
  device=$(adb devices | awk '$2=="device" {print $1;exit}')
  proxy='http://10.0.2.2:18081'
  direct_origin='http://10.0.2.2:18080'
else
  device=${LYCO_IOS_SIMULATOR:?simulator UDID required}
  xcrun simctl install "$device" "$LYCO_IOS_APP"
  proxy='http://127.0.0.1:18081'
  direct_origin='http://127.0.0.1:18080'
fi
maestro --device "$device" test --format junit --output "$evidence/initial.xml" --test-output-dir "$evidence/initial" --debug-output "$evidence/initial-debug" --flatten-debug-output -e "PROXY=$proxy" "$root/flows/initial.yaml"
expected_reports=5
if [[ "$platform" == android ]]; then
  maestro --device "$device" test --format junit --output "$evidence/background-close.xml" --test-output-dir "$evidence/background-close" --debug-output "$evidence/background-close-debug" --flatten-debug-output -e "PROXY=$proxy" "$root/flows/background-close.yaml"
  expected_reports=6
  for attempt in 1 2 3 4 5; do
    if ! adb shell pidof 'top.lain42.lycobrowser:lyco_browser' >/dev/null; then break; fi
    sleep 1
  done
  if adb shell pidof 'top.lain42.lycobrowser:lyco_browser' >/dev/null; then
    echo 'Control UI left the old native browser process running' >&2
    exit 1
  fi
fi
maestro --device "$device" test --format junit --output "$evidence/clear-data.xml" --test-output-dir "$evidence/clear-data" --debug-output "$evidence/clear-data-debug" --flatten-debug-output -e "PROXY=$proxy" "$root/flows/clear-data.yaml"
maestro --device "$device" test --format junit --output "$evidence/delete-profile.xml" --test-output-dir "$evidence/delete-profile" --debug-output "$evidence/delete-profile-debug" --flatten-debug-output "$root/flows/delete-profile.yaml"
maestro --device "$device" test --format junit --output "$evidence/notices.xml" --test-output-dir "$evidence/notices" --debug-output "$evidence/notices-debug" --flatten-debug-output "$root/flows/notices.yaml"
touch "$evidence/stop-proxy"
python3 - "$evidence/proxy-stopped" <<'PY'
import sys,time
from pathlib import Path
for _ in range(600):
    if Path(sys.argv[1]).exists(): break
    time.sleep(.1)
else: raise SystemExit('Proxy stop control did not complete')
PY
maestro --device "$device" test --format junit --output "$evidence/stopped.xml" --test-output-dir "$evidence/stopped" --debug-output "$evidence/stopped-debug" --flatten-debug-output -e "PROXY=$proxy" -e "DIRECT_ORIGIN=$direct_origin" "$root/flows/stopped-proxy.yaml"
# Give a forbidden direct fallback time to reach the still-running origin.
sleep 6
python3 "$root/assert-evidence.py" "$evidence" "$expected_reports"
