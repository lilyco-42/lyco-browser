"""Bind unchanged notice originals to an actual newly compiled Android core."""
from pathlib import Path, PurePosixPath
import base64
import gzip
import hashlib
import io
import json
import os
import stat
import struct
import subprocess
import sys
import tarfile
import zipfile

assert os.environ.get('GITHUB_ACTIONS') == 'true', 'Genuine Actions required'
assert os.environ['GITHUB_EVENT_NAME'] == 'workflow_dispatch'
inputs = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())['inputs']
run_id = sys.argv[1]
assert run_id == inputs['native_go_component'] == '41942598583'
for key in ['native_android_candidate', 'native_go_origin']:
    assert not inputs.get(key)
for key in ['native_js_inventory', 'go_toolchain_source']:
    assert str(inputs.get(key, 'false')).lower() == 'false'
assert subprocess.check_output(['go', 'env', 'GOVERSION'], text=True).strip() == 'go1.25.5'
repo = os.environ['GITHUB_REPOSITORY']
root = Path(os.environ['RUNNER_TEMP']) / 'lyco-go-notice-binding'
stage, output = root / 'input', root / 'evidence'
stage.mkdir(parents=True)
output.mkdir()


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def file_sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def api(path):
    return json.loads(subprocess.check_output(['gh', 'api', 'repos/' + repo + '/' + path]))


def safe(name):
    path = PurePosixPath(name)
    assert not path.is_absolute() and '..' not in path.parts and '\\' not in name


def check_zip(archive):
    assert len(archive.namelist()) == len(set(archive.namelist()))
    assert archive.testzip() is None
    for entry in archive.infolist():
        safe(entry.filename)
        assert not stat.S_ISLNK(entry.external_attr >> 16)


def write_json(name, value):
    (output / name).write_text(json.dumps(value, indent=2) + '\n')


run = api('actions/runs/' + run_id)
assert run['status'] == 'completed' and run['conclusion'] == 'success'
assert run['event'] == 'pull_request' and run['path'].split('@')[0] == '.github/workflows/mobile-core.yml'
assert run['head_sha'] == '85c652cde5d5e936025c36b18b1e9f1459d74a03'
listing = api('actions/runs/' + run_id + '/artifacts?per_page=100')
assert listing['total_count'] <= 100
pins = {
    'component': ('lyco-mobile-core-android-', 13376844775, 808553893,
                  '4decd85af84bf3002f5cc0fca00c75a76692610cec81c70c3a5a583d93b4e789'),
    'receipts': ('lyco-generated-binding-receipts-', 13376829922, 589953,
                 '785ee638ffb64e229630c9b7d75e5b605627f83ab72d393fed260b316f063ca4'),
}
artifacts = {}
for kind, (prefix, identity, size, expected) in pins.items():
    entry, = [a for a in listing['artifacts'] if a['name'] == prefix + run_id and not a['expired']]
    assert entry['id'] == identity and entry['size_in_bytes'] == size and entry['digest'] == 'sha256:' + expected
    path = stage / (kind + '.zip')
    with path.open('wb') as stream:
        subprocess.run(['gh', 'api', f'repos/{repo}/actions/artifacts/{identity}/zip'], stdout=stream, check=True)
    assert path.stat().st_size == size and file_sha(path) == expected
    artifacts[kind] = {'id': identity, 'bytes': size, 'sha256': expected}
    with zipfile.ZipFile(path) as archive:
        assert sum(e.file_size for e in archive.infolist()) < 1200 * 1024 * 1024
        check_zip(archive)
write_json('ORIGINAL-SOURCES.json', {'producerRun': int(run_id), 'producerHead': run['head_sha'], 'artifacts': artifacts})

