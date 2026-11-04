"""Retain the pinned official Go source archive and original notices on Actions."""
import gzip
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import tarfile
import urllib.request


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    require(os.environ.get('GITHUB_ACTIONS') == 'true', 'Actions only')
    version = 'go1.25.5'
    expected = '22a5fd0a91efcd28a1b0537106b9959b2804b61f59c3758b51e8e5429c1a954f'
    catalog_file = Path('apps/universal/src/go-notices.json')
    require(json.loads(catalog_file.read_text())['goVersion'] == version, 'Source version differs from observed native catalog')
    root = Path(os.environ['RUNNER_TEMP']) / 'lyco-go-toolchain-source'
    root.mkdir()
    with urllib.request.urlopen('https://go.dev/dl/?mode=json&include=all', timeout=60) as response:
        metadata = response.read(8 * 1024 * 1024 + 1)
    require(len(metadata) <= 8 * 1024 * 1024, 'Official release metadata exceeds bounds')
    (root / 'official-release-metadata.json').write_bytes(metadata)
    releases = [r for r in json.loads(metadata) if r['version'] == version]
    require(len(releases) == 1, 'Exactly one official pinned release required')
    files = [f for f in releases[0]['files'] if f['kind'] == 'source' and f['filename'] == version + '.src.tar.gz']
    require(len(files) == 1, 'Exactly one official source archive required')
    published = files[0]
    require(published['sha256'] == expected and 0 < published['size'] <= 64 * 1024 * 1024, 'Official pinned archive identity differs')
    archive = root / published['filename']
    url = 'https://go.dev/dl/' + published['filename']
    with urllib.request.urlopen(url, timeout=60) as response, archive.open('wb') as output:
        shutil.copyfileobj(response, output)
    require(archive.stat().st_size == published['size'] and sha(archive) == expected, 'Source archive size/SHA mismatch')
    # Drain the complete gzip stream as well as reading tar members, so the
    # compressed footer CRC is checked even if tar stops at its zero blocks.
    with gzip.open(archive, 'rb') as stream:
        while stream.read(1024 * 1024):
            pass
    notices = []
    index = []
    output = root / 'original-notices'
    output.mkdir()
    with tarfile.open(archive, 'r:gz') as tar:
        members = tar.getmembers()
        require(len(members) <= 50000 and sum(m.size for m in members) <= 1024 * 1024 * 1024, 'Expanded source exceeds bounds')
        require(len({m.name for m in members}) == len(members), 'Duplicate source paths')
        names = {m.name for m in members}
        require({'go/VERSION', 'go/LICENSE', 'go/src/runtime/runtime2.go', 'go/src/cmd/compile/main.go', 'go/src/cmd/cgo/main.go'} <= names, 'Incomplete official source tree')
        require(tar.extractfile('go/VERSION').read().splitlines()[0].decode() == version, 'Original VERSION differs')
        for member in members:
            require(member.name.startswith('go/') and '..' not in PurePosixPath(member.name).parts, 'Unexpected original source path')
            if not member.isfile():
                index.append({'path': member.name, 'kind': 'directory' if member.isdir() else 'link-or-other', 'link': member.linkname})
                continue
            stream = tar.extractfile(member)
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
            index.append({'path': member.name, 'bytes': member.size, 'sha256': digest})
            basename = PurePosixPath(member.name).name.lower()
            if re.match(r'^(licen[cs]e|copying|copyright|notice|patents|authors)([._-]|$)', basename):
                require(member.size <= 16 * 1024 * 1024, 'Notice exceeds bounds')
                raw = tar.extractfile(member).read()
                name = f'notice-{len(notices):03d}.txt'
                (output / name).write_bytes(raw)
                notices.append({'originalPath': member.name, 'retainedFile': name, 'bytes': len(raw), 'sha256': digest})
    proof = {'schemaVersion': 1, 'run': os.environ['GITHUB_RUN_ID'], 'source': os.environ['GITHUB_SHA'],
             'version': version, 'officialMetadataUrl': 'https://go.dev/dl/?mode=json&include=all',
             'officialMetadataSha256': sha(root / 'official-release-metadata.json'),
             'archiveUrl': url, 'archiveBytes': archive.stat().st_size, 'archiveSha256': expected,
             'officialPublishedSizeShaMatched': True, 'completeGzipCrcVerified': True,
             'observedNativeGoCatalogSha256': sha(catalog_file), 'fileIndex': index, 'noticeCandidates': notices,
             'scope': 'Exact official compiler/runtime/standard-library source and verbatim notice candidates for the observed Go version; no build or target execution',
             'nativeBinaryReproductionProven': False, 'completeCorrespondingSourceProven': False,
             'completeLicenseClearanceProven': False,
             'limits': ['Not a per-file linked-code inventory', 'Does not cover NDK/cgo C dependencies, generated bindings or other native libraries',
                        'Does not prove source-to-binary reproduction or packaging of these notices in a client']}
    (root / 'GO-TOOLCHAIN-SOURCE.json').write_text(json.dumps(proof, indent=2) + '\n')
    print(json.dumps({'version': version, 'archiveBytes': proof['archiveBytes'], 'archiveSha256': expected,
                      'indexedEntries': len(index), 'noticeCandidateFiles': len(notices), 'nativeBinaryReproductionProven': False}))


if __name__ == '__main__':
    main()
