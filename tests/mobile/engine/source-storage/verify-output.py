"""Verify the actual compiled storage-policy archive, never runtime durability."""
from pathlib import Path
import hashlib
import json
import os
import struct
import zipfile

assert os.environ.get('GITHUB_ACTIONS') == 'true', 'Genuine Actions required'
root = Path(os.environ['RUNNER_TEMP'])
evidence = root / 'lyco-gecko-build-evidence'
output = root / 'lyco-gecko-build-output'
stage = root / 'lyco-gecko-storage-recipe'


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


recipe = json.loads((evidence / 'STORAGE-RECIPE.json').read_text())
for name, expected in recipe['generatedRecipeSha256'].items():
    assert sha(stage / name) == expected
assert recipe['source'] == os.environ['GITHUB_SHA'] and recipe['run'] == os.environ['GITHUB_RUN_ID']
changed = (evidence / 'changed-files.txt').read_text().splitlines()
assert len(changed) == 3 and set(changed) == set(recipe['upstreamChangedFiles'])
meta = json.loads((output / 'engine-build.json').read_text())
assert meta == json.loads((evidence / 'RESULT.json').read_text())
assert meta['source'] == recipe['source'] and meta['run'] == recipe['run']
assert meta['abi'] == 'x86_64' and meta['compiledNativeCode'] is True and meta['artifactBuild'] is False
assert meta['nativeOptimized'] is True and meta['nativeDebugSymbols'] is False
assert meta['gradlePublicationVariant'] == 'debug' and meta['publishedAarByteMatch'] is True
assert meta['appliedPatchSha256'] == '499192920a5ff49468f43004771176844341c666e27c15e330fe949ce8c91cb3'
assert meta['patchedFileSha256'] == 'c6d2bc5c2478612d393fdf7d664dbdb2225b3631ec2a6321eb88107493389764'
policy = meta['storageFlushPolicy']
assert policy['prefName'] == recipe['storagePreference'] == 'dom.storage.database.flushIntervalMs'
assert policy['defaultDelayMs'] == recipe['defaultDelayMs'] == 5000
assert policy['appliedPatchSha256'] == sha(evidence / 'storage-applied.patch')
assert set(policy['patchedSourceSha256']) == {
    'dom/localstorage/ActorsParent.cpp', 'modules/libpref/init/StaticPrefList.yaml'}
for relative, expected in policy['patchedSourceSha256'].items():
    assert sha(evidence / Path(relative).name) == expected
aar = output / 'geckoview-lyco-default-route-experiment.aar'
assert aar.stat().st_size == meta['aarBytes'] and sha(aar) == meta['aarSha256']
libraries = []
with zipfile.ZipFile(aar) as archive:
    assert archive.testzip() is None
    assert len(archive.namelist()) == len(set(archive.namelist()))
    assert 'classes.jar' in archive.namelist() and 'AndroidManifest.xml' in archive.namelist()
    assert 'jni/x86_64/libxul.so' in archive.namelist()
    for entry in archive.infolist():
        if not entry.filename.startswith('jni/') or entry.is_dir():
            continue
        assert entry.filename.startswith('jni/x86_64/') and entry.filename.endswith('.so')
        raw = archive.read(entry)
        assert raw[:6] == b'\x7fELF\x02\x01' and struct.unpack_from('<H', raw, 18)[0] == 62
        libraries.append({'path': entry.filename, 'bytes': len(raw),
                          'sha256': hashlib.sha256(raw).hexdigest(), 'elfClass': 64, 'elfMachine': 62})
assert len(libraries) == 13
assert json.loads((evidence / 'host-result.json').read_text())['exitCode'] == 0
meta.update(storageRecipe=recipe, nativeLibraries=libraries,
            actualElfArchitectureVerified=True, storageRuntimeProven=False,
            synchronousDiskFenceProven=False, productAdopted=False,
            scope='Actual optimized source-built storage-policy archive only; default5000ms retained. No runtime durability, ARM64, migration, product adoption or release proof')
for path in [output / 'engine-build.json', evidence / 'RESULT.json']:
    path.write_text(json.dumps(meta, indent=2) + '\n')
print(json.dumps({'aarSha256': meta['aarSha256'], 'nativeLibraryCount': len(libraries),
                  'storageRuntimeProven': False, 'productAdopted': False}))
