"""Actions-only static inspection of the fixed official Wayfern candidate ZIP."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
from collections import defaultdict
import urllib.request
import zipfile

assert os.environ.get('GITHUB_ACTIONS') == 'true', 'Archive inspection runs in Actions only'
root = Path(__file__).resolve().parents[1]
manifest = json.loads((root/'resources/native-sdk/wayfern-155-windows.json').read_text())
assert manifest['version'] == '155.0.8059.79' and manifest['platform'] == 'windows-x64'
assert manifest['url'] == 'https://download.wayfern.com/wayfern-155.0.8059.79_windows_x64.zip'
assert type(manifest['expected_bytes']) is int and 0 < manifest['expected_bytes'] <= 2*1024**3
evidence = Path(os.environ['RUNNER_TEMP'])/'lyco-wayfern-archive-audit'
evidence.mkdir(parents=True, exist_ok=True)
archive_path = Path(os.environ['RUNNER_TEMP'])/'lyco-wayfern-discovery.zip'
request = urllib.request.Request(manifest['url'], headers={'User-Agent': 'LYCO-official-archive-audit/1.0'})
digest = hashlib.sha256()
size = 0
with urllib.request.urlopen(request, timeout=60) as response, archive_path.open('xb') as stream:
    assert response.status == 200 and response.url == manifest['url'], 'Unexpected download response or redirect'
    length = response.headers.get('Content-Length')
    headers = {'url': response.url, 'status': response.status, 'contentLength': length}
    (evidence/'download-headers.json').write_text(json.dumps(headers, indent=2)+'\n')
    print(json.dumps(headers), flush=True)
    assert length is not None and int(length) == manifest['expected_bytes'], 'Official archive length changed'
    for block in iter(lambda: response.read(1024*1024), b''):
        size += len(block)
        assert size <= manifest['expected_bytes'], 'Archive exceeds its observed official length'
        stream.write(block)
        digest.update(block)
assert size == manifest['expected_bytes'], 'Incomplete archive download'
result = {
    'source': os.environ['GITHUB_SHA'], 'run': os.environ['GITHUB_RUN_ID'],
    'manifest': manifest, 'archiveBytes': size, 'archiveSha256': digest.hexdigest(),
    'browserExecuted': False, 'productAdopted': False, 'compatibilityPassed': False,
    'scope': 'Static official ZIP inspection only; archive CRC and executable digest do not prove product compatibility',
}
with zipfile.ZipFile(archive_path) as archive:
    rows = archive.infolist()
    assert rows and len(rows) <= 10000 and sum(row.file_size for row in rows) <= 8*1024**3, 'Unexpected expanded archive size'
    for row in rows:
        path = PurePosixPath(row.filename.replace('\\', '/'))
        assert not path.is_absolute() and '..' not in path.parts and not re.match(r'^[A-Za-z]:', str(path))
        assert not stat.S_ISLNK(row.external_attr >> 16), 'Unexpected archive symlink'
    assert archive.testzip() is None, 'Archive CRC mismatch'
    executables = [row for row in rows if PurePosixPath(row.filename).name.lower() == 'chrome.exe']
    assert len(executables) == 1, 'Expected exactly one native Chrome executable'
    executable = executables[0]
    with archive.open(executable) as stream:
        executable_digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    result['executable'] = {'path': executable.filename, 'bytes': executable.file_size, 'sha256': executable_digest}
    result['fileCount'] = len(rows)
    result['expandedBytes'] = sum(row.file_size for row in rows)
    by_windows_path = defaultdict(list)
    for row in rows:
        by_windows_path[PurePosixPath(row.filename.replace('\\', '/')).as_posix().casefold()].append(row)
    result['windowsPathCollisions'] = []
    for group in by_windows_path.values():
        if len(group) < 2:
            continue
        observed = []
        for row in group:
            entry = {'path': row.filename, 'directory': row.is_dir(), 'bytes': row.file_size}
            if not row.is_dir():
                with archive.open(row) as stream:
                    entry['sha256'] = hashlib.file_digest(stream, 'sha256').hexdigest()
            observed.append(entry)
        result['windowsPathCollisions'].append(observed)
    (evidence/'archive-paths.json').write_text(json.dumps([{'path': row.filename, 'bytes': row.file_size, 'directory': row.is_dir()} for row in rows], indent=2)+'\n')
    result['publicNotices'] = []
    notice_names = {'license', 'license.txt', 'license.chromium.html', 'licenses.chromium.html', 'notice', 'notice.txt', 'credits.html'}
    for row in rows:
        if PurePosixPath(row.filename).name.lower() not in notice_names or row.file_size > 4*1024**2:
            continue
        raw = archive.read(row)
        text = raw.decode('utf-8')
        name = 'notice-'+str(len(result['publicNotices']))+'.txt'
        (evidence/name).write_bytes(raw)
        result['publicNotices'].append({'path': row.filename, 'evidence': name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})
(evidence/'RESULT.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result, indent=2))
archive_path.unlink()
