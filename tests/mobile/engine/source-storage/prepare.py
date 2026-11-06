"""Derive an isolated storage-policy build from the immutable tested recipe."""
from pathlib import Path
import hashlib
import json
import os

assert os.environ.get('GITHUB_ACTIONS') == 'true', 'Genuine Actions required'
assert os.environ['GITHUB_EVENT_NAME'] == 'workflow_dispatch'
inputs = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())['inputs']
assert str(inputs.get('source_engine_build')).lower() == 'true'
assert str(inputs.get('native_engine_storage')).lower() == 'true'
assert inputs.get('source_engine_abi', 'x86_64') == 'x86_64'
assert not inputs.get('native_engine_source_run')
for name in ['native_engine_probe', 'signed_android', 'ios_device', 'native_engine_cookie_flush']:
    assert str(inputs.get(name, 'false')).lower() == 'false'
for name in ['paid_routes_candidate', 'network_probe_candidate']:
    assert not inputs.get(name)

repo = Path(os.environ['GITHUB_WORKSPACE'])
stage = Path(os.environ['RUNNER_TEMP']) / 'lyco-gecko-storage-recipe'
evidence = Path(os.environ['RUNNER_TEMP']) / 'lyco-gecko-build-evidence'
stage.mkdir()
evidence.mkdir(exist_ok=True)
pins = {
    '.github/workflows/build-gecko-experiment.yml': '8a96177594e5756c146a89740cce2858d13a65e8d4b5922dac410c416cab4000',
    'tests/mobile/engine/source/build-engine.sh': '976db526d07f8c69a28495c214321b332030365ec298c3e1133b981deb6612d0',
    'tests/mobile/engine/source/build-host.py': 'd32a57906e3ed3838b7155581387e325a08dacb94f5f9a5b8313ed0647eae08b',
    'tests/mobile/engine/source/proxy-default-address.patch': '7797f2c90e03fc0af71b848b45cc3caa37df9b4fe05c9048c48529987b1addd8',
    'tests/mobile/engine/source-storage/database-flush-delay.patch': 'c57f5614a151eb0edce49d357def7711e06fdb816a77ce13581472cd17e6073b',
}
originals = {}
for relative, expected in pins.items():
    raw = (repo / relative).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == expected, 'Bound recipe changed: ' + relative
    originals[relative] = raw
    (evidence / ('base-' + Path(relative).name)).write_bytes(raw)

