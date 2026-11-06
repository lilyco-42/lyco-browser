"""Retain original module sources selected by an actual APK's embedded metadata."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import zipfile


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def api(endpoint):
    return json.loads(subprocess.check_output(['gh', 'api', endpoint]))


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def main():
    require(os.environ.get('GITHUB_ACTIONS') == 'true', 'Actions only')
    require(not os.environ.get('NATIVE_ANDROID_CANDIDATE'), 'Use one source-audit input at a time')
    audit_run = sys.argv[1]
    require(re.fullmatch(r'[0-9]{5,20}', audit_run), 'Invalid original native audit run')
    repository = Path.cwd()
    repo = os.environ['GITHUB_REPOSITORY']
    root = Path(os.environ['RUNNER_TEMP']) / 'lyco-native-go-sources'
    root.mkdir()
    run = api(f'repos/{repo}/actions/runs/{audit_run}')
    require(run['status'] == 'completed' and run['conclusion'] == 'success', 'Successful native audit required')
    require(run['event'] == 'workflow_dispatch' and run['path'].split('@')[0] == '.github/workflows/mobile-notices.yml', 'Unexpected audit workflow')
    save(root / 'original-audit-run.json', {k: run[k] for k in ['id', 'head_sha', 'event', 'path', 'conclusion', 'html_url']})
    response = api(f'repos/{repo}/actions/runs/{audit_run}/artifacts?per_page=100')
    require(response['total_count'] <= 100, 'Artifact pagination requires explicit handling')
    matches = [a for a in response['artifacts'] if a['name'] == 'lyco-native-android-js-origin-' + audit_run and not a['expired']]
    require(len(matches) == 1, 'Exactly one complete native audit artifact required')
    artifact = matches[0]
    require(0 < artifact['size_in_bytes'] <= 64 * 1024 * 1024, 'Original audit exceeds bounds')
    require(re.fullmatch(r'sha256:[0-9a-f]{64}', artifact.get('digest', '')), 'Original digest required')
    original = root / 'original-audit.zip'
    with original.open('wb') as stream:
        subprocess.run(['gh', 'api', f'repos/{repo}/actions/artifacts/{artifact["id"]}/zip'], stdout=stream, check=True)
    require(original.stat().st_size == artifact['size_in_bytes'] and sha(original) == artifact['digest'][7:], 'Original audit size/SHA mismatch')
    member = 'native-libraries/NATIVE-LIBRARY-INVENTORY.json'
    with zipfile.ZipFile(original) as zipped:
        require(sum(i.file_size for i in zipped.infolist()) <= 128 * 1024 * 1024, 'Expanded audit exceeds bounds')
        require(len(zipped.namelist()) == len(set(zipped.namelist())), 'Duplicate audit paths')
        require(zipped.testzip() is None and zipped.namelist().count(member) == 1, 'Invalid original audit CRC/metadata')
        metadata_bytes = zipped.read(member)
    (root / 'original-native-library-inventory.json').write_bytes(metadata_bytes)
    metadata = json.loads(metadata_bytes)
    binding = metadata['sourceBinding']
    require(str(metadata['analyzerRun']) == audit_run and metadata['analyzerCommit'] == run['head_sha'], 'Native audit run/source mismatch')
    require(binding['originalSizeShaCrcVerified'] and binding['actualApkBundleBindingVerified'], 'Original APK binding required')
    producer = str(binding['sourceRun'])
    commit = binding['sourceCommit']
    require(re.fullmatch(r'[0-9]{5,20}', producer) and re.fullmatch(r'[0-9a-f]{40}', commit), 'Invalid producer binding')
    parent = api(f'repos/{repo}/actions/runs/{producer}')
    require(parent['status'] == 'completed' and parent['conclusion'] == 'success' and parent['head_sha'] == commit, 'Successful bound producer required')
    require(parent['event'] == 'workflow_dispatch' and parent['path'].split('@')[0] == '.github/workflows/build-universal.yml', 'Unexpected producer workflow')
    subprocess.run(['git', 'fetch', '--no-tags', 'origin', commit], check=True)
    subprocess.run(['git', 'diff', '--exit-code', commit, 'HEAD', '--', 'mobile/core'], check=True)
    locks = repository / 'mobile/core'
    sums = set((locks / 'go.sum').read_text().splitlines())
    native = [r for r in metadata['nativeLibraries'] if 'embeddedGoBuildInfo' in r]
    require({r['path'] for r in native} == {'lib/arm64-v8a/libgojni.so', 'lib/x86_64/libgojni.so'}, 'Both actual Go JNI records required')
    graphs = []
    settings = []
    for row in native:
        info = row['embeddedGoBuildInfo']
        require(info['GoVersion'] == 'go1.25.5', 'Unexpected binary Go toolchain')
        config = {s['Key']: s['Value'] for s in info['Settings']}
        require(config['GOOS'] == 'android' and config['vcs.revision'] == commit, 'Embedded source/target differs')
        require(config['-buildmode'] == 'c-shared' and config['-tags'] == 'with_quic,with_utls', 'Unexpected original native build')
        deps = info['Deps']
        require(0 < len(deps) <= 256 and len({d['Path'] for d in deps}) == len(deps), 'Unbounded/duplicate module graph')
        graphs.append(sorted(deps, key=lambda d: d['Path']))
        settings.append({'library': row['path'], 'sha256': row['sha256'], 'settings': config})
    require(graphs[0] == graphs[1], 'Native ABI dependency graphs differ')
    stage = root / 'resolution'
    stage.mkdir()
    # Independent scratch module; never tidy or alter the product's locks.
    (stage / 'go.mod').write_text('module top.lain42/source-review\n\ngo 1.25.5\n')
    shutil.copyfile(locks / 'go.sum', stage / 'go.sum')
    env = dict(os.environ, GOWORK='off', GOTOOLCHAIN='local', GOFLAGS='', GOPRIVATE='',
               GONOSUMDB='', GOSUMDB='sum.golang.org', GOPROXY='https://proxy.golang.org,direct')
    version = subprocess.check_output(['go', 'env', 'GOVERSION'], env=env, text=True).strip()
    require(version == 'go1.25.5', 'Pinned Go resolver required')
    manifest = {'schemaVersion': 1, 'auditRun': audit_run, 'producerRun': producer,
                'producerCommit': commit, 'apkSha256': binding['apkSha256'], 'collectorRun': os.environ['GITHUB_RUN_ID'],
                'collectorCommit': os.environ['GITHUB_SHA'], 'resolverVersion': version,
                'originalAudit': {k: artifact[k] for k in ['id', 'name', 'size_in_bytes', 'digest']},
                'originalAuditSizeShaCrcVerified': True, 'nativeBuildSettings': settings,
                'modules': [], 'complete': False, 'completeLicenseClearanceProven': False,
                'completeCorrespondingSourceProven': False,
                'scope': 'Exact original module ZIPs named in both APK Go build records, locked checksums and verbatim notice candidates; no target code execution',
                'limits': ['Does not cover Go standard library, cgo/NDK, generated bindings or other native libraries',
                           'Embedded vcs.modified is retained; generated source and reproducible binary equivalence remain unproven',
                           'Notice filename matches require review; absence of a match does not establish absence of licensing terms']}
    manifest_path = root / 'GO-MODULE-SOURCES.json'
    save(manifest_path, manifest)
    total_zip = 0
    total_notices = 0
    for index, module in enumerate(graphs[0]):
        name, tag, expected = module['Path'], module['Version'], module['Sum']
        require('Replace' not in module and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9./_~+-]*', name), 'Unexpected module path/replacement')
        require(re.fullmatch(r'v[0-9][A-Za-z0-9.+-]*', tag) and re.fullmatch(r'h1:[A-Za-z0-9+/]{43}=', expected), 'Invalid module version/checksum')
        require(f'{name} {tag} {expected}' in sums, 'Embedded module differs from product lock: ' + name)
        result = subprocess.run(['go', 'mod', 'download', '-json', name + '@' + tag], cwd=stage, env=env, text=True, stdout=subprocess.PIPE, check=True)
        resolved = json.loads(result.stdout)
        require(not resolved.get('Error') and resolved['Path'] == name and resolved['Version'] == tag and resolved['Sum'] == expected, 'Resolved module mismatch')
        require(f'{name} {tag}/go.mod {resolved["GoModSum"]}' in sums, 'Original module go.mod differs from product lock')
        folder = root / 'modules' / f'{index:03d}'
        folder.mkdir(parents=True)
        files = {}
        for field, filename in [('Zip', 'source.zip'), ('GoMod', 'go.mod'), ('Info', 'version.info')]:
            source = Path(resolved[field])
            require(source.is_file() and not source.is_symlink(), 'Expected regular original cache file')
            shutil.copyfile(source, folder / filename)
            files[filename] = {'bytes': source.stat().st_size, 'sha256': sha(source)}
        total_zip += files['source.zip']['bytes']
        require(total_zip <= 1024 * 1024 * 1024, 'Source bundle exceeds bounds')
        notices = []
        with zipfile.ZipFile(folder / 'source.zip') as archive:
            require(sum(i.file_size for i in archive.infolist()) <= 500 * 1024 * 1024, 'Expanded module exceeds Go ZIP bounds')
            require(archive.testzip() is None, 'Original module ZIP CRC failure')
            prefix = name + '@' + tag + '/'
            require(all(n.startswith(prefix) and '..' not in PurePosixPath(n).parts for n in archive.namelist()), 'Unexpected original module paths')
            for entry in archive.infolist():
                basename = PurePosixPath(entry.filename).name.lower()
                if entry.is_dir() or not re.match(r'^(licen[cs]e|copying|copyright|notice|patents|authors)([._-]|$)', basename):
                    continue
                require(entry.file_size <= 16 * 1024 * 1024, 'Notice exceeds bounds')
                text = archive.read(entry)
                total_notices += len(text)
                require(total_notices <= 64 * 1024 * 1024, 'Notice collection exceeds bounds')
                local = 'notice-' + str(len(notices)) + '.txt'
                (folder / local).write_bytes(text)
                notices.append({'originalPath': entry.filename[len(prefix):], 'retainedFile': local,
                                'bytes': len(text), 'sha256': hashlib.sha256(text).hexdigest()})
        record = {'path': name, 'version': tag, 'sum': expected, 'goModSum': resolved['GoModSum'],
                  'directory': str(folder.relative_to(root)), 'files': files, 'noticeCandidates': notices,
                  'noticeReview': 'Original filename candidates retained; licensing review pending' if notices else 'No filename candidates; inspect original source ZIP'}
        manifest['modules'].append(record)
        save(manifest_path, manifest)
        print(f'Retained original module {index + 1}/{len(graphs[0])}: {name}@{tag}; notice candidates {len(notices)}', flush=True)
    app_source = root / 'application-source.tar.gz'
    subprocess.run(['git', 'archive', '--format=tar.gz', '-o', str(app_source), commit], cwd=repository, check=True)
    manifest.update(complete=True, moduleCount=len(graphs[0]), totalOriginalModuleZipBytes=total_zip,
                    noticeCandidateFiles=sum(len(m['noticeCandidates']) for m in manifest['modules']),
                    modulesWithoutFilenameCandidates=[m['path'] for m in manifest['modules'] if not m['noticeCandidates']],
                    trackedApplicationSource={'commit': commit, 'bytes': app_source.stat().st_size, 'sha256': sha(app_source)},
                    originalGoSumSha256=sha(locks / 'go.sum'), originalGoModSha256=sha(locks / 'go.mod'))
    shutil.copyfile(locks / 'go.mod', root / 'original-core.go.mod')
    shutil.copyfile(locks / 'go.sum', root / 'original-core.go.sum')
    # Preserve complete original UTF-8 text for an offline client view; no
    # inferred SPDX labels, replacement license text or whitespace rewriting.
    catalog = {'schemaVersion': 1, 'generated': True, 'goVersion': version,
               'sourceRun': os.environ['GITHUB_RUN_ID'], 'producerCommit': commit,
               'originalGoModSha256': manifest['originalGoModSha256'],
               'originalGoSumSha256': manifest['originalGoSumSha256'], 'packages': []}
    for module in manifest['modules']:
        files = []
        for notice in module['noticeCandidates']:
            raw = (root / module['directory'] / notice['retainedFile']).read_bytes()
            require(hashlib.sha256(raw).hexdigest() == notice['sha256'], 'Retained notice drift')
            text = raw.decode('utf-8')
            require(text.encode('utf-8') == raw, 'Notice text must preserve original bytes')
            files.append({'name': notice['originalPath'], 'text': text, 'sha256': notice['sha256']})
        catalog['packages'].append({'id': module['path'] + '@' + module['version'],
                                    'name': module['path'], 'version': module['version'],
                                    'sum': module['sum'], 'goModSum': module['goModSum'], 'files': files})
    save(root / 'OFFLINE-GO-NOTICES.json', catalog)
    manifest['offlineNoticeCatalogSha256'] = sha(root / 'OFFLINE-GO-NOTICES.json')
    shutil.rmtree(stage)
    save(manifest_path, manifest)
    print(json.dumps({'moduleCount': manifest['moduleCount'], 'noticeCandidateFiles': manifest['noticeCandidateFiles'],
                      'modulesWithoutFilenameCandidates': manifest['modulesWithoutFilenameCandidates'], 'completeLicenseClearanceProven': False}))


if __name__ == '__main__':
    main()
