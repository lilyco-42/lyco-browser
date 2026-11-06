"""Derive only the ARM64 target from the immutable, runtime-tested x86 recipe."""
from pathlib import Path
import hashlib
import json
import os

assert os.environ.get('GITHUB_ACTIONS') == 'true', 'Genuine Actions required'
repo = Path(os.environ['GITHUB_WORKSPACE'])
stage = Path(os.environ['RUNNER_TEMP']) / 'lyco-gecko-arm64-recipe'
evidence = Path(os.environ['RUNNER_TEMP']) / 'lyco-gecko-build-evidence'
stage.mkdir()
evidence.mkdir(exist_ok=True)
pins = {
    '.github/workflows/build-gecko-experiment.yml': '8a96177594e5756c146a89740cce2858d13a65e8d4b5922dac410c416cab4000',
    'tests/mobile/engine/source/build-engine.sh': '976db526d07f8c69a28495c214321b332030365ec298c3e1133b981deb6612d0',
    'tests/mobile/engine/source/build-host.py': 'd32a57906e3ed3838b7155581387e325a08dacb94f5f9a5b8313ed0647eae08b',
    'tests/mobile/engine/source/proxy-default-address.patch': '7797f2c90e03fc0af71b848b45cc3caa37df9b4fe05c9048c48529987b1addd8',
}
originals = {}
for relative, expected in pins.items():
    raw = (repo / relative).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == expected, 'Tested base recipe changed: ' + relative
    originals[relative] = raw
    (evidence / ('base-' + Path(relative).name)).write_bytes(raw)
source = originals['tests/mobile/engine/source/build-engine.sh'].decode()
changes = [
    ('--target=x86_64-linux-android', '--target=aarch64-linux-android', 1),
    ('jni/x86_64/', 'jni/arm64-v8a/', 2),
    ("'abi':'x86_64'", "'abi':'arm64-v8a'", 1),
]
for before, after, expected in changes:
    assert source.count(before) == expected, 'Architecture transform no longer exact'
    source = source.replace(before, after)
assert 'x86_64' not in source
(stage / 'build-engine.sh').write_text(source)
for name in ['build-host.py', 'proxy-default-address.patch']:
    (stage / name).write_bytes(originals['tests/mobile/engine/source/' + name])
generated = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in stage.iterdir()}
for path in stage.iterdir():
    (evidence / ('generated-' + path.name)).write_bytes(path.read_bytes())
proof = {
    'run': os.environ['GITHUB_RUN_ID'], 'source': os.environ['GITHUB_SHA'],
    'baseRecipeCommit': '69110444d0742c231f55f0b1ccd489fa9fac2bdb',
    'baseCompiledRun': 41772782539, 'baseRuntimeRun': 41810285687,
    'baseRecipeSha256': pins, 'generatedRecipeSha256': generated,
    'replacements': [{'before': a, 'after': b, 'count': n} for a, b, n in changes],
    'architecture': 'arm64-v8a', 'target': 'aarch64-linux-android',
    'baseFilesModified': False, 'upstreamPatchChanged': False,
    'resourcePolicyChanged': False, 'nativeOptimizationChanged': False,
    'nativeRuntimeProven': False, 'productAdopted': False,
}
(evidence / 'ARM64-RECIPE.json').write_text(json.dumps(proof, indent=2) + '\n')
print(json.dumps(proof))
