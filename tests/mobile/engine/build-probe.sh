#!/usr/bin/env bash
set -euo pipefail
[[ ${GITHUB_ACTIONS:-} == true ]] || exit 2
root=$(cd "$(dirname "$0")" && pwd)
evidence="$RUNNER_TEMP/lyco-mobile-network"
private="$RUNNER_TEMP/lyco-engine-private"
mkdir -p "$evidence" "$private"
chmod 700 "$private"
trap 'rm -rf "$private"' EXIT
export LYCO_ENGINE_SIGNING_KEY="$private/experiment.p12"
keytool -genkeypair -noprompt -keystore "$LYCO_ENGINE_SIGNING_KEY" -storetype PKCS12 \
 --storepass CI_engine_probe_only --keypass CI_engine_probe_only -alias experiment \
 -keyalg RSA -keysize 2048 -validity 2 -dname 'CN=LYCO disposable native engine experiment'
if [[ ! -f "$ANDROID_HOME/platforms/android-37.0/android.jar" ]]; then
 sdkmanager_bin=$(find "$ANDROID_HOME/cmdline-tools" -type f -name sdkmanager | sort -V | tail -1)
 test -n "$sdkmanager_bin"
 "$sdkmanager_bin" 'platforms;android-37.0' 'build-tools;36.0.0'
fi
gradle --no-daemon --console=plain -p "$root" :app:assembleRelease :app:nativeDependencyEvidence
cp "$root/app/build/outputs/apk/release/app-release.apk" "$evidence/engine-probe.apk"
tools=$(find "$ANDROID_HOME/build-tools" -name aapt -type f | sort -V | tail -1)
"$tools" dump badging "$evidence/engine-probe.apk" > "$evidence/engine-badging.txt"
python3 - <<'PY'
import hashlib,json,os,zipfile
from pathlib import Path
p=Path(os.environ['RUNNER_TEMP'])/'lyco-mobile-network'
badging=(p/'engine-badging.txt').read_text()
assert "package: name='top.lain42.lycoengineprobe'" in badging and 'application-debuggable' not in badging
assert "targetSdkVersion:'36'" in badging and "sdkVersion:'28'" in badging
digest=hashlib.sha256((p/'engine-probe.apk').read_bytes()).hexdigest()
meta={'source':os.environ['GITHUB_SHA'],'run':os.environ['GITHUB_RUN_ID'],'sha256':digest,'notProductAPK':True,
      'engine':'GeckoView 159.0.20261022150525','targetSdk':36,'minSdk':28,'debuggable':False,'pagePolicyScript':False,'nativePolicy':'public configFilePath / media.peerconnection.ice.proxy_only',
      'signing':'disposable CI experiment key, not the owner product certificate','scope':'Native capability experiment only, no environment migration or product adoption'}
if os.environ.get('LYCO_ENGINE_AAR'):
    source=json.loads(Path(os.environ['LYCO_ENGINE_BUILD_METADATA']).read_text())
    aar=Path(os.environ['LYCO_ENGINE_AAR'])
    with aar.open('rb') as stream:assert hashlib.file_digest(stream,'sha256').hexdigest()==source['aarSha256']
    libraries=[]
    with zipfile.ZipFile(aar) as archive,zipfile.ZipFile(p/'engine-probe.apk') as apk:
        for name in archive.namelist():
            if not (name.startswith('jni/x86_64/') and name.endswith('.so')):continue
            packaged=name.replace('jni/','lib/',1)
            with archive.open(name) as stream:original=hashlib.file_digest(stream,'sha256').hexdigest()
            with apk.open(packaged) as stream:actual=hashlib.file_digest(stream,'sha256').hexdigest()
            assert original==actual, 'APK native library differs from source-built AAR: '+name
            libraries.append({'file':packaged,'sha256':actual})
    assert any(row['file']=='lib/x86_64/libxul.so' for row in libraries)
    (p/'source-engine-packaged-libraries.json').write_text(json.dumps(libraries,indent=2)+'\n')
    meta['engine']='GeckoView 159.0 source-built native route experiment'
    meta['sourceEngineBuild']=source
    meta['packagedNativeLibrariesMatchSourceAar']=True
(p/'candidate.json').write_text(json.dumps(meta,indent=2)+'\n')
PY
