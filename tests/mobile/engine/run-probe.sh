#!/usr/bin/env bash
set -euo pipefail
[[ ${GITHUB_ACTIONS:-} == true ]] || exit 2
export LYCO_NATIVE_ENGINE_PROBE=true
root=$(cd "$(dirname "$0")" && pwd)
evidence="$RUNNER_TEMP/lyco-mobile-network"
turnserver -n --listening-ip=127.0.0.1 --listening-port=13478 --relay-ip=127.0.0.1 \
 --min-port=40000 --max-port=40100 --no-udp --no-tls --no-dtls --no-tcp-relay --no-cli \
 --allow-loopback-peers --cli-password=lyco-ci-local-only --realm=lyco-fixture.invalid \
 --lt-cred-mech --user=lyco-ci:lyco-ci-owned-turn-only --verbose --log-file=stdout \
 --pidfile="$RUNNER_TEMP/lyco-engine-turn.pid" > "$evidence/coturn.log" 2>&1 &
turn_pid=$!
"$LYCO_NETWORK_PYTHON" "$root/../network/fixture.py" > "$evidence/fixture.log" 2>&1 &
fixture_pid=$!
cleanup(){
 adb logcat -d -v threadtime > "$evidence/final-native-logcat.txt" 2>/dev/null || true
 adb exec-out screencap -p > "$evidence/final-screen.png" 2>/dev/null || true
 kill "$fixture_pid" "$turn_pid" 2>/dev/null || true
}
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
# This exposes the same owned host fixture on the real device loopback. The
# browser must proxy those URLs; direct controls must prove all three reachable.
adb reverse tcp:18080 tcp:18080
adb install -r "$evidence/engine-probe.apk"
adb logcat -c
wait_report(){
 python3 - "$evidence/network.json" "$1" <<'PY'
import json,sys,time
from pathlib import Path
for _ in range(600):
 data=json.loads(Path(sys.argv[1]).read_text())
 if any(x['phase']==sys.argv[2] for x in data['reports']): break
 time.sleep(.1)
else: raise SystemExit('Actual engine report missing: '+sys.argv[2])
PY
}
launch(){
 adb shell am force-stop top.lain42.lycoengineprobe
 adb shell am start -W -n top.lain42.lycoengineprobe/.ProbeActivity --es mode "$1" -d "http://10.0.2.2:18080/rtc?phase=$2"
 wait_report "$2"
 adb exec-out screencap -p > "$evidence/$2.png"
 adb logcat -d -v threadtime > "$evidence/$2-native-logcat.txt"
}
launch direct control
launch policy lyco
curl --fail --silent --show-error --max-time 10 -H 'Content-Type: application/json' -d '{"stop":true}' http://127.0.0.1:18080/control > /dev/null
adb shell am start -W -n top.lain42.lycoengineprobe/.ProbeActivity --es action stopped
for attempt in $(seq 1 50); do
 adb shell uiautomator dump /data/local/tmp/lyco-engine-stopped.xml >/dev/null
 adb pull /data/local/tmp/lyco-engine-stopped.xml "$evidence/stopped-ui.xml" >/dev/null
 if python3 - "$evidence/stopped-ui.xml" <<'PY'
import sys,xml.etree.ElementTree as E
assert any(n.get('text')=='ENGINE TITLE: LYCO RTC stopped completed' for n in E.parse(sys.argv[1]).iter('node'))
PY
 then break; fi
 sleep .5
done
adb exec-out screencap -p > "$evidence/stopped.png"
adb logcat -d -v threadtime > "$evidence/stopped-native-logcat.txt"
cp "$evidence/network.json" "$evidence/stopped-window-network.json"
curl --fail --silent --show-error --max-time 10 -H 'Content-Type: application/json' -d '{"recover":true}' http://127.0.0.1:18080/control > /dev/null
adb shell am start -W -n top.lain42.lycoengineprobe/.ProbeActivity --es action upload
wait_report stopped
launch direct control-after
adb shell am force-stop top.lain42.lycoengineprobe
python3 "$root/../network/assert-evidence.py" "$evidence" --native-engine
