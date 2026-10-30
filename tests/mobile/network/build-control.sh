#!/usr/bin/env bash
set -euo pipefail
[[ ${GITHUB_ACTIONS:-} == true ]] || exit 2
root=$(cd "$(dirname "$0")" && pwd)
build="$RUNNER_TEMP/lyco-network-control"
private="$RUNNER_TEMP/lyco-network-control-private"
mkdir -p "$build/classes" "$build/dex" "$private"
chmod 700 "$private"
tools=$(find "$ANDROID_HOME/build-tools" -name aapt2 -type f | sort -V | tail -1)
tools=$(dirname "$tools")
android="$ANDROID_HOME/platforms/android-35/android.jar"
test -f "$android"
"$tools/aapt" dump badging "$LYCO_CANDIDATE_APK" > "$build/product-badging.txt"
target=$(python3 - "$build/product-badging.txt" <<'PY'
import re,sys
value=re.findall(r"(?m)^targetSdkVersion:'([0-9]+)'$",open(sys.argv[1]).read())
assert len(value)==1
print(value[0])
PY
)
"$tools/aapt2" link -I "$android" --manifest "$root/AndroidManifest.xml" --min-sdk-version 28 --target-sdk-version "$target" -o "$build/control-unsigned.apk"
javac -source 8 -target 8 -bootclasspath "$android" -d "$build/classes" "$root/ControlActivity.java"
"$tools/d8" --lib "$android" --min-api 28 --output "$build/dex" "$build/classes/top/lain42/lyconetworkcontrol/ControlActivity.class"
python3 - "$build" <<'PY'
import sys,zipfile
from pathlib import Path
p=Path(sys.argv[1])
with zipfile.ZipFile(p/'control-unsigned.apk','a') as z:z.write(p/'dex/classes.dex','classes.dex')
PY
keytool -genkeypair -noprompt -keystore "$private/control.p12" -storetype PKCS12 -storepass CI_control_pass -keypass CI_control_pass -alias control -keyalg RSA -keysize 2048 -validity 2 -dname 'CN=LYCO disposable CI control'
"$tools/zipalign" -f 4 "$build/control-unsigned.apk" "$build/control-aligned.apk"
"$tools/apksigner" sign --ks "$private/control.p12" --ks-pass pass:CI_control_pass --key-pass pass:CI_control_pass --out "$build/control.apk" "$build/control-aligned.apk"
rm -rf "$private"
