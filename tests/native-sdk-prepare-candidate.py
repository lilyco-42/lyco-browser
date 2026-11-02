"""Prepare the reviewed candidate on its own disposable Windows runner only."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import urllib.request
import zipfile

assert os.environ.get('GITHUB_ACTIONS') == 'true' and os.name == 'nt'
root = Path(__file__).resolve().parents[1]
manifest = json.loads((root/'resources/native-sdk/wayfern-155-windows.json').read_text())
assert manifest['url'] == 'https://download.wayfern.com/wayfern-155.0.8059.79_windows_x64.zip'
assert manifest['archive_audit_run'] == 41441842796
assert manifest['sha256'] == '43925a0841c254f66289565cd1d65f7d783c1f1e40b2a77fd402253c59b3e8b1'
stage = Path(os.environ['RUNNER_TEMP'])/'lyco-native-candidate'
stage.mkdir(exist_ok=False)
archive_path = stage/'original.zip'
digest = hashlib.sha256()
size = 0
with urllib.request.urlopen(manifest['url'], timeout=60) as response, archive_path.open('xb') as stream:
    assert response.status == 200 and response.url == manifest['url']
    assert int(response.headers['Content-Length']) == manifest['expected_bytes']
    for block in iter(lambda: response.read(1024*1024), b''):
        size += len(block)
        assert size <= manifest['expected_bytes']
        stream.write(block)
        digest.update(block)
assert size == manifest['expected_bytes'] and digest.hexdigest() == manifest['sha256']
with zipfile.ZipFile(archive_path) as archive:
    assert sum(row.file_size for row in archive.infolist()) <= 8*1024**3
    assert archive.testzip() is None
    targets = set()
    for row in archive.infolist():
        path = PurePosixPath(row.filename.replace('\\', '/'))
        assert path.parts and not path.is_absolute() and '..' not in path.parts
        assert not re.match(r'^[A-Za-z]:', str(path)) and not stat.S_ISLNK(row.external_attr >> 16)
        assert all(':' not in part and not part.endswith((' ', '.')) for part in path.parts)
        target = stage.joinpath(*path.parts)
        assert target.is_relative_to(stage)
        key = str(target).casefold()
        assert key not in targets, 'Archive has a colliding Windows path'
        targets.add(key)
        if row.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(row) as source, target.open('xb') as output:
                shutil.copyfileobj(source, output, 1024*1024)
binary = stage/manifest['executable']
with binary.open('rb') as stream:
    assert hashlib.file_digest(stream, 'sha256').hexdigest() == manifest['executable_sha256']
evidence = Path(os.environ['RUNNER_TEMP'])/'lyco-sdk-order-probe'
evidence.mkdir(parents=True, exist_ok=True)
proof = {'source': os.environ['GITHUB_SHA'], 'run': os.environ['GITHUB_RUN_ID'],
         'manifest': manifest, 'archiveBytesVerified': size, 'archiveSha256Verified': digest.hexdigest(),
         'executableSha256Verified': manifest['executable_sha256'],
         'scope': 'Independent candidate only; default product kernel and user data unchanged'}
(evidence/'candidate-archive.json').write_text(json.dumps(proof, indent=2)+'\n')
with open(os.environ['GITHUB_ENV'], 'a', encoding='utf-8') as env:
    env.write('LYCO_NATIVE_CANDIDATE_PATH='+str(binary)+'\n')
archive_path.unlink()
print(json.dumps(proof, indent=2))
