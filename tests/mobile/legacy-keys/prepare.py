"""Derive an isolated owned-key fixture in Actions; never edit original gates."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

assert os.environ.get('GITHUB_ACTIONS') == 'true', 'Genuine Actions only'
repo = Path(__file__).resolve().parents[3]
pins = {
    'tests/workspace-routing-fixture.mjs': '0faa8ee565c486087f45305c256a34a57ef8428caf03b9ca2e3d722c089b1635',
    'tests/mobile/paid/fixture.mjs': '47218833693f7970b69566f108cc12e5b6ac641fc05c163a60e2d58c7ca56e12',
    'tests/mobile/paid/run-paid.sh': '4428660043c161bf7b2f320406ee4a5640e9470b6728c93eadc86b184a6b9767',
    '.github/workflows/build-universal.yml': '7330987595c6c504ce19a478f4388d02b47f7b0ee097d67c960405ed888faf99',
    'tests/mobile/paid/assert-evidence.py': '93a3afcdcd92e0446d47d4d8971249b7b34b50922e9d82f0b34618cff169c3fa',
    'tests/mobile/paid/inspect-edit.py': 'f01402a7a8027d29805008c090dd79eb893a9660b23a8c332e6aefaf4b738cec',
    'tests/mobile/paid/legacy-aaec002.json': 'f8ba59c01dd76525518e7d78027ca0b4d743464759d75774a67272c45103cbe0',
    'tests/mobile/paid/download-legacy.py': '7d036419a72756490d197686d4cdcc100dc48954888ab6c9d06297653e45b410',
}
sha = lambda data: hashlib.sha256(data).hexdigest()
for name, digest in pins.items():
    assert sha((repo / name).read_bytes()) == digest, 'Original input changed: ' + name
root = Path(os.environ['RUNNER_TEMP']) / 'lyco-legacy-key-overlay'
assert not root.exists(), 'Never overwrite an existing fixture preparation'
shutil.copytree(repo / 'tests', root / 'tests')
shutil.copytree(repo / 'apps/universal/src', root / 'apps/universal/src')
changes = []
def replace(name, before, after):
    target = root / name
    source = target.read_text()
    assert source.count(before) == 1, 'Exact preparation anchor changed: ' + name
    target.write_text(source.replace(before, after))
    changes.append({'path': name, 'before': before, 'after': after})

replace('tests/workspace-routing-fixture.mjs', 'visibleStatus=false,cookieMaxAge=600}={})',
        "visibleStatus=false,cookieMaxAge=600,profileKeyScript=''}={})")
replace('tests/workspace-routing-fixture.mjs', '  pageRequests.push({phase,route});',
        "  const seedNativeKey=Boolean(profileKeyScript)&&((phase==='paid-A'&&pageRequests.length===0&&route==='direct')"
        "||(phase==='paid-B'&&pageRequests.every(row=>row.phase!=='paid-B')));\n  pageRequests.push({phase,route});")
replace('tests/workspace-routing-fixture.mjs', "   const reported=await fetch('/report'",
        "   const keyEvidence=await (${profileKeyScript})(owner,phase,${seedNativeKey});\n   const reported=await fetch('/report'")
replace('tests/workspace-routing-fixture.mjs', 'JSON.stringify({phase,before,after})',
        'JSON.stringify({phase,before,after,keyEvidence})')
replace('tests/mobile/paid/fixture.mjs',
        "const routes=await createWorkspaceRoutingFixture({browserOriginHost:'10.0.2.2',indexedDB:true,visibleStatus:true,cookieMaxAge:3600});",
        "const profileKeyScript=await fs.readFile(new URL('../legacy-keys/owned-key.js',import.meta.url),'utf8');\n"
        "const routes=await createWorkspaceRoutingFixture({browserOriginHost:'127.0.0.1',indexedDB:true,visibleStatus:true,cookieMaxAge:3600,profileKeyScript});")
replace('tests/mobile/paid/run-paid.sh', 'adb wait-for-device\n',
        'adb wait-for-device\nkey_origin_port=$(python3 -c \'import json,sys;print(json.load(open(sys.argv[1]))["originPort"])\' "$evidence/fixture.json")\n'
        'adb reverse "tcp:$key_origin_port" "tcp:$key_origin_port"\n')
replace('tests/mobile/paid/run-paid.sh', '  adb shell settings put global http_proxy :0 >/dev/null 2>&1 || true\n',
        '  if [[ -n ${key_origin_port:-} ]]; then adb reverse --remove "tcp:$key_origin_port" >/dev/null 2>&1 || true; fi\n'
        '  adb shell settings put global http_proxy :0 >/dev/null 2>&1 || true\n')
replace('tests/mobile/paid/run-paid.sh', 'python3 "$root/assert-evidence.py" "$evidence"\n',
        'python3 "$root/assert-evidence.py" "$evidence"\npython3 "$root/../legacy-keys/assert-keys.py" "$evidence"\n')
replace('tests/mobile/paid/download-legacy.py',
        "assert current['event'] == 'workflow_dispatch' and current['path'] == run['path']",
        "assert current['event'] == 'workflow_dispatch' and current['path'] == '.github/workflows/android-legacy-keys.yml'")
for name in ['tests/mobile/paid/assert-evidence.py', 'tests/mobile/paid/inspect-edit.py', 'tests/mobile/paid/legacy-aaec002.json']:
    assert (root / name).read_bytes() == (repo / name).read_bytes()
for name, digest in pins.items():
    assert sha((repo / name).read_bytes()) == digest
record = {'run': os.environ['GITHUB_RUN_ID'], 'source': os.environ['GITHUB_SHA'],
          'testedCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip(),
          'originalPins': pins, 'replacements': changes,
          'generatedSourceSha256': {name: sha((root / name).read_bytes()) for name in sorted({x['path'] for x in changes})},
          'addedSourceSha256': {str(p.relative_to(repo)): sha(p.read_bytes()) for p in (repo / 'tests/mobile/legacy-keys').glob('*') if p.is_file()},
          'originalPaidAssertionsByteUnchanged': True, 'productOrEngineChanged': False,
          'nativeRuntimeProven': False, 'crossEngineMigrationProven': False}
assert record['testedCommit'] == os.environ['GITHUB_SHA']
evidence = Path(os.environ['RUNNER_TEMP']) / 'lyco-legacy-key-preparation'
evidence.mkdir()
(evidence / 'PREPARATION.json').write_text(json.dumps(record, indent=2) + '\n')
for name in sorted({x['path'] for x in changes}):
    for label, base in [('original', repo), ('generated', root)]:
        target = evidence / label / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(base / name, target)
for name in record['addedSourceSha256']:
    target = evidence / 'added' / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(repo / name, target)
print(json.dumps(record, indent=2))
