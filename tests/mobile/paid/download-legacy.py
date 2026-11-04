"""Recover the exact signed historical fixture; never rebuild or relax device checks."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import zipfile

assert os.environ.get('GITHUB_ACTIONS') == 'true', 'Run only in genuine Actions'
repo = os.environ['GITHUB_REPOSITORY']
assert repo == 'lilyco-42/lyco-browser'
manifest = json.loads(Path(__file__).with_name('legacy-aaec002.json').read_text())
root = Path(os.environ['RUNNER_TEMP'])
target = root / 'lyco-paid-legacy'
evidence = root / 'lyco-mobile-paid'
target.mkdir(parents=True, exist_ok=True)
evidence.mkdir(parents=True, exist_ok=True)
assert not any(target.iterdir()), 'Never mix fixture downloads'


def api(path):
    return json.loads(subprocess.check_output(['gh', 'api', f'repos/{repo}/{path}']))


def download(path, destination, accept=None):
    args = ['gh', 'api', f'repos/{repo}/{path}']
    if accept:
        args += ['-H', 'Accept: ' + accept]
    with destination.open('wb') as output:
        subprocess.run(args, stdout=output, check=True)


def verify(path, expected):
    assert path.stat().st_size == expected['bytes'], f'Fixture size mismatch: {path.name}'
    with path.open('rb') as stream:
        actual = hashlib.file_digest(stream, 'sha256').hexdigest()
    assert actual == expected['sha256'], f'Fixture digest mismatch: {path.name}'


run = api(f'actions/runs/{manifest["sourceRun"]}')
assert run['id'] == manifest['sourceRun'] and run['head_sha'] == manifest['sourceCommit']
assert run['status'] == 'completed' and run['conclusion'] == 'success'
assert run['event'] == 'workflow_dispatch' and run['path'] == '.github/workflows/build-universal.yml'
listing = api(f'actions/runs/{run["id"]}/artifacts?per_page=100')
assert listing['total_count'] <= 100, 'Ambiguous historical artifact inventory'
named = [a for a in listing['artifacts'] if a['name'] == f'lyco-android-candidate-{run["id"]}']
assert len(named) <= 1, 'Ambiguous historical candidate'
available = [a for a in named if not a['expired']]
receipt = {'sourceRun': run['id'], 'sourceCommit': run['head_sha'], 'apkModified': False,
           'rebuiltOrResigned': False, 'files': manifest['files']}
if available:
    artifact, = available
    archive_path = root / 'lyco-paid-legacy-original.zip'
    download(f'actions/artifacts/{artifact["id"]}/zip', archive_path)
    verify(archive_path, {'bytes': artifact['size_in_bytes'], 'sha256': artifact['digest'].removeprefix('sha256:')})
    with zipfile.ZipFile(archive_path) as archive:
        assert len(archive.namelist()) == len(manifest['files'])
        assert set(archive.namelist()) == set(manifest['files'])
        assert archive.testzip() is None
        archive.extractall(target)
    receipt.update(source='original-actions-artifact', artifactId=artifact['id'], artifactDigest=artifact['digest'])
else:
    # Only authoritative absence/expiration permits this exact retained mirror.
    # HTTP/download/hash errors above fail the job; they never trigger fallback.
    release = api(f'releases/{manifest["mirrorReleaseId"]}')
    assert release['id'] == manifest['mirrorReleaseId'] and release['draft'] is True
    assert release['tag_name'] == manifest['mirrorTag']
    assert release['target_commitish'] == manifest['sourceCommit']
    assets = {asset['name']: asset for asset in release['assets']}
    assert len(assets) == len(release['assets']) and set(assets) == set(manifest['files'])
    for name, expected in manifest['files'].items():
        asset = assets[name]
        assert asset['state'] == 'uploaded' and asset['size'] == expected['bytes']
        assert asset['digest'] == 'sha256:' + expected['sha256']
        download(f'releases/assets/{asset["id"]}', target / name, 'application/octet-stream')
        verify(target / name, expected)
    receipt.update(source='unpublished-exact-retained-draft', releaseId=release['id'],
                   originalArtifactAbsentOrExpired=True,
                   assetIds={name: asset['id'] for name, asset in assets.items()})
for name, expected in manifest['files'].items():
    verify(target / name, expected)
version = json.loads((target / 'ANDROID-VERSION-PROVENANCE.json').read_text())
signature = json.loads((target / 'ANDROID-SIGNATURE-PROVENANCE.json').read_text())
for metadata in [version, signature]:
    assert metadata['commit'] == manifest['sourceCommit'] and metadata['run'] == str(run['id'])
assert version['platform'] == 'android' and version['identifier'] == manifest['identifier']
assert version['version'] == manifest['version'] and version['build'] == manifest['build']
assert signature['certificateSha256'] == manifest['certificateSha256']
assert signature['releaseIdentityMatches'] is True and signature['releaseSigningRequested'] is True
with zipfile.ZipFile(target / 'LYCO-Browser-Android-preview.apk') as archive:
    assert archive.testzip() is None
(evidence / 'legacy-fetch.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'historicalSource': run['head_sha'], 'fixtureSource': receipt['source'],
                  'apkSha256': manifest['files']['LYCO-Browser-Android-preview.apk']['sha256'],
                  'rebuiltOrResigned': False, 'actualSignatureAndDeviceChecksStillRequired': True}))
