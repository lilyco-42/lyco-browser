"""Archive captured compiler inputs and bind them to the actual component AAR."""
from pathlib import Path
import collections
import hashlib
import json
import os
import shutil
import shlex
import subprocess
import tarfile
import tempfile
import zipfile

assert os.environ.get('GITHUB_ACTIONS') == 'true', 'Genuine Actions required'
root = Path(os.environ['LYCO_CAPTURE_ROOT']).resolve(strict=True)
temporary = Path(os.environ['RUNNER_TEMP']).resolve(strict=True)
assert root == temporary / 'lyco-binding-capture-android'
published = root / 'published'
core = Path(__file__).resolve().parent
real = os.environ['LYCO_REAL_GO']


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


calls = []
for folder in sorted((published / 'calls').iterdir()):
    receipt = json.loads((folder / 'receipt.json').read_text())
    assert receipt['run'] == os.environ['GITHUB_RUN_ID'] and receipt['workflowSha'] == os.environ['GITHUB_SHA']
    assert receipt['exitCode'] == 0 and receipt['inputsUnchanged'] is True
    assert receipt['wrapperSha256'] == sha(core / 'capture-go-build.py')
    for entry in receipt['sourceFiles']:
        path = folder / 'sources' / entry['path']
        assert path.stat().st_size == entry['bytes'] and sha(path) == entry['sha256']
    calls.append({'receipt': str((folder / 'receipt.json').relative_to(published)), **receipt})
assert len(calls) == 2 and {r['goarch'] for r in calls} == {'arm64', 'amd64'}

retained = []
total = 0
suffixes = {'.go', '.java', '.c', '.h', '.cc', '.cpp', '.m', '.mm', '.s', '.S'}
for path in sorted((root / 'work').rglob('*')):
    if path.is_symlink():
        assert not path.is_dir() and path.suffix not in suffixes, 'Source links require explicit source mapping'
        continue
    if not path.is_file() or (path.suffix not in suffixes and path.name not in ['go.mod', 'go.sum']):
        continue
    relative = path.relative_to(root / 'work')
    total += path.stat().st_size
    assert total <= 128 * 1024 * 1024 and len(retained) < 20000
    target = published / 'retained-work' / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(path, target)
    assert sha(path) == sha(target)
    retained.append({'path': str(target.relative_to(published)), 'bytes': target.stat().st_size, 'sha256': sha(target)})
counts = collections.Counter(Path(r['path']).suffix for r in retained)
assert counts['.go'] and counts['.java'] and (counts['.c'] or counts['.h'])

aar = temporary / 'lyco-tunnel.aar'
library_metadata = []
with zipfile.ZipFile(aar) as archive:
    assert archive.testzip() is None
    expected = {'jni/arm64-v8a/libgojni.so': 'arm64', 'jni/x86_64/libgojni.so': 'amd64'}
    assert {n for n in archive.namelist() if n.startswith('jni/') and n.endswith('.so')} == set(expected)
    assert 'classes.jar' in archive.namelist()
    classes = archive.read('classes.jar')
    with tempfile.TemporaryDirectory(dir=root / 'work') as work:
        work = Path(work)
        for name, arch in expected.items():
            raw = archive.read(name)
            call, = [r for r in calls if r['goarch'] == arch]
            assert len(raw) == call['output']['bytes'] and hashlib.sha256(raw).hexdigest() == call['output']['sha256']
            lib = work / (arch + '.so')
            lib.write_bytes(raw)
            info = subprocess.check_output([real, 'version', '-m', str(lib)], text=True)
            assert 'go1.25.5' in info.splitlines()[0]
            record = published / ('native-go-build-info-' + arch + '.txt')
            record.write_text(info)
            library_metadata.append({'path': name, 'bytes': len(raw), 'sha256': call['output']['sha256'],
                                     'elfMachine': call['output']['elfMachine'], 'compilerCallReceipt': call['receipt'],
                                     'embeddedBuildInfoPath': record.name, 'embeddedBuildInfoSha256': sha(record)})
go_version = subprocess.check_output([real, 'version'], text=True).strip()
assert go_version.split()[2] == 'go1.25.5'
tools = {}
for name in ['gomobile', 'gobind']:
    tool = Path(shutil.which(name)).resolve(strict=True)
    info = subprocess.check_output([real, 'version', '-m', str(tool)], text=True)
    assert '\tmod\tgithub.com/sagernet/gomobile\tv0.1.12\t' in info
    target = published / (name + '-build-info.txt')
    target.write_text(info)
    tools[name] = {'sha256': sha(tool), 'embeddedBuildInfoPath': target.name, 'embeddedBuildInfoSha256': sha(target)}
ndk = Path(os.environ['ANDROID_NDK_HOME']).resolve(strict=True)
for call in calls:
    Path(shlex.split(call['selectedCompiler'])[0]).resolve(strict=True).relative_to(ndk)
properties = ndk / 'source.properties'
shutil.copyfile(properties, published / 'ndk-source.properties')
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=core, text=True).strip()
assert commit == os.environ['GITHUB_SHA']
manifest = {'schemaVersion': 1, 'run': os.environ['GITHUB_RUN_ID'], 'testedGitCommit': commit,
            'platform': 'android', 'goVersion': go_version, 'tools': tools,
            'ndkSourcePropertiesSha256': sha(properties),
            'componentAar': {'bytes': aar.stat().st_size, 'sha256': sha(aar),
                             'classesJarSha256': hashlib.sha256(classes).hexdigest(),
                             'nativeLibraries': library_metadata},
            'compilerCalls': calls, 'retainedWorkSourceFiles': retained, 'retainedSuffixCounts': dict(counts),
            'resolvedCoreLocks': {n: sha(core / n) for n in ['go.mod', 'go.sum']},
            'actualInputsUnchangedDuringCompile': True, 'actualCompilerOutputsEqualPackagedLibraries': True,
            'oldSignedApkCorrespondenceProven': False, 'completeCorrespondingSourceProven': False,
            'reproducibleBuildProven': False, 'productAdopted': False,
            'scope': 'Opt-in Android component build: exact generated per-ABI compiler inputs, retained Java/Cgo source, pinned tool identities and actual AAR bytes. Not the older signed APK, a reproduction proof, all SDK/NDK sources/licenses or release approval.'}
(published / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
(published / 'README.txt').write_text(
    'Exact generated Android binding source capture\n\n'
    'calls/ contains source files copied before the real Go compiler invocation.\n'
    'Each receipt verifies those files and the resolved core locks after compilation.\n'
    'Both actual compiler outputs must byte-match the two packaged AAR libraries.\n'
    'retained-work/ contains retained Java and Go/Cgo work sources; binary intermediates are excluded.\n'
    'Tool metadata and the actual NDK revision are retained, without claiming complete SDK source delivery.\n'
    'The parent Go source bundle retains the tracked application and original verified module ZIPs.\n'
    'No correspondence to an older signed APK or reproducible build is asserted.\n')
output = temporary / 'lyco-generated-bindings-android.tar.gz'
with tarfile.open(output, 'w:gz') as archive:
    archive.add(published, arcname='lyco-generated-bindings-android', recursive=True)
output.with_name(output.name + '.sha256').write_text(sha(output) + '  ' + output.name + '\n')
print(json.dumps({'generatedSourceArchive': output.name, 'compilerCalls': len(calls),
                  'retainedSourceFiles': len(retained), 'componentAarSha256': sha(aar),
                  'completeCorrespondingSourceProven': False}))
