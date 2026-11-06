#!/usr/bin/env bash
set -euo pipefail
[[ ${GITHUB_ACTIONS:-} == true ]] || exit 2
[[ "$LYCO_NETWORK_CANDIDATE_RUN" =~ ^[0-9]{5,20}$ ]]
gh run watch "$LYCO_NETWORK_CANDIDATE_RUN" -R "$GITHUB_REPOSITORY" --interval 30 --exit-status
gh api "repos/$GITHUB_REPOSITORY/actions/runs/$LYCO_NETWORK_CANDIDATE_RUN" > "$RUNNER_TEMP/lyco-network-source-run.json"
source=$(python3 -c 'import json,sys;r=json.load(open(sys.argv[1]));assert r["conclusion"]=="success";print(r["head_sha"])' "$RUNNER_TEMP/lyco-network-source-run.json")
git fetch --no-tags origin "$source"
git diff --exit-code "$source" HEAD -- apps/universal mobile/core src/product-version.js
mkdir -p "$RUNNER_TEMP/lyco-network-candidate" "$RUNNER_TEMP/lyco-mobile-network"
gh run download "$LYCO_NETWORK_CANDIDATE_RUN" -R "$GITHUB_REPOSITORY" -n "lyco-android-candidate-$LYCO_NETWORK_CANDIDATE_RUN" -D "$RUNNER_TEMP/lyco-network-candidate"
(cd "$RUNNER_TEMP/lyco-network-candidate" && sha256sum -c ANDROID-SHA256SUMS.txt)
signer=$(find "$ANDROID_HOME/build-tools" -name apksigner -type f | sort -V | tail -1)
apk="$RUNNER_TEMP/lyco-network-candidate/LYCO-Browser-Android-preview.apk"
"$signer" verify --verbose --print-certs "$apk" > "$RUNNER_TEMP/lyco-mobile-network/candidate-signature.txt"
LYCO_REQUIRE_RELEASE_SIGNATURE=true python3 apps/universal/scripts/verify-android-signature.py "$RUNNER_TEMP/lyco-mobile-network/candidate-signature.txt" resources/signing/android-release-certificate.pem
python3 - <<'PY'
import hashlib,json,os
from pathlib import Path
p=Path(os.environ['RUNNER_TEMP']);run=json.loads((p/'lyco-network-source-run.json').read_text())
meta=json.loads((p/'lyco-network-candidate/ANDROID-VERSION-PROVENANCE.json').read_text())
assert meta['commit']==run['head_sha'] and meta['run']==str(run['id'])
with (p/'lyco-network-candidate/LYCO-Browser-Android-preview.apk').open('rb') as f:digest=hashlib.file_digest(f,'sha256').hexdigest()
(p/'lyco-mobile-network/candidate.json').write_text(json.dumps({'run':run['id'],'source':run['head_sha'],'sha256':digest,'runtimeSourceDiff':'empty','apkModified':False,'certificate':'retained-owner-certificate'},indent=2))
PY
echo "LYCO_CANDIDATE_APK=$apk" >> "$GITHUB_ENV"
