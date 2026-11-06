#!/usr/bin/env bash
set -euo pipefail
[[ ${GITHUB_ACTIONS:-} == true ]] || exit 2
export MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_DRIVER_STARTUP_TIMEOUT=300000
root=$(cd "$(dirname "$0")" && pwd)
evidence="$RUNNER_TEMP/lyco-mobile-network"
mkdir -p "$evidence"
turnserver -n --listening-ip=127.0.0.1 --listening-port=13478 --relay-ip=127.0.0.1 \
 --min-port=40000 --max-port=40100 --no-udp --no-tls --no-dtls --no-tcp-relay --no-cli \
 --allow-loopback-peers --cli-password=lyco-ci-local-only --realm=lyco-fixture.invalid \
 --lt-cred-mech --user=lyco-ci:lyco-ci-owned-turn-only --verbose --log-file=stdout \
 --pidfile="$RUNNER_TEMP/lyco-network-turn.pid" > "$evidence/coturn.log" 2>&1 &
turn_pid=$!
"$LYCO_NETWORK_PYTHON" "$root/fixture.py" > "$evidence/fixture.log" 2>&1 &
fixture_pid=$!
cleanup(){ kill "$fixture_pid" "$turn_pid" 2>/dev/null || true; }
trap cleanup EXIT
for attempt in $(seq 1 100); do [[ -f "$evidence/fixture.json" ]] && break; sleep .1; done
test -s "$evidence/fixture.json"
python3 - <<'PY'
import socket,time
for _ in range(100):
 try:
  with socket.create_connection(('127.0.0.1',13478),.2): pass
  break
 except OSError: time.sleep(.1)
else: raise SystemExit('Owned coturn listener did not start')
PY
adb shell settings put global http_proxy :0
adb shell dumpsys webviewupdate > "$evidence/webview-provider.txt"
adb install -r "$RUNNER_TEMP/lyco-network-control/control.apk"
adb install -r "$LYCO_CANDIDATE_APK"
python3 - "$RUNNER_TEMP/lyco-network-control/control.apk" "$evidence" <<'PY'
import hashlib,json,sys
from pathlib import Path
p=Path(sys.argv[1]);(Path(sys.argv[2])/'control.json').write_text(json.dumps({'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'purpose':'Separate plain WebView direct positive control; not the product','source':'tests/mobile/network/ControlActivity.java'},indent=2))
PY
cp "$RUNNER_TEMP/lyco-network-control/product-badging.txt" "$evidence/product-badging.txt"
wait_report(){
 python3 - "$evidence/network.json" "$1" <<'PY'
import json,sys,time
from pathlib import Path
for _ in range(450):
 data=json.loads(Path(sys.argv[1]).read_text())
 if any(x['phase']==sys.argv[2] for x in data['reports']):break
 time.sleep(.1)
else:raise SystemExit('Actual WebView report missing: '+sys.argv[2])
PY
}
direct_control(){
 adb shell am force-stop top.lain42.lyconetworkcontrol
 adb shell am start -W -n top.lain42.lyconetworkcontrol/.ControlActivity -d "http://10.0.2.2:18080/rtc?phase=$1"
 wait_report "$1"
 adb exec-out screencap -p > "$evidence/$1.png"
 adb shell am force-stop top.lain42.lyconetworkcontrol
}
direct_control control
maestro test --format junit --output "$evidence/healthy.xml" --test-output-dir "$evidence/healthy" --debug-output "$evidence/healthy-debug" --flatten-debug-output "$root/../flows/network-rtc.yaml"
wait_report lyco
curl --fail --silent --show-error --max-time 10 -H 'Content-Type: application/json' -d '{"stop":true}' http://127.0.0.1:18080/control > /dev/null
maestro test --format junit --output "$evidence/stopped.xml" --test-output-dir "$evidence/stopped" --debug-output "$evidence/stopped-debug" --flatten-debug-output "$root/../flows/network-rtc-stopped.yaml"
adb shell uiautomator dump /data/local/tmp/lyco-rtc-stopped.xml >/dev/null
adb pull /data/local/tmp/lyco-rtc-stopped.xml "$evidence/stopped-ui.xml" >/dev/null
# Preserve the actual completed stopped window before recovering only its HTTP
# upload path. No stopped RTC attempt is repeated with a healthy upstream.
cp "$evidence/network.json" "$evidence/stopped-window-network.json"
curl --fail --silent --show-error --max-time 10 -H 'Content-Type: application/json' -d '{"recover":true}' http://127.0.0.1:18080/control > /dev/null
maestro test --format junit --output "$evidence/recovered.xml" --test-output-dir "$evidence/recovered" "$root/../flows/network-rtc-recover.yaml"
wait_report stopped
maestro test "$root/../flows/close.yaml"
direct_control control-after
python3 "$root/assert-evidence.py" "$evidence"
