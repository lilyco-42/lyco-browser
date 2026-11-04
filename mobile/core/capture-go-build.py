#!/usr/bin/env python3
"""Delegate to the pinned Go tool and retain exact Android binding inputs."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import shutil
import struct
import subprocess
import sys

assert os.environ.get('GITHUB_ACTIONS') == 'true', 'Genuine Actions required'
real = Path(os.environ['LYCO_REAL_GO']).resolve(strict=True)
assert real != Path(sys.argv[0]).resolve()
args = sys.argv[1:]
if not args or args[0] != 'build' or '-buildmode=c-shared' not in args:
    os.execv(str(real), [str(real), *args])

core = Path(os.environ['GITHUB_WORKSPACE']).resolve() / 'mobile/core'
cwd = Path.cwd().resolve()
parts = cwd.relative_to(core / 'build').parts
assert len(parts) == 2 and parts[0] in ['arm64', 'amd64'] and parts[1] == 'libgojni'
assert os.environ['GOOS'] == 'android' and os.environ['GOARCH'] == parts[0]
assert '-trimpath' in args and '-work' in args
root = Path(os.environ['LYCO_CAPTURE_ROOT']).resolve(strict=True)
assert root == Path(os.environ['RUNNER_TEMP']).resolve() / 'lyco-binding-capture-android'
name = 'android-' + parts[0] + '-' + str(os.getpid())
target = root / 'published/calls' / name
target.mkdir(parents=True)


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


records = []
total = 0
for path in sorted(cwd.rglob('*')):
    if path.is_symlink() and path.is_dir():
        raise ValueError('Generated source directory links require explicit source mapping')
    if path.suffix not in ['.go', '.c', '.h', '.cc', '.cpp', '.s', '.S'] and path.name not in ['go.mod', 'go.sum']:
        continue
    assert not path.is_symlink() and path.is_file(), 'Generated binding input must be a regular file'
    relative = path.relative_to(cwd)
    total += path.stat().st_size
    assert total <= 128 * 1024 * 1024 and len(records) < 4096
    copy = target / 'sources' / relative
    copy.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(path, copy)
    digest = sha(path)
    assert sha(copy) == digest
    records.append({'path': relative.as_posix(), 'bytes': path.stat().st_size, 'sha256': digest})
assert any(r['path'].endswith('.go') for r in records)
locks = {name: sha(core / name) for name in ['go.mod', 'go.sum']}
for lock in locks:
    shutil.copyfile(core / lock, target / ('core-' + lock))
output_args = [a[3:] for a in args if a.startswith('-o=')]
assert len(output_args) == 1
output = Path(output_args[0]).resolve()
output_relative = output.relative_to(root / 'work')
receipt = {'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
           'run': os.environ['GITHUB_RUN_ID'], 'workflowSha': os.environ['GITHUB_SHA'],
           'goos': 'android', 'goarch': parts[0], 'sourceDirectory': str(cwd.relative_to(core)),
           'arguments': args, 'sourceFiles': records, 'resolvedCoreLocks': locks,
           'wrapperSha256': sha(Path(sys.argv[0])),
           'selectedCompiler': os.environ.get('CC'),
           'outputPath': str(output_relative), 'exitCode': None, 'inputsUnchanged': False}
(target / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
process = subprocess.run([str(real), *args], check=False)
receipt['exitCode'] = process.returncode
receipt['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
receipt['inputsUnchanged'] = (all(sha(cwd / r['path']) == r['sha256'] for r in records)
                              and all(sha(core / n) == value for n, value in locks.items()))
if process.returncode == 0:
    assert output.is_file() and not output.is_symlink()
    with output.open('rb') as stream:
        header = stream.read(20)
    machine = 183 if parts[0] == 'arm64' else 62
    assert header[:6] == b'\x7fELF\x02\x01' and struct.unpack_from('<H', header, 18)[0] == machine
    receipt['output'] = {'bytes': output.stat().st_size, 'sha256': sha(output), 'elfMachine': machine}
(target / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
assert receipt['inputsUnchanged'], 'Binding source/locks changed during the actual compiler call'
raise SystemExit(process.returncode)
