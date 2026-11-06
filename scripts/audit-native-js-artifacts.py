"""Read and bind original native build evidence on Actions; never run the APK."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import zipfile


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def api(endpoint):
    return json.loads(subprocess.check_output(['gh', 'api', endpoint]))


def checksums(file, directory, apk=None):
    for line in file.read_text().splitlines():
        expected, name = line.split(maxsplit=1)
        name = name.lstrip('*')
        require(re.fullmatch(r'[0-9a-f]{64}', expected), 'Invalid checksum')
        require(Path(name).name == name, 'Checksum path must be a filename')
        target = apk if apk is not None and name == apk.name else directory / name
        require(sha(target) == expected, 'Original file checksum mismatch: ' + name)


def main():
    require(os.environ.get('GITHUB_ACTIONS') == 'true', 'Actions only')
    source_run = sys.argv[1]
    require(re.fullmatch(r'[0-9]{5,20}', source_run), 'Invalid native build run')
    repo = os.environ['GITHUB_REPOSITORY']
    root = Path(os.environ['LYCO_NATIVE_JS_AUDIT'])
    root.mkdir(parents=True, exist_ok=True)
    run = api(f'repos/{repo}/actions/runs/{source_run}')
    require(run['status'] == 'completed' and run['conclusion'] == 'success', 'Successful producer required')
    require(run['event'] == 'workflow_dispatch' and run['path'].split('@')[0] == '.github/workflows/build-universal.yml', 'Unexpected producer workflow')
    commit = run['head_sha']
    require(re.fullmatch(r'[0-9a-f]{40}', commit), 'Invalid source commit')
    metadata = {key: run[key] for key in ['id', 'head_sha', 'event', 'path', 'status', 'conclusion', 'html_url']}
    (root / 'source-run.json').write_text(json.dumps(metadata, indent=2) + '\n')
    subprocess.run(['git', 'fetch', '--no-tags', 'origin', commit], check=True)
    subprocess.run(['git', 'diff', '--exit-code', commit, 'HEAD', '--', 'apps/universal', 'mobile/core', 'src/product-version.js'], check=True)
    response = api(f'repos/{repo}/actions/runs/{source_run}/artifacts?per_page=100')
    require(response['total_count'] <= 100, 'Artifact pagination requires explicit handling')
    specs = [
        ('candidate', 'lyco-android-candidate-', {'LYCO-Browser-Android-preview.apk', 'ANDROID-SHA256SUMS.txt', 'ANDROID-SIGNATURE.txt', 'ANDROID-SIGNATURE-PROVENANCE.json', 'ANDROID-VERSION-PROVENANCE.json', 'ANDROID-PACKAGE.txt'}),
        ('source-map', 'lyco-native-js-source-android-', {'ANDROID-GRADLE-BUNDLE', 'ANDROID-PACKAGER-SOURCE.map', 'ANDROID-JS-PROVENANCE.json', 'ANDROID-JS-SOURCE-SHA256SUMS.txt', 'ANDROID-VERSION-PROVENANCE.json'}),
        ('notices', 'lyco-npm-notices-android-', {'src/npm-notices.json', 'package-lock.json', 'third-party/npm-notice-supplements.json'}),
    ]
    originals = []
    for label, prefix, allowed in specs:
        matches = [a for a in response['artifacts'] if a['name'] == prefix + source_run]
        require(len(matches) == 1 and not matches[0]['expired'], 'Exactly one original artifact required: ' + label)
        artifact = matches[0]
        require(re.fullmatch(r'sha256:[0-9a-f]{64}', artifact.get('digest', '')), 'Original artifact digest required')
        require(0 < artifact['size_in_bytes'] <= 128 * 1024 * 1024, 'Artifact exceeds size bounds')
        directory = root / label
        directory.mkdir()
        archive = directory / 'original.zip'
        with archive.open('wb') as stream:
            subprocess.run(['gh', 'api', f'repos/{repo}/actions/artifacts/{artifact["id"]}/zip'], stdout=stream, check=True)
        require(archive.stat().st_size == artifact['size_in_bytes'] and sha(archive) == artifact['digest'][7:], 'Original ZIP size/digest mismatch')
        with zipfile.ZipFile(archive) as zipped:
            require(len(zipped.namelist()) == len(allowed) and set(zipped.namelist()) == allowed, 'Unexpected or duplicate original paths')
            require(sum(info.file_size for info in zipped.infolist()) <= 512 * 1024 * 1024, 'Expanded artifact exceeds bounds')
            require(zipped.testzip() is None, 'Original ZIP CRC mismatch')
            zipped.extractall(directory / 'files')
        originals.append({key: artifact[key] for key in ['id', 'name', 'size_in_bytes', 'digest']})
    candidate = root / 'candidate/files'
    mapped = root / 'source-map/files'
    notices_dir = root / 'notices/files'
    apk = candidate / 'LYCO-Browser-Android-preview.apk'
    checksums(candidate / 'ANDROID-SHA256SUMS.txt', candidate)
    checksums(mapped / 'ANDROID-JS-SOURCE-SHA256SUMS.txt', mapped, apk)
    signature = json.loads((candidate / 'ANDROID-SIGNATURE-PROVENANCE.json').read_text())
    version = json.loads((candidate / 'ANDROID-VERSION-PROVENANCE.json').read_text())
    binding = json.loads((mapped / 'ANDROID-JS-PROVENANCE.json').read_text())
    for proof in [signature, version, binding]:
        require(proof['commit'] == commit and proof['run'] == source_run, 'Original source/run mismatch')
    require(signature['releaseIdentityMatches'] and signature['releaseSigningRequested'], 'Signed owner candidate required')
    certificate = subprocess.check_output(['openssl', 'x509', '-in', 'resources/signing/android-release-certificate.pem', '-outform', 'DER'])
    require(signature['certificateSha256'] == hashlib.sha256(certificate).hexdigest(), 'Original certificate differs from retained identity')
    require(version['platform'] == 'android' and version['identifier'] == 'top.lain42.lycobrowser', 'Unexpected native application')
    require((mapped / 'ANDROID-VERSION-PROVENANCE.json').read_bytes() == (candidate / 'ANDROID-VERSION-PROVENANCE.json').read_bytes(), 'Original versions differ')
    bundle = mapped / 'ANDROID-GRADLE-BUNDLE'
    source_map = mapped / 'ANDROID-PACKAGER-SOURCE.map'
    require(0 < bundle.stat().st_size <= 64 * 1024 * 1024 and 0 < source_map.stat().st_size <= 64 * 1024 * 1024, 'Source evidence exceeds bounds')
    with zipfile.ZipFile(apk) as zipped:
        require(zipped.testzip() is None and zipped.namelist().count('assets/index.android.bundle') == 1, 'Invalid original APK contents')
        require(zipped.read('assets/index.android.bundle') == bundle.read_bytes(), 'Actual APK bundle mismatch')
    require(binding['bundleMatchesApk'] and binding['apkSha256'] == sha(apk) and binding['packagedBundleSha256'] == sha(bundle) and binding['packagerMapSha256'] == sha(source_map), 'Native map binding mismatch')
    notices_file = notices_dir / 'src/npm-notices.json'
    notices = json.loads(notices_file.read_text())
    require(notices.get('generated') is True and notices.get('lockSha256') == sha(notices_dir / 'package-lock.json'), 'Original notices/lock mismatch')
    require(sha(notices_dir / 'package-lock.json') == sha(Path('apps/universal/package-lock.json')), 'Original build lock differs from pinned source')
    require(isinstance(notices.get('packages'), list) and isinstance(notices.get('review'), list), 'Invalid original notices')
    result = {'sourceRun': source_run, 'sourceCommit': commit, 'analyzerCommit': os.environ['GITHUB_SHA'], 'originals': originals,
              'apkSha256': sha(apk), 'compiledBundleSha256': sha(bundle), 'packagerMapSha256': sha(source_map),
              'lockSha256': notices['lockSha256'], 'noticeSha256': sha(notices_file), 'originalSizeShaCrcVerified': True,
              'actualApkBundleBindingVerified': True, 'releaseCertificateSha256': signature['certificateSha256']}
    (root / 'verified-artifacts.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'sourceRun': source_run, 'sourceCommit': commit, 'apkSha256': result['apkSha256'], 'completeOriginalArtifacts': len(originals)}))


if __name__ == '__main__':
    main()