catalog_path = Path('apps/universal/src/go-notices.json')
descriptor_path = Path('apps/universal/third-party/go-notices-source.json')
catalog_raw = catalog_path.read_bytes()
catalog = json.loads(catalog_raw)
descriptor = json.loads(descriptor_path.read_bytes())
assert sha(catalog_raw) == descriptor['catalogSha256']
assert catalog['generated'] is True and catalog['goVersion'] == 'go1.25.5'
assert catalog['sourceRun'] == descriptor['sourceRun'] and catalog['producerCommit'] == descriptor['producerCommit']
catalog_modules = {(m['name'], m['version']): m for m in catalog['packages']}
assert len(catalog_modules) == len(catalog['packages']) == descriptor['moduleCount'] == 72
lock_hashes = {n: file_sha(Path('mobile/core') / n) for n in ['go.mod', 'go.sum']}
assert lock_hashes['go.mod'] == catalog['originalGoModSha256']
assert lock_hashes['go.sum'] == catalog['originalGoSumSha256']
sums = set(Path('mobile/core/go.sum').read_text().splitlines())
for module in catalog_modules.values():
    assert f"{module['name']} {module['version']} {module['sum']}" in sums
    assert f"{module['name']} {module['version']}/go.mod {module['goModSum']}" in sums

