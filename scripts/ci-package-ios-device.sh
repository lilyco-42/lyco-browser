#!/usr/bin/env bash
set -euo pipefail
[[ ${GITHUB_ACTIONS:-} == true ]] || { echo 'Device packaging runs on Actions only' >&2; exit 2; }
app_path=$(find "$RUNNER_TEMP/LYCO_Device/Build/Products/Release-iphoneos" -maxdepth 1 -name '*.app' | head -1)
test -d "$app_path"
test ! -e "$app_path/embedded.mobileprovision"
app_executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app_path/Info.plist")
xcrun vtool -show-build "$app_path/$app_executable" > "$RUNNER_TEMP/ios-device-platform.txt"
python3 - "$app_path/Info.plist" <<'PY'
import json,os,plistlib,re,subprocess,sys
from pathlib import Path
root=Path(os.environ['RUNNER_TEMP'])
info=plistlib.loads(Path(sys.argv[1]).read_bytes())
assert info['CFBundleSupportedPlatforms']==['iPhoneOS'], 'An iPhoneOS device product is required'
assert re.search(r'(?m)^\s*platform IOS\s*$',(root/'ios-device-platform.txt').read_text()), 'Simulator binaries cannot be device candidates'
version=tuple(int(x) for x in info['MinimumOSVersion'].split('.'))
assert version>=(17,0), 'Per-environment native APIs require iOS 17'
record={'commit':os.environ['GITHUB_SHA'],'run':os.environ['GITHUB_RUN_ID'],
 'bundleIdentifier':info['CFBundleIdentifier'],'version':info['CFBundleShortVersionString'],
 'build':info['CFBundleVersion'],'minimumOS':info['MinimumOSVersion'],
 'sdk':subprocess.check_output(['xcrun','--sdk','iphoneos','--show-sdk-version'],text=True).strip(),
 'platform':'iPhoneOS','signingCredentialsUsed':False,'provisioningProfileIncluded':False,
 'installableWithoutSigning':False,'realDeviceRuntimeVerified':False}
(root/'IOS-DEVICE-PROVENANCE.json').write_text(json.dumps(record,indent=2)+'\n')
PY
mkdir -p "$RUNNER_TEMP/LYCO-device-package/Payload"
ditto "$app_path" "$RUNNER_TEMP/LYCO-device-package/Payload/$(basename "$app_path")"
ditto -c -k --keepParent "$RUNNER_TEMP/LYCO-device-package/Payload" "$RUNNER_TEMP/LYCO-Browser-iOS-device-unsigned.ipa"
cd "$RUNNER_TEMP"
shasum -a 256 LYCO-Browser-iOS-device-unsigned.ipa IOS-DEVICE-PROVENANCE.json > IOS-DEVICE-SHA256SUMS.txt
