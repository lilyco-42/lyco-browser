#!/usr/bin/env python3
"""Retain the tested application tree and verified Go sources on Actions."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile


def run(*args):
    return subprocess.run(args, check=True, text=True, stdout=subprocess.PIPE).stdout


def objects(content):
    decoder = json.JSONDecoder()
    while content.strip():
        content = content.lstrip()
        item, end = decoder.raw_decode(content)
        if item.get('Error'):
            raise RuntimeError('A module source download failed: ' + item['Path'])
        yield item
        content = content[end:]


def main():
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        raise SystemExit('Source dependency resolution runs on GitHub Actions only')
    root = Path(__file__).resolve().parents[2]
    core = Path(__file__).resolve().parent
    os.chdir(core)
    output = Path(os.environ['RUNNER_TEMP']) / 'lyco-mobile-core-source.tar.gz'
    modules = {(row['Path'], row['Version']): row for row in objects(run('go', 'mod', 'download', '-json', 'all'))}
    # Binding tools have their own module graph, outside the application's
    # go.mod. Retain the actual modules embedded in both installed tool binaries.
    for tool in ('gomobile', 'gobind'):
        executable = shutil.which(tool)
        if not executable:
            raise RuntimeError('Build the pinned native binding tools first')
        for line in run('go', 'version', '-m', executable).splitlines():
            fields = line.split()
            if fields and fields[0] == '=>':
                raise RuntimeError('Unexpected replacement in the binding tool graph')
            if len(fields) >= 4 and fields[0] in ('mod', 'dep'):
                name, version, expected = fields[1:4]
                row = next(objects(run('go', 'mod', 'download', '-json', name + '@' + version)))
                if row.get('Sum') != expected:
                    raise RuntimeError('Binding tool module checksum mismatch: ' + name)
                modules[(name, version)] = row
    run('go', 'mod', 'verify')
    with tempfile.TemporaryDirectory(dir=os.environ['RUNNER_TEMP']) as temporary:
        target = Path(temporary)
        # git archive excludes credentials, caches, generated keystores and all
        # untracked runner files. Use the actual tested merge tree, not PR head.
        subprocess.run(['git', '-C', str(root), 'archive', '--format=tar',
                        '-o', str(target / 'application-source.tar'), 'HEAD'], check=True)
        lock = target / 'resolved-core-lock'
        lock.mkdir()
        for name in ('go.mod', 'go.sum'):
            shutil.copyfile(core / name, lock / name)
        records = []
        for index, ((name, version), row) in enumerate(sorted(modules.items())):
            folder = target / 'modules' / str(index)
            folder.mkdir(parents=True)
            hashes = {}
            for key, filename in (('Zip', 'source.zip'), ('GoMod', 'go.mod'), ('Info', 'version.info')):
                source = Path(row[key])
                shutil.copyfile(source, folder / filename)
                hashes[filename] = hashlib.sha256(source.read_bytes()).hexdigest()
            records.append({'path': name, 'version': version, 'sum': row['Sum'],
                            'goModSum': row['GoModSum'], 'directory': 'modules/' + str(index),
                            'sha256': hashes})
        manifest = {'applicationCommit': run('git', '-C', str(root), 'rev-parse', 'HEAD').strip(),
                    'go': run('go', 'version').strip(), 'modules': records,
                    'scope': 'Application tracked source plus Go application and binding-tool build modules; '
                             'not a complete inventory of npm, Pods, Android, browser kernels or platform SDKs.'}
        (target / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        (target / 'README.txt').write_text(
            'LYCO mobile network-core source review bundle\n\n'
            'application-source.tar contains the tested tracked repository tree.\n'
            'Extract it, then copy resolved-core-lock/go.mod and go.sum over mobile/core/.\n'
            'Go module ZIPs retain their original source, copyright and license files.\n'
            'manifest.json identifies every module and its Go and SHA-256 checksums.\n'
            'The binding tools and their actual embedded dependency modules are included.\n'
            'Build instructions: mobile/core/README.md and mobile/core/build-native.sh.\n'
            'The native apps additionally require the pinned npm lock, Android SDK/NDK or Xcode/Pods.\n'
            'Those dependency sources and platform SDKs are outside this Go source bundle.\n'
            'This archive does not itself establish commercial distribution readiness.\n')
        with tarfile.open(output, 'w:gz') as archive:
            for child in sorted(target.iterdir()):
                archive.add(child, arcname='lyco-mobile-core-source/' + child.name)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_name(output.name + '.sha256').write_text(digest + '  ' + output.name + '\n')
    print('Retained verified network-core source modules:', len(modules))


if __name__ == '__main__':
    main()
