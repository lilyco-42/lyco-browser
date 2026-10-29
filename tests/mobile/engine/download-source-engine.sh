#!/usr/bin/env bash
set -euo pipefail
[[ ${GITHUB_ACTIONS:-} == true ]] || exit 2
[[ "$LYCO_SOURCE_ENGINE_RUN" =~ ^[0-9]{5,20}$ ]]
stage="$RUNNER_TEMP/lyco-source-engine"
evidence="$RUNNER_TEMP/lyco-mobile-network"
mkdir -p "$stage" "$evidence"
gh api "repos/$GITHUB_REPOSITORY/actions/runs/$LYCO_SOURCE_ENGINE_RUN" > "$stage/run.json"
source=$(python3 - "$stage/run.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]))
assert r['status']=='completed' and r['conclusion']=='success', 'Source build must be successfully completed'
assert r['event']=='workflow_dispatch' and r['path']=='.github/workflows/build-universal.yml'
print(r['head_sha'])
PY
)
git fetch --no-tags origin "$source"
git diff --exit-code "$source" HEAD -- .github/workflows/build-gecko-experiment.yml \
 tests/mobile/engine/source/build-engine.sh tests/mobile/engine/source/proxy-default-address.patch
gh api "repos/$GITHUB_REPOSITORY/actions/runs/$LYCO_SOURCE_ENGINE_RUN/artifacts" > "$stage/artifacts.json"
artifact=$(python3 - "$stage/artifacts.json" "$LYCO_SOURCE_ENGINE_RUN" <<'PY'
import json,sys
items=[a for a in json.load(open(sys.argv[1]))['artifacts'] if a['name']=='lyco-source-built-gecko-'+sys.argv[2] and not a['expired']]
assert len(items)==1 and 0<items[0]['size_in_bytes']<2*1024**3
print(items[0]['id'])
PY
)
gh api "repos/$GITHUB_REPOSITORY/actions/artifacts/$artifact/zip" > "$stage/artifact.zip"
python3 - "$stage" "$evidence" <<'PY'
import hashlib,json,os,sys,urllib.request,xml.etree.ElementTree as ET,zipfile
from pathlib import Path
stage,evidence=map(Path,sys.argv[1:])
def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
run=json.loads((stage/'run.json').read_text())
entry,=[a for a in json.loads((stage/'artifacts.json').read_text())['artifacts'] if a['name']=='lyco-source-built-gecko-'+str(run['id']) and not a['expired']]
assert (stage/'artifact.zip').stat().st_size==entry['size_in_bytes']
assert 'sha256:'+digest(stage/'artifact.zip')==entry['digest'], 'Original artifact differs'
with zipfile.ZipFile(stage/'artifact.zip') as archive:
    assert set(archive.namelist())=={'engine-build.json','geckoview-lyco-default-route-experiment.aar'}
    assert archive.testzip() is None
    archive.extractall(stage/'compiled')
meta=json.loads((stage/'compiled/engine-build.json').read_text())
assert meta['source']==run['head_sha'] and str(meta['run'])==str(run['id'])
assert meta['upstreamGitRevision']=='9a2dc53c369c7ae5172018b35988e1d2ffeff402'
assert meta['publishedMavenHgRevision']=='5add844c26613d7e4d84c799d6e23cf987b1240d'
assert meta['originalAffectedFileSha256']=='918068eebc2080e170de43acbf3d10c3643f7fe8a82102548e38025622129988'
assert meta['compiledNativeCode'] is True and meta['artifactBuild'] is False and meta['productAdopted'] is False and meta['abi']=='x86_64'
aar=stage/'compiled/geckoview-lyco-default-route-experiment.aar'
assert aar.stat().st_size==meta['aarBytes'] and digest(aar)==meta['aarSha256']
with zipfile.ZipFile(aar) as archive:
    assert 'jni/x86_64/libxul.so' in archive.namelist()
    assert archive.testzip() is None
# Keep the published dependency graph, replacing only the actual engine AAR.
url='https://maven.mozilla.org/maven2/org/mozilla/geckoview/geckoview/159.0.20261022150525/geckoview-159.0.20261022150525.pom'
with urllib.request.urlopen(url,timeout=60) as response:pom=response.read(1024*1024)
assert hashlib.sha256(pom).hexdigest()=='760b60b556283f897c7258b04bf314f9c02cc5de26845d569c6d7a42d99d8c76'
(evidence/'source-engine-original.pom').write_bytes(pom)
ns='{http://maven.apache.org/POM/4.0.0}';tree=ET.fromstring(pom)
for key,value in [('groupId','top.lain42.experimental'),('artifactId','geckoview-source'),('version','159.0-route-experiment')]:
    tree.find(ns+key).text=value
repository=stage/'maven';module=repository/'top/lain42/experimental/geckoview-source/159.0-route-experiment'
module.mkdir(parents=True)
target=module/'geckoview-source-159.0-route-experiment.aar';aar.replace(target)
ET.ElementTree(tree).write(module/'geckoview-source-159.0-route-experiment.pom',encoding='utf-8',xml_declaration=True)
(evidence/'source-engine-build.json').write_text(json.dumps(meta,indent=2)+'\n')
(evidence/'source-engine-artifact.json').write_text(json.dumps(entry,indent=2)+'\n')
with open(os.environ['GITHUB_ENV'],'a') as output:
    output.write('LYCO_ENGINE_MAVEN_ROOT='+str(repository)+'\n')
    output.write('LYCO_ENGINE_AAR='+str(target)+'\n')
    output.write('LYCO_ENGINE_BUILD_METADATA='+str(evidence/'source-engine-build.json')+'\n')
print(json.dumps({'run':run['id'],'source':run['head_sha'],'aarSha256':meta['aarSha256'],'nativeSourceUnchanged':True,'productAdopted':False}))
PY
