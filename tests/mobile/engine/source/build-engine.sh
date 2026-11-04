#!/usr/bin/env bash
set -euo pipefail
[[ ${GITHUB_ACTIONS:-} == true ]] || exit 2
root=$(cd "$(dirname "$0")" && pwd)
source_root="$RUNNER_TEMP/lyco-gecko-source"
evidence="$RUNNER_TEMP/lyco-gecko-build-evidence"
output="$RUNNER_TEMP/lyco-gecko-build-output"
mkdir -p "$evidence" "$output"
python3 -u - "$evidence/resources.log" <<'PY' &
import datetime,json,subprocess,sys,time
from pathlib import Path
while True:
    memory={}
    for line in Path('/proc/meminfo').read_text().splitlines():
        key,_,value=line.partition(':')
        if key in ['MemTotal','MemAvailable','SwapTotal','SwapFree']:memory[key]=value.strip()
    row={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'memory':memory,
         'largestProcesses':subprocess.check_output(['ps','-eo','pid,comm,rss','--sort=-rss'],text=True).splitlines()[:9]}
    line=json.dumps(row)
    print('Build resources: '+line,flush=True)
    with open(sys.argv[1],'a') as stream:stream.write(line+'\n')
    time.sleep(30)
PY
resource_monitor=$!
trap 'kill "$resource_monitor" 2>/dev/null || true' EXIT
current_phase=initialization
run_phase() {
 current_phase=$1
 shift
 printf '\nGecko source build phase: %s (%s)\n' "$current_phase" "$(date -u +%FT%TZ)"
 printf '{"phase":"%s","status":"running","checkedAt":"%s"}\n' \
  "$current_phase" "$(date -u +%FT%TZ)" > "$evidence/BUILD-STATE.json"
 # Keep original output both in the artifact and the live Actions log. A host
 # shutdown can prevent even an always() artifact step from running.
 if "$@" 2>&1 | tee "$evidence/$current_phase.log"; then
  printf '{"phase":"%s","status":"complete","checkedAt":"%s"}\n' \
   "$current_phase" "$(date -u +%FT%TZ)" > "$evidence/BUILD-STATE.json"
 else
  local status=$?
  printf '{"phase":"%s","status":"failed","exitCode":%s,"checkedAt":"%s"}\n' \
   "$current_phase" "$status" "$(date -u +%FT%TZ)" > "$evidence/BUILD-STATE.json"
  return "$status"
 fi
}
export MOZBUILD_STATE_PATH="$RUNNER_TEMP/lyco-mozbuild"
export CARGO_BUILD_JOBS=1
export GRADLE_USER_HOME="$RUNNER_TEMP/lyco-gecko-gradle"
mkdir -p "$GRADLE_USER_HOME"
cat > "$GRADLE_USER_HOME/gradle.properties" <<'GRADLE'
org.gradle.jvmargs=-Xmx2g
org.gradle.workers.max=1
org.gradle.daemon=false
GRADLE
cp "$GRADLE_USER_HOME/gradle.properties" "$evidence/gradle.properties"
run_phase checkout git clone --depth=1 --branch FIREFOX_159_0_RELEASE --single-branch \
 https://github.com/mozilla-firefox/firefox.git "$source_root"
cd "$source_root"
test "$(git rev-parse HEAD)" = 9a2dc53c369c7ae5172018b35988e1d2ffeff402
printf '%s  %s\n' 918068eebc2080e170de43acbf3d10c3643f7fe8a82102548e38025622129988 \
 dom/media/webrtc/jsapi/PeerConnectionImpl.cpp | sha256sum --check
