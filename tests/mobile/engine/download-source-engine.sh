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
 tests/mobile/engine/source/build-engine.sh tests/mobile/engine/source/build-host.py \
 tests/mobile/engine/source/proxy-default-address.patch
export LYCO_SOURCE_ENGINE_ARTIFACT_PREFIX=lyco-source-built-gecko-
if [[ "$LYCO_SOURCE_ENGINE_RUN" == 41940576338 ]]; then
 export LYCO_SOURCE_ENGINE_ARTIFACT_PREFIX=lyco-source-built-gecko-storage-
 git diff --exit-code "$source" HEAD -- .github/workflows/build-gecko-storage.yml \
  tests/mobile/engine/source-storage/prepare.py tests/mobile/engine/source-storage/verify-output.py \
  tests/mobile/engine/source-storage/database-flush-delay.patch
fi
gh api "repos/$GITHUB_REPOSITORY/actions/runs/$LYCO_SOURCE_ENGINE_RUN/artifacts" > "$stage/artifacts.json"
artifact=$(python3 - "$stage/artifacts.json" "$LYCO_SOURCE_ENGINE_RUN" <<'PY'
import json,os,sys
items=[a for a in json.load(open(sys.argv[1]))['artifacts'] if a['name']==os.environ['LYCO_SOURCE_ENGINE_ARTIFACT_PREFIX']+sys.argv[2] and not a['expired']]
assert len(items)==1 and 0<items[0]['size_in_bytes']<2*1024**3
print(items[0]['id'])
PY
)
gh api "repos/$GITHUB_REPOSITORY/actions/artifacts/$artifact/zip" > "$stage/artifact.zip"
python3 - "$stage" "$evidence" <<'PY'
import hashlib,io,json,os,struct,sys,urllib.request,xml.etree.ElementTree as ET,zipfile
from pathlib import Path
stage,evidence=map(Path,sys.argv[1:])
def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
run=json.loads((stage/'run.json').read_text())
entry,=[a for a in json.loads((stage/'artifacts.json').read_text())['artifacts'] if a['name']==os.environ['LYCO_SOURCE_ENGINE_ARTIFACT_PREFIX']+str(run['id']) and not a['expired']]
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
assert meta['gradlePublicationVariant']=='debug' and meta['publishedAarByteMatch'] is True
assert meta['nativeOptimized'] is True and meta['nativeDebugSymbols'] is False
storage_policy = run['id'] == 41940576338
if storage_policy:
    assert run['head_sha']=='937bde85220b19a1433ff772b5f0b1a17238b4fc'
    assert meta['appliedPatchSha256']=='499192920a5ff49468f43004771176844341c666e27c15e330fe949ce8c91cb3'
    assert meta['patchedFileSha256']=='c6d2bc5c2478612d393fdf7d664dbdb2225b3631ec2a6321eb88107493389764'
    assert meta['actualElfArchitectureVerified'] is True and meta['storageRuntimeProven'] is False
    assert meta['synchronousDiskFenceProven'] is False
    recipe=meta['storageRecipe'];policy=meta['storageFlushPolicy']
    assert recipe['run']==str(run['id']) and recipe['source']==run['head_sha']
    assert recipe['baseCompiledRun']==41772782539
    assert recipe['storagePreference']==policy['prefName']=='dom.storage.database.flushIntervalMs'
    assert recipe['defaultDelayMs']==policy['defaultDelayMs']==5000
    assert not any(recipe[k] for k in ['baseFilesModified','routePatchChanged','resourcePolicyChanged','nativeOptimizationChanged','storageFormatChanged','nativeRuntimeProven','productAdopted'])
    assert set(recipe['upstreamChangedFiles'])=={'dom/media/webrtc/jsapi/PeerConnectionImpl.cpp','dom/localstorage/ActorsParent.cpp','modules/libpref/init/StaticPrefList.yaml'}
    assert recipe['baseRecipeSha256']['tests/mobile/engine/source-storage/database-flush-delay.patch']=='c57f5614a151eb0edce49d357def7711e06fdb816a77ce13581472cd17e6073b'
    assert policy['originalSourceSha256']=={
        'dom/localstorage/ActorsParent.cpp':'0df7a7d47a7f514d6978c618f972f44e277f5672acb780b45c89e32d8c7087b5',
        'modules/libpref/init/StaticPrefList.yaml':'d52399cc74e28bb91ec40cc83b57834ce6127452635a8d2a3e3e60a7af2fe330'}
    assert policy['nativeRuntimeProven'] is False and policy['synchronousDiskFenceProven'] is False
