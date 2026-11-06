#!/usr/bin/env bash
set -euo pipefail
[[ ${GITHUB_ACTIONS:-} == true && ${GITHUB_EVENT_NAME:-} == workflow_dispatch ]] || exit 2
root=$(cd "$(dirname "$0")" && pwd)
out="$RUNNER_TEMP/lyco-vpn-boundary"
private="$RUNNER_TEMP/lyco-vpn-boundary-private"
mkdir -p "$out/classes" "$out/dex" "$private"
chmod 700 "$private"
trap 'rm -rf "$private"' EXIT
sdkmanager=$(find "$ANDROID_HOME/cmdline-tools" -type f -name sdkmanager | sort -V | tail -1)
"$sdkmanager" 'platforms;android-35' 'build-tools;36.0.0'
android="$ANDROID_HOME/platforms/android-35/android.jar"
tools="$ANDROID_HOME/build-tools/36.0.0"
"$tools/aapt2" link -I "$android" --manifest "$root/AndroidManifest.xml" --min-sdk-version 28 --target-sdk-version 36 -o "$out/unsigned.apk"
javac -source 8 -target 8 -bootclasspath "$android" -d "$out/classes" "$root/ProbeActivity.java" "$root/PacketVpnService.java"
mapfile -t classes < <(find "$out/classes" -type f -name '*.class' | sort)
"$tools/d8" --lib "$android" --min-api 28 --output "$out/dex" "${classes[@]}"
python3 - "$out" <<'PY'
from pathlib import Path
import sys, zipfile
out = Path(sys.argv[1])
with zipfile.ZipFile(out / 'unsigned.apk', 'a') as archive:
    archive.write(out / 'dex/classes.dex', 'classes.dex')
PY
keytool -genkeypair -noprompt -keystore "$private/probe.p12" -storetype PKCS12 -storepass owned_probe_only -keypass owned_probe_only -alias probe -keyalg RSA -keysize 2048 -validity 2 -dname 'CN=LYCO disposable owned VPN diagnostic'
"$tools/zipalign" -f 4 "$out/unsigned.apk" "$out/aligned.apk"
"$tools/apksigner" sign --ks "$private/probe.p12" --ks-pass pass:owned_probe_only --key-pass pass:owned_probe_only --out "$out/probe.apk" "$out/aligned.apk"
"$tools/apksigner" verify --verbose --print-certs "$out/probe.apk" > "$out/signature.txt"
"$tools/aapt" dump badging "$out/probe.apk" > "$out/badging.txt"
python3 - "$root" "$out" <<'PY'
from pathlib import Path
import hashlib, json, os, subprocess, sys, zipfile
root, out = map(Path, sys.argv[1:])
badging = (out / 'badging.txt').read_text()
assert "package: name='top.lain42.lycovpnboundary'" in badging
assert "targetSdkVersion:'36'" in badging and "sdkVersion:'28'" in badging
assert 'application-debuggable' not in badging
with zipfile.ZipFile(out / 'probe.apk') as archive:
    assert archive.testzip() is None and 'classes.dex' in archive.namelist()
    assert not any(n.endswith('.so') for n in archive.namelist())
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
assert commit == os.environ['GITHUB_SHA']
files = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in root.iterdir() if p.is_file()}
record = {'run': os.environ['GITHUB_RUN_ID'], 'source': commit, 'event': os.environ['GITHUB_EVENT_NAME'],
          'apkSha256': hashlib.sha256((out / 'probe.apk').read_bytes()).hexdigest(),
          'apkBytes': (out / 'probe.apk').stat().st_size, 'sourceFiles': files,
          'notProductAPK': True, 'debuggable': False, 'targetSdk': 36, 'minSdk': 28,
          'pagePolicyScript': False, 'upstreamForwarding': False, 'productAdopted': False,
          'scope': 'Owned Android SDK-only packet/candidate diagnostic; no product browser, customer data, selected upstream, TURN functional or migration proof.'}
(out / 'candidate.json').write_text(json.dumps(record, indent=2) + '\n')
PY
rm -rf "$out/classes" "$out/dex" "$out/unsigned.apk" "$out/aligned.apk"