cp AGENTS.md LICENSE "$evidence/"
git apply --check "$root/proxy-default-address.patch"
git apply "$root/proxy-default-address.patch"
cat > .mozconfig <<'MOZCONFIG'
ac_add_options --enable-project=mobile/android
ac_add_options --target=x86_64-linux-android
ac_add_options --disable-debug
ac_add_options --disable-debug-symbols
ac_add_options --disable-tests
ac_add_options --enable-optimize
mk_add_options MOZ_OBJDIR=@TOPSRCDIR@/obj-lyco
mk_add_options MOZ_MAKE_FLAGS=-j1
MOZCONFIG
cp .mozconfig "$evidence/mozconfig.txt"
run_phase bootstrap ./mach --no-interactive bootstrap --application-choice='GeckoView/Firefox for Android'
run_phase configure ./mach configure
run_phase compiler-config python3 - "$source_root" "$evidence" <<'PY'
import hashlib,json,re,sys
from pathlib import Path
source,evidence=map(Path,sys.argv[1:])
config=source/'obj-lyco/config/autoconf.mk'
raw=config.read_bytes()
substs=dict(re.findall(r'^([A-Z][A-Z0-9_]*)[ \t]*=[ \t]*(.*)$',raw.decode(),re.MULTILINE))
names=['MOZ_OPTIMIZE','MOZ_DEBUG','MOZ_DEBUG_SYMBOLS',
       'CARGO_PROFILE_RELEASE_OPT_LEVEL','CARGO_PROFILE_DEV_OPT_LEVEL',
       'MOZ_RUST_DEFAULT_FLAGS','MOZ_RUSTFLAGS_TARGET_COMMON','MOZ_RUSTFLAGS_TARGET_LTOABLE',
       'MOZ_RUSTFLAGS_CODEGEN','MOZ_RUSTFLAGS_AFTER_EXTRA',
       'RUST_LTO_ELIGIBLE','RUST_LIBRARY_LTO','MOZ_LTO_RUST_CROSS']
selected={name:substs.get(name,'') for name in names}
assert selected['MOZ_OPTIMIZE']=='1','Optimized native build must remain enabled'
assert selected['CARGO_PROFILE_RELEASE_OPT_LEVEL']=='2','Keep original optimized Rust level'
assert not selected['MOZ_DEBUG'] and not selected['MOZ_DEBUG_SYMBOLS'],'Debug mode/symbols must be disabled'
assert not any('debuginfo=2' in value for name,value in selected.items() if 'RUST' in name)
proof={'scope':'Actual configured compiler metadata only; no compilation/runtime proof',
       'autoconfMkSha256':hashlib.sha256(raw).hexdigest(),'selectedSubsts':selected,
       'optimizedBuildRetained':True,'debugSymbolsDisabled':True}
(evidence/'compiler-config.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps(proof))
PY
run_phase format ./mach format dom/media/webrtc/jsapi/PeerConnectionImpl.cpp
git diff --name-only > "$evidence/changed-files.txt"
git diff -- dom/media/webrtc/jsapi/PeerConnectionImpl.cpp > "$evidence/applied.patch"
cp dom/media/webrtc/jsapi/PeerConnectionImpl.cpp "$evidence/PeerConnectionImpl.cpp"
git diff --check
test "$(git diff --name-only)" = dom/media/webrtc/jsapi/PeerConnectionImpl.cpp
run_phase compile ./mach build
run_phase package ./mach package
run_phase archive ./mach android archive-geckoview
python3 - "$source_root" "$evidence" "$output" <<'PY'
import hashlib,json,os,shutil,sys,zipfile
from pathlib import Path
source,evidence,output=map(Path,sys.argv[1:])
found=[]
for path in (source/'obj-lyco').glob('**/outputs/aar/*release.aar'):
    with zipfile.ZipFile(path) as archive:
        if 'jni/x86_64/libxul.so' in archive.namelist():
            assert archive.testzip() is None
            found.append(path)
assert len(found)==1, f'Expected one native release AAR, found {len(found)}'
target=output/'geckoview-lyco-default-route-experiment.aar'
shutil.copy2(found[0],target)
def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
    return h.hexdigest()
proof={'source':os.environ['GITHUB_SHA'],'run':os.environ['GITHUB_RUN_ID'],
       'upstreamGitRevision':'9a2dc53c369c7ae5172018b35988e1d2ffeff402',
       'upstreamTag':'FIREFOX_159_0_RELEASE',
       'publishedMavenHgRevision':'5add844c26613d7e4d84c799d6e23cf987b1240d',
       'originalAffectedFileSha256':'918068eebc2080e170de43acbf3d10c3643f7fe8a82102548e38025622129988',
       'appliedPatchSha256':digest(evidence/'applied.patch'),
       'patchedFileSha256':digest(evidence/'PeerConnectionImpl.cpp'),
       'aarSha256':digest(target),'aarBytes':target.stat().st_size,'abi':'x86_64',
       'compiledNativeCode':True,'artifactBuild':False,'productAdopted':False,
       'scope':'Source-built engine experiment only; no native runtime/privacy acceptance or commercial release yet'}
(evidence/'RESULT.json').write_text(json.dumps(proof,indent=2)+'\n')
(output/'engine-build.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps(proof,indent=2))
PY