with zipfile.ZipFile(stage / 'receipts.zip') as receipts:
    capture_raw = receipts.read('manifest.json')
    capture = json.loads(capture_raw)
    assert capture['run'] == run_id and capture['platform'] == 'android'
    tested = capture['testedGitCommit']
    subprocess.run(['git', 'fetch', '--no-tags', 'origin', tested], check=True)
    parents = subprocess.check_output(['git', 'show', '-s', '--format=%P', tested], text=True).split()
    assert len(parents) == 2 and parents[1] == run['head_sha']
    subprocess.run(['git', 'diff', '--exit-code', tested, 'HEAD', '--', 'mobile/core'], check=True)
    tree = subprocess.check_output(['git', 'rev-parse', tested + ':mobile/core'], text=True).strip()
    assert tree == subprocess.check_output(['git', 'rev-parse', 'HEAD:mobile/core'], text=True).strip()
    assert capture['resolvedCoreLocks'] == lock_hashes
    assert len(capture['compilerCalls']) == 2 and {c['goarch'] for c in capture['compilerCalls']} == {'arm64', 'amd64'}
    for call in capture['compilerCalls']:
        assert call['run'] == run_id and call['workflowSha'] == tested
        assert call['exitCode'] == 0 and call['inputsUnchanged'] is True
        assert call['resolvedCoreLocks'] == lock_hashes
        assert call['wrapperSha256'] == file_sha(Path('mobile/core/capture-go-build.py'))
        folder = str(PurePosixPath(call['receipt']).parent)
        assert json.loads(receipts.read(call['receipt'])) == {k: v for k, v in call.items() if k != 'receipt'}
        for name, expected in lock_hashes.items():
            assert sha(receipts.read(folder + '/core-' + name)) == expected
        for source in call['sourceFiles']:
            safe(source['path'])
            raw = receipts.read(folder + '/sources/' + source['path'])
            assert len(raw) == source['bytes'] and sha(raw) == source['sha256']
    (output / 'ORIGINAL-CAPTURE-MANIFEST.json').write_bytes(capture_raw)

    with zipfile.ZipFile(stage / 'component.zip') as component:
        aar_raw = component.read('lyco-tunnel.aar')
        assert len(aar_raw) == capture['componentAar']['bytes'] and sha(aar_raw) == capture['componentAar']['sha256']
        generated_raw = component.read('lyco-generated-bindings-android.tar.gz')
        assert component.read('lyco-generated-bindings-android.tar.gz.sha256').decode().split()[0] == sha(generated_raw)
        with tarfile.open(fileobj=io.BytesIO(gzip.decompress(generated_raw)), mode='r:') as generated:
            for entry in generated:
                safe(entry.name)
                assert entry.isdir() or entry.isfile()
                if entry.isfile():
                    name = str(PurePosixPath(entry.name).relative_to('lyco-generated-bindings-android'))
                    assert generated.extractfile(entry).read() == receipts.read(name)

        native_records = []
        graphs = []
        with zipfile.ZipFile(io.BytesIO(aar_raw)) as aar:
            check_zip(aar)
            assert {n for n in aar.namelist() if n.startswith('jni/') and n.endswith('.so')} == {
                'jni/arm64-v8a/libgojni.so', 'jni/x86_64/libgojni.so'}
            for library in capture['componentAar']['nativeLibraries']:
                raw = aar.read(library['path'])
                assert len(raw) == library['bytes'] and sha(raw) == library['sha256']
                assert raw[:6] == b'\x7fELF\x02\x01' and struct.unpack_from('<H', raw, 18)[0] == library['elfMachine']
                call, = [c for c in capture['compilerCalls'] if c['receipt'] == library['compilerCallReceipt']]
                assert call['output'] == {k: library[k] for k in ['bytes', 'sha256', 'elfMachine']}
                path = stage / (call['goarch'] + '.so')
                path.write_bytes(raw)
                info = subprocess.check_output(['go', 'version', '-m', str(path)], text=True)
                assert info.splitlines()[0].endswith('go1.25.5')
                assert '\n\t=>' not in info
                config = dict(line.removeprefix('\tbuild\t').split('=', 1) for line in info.splitlines() if line.startswith('\tbuild\t'))
                assert config['GOOS'] == 'android' and config['GOARCH'] == call['goarch']
                assert config['vcs.revision'] == tested and config['-buildmode'] == 'c-shared'
                assert config['-tags'] == 'with_quic,with_utls'
                graph = {}
                for line in info.splitlines():
                    if line.startswith('\tdep\t'):
                        _, name, version, checksum = line.split()
                        assert name not in graph
                        graph[name] = (version, checksum)
                expected = {m['name']: (m['version'], m['sum']) for m in catalog_modules.values()}
                assert graph == expected
                graphs.append(graph)
                (output / ('actual-' + call['goarch'] + '-go-build-info.txt')).write_text(info)
                native_records.append({**library, 'goBuildSettings': config, 'moduleCount': len(graph)})
        assert len(graphs) == 2 and graphs[0] == graphs[1]

        selected = {}
        module_files = {}
        original_notice_files = 0
        source_manifest = None
        outer_locks = {}
        total = 0
        with component.open('lyco-mobile-core-source.tar.gz') as packed, gzip.GzipFile(fileobj=packed) as gz:
            with tarfile.open(fileobj=gz, mode='r|') as archive:
                seen = set()
                for entry in archive:
                    safe(entry.name)
                    assert entry.name not in seen and (entry.isdir() or entry.isfile())
                    seen.add(entry.name)
                    if not entry.isfile():
                        continue
                    total += entry.size
                    assert total < 1200 * 1024 * 1024
                    name = str(PurePosixPath(entry.name).relative_to('lyco-mobile-core-source'))
                    if name == 'manifest.json':
                        source_manifest = json.load(archive.extractfile(entry))
                        assert source_manifest['applicationCommit'] == tested
                        assert source_manifest['generatedBindings']['archiveSha256'] == sha(generated_raw)
                        assert source_manifest['generatedBindings']['componentAar'] == capture['componentAar']
                        selected = {m['directory']: m for m in source_manifest['modules'] if (m['path'], m['version']) in catalog_modules}
                        assert len(selected) == len(catalog_modules)
                    elif name.startswith('resolved-core-lock/'):
                        outer_locks[PurePosixPath(name).name] = sha(archive.extractfile(entry).read())
                    elif str(PurePosixPath(name).parent) in selected:
                        folder = str(PurePosixPath(name).parent)
                        member = PurePosixPath(name).name
                        module = selected[folder]
                        expected = catalog_modules[(module['path'], module['version'])]
                        assert module['sum'] == expected['sum'] and module['goModSum'] == expected['goModSum']
                        assert entry.size < 500 * 1024 * 1024
                        raw = archive.extractfile(entry).read()
                        assert sha(raw) == module['sha256'][member]
                        module_files[name] = {'bytes': len(raw), 'sha256': sha(raw)}
                        if member == 'go.mod':
                            h1 = 'h1:' + base64.b64encode(hashlib.sha256((sha(raw) + '  go.mod\n').encode()).digest()).decode()
                            assert h1 == expected['goModSum']
                        elif member == 'source.zip':
                            prefix = module['path'] + '@' + module['version'] + '/'
                            with zipfile.ZipFile(io.BytesIO(raw)) as original:
                                assert sum(e.file_size for e in original.infolist()) <= 500 * 1024 * 1024
                                check_zip(original)
                                assert all(n.startswith(prefix) for n in original.namelist())
                                h = hashlib.sha256()
                                for n in sorted(original.namelist()):
                                    assert not n.endswith('/')
                                    h.update((sha(original.read(n)) + '  ' + n + '\n').encode())
                                assert 'h1:' + base64.b64encode(h.digest()).decode() == expected['sum']
                                for notice in expected['files']:
                                    body = original.read(prefix + notice['name'])
                                    assert sha(body) == notice['sha256']
                                    assert body == notice['text'].encode('utf-8')
                                    original_notice_files += 1
            for block in iter(lambda: gz.read(1024 * 1024), b''):
                assert not block.strip(b'\0')
        assert outer_locks == lock_hashes
        assert len(module_files) == len(catalog_modules) * 3
        assert original_notice_files == descriptor['noticeFiles'] == 104