source_checks = '''printf '%s  %s\\n' \\
  0df7a7d47a7f514d6978c618f972f44e277f5672acb780b45c89e32d8c7087b5 dom/localstorage/ActorsParent.cpp \\
  d52399cc74e28bb91ec40cc83b57834ce6127452635a8d2a3e3e60a7af2fe330 modules/libpref/init/StaticPrefList.yaml | sha256sum --check
git apply --check "$root/database-flush-delay.patch"
git apply "$root/database-flush-delay.patch"
'''
storage_evidence = '''git diff -- dom/localstorage/ActorsParent.cpp modules/libpref/init/StaticPrefList.yaml > "$evidence/storage-applied.patch"
cp dom/localstorage/ActorsParent.cpp "$evidence/ActorsParent.cpp"
cp modules/libpref/init/StaticPrefList.yaml "$evidence/StaticPrefList.yaml"
'''
source_allowlist = '''python3 - "$evidence/changed-files.txt" <<'PY_CHANGED'
from pathlib import Path
import sys
changed = Path(sys.argv[1]).read_text().splitlines()
assert len(changed) == 3 and set(changed) == {
    'dom/media/webrtc/jsapi/PeerConnectionImpl.cpp',
    'dom/localstorage/ActorsParent.cpp', 'modules/libpref/init/StaticPrefList.yaml'}
PY_CHANGED
'''
storage_metadata = '''       'storageFlushPolicy':{
           'prefName':'dom.storage.database.flushIntervalMs','defaultDelayMs':5000,
           'originalSourceSha256':{
               'dom/localstorage/ActorsParent.cpp':'0df7a7d47a7f514d6978c618f972f44e277f5672acb780b45c89e32d8c7087b5',
               'modules/libpref/init/StaticPrefList.yaml':'d52399cc74e28bb91ec40cc83b57834ce6127452635a8d2a3e3e60a7af2fe330'},
           'patchedSourceSha256':{
               'dom/localstorage/ActorsParent.cpp':digest(evidence/'ActorsParent.cpp'),
               'modules/libpref/init/StaticPrefList.yaml':digest(evidence/'StaticPrefList.yaml')},
           'appliedPatchSha256':digest(evidence/'storage-applied.patch'),
           'synchronousDiskFenceProven':False,'nativeRuntimeProven':False},
'''
marker = "       'compiledNativeCode':True,'artifactBuild':False,'productAdopted':False,\n"
changes = [
    ('git apply "$root/proxy-default-address.patch"\n',
     'git apply "$root/proxy-default-address.patch"\n' + source_checks),
    ('run_phase format ./mach format dom/media/webrtc/jsapi/PeerConnectionImpl.cpp\n',
     'run_phase format ./mach format --skip-android dom/media/webrtc/jsapi/PeerConnectionImpl.cpp dom/localstorage/ActorsParent.cpp modules/libpref/init/StaticPrefList.yaml\n'),
    ('cp dom/media/webrtc/jsapi/PeerConnectionImpl.cpp "$evidence/PeerConnectionImpl.cpp"\n',
     'cp dom/media/webrtc/jsapi/PeerConnectionImpl.cpp "$evidence/PeerConnectionImpl.cpp"\n' + storage_evidence),
    ('test "$(git diff --name-only)" = dom/media/webrtc/jsapi/PeerConnectionImpl.cpp\n', source_allowlist),
    (marker, marker + storage_metadata),
]
source = originals['tests/mobile/engine/source/build-engine.sh'].decode()
for before, after in changes:
    assert source.count(before) == 1, 'Storage recipe transform is no longer exact'
    source = source.replace(before, after)
(stage / 'build-engine.sh').write_text(source)
for name in ['build-host.py', 'proxy-default-address.patch']:
    (stage / name).write_bytes(originals['tests/mobile/engine/source/' + name])
(stage / 'database-flush-delay.patch').write_bytes(
    originals['tests/mobile/engine/source-storage/database-flush-delay.patch'])
generated = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in stage.iterdir()}
for path in stage.iterdir():
    (evidence / ('generated-' + path.name)).write_bytes(path.read_bytes())
proof = {
    'run': os.environ['GITHUB_RUN_ID'], 'source': os.environ['GITHUB_SHA'],
    'baseRecipeCommit': '69110444d0742c231f55f0b1ccd489fa9fac2bdb',
    'baseCompiledRun': 41772782539, 'normalCloseReference': 41873067393,
    'cookieBufferReference': 41875833193,
    'baseRecipeSha256': pins, 'generatedRecipeSha256': generated,
    'replacements': [{'before': a, 'after': b, 'count': 1} for a, b in changes],
    'architecture': 'x86_64', 'storagePreference': 'dom.storage.database.flushIntervalMs',
    'defaultDelayMs': 5000,
    'upstreamChangedFiles': ['dom/media/webrtc/jsapi/PeerConnectionImpl.cpp',
                             'dom/localstorage/ActorsParent.cpp', 'modules/libpref/init/StaticPrefList.yaml'],
    'baseFilesModified': False, 'routePatchChanged': False,
    'resourcePolicyChanged': False, 'nativeOptimizationChanged': False,
    'storageFormatChanged': False, 'synchronousDiskFenceProven': False,
    'nativeRuntimeProven': False, 'productAdopted': False,
}
(evidence / 'STORAGE-RECIPE.json').write_text(json.dumps(proof, indent=2) + '\n')
print(json.dumps(proof))
