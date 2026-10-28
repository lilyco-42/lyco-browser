#!/usr/bin/env bash
set -euo pipefail
[[ ${GITHUB_ACTIONS:-} == true ]] || exit 2
export MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_DRIVER_STARTUP_TIMEOUT=300000
root=$(cd "$(dirname "$0")" && pwd)
evidence="$RUNNER_TEMP/lyco-mobile-paid"
private_ca="$RUNNER_TEMP/lyco-paid-private-ca"
private_storage="$RUNNER_TEMP/lyco-paid-private-storage"
mkdir -p "$evidence" "$private_ca" "$private_storage"
chmod 700 "$private_ca" "$private_storage"
node "$root/fixture.mjs" > "$evidence/fixture.log" 2>&1 &
fixture_pid=$!
cleanup(){
  adb shell settings put global http_proxy :0 >/dev/null 2>&1 || true
  kill "${mitm_pid:-}" "$fixture_pid" 2>/dev/null || true
  rm -rf "$private_ca" "$private_storage"
}
trap cleanup EXIT
for attempt in $(seq 1 100); do [[ -f "$evidence/fixture.json" ]] && break; sleep .1; done
origin=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["origin"])' "$evidence/fixture.json")
"$RUNNER_TEMP/lyco-paid-mitm/bin/mitmdump" --listen-host 127.0.0.1 --listen-port 18082 --set "confdir=$private_ca" --set connection_strategy=lazy --set upstream_cert=false -s "$root/billing-proxy.py" > "$private_ca/mitm.log" 2>&1 &
mitm_pid=$!
for attempt in $(seq 1 100); do [[ -f "$private_ca/mitmproxy-ca-cert.pem" ]] && break; sleep .1; done
adb root
adb wait-for-device
adb shell settings put global http_proxy 10.0.2.2:18082
maestro_test(){
 local name=$1;shift
 local label="$name${LYCO_PHASE_SUFFIX:-}"
 maestro test --format junit --output "$evidence/$label.xml" --test-output-dir "$evidence/$label" --debug-output "$evidence/$label-debug" --flatten-debug-output -e "ORIGIN=$origin" "$@" "$root/../flows/$name.yaml"
}
storage(){
 local phase=$1
 adb shell am force-stop top.lain42.lycobrowser
 mkdir -p "$private_storage/$phase"
 adb pull /data/user/0/top.lain42.lycobrowser/databases "$private_storage/$phase/" > /dev/null
 python3 "$root/inspect-storage.py" "$private_storage/$phase" "$evidence" "$phase"
}
control(){ curl --fail --silent --show-error --max-time 10 -H 'Content-Type: application/json' -d "$1" http://127.0.0.1:18086/control >/dev/null; }
# Real old binary creates a v1 environment and browser data before upgrade.
adb install -r "$LYCO_LEGACY_APK"
maestro_test paid-legacy
storage legacy
adb install -r "$LYCO_CANDIDATE_APK"
maestro_test paid-tls-rejection
python3 - "$evidence/network.json" <<'PY'
import json,sys
assert not json.load(open(sys.argv[1]))['requests'],'The untrusted TLS fixture was accepted before installing its CA'
PY
adb shell am force-stop top.lain42.lycobrowser
bash "$root/install-ci-ca.sh" "$private_ca/mitmproxy-ca-cert.pem"
maestro_test paid-initial
adb shell am force-stop top.lain42.lycobrowser
LYCO_PHASE_SUFFIX=-A maestro_test paid-reopen -e ROUTE=A
maestro test -e "ORIGIN=$origin" "$root/../flows/close.yaml"
control '{"hideA":true}'
maestro_test paid-missing
control '{"hideA":false,"stop":"A"}'
# Raw device TCP positive control is independent of the Android system proxy.
python3 - "$evidence/fixture.json" <<'PY'
import json,subprocess,sys
x=json.load(open(sys.argv[1]));p=x['originPort']
r=subprocess.run(['adb','shell','toybox','nc','-w','5','10.0.2.2',str(p)],input=f'GET /check?key=device-direct-control HTTP/1.1\r\nHost: 10.0.2.2:{p}\r\nConnection: close\r\n\r\n'.encode(),capture_output=True,timeout=15)
assert b'200 OK' in r.stdout and b'"route":"direct"' in r.stdout,'Device direct control could not reach the same origin'
PY
maestro_test paid-stopped
maestro_test paid-change
storage bound
# Install the actual old APK: its v1 reader must fail instead of dropping routes.
adb install -r -d "$LYCO_LEGACY_APK"
maestro_test paid-downgrade
adb shell uiautomator dump /data/local/tmp/lyco-downgrade.xml >/dev/null
adb pull /data/local/tmp/lyco-downgrade.xml "$evidence/downgrade-ui.xml" >/dev/null
python3 - "$evidence/downgrade-ui.xml" <<'PY'
import sys,xml.etree.ElementTree as ET
nodes=ET.parse(sys.argv[1]).iter('node')
assert any((n.get('content-desc')=='保存环境' or n.get('text')=='保存环境') and n.get('enabled')=='false' for n in nodes),'Old client allowed overwriting v2 environments'
PY
storage downgrade
adb install -r "$LYCO_CANDIDATE_APK"
LYCO_PHASE_SUFFIX=-B maestro_test paid-reopen -e ROUTE=B
control '{"revoked":true}'
maestro_test paid-revoked
storage final
curl --fail --silent --show-error -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:18086/control >/dev/null
python3 "$root/assert-evidence.py" "$evidence"