review = {'schemaVersion': 1, 'passed': True, 'reviewRun': os.environ['GITHUB_RUN_ID'],
          'reviewCommit': os.environ['GITHUB_SHA'], 'producerRun': int(run_id),
          'producerHead': run['head_sha'], 'testedMergeCommit': tested, 'coreSourceTree': tree,
          'originalArtifacts': artifacts, 'originalArchiveSizeShaCrcVerified': True,
          'catalogSha256': sha(catalog_raw), 'actualNativeLibraries': native_records,
          'bothActualNativeGraphsMatchCatalog': True, 'moduleCount': len(catalog_modules),
          'noticeFiles': original_notice_files, 'allNoticeTextsEqualIncludedOriginalModuleZips': True,
          'canonicalModuleAndGoModChecksumsVerified': True, 'selectedOriginalModuleFiles': module_files,
          'actualCompilerAndOuterLocksMatchCurrentSource': True, 'sourceLockSha256': lock_hashes,
          'sameWholeCoreTreeAsActuallyCompiledCommit': True,
          'catalogAndOriginalNoticePayloadChanged': False,
          'currentSignedApkCorrespondenceProven': False, 'productRuntimeTested': False,
          'completeLicenseClearanceProven': False, 'completeCorrespondingSourceProven': False,
          'scope': 'Current entire mobile/core tree matched to successful actual Android component, two actual Go JNI graphs, all 72 included original module sources and 104 unchanged offline notice texts. Not a current signed APK, runtime, complete SDK/native licensing or reproducible build proof.'}
write_json('CORE-NOTICE-BINDING.json', review)
refreshed = dict(descriptor)
refreshed['coreSourceTree'] = tree
refreshed['currentCoreBindingReview'] = {
    'run': os.environ['GITHUB_RUN_ID'], 'producerRun': int(run_id), 'producerHead': run['head_sha'],
    'testedMergeCommit': tested, 'coreSourceTree': tree,
    'reviewSha256': file_sha(output / 'CORE-NOTICE-BINDING.json'),
    'actualModuleGraphsAndOriginalNoticeBytesVerified': True,
    'currentSignedApkCorrespondenceProven': False}
write_json('REFRESHED-GO-NOTICES-SOURCE.json', refreshed)
print(json.dumps({k: review[k] for k in ['passed', 'producerRun', 'coreSourceTree', 'moduleCount', 'noticeFiles', 'catalogAndOriginalNoticePayloadChanged', 'currentSignedApkCorrespondenceProven']}))