aar=stage/'compiled/geckoview-lyco-default-route-experiment.aar'
assert aar.stat().st_size==meta['aarBytes'] and digest(aar)==meta['aarSha256']
with zipfile.ZipFile(aar) as archive:
    assert 'jni/x86_64/libxul.so' in archive.namelist()
    assert archive.testzip() is None
    if storage_policy:
        assert len(archive.namelist())==len(set(archive.namelist()))
        with zipfile.ZipFile(io.BytesIO(archive.read('classes.jar'))) as classes:
            assert classes.testzip() is None
        expected={row['path']:row for row in meta['nativeLibraries']}
        names={i.filename for i in archive.infolist() if i.filename.startswith('jni/') and not i.is_dir()}
        assert len(expected)==len(meta['nativeLibraries'])==13 and names==set(expected)
        for name in names:
            raw=archive.read(name);row=expected[name]
            assert name.startswith('jni/x86_64/') and name.endswith('.so')
            assert len(raw)==row['bytes'] and hashlib.sha256(raw).hexdigest()==row['sha256']
            assert row['elfClass']==64
            assert raw[:6]==b'\x7fELF\x02\x01' and struct.unpack_from('<H',raw,18)[0]==row['elfMachine']==62
# Keep the published dependency graph, replacing only the actual engine AAR.
url='https://maven.mozilla.org/maven2/org/mozilla/geckoview/geckoview/159.0.20261022150525/geckoview-159.0.20261022150525.pom'
with urllib.request.urlopen(url,timeout=60) as response:pom=response.read(1024*1024)
assert hashlib.sha256(pom).hexdigest()=='760b60b556283f897c7258b04bf314f9c02cc5de26845d569c6d7a42d99d8c76'
(evidence/'source-engine-original.pom').write_bytes(pom)
ns='{http://maven.apache.org/POM/4.0.0}';tree=ET.fromstring(pom)
# Maven expects an unprefixed project root with the POM default namespace.
# Preserve every dependency and attribute while avoiding ElementTree's ns0 prefix.
ET.register_namespace('',ns[1:-1])
ET.register_namespace('xsi','http://www.w3.org/2001/XMLSchema-instance')
for key,value in [('groupId','top.lain42.experimental'),('artifactId','geckoview-source'),('version','159.0-route-experiment')]:
    tree.find(ns+key).text=value
repository=stage/'maven';module=repository/'top/lain42/experimental/geckoview-source/159.0-route-experiment'
module.mkdir(parents=True)
target=module/'geckoview-source-159.0-route-experiment.aar';aar.replace(target)
transformed=module/'geckoview-source-159.0-route-experiment.pom'
ET.ElementTree(tree).write(transformed,encoding='utf-8',xml_declaration=True)
assert b'<project ' in transformed.read_bytes() and b'<ns0:project' not in transformed.read_bytes()
assert ET.tostring(ET.fromstring(pom).find(ns+'dependencies'))==ET.tostring(ET.parse(transformed).getroot().find(ns+'dependencies'))
(evidence/'source-engine-consumer.pom').write_bytes(transformed.read_bytes())
(evidence/'source-engine-build.json').write_text(json.dumps(meta,indent=2)+'\n')
(evidence/'source-engine-artifact.json').write_text(json.dumps(entry,indent=2)+'\n')
with open(os.environ['GITHUB_ENV'],'a') as output:
    output.write('LYCO_ENGINE_MAVEN_ROOT='+str(repository)+'\n')
    output.write('LYCO_ENGINE_AAR='+str(target)+'\n')
    output.write('LYCO_ENGINE_BUILD_METADATA='+str(evidence/'source-engine-build.json')+'\n')
print(json.dumps({'run':run['id'],'source':run['head_sha'],'aarSha256':meta['aarSha256'],'nativeSourceUnchanged':True,'productAdopted':False}))
PY
