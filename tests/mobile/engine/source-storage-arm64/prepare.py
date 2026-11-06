"""Compose the verified storage recipe with an exact ARM64 target in Actions."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys

assert os.environ.get('GITHUB_ACTIONS') == 'true', 'Genuine Actions required'
assert os.environ['GITHUB_EVENT_NAME'] in ('pull_request', 'workflow_dispatch')
assert '/.github/workflows/gecko-storage-arm64.yml@' in os.environ['GITHUB_WORKFLOW_REF']
repo = Path(os.environ['GITHUB_WORKSPACE'])
temporary = Path(os.environ['RUNNER_TEMP'])
evidence = temporary / 'lyco-gecko-build-evidence'
evidence.mkdir(exist_ok=True)
stage = temporary / 'lyco-gecko-storage-recipe'
assert not stage.exists(), 'Never mix or replace a prepared build'
pins = {
    'tests/mobile/engine/source-storage/prepare.py': 'ef99059f732f983354e7314c1bdd14efd540dff3ff25bc54e30a83b168b4086d',
    'tests/mobile/engine/source-storage/verify-output.py': 'd5ca608feb273935cdc43a04c9e1cde31436f636758afe2948650bc795769daa',
    '.github/workflows/build-gecko-storage.yml': 'f2f6dfa2a45985a42dc49c28fceb3ff8cf7afcc45aa2e20c78c9c384ffa7f1f1',
    'tests/mobile/engine/source-arm64/prepare.py': '9a82f7ec0aafc4fd504b2068135813251dc1e297104e0c354731db71903f2389',
}
sha = lambda raw: hashlib.sha256(raw).hexdigest()
for name, expected in pins.items():
    raw = (repo / name).read_bytes()
    assert sha(raw) == expected, 'Verified input changed: ' + name
    (evidence / ('arm64-base-' + Path(name).parent.name + '-' + Path(name).name)).write_bytes(raw)

# Replace only the caller-input guard in a private copy. The real event and
# workflow stay unchanged; the original source file is never edited or run
# under a fabricated Actions environment.
source = (repo / 'tests/mobile/engine/source-storage/prepare.py').read_text()
start = source.index("assert os.environ['GITHUB_EVENT_NAME']")
end = source.index("repo = Path(os.environ['GITHUB_WORKSPACE'])")
original_guard = source[start:end]
new_guard = "assert os.environ['GITHUB_EVENT_NAME'] in ('pull_request', 'workflow_dispatch')\n" \
            "assert '/.github/workflows/gecko-storage-arm64.yml@' in os.environ['GITHUB_WORKFLOW_REF']\n\n"
derived = temporary / 'lyco-gecko-storage-arm64-prepare.py'
derived.write_text(source[:start] + new_guard + source[end:])
subprocess.run([sys.executable, str(derived)], check=True)
recipe_path = evidence / 'STORAGE-RECIPE.json'
recipe = json.loads(recipe_path.read_text())
expected_x86 = {
    'build-engine.sh': '545c38f56e47f6d2ea9ab7c4c050963553456309a74bf9a42e98e4f25c9cc0ad',
    'build-host.py': 'd32a57906e3ed3838b7155581387e325a08dacb94f5f9a5b8313ed0647eae08b',
    'proxy-default-address.patch': '7797f2c90e03fc0af71b848b45cc3caa37df9b4fe05c9048c48529987b1addd8',
    'database-flush-delay.patch': 'c57f5614a151eb0edce49d357def7711e06fdb816a77ce13581472cd17e6073b',
}
assert recipe['generatedRecipeSha256'] == expected_x86
for name, expected in expected_x86.items():
    assert sha((stage / name).read_bytes()) == expected
(evidence / 'STORAGE-X86-REFERENCE-RECIPE.json').write_bytes(recipe_path.read_bytes())
changes = [('--target=x86_64-linux-android', '--target=aarch64-linux-android', 1),
           ('jni/x86_64/', 'jni/arm64-v8a/', 2),
           ("'abi':'x86_64'", "'abi':'arm64-v8a'", 1)]
source = (stage / 'build-engine.sh').read_text()
for before, after, count in changes:
    assert source.count(before) == count, 'Architecture transform changed'
    source = source.replace(before, after)
assert 'x86_64' not in source
(stage / 'build-engine.sh').write_text(source)
recipe.update(architecture='arm64-v8a', target='aarch64-linux-android',
              storageSourceReferenceRun=41940576338,
              storageRuntimeReferenceRun=41966583355, rtcRuntimeReferenceRun=41968477892,
              arm64ArchitectureReplacements=[{'before': a, 'after': b, 'count': c} for a, b, c in changes],
              generatedRecipeSha256={name: sha((stage / name).read_bytes()) for name in expected_x86},
              arm64RuntimeProven=False, productAdopted=False)
recipe_path.write_text(json.dumps(recipe, indent=2) + '\n')
for name in expected_x86:
    (evidence / ('generated-' + name)).write_bytes((stage / name).read_bytes())

verify = (repo / 'tests/mobile/engine/source-storage/verify-output.py').read_text()
verify_changes = [
    ("meta['abi'] == 'x86_64'", "meta['abi'] == 'arm64-v8a'", 1),
    ('jni/x86_64/', 'jni/arm64-v8a/', 2),
    ("struct.unpack_from('<H', raw, 18)[0] == 62", "struct.unpack_from('<H', raw, 18)[0] == 183", 1),
    ("'elfMachine': 62", "'elfMachine': 183", 1),
    ('actualElfArchitectureVerified=True, storageRuntimeProven=False,',
     'actualElfArchitectureVerified=True, storageRuntimeProven=False, arm64RuntimeProven=False,', 1),
    ('No runtime durability, ARM64, migration,', 'No ARM64 runtime durability, migration,', 1),
    ("aar = output / 'geckoview-lyco-default-route-experiment.aar'",
     "assert recipe['architecture'] == 'arm64-v8a'\n"
     "assert policy['appliedPatchSha256'] == '85b220f4cba7e5e16ca898b19e7fe90a459744e351d2458da43e70207b7231e1'\n"
     "assert policy['patchedSourceSha256'] == {\n"
     "    'dom/localstorage/ActorsParent.cpp': '492a133abda69287bc0d9a4ed458013cbee83aba4649755cb90f357fa1b184d6',\n"
     "    'modules/libpref/init/StaticPrefList.yaml': '2b84754052ee706f524f8f0c8f636ce695b0a604fb398fd85a6d644beec9eccf'}\n"
     "aar = output / 'geckoview-lyco-default-route-experiment.aar'", 1),
]
for before, after, count in verify_changes:
    assert verify.count(before) == count, 'Verifier transform changed'
    verify = verify.replace(before, after)
verifier = temporary / 'lyco-gecko-storage-arm64-verify.py'
verifier.write_text(verify)
proof = {'run': os.environ['GITHUB_RUN_ID'], 'source': os.environ['GITHUB_SHA'],
         'originalPins': pins, 'originalCallerGuard': original_guard, 'derivedCallerGuard': new_guard,
         'derivedPrepareSha256': sha(derived.read_bytes()), 'verifiedX86RecipeHashes': expected_x86,
         'architectureReplacements': recipe['arm64ArchitectureReplacements'],
         'generatedRecipeSha256': recipe['generatedRecipeSha256'],
         'verifierReplacements': [{'before': a, 'after': b, 'count': c} for a, b, c in verify_changes],
         'derivedVerifierSha256': sha(verifier.read_bytes()), 'originalQueuedArm64RunPreserved': 41812206227,
         'originalFilesModified': False, 'storageOrRtcSourcePatchChanged': False,
         'nativeOptimizationOrResourceGatesChanged': False, 'exact13LibraryGateRetained': True,
         'compiledArchiveProven': False, 'arm64RuntimeProven': False, 'productAdopted': False}
(evidence / 'ARM64-STORAGE-RECIPE.json').write_text(json.dumps(proof, indent=2) + '\n')
(evidence / 'derived-arm64-prepare.py').write_bytes(derived.read_bytes())
(evidence / 'derived-arm64-verify.py').write_bytes(verifier.read_bytes())
for name, expected in pins.items():
    assert sha((repo / name).read_bytes()) == expected
print(json.dumps(proof, indent=2))
