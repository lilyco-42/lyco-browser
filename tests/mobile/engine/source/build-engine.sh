#!/usr/bin/env bash
set -euo pipefail
[[ ${GITHUB_ACTIONS:-} == true ]] || exit 2
root=$(cd "$(dirname "$0")" && pwd)
source_root="$RUNNER_TEMP/lyco-gecko-source"
evidence="$RUNNER_TEMP/lyco-gecko-build-evidence"
output="$RUNNER_TEMP/lyco-gecko-build-output"
mkdir -p "$evidence" "$output"
export MOZBUILD_STATE_PATH="$RUNNER_TEMP/lyco-mozbuild"
export CARGO_BUILD_JOBS=2
git clone --depth=1 --branch FIREFOX_159_0_RELEASE --single-branch \
 https://github.com/mozilla-firefox/firefox.git "$source_root" > "$evidence/checkout.log" 2>&1
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
ac_add_options --disable-tests
ac_add_options --enable-optimize
mk_add_options MOZ_OBJDIR=@TOPSRCDIR@/obj-lyco
mk_add_options MOZ_MAKE_FLAGS=-j2
MOZCONFIG
cp .mozconfig "$evidence/mozconfig.txt"
if ! ./mach --no-interactive bootstrap --application-choice='GeckoView/Firefox for Android' > "$evidence/bootstrap.log" 2>&1; then
 tail -n 100 "$evidence/bootstrap.log"
 exit 1
fi
if ! ./mach format dom/media/webrtc/jsapi/PeerConnectionImpl.cpp > "$evidence/format.log" 2>&1; then
 tail -n 100 "$evidence/format.log"
 exit 1
fi
git diff --name-only > "$evidence/changed-files.txt"
git diff -- dom/media/webrtc/jsapi/PeerConnectionImpl.cpp > "$evidence/applied.patch"
cp dom/media/webrtc/jsapi/PeerConnectionImpl.cpp "$evidence/PeerConnectionImpl.cpp"
git diff --check
test "$(git diff --name-only)" = dom/media/webrtc/jsapi/PeerConnectionImpl.cpp
if ! ./mach build > "$evidence/compile.log" 2>&1; then
 tail -n 120 "$evidence/compile.log"
 exit 1
fi
if ! ./mach package > "$evidence/package.log" 2>&1; then
 tail -n 100 "$evidence/package.log"
 exit 1
fi
if ! ./mach android archive-geckoview > "$evidence/archive.log" 2>&1; then
 tail -n 100 "$evidence/archive.log"
 exit 1
fi
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
