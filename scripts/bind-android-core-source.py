"""Bind this build's retained Go compiler inputs to its actual Android APK."""
from pathlib import Path
import gzip
import hashlib
import io
import json
import os
import struct
import subprocess
import tarfile
import zipfile


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def checked_archive(path):
    # Read through the gzip trailer as well as the tar end marker.
    with gzip.open(path, 'rb') as stream:
        while stream.read(1024 * 1024):
            pass
    archive = tarfile.open(path, 'r:gz')
    members = archive.getmembers()
    names = [m.name for m in members]
    assert len(names) == len(set(names)), 'Duplicate source archive path'
    assert all(not Path(n).is_absolute() and '..' not in Path(n).parts for n in names)
    assert all(m.isfile() or m.isdir() for m in members), 'Unexpected source link/device'
    return archive


def json_file(archive, name):
    return json.loads(archive.extractfile(name).read())


def allocated_elf(raw):
    """Read ELF64 little-endian runtime sections without loading the library."""
    assert raw[:6] == b'\x7fELF\x02\x01'
    offset = struct.unpack_from('<Q', raw, 40)[0]
    entry_size, count, names_index = struct.unpack_from('<HHH', raw, 58)
    assert entry_size == 64 and 0 < count < 65535 and names_index < count
    assert offset + count * entry_size <= len(raw)
    headers = [struct.unpack_from('<IIQQQQIIQQ', raw, offset + i * entry_size) for i in range(count)]
    names_header = headers[names_index]
    names = raw[names_header[4]:names_header[4] + names_header[5]]
    result = {}
    for name_offset, kind, flags, address, file_offset, size, link, info, alignment, entity_size in headers:
        if not flags & 2:  # ELF SHF_ALLOC: contributes to process memory.
            continue
        assert name_offset < len(names)
        end = names.index(0, name_offset)
        name = names[name_offset:end].decode('ascii')
        assert name and name not in result
        assert kind == 8 or file_offset + size <= len(raw)  # SHT_NOBITS has no file data.
        content = None if kind == 8 else hashlib.sha256(raw[file_offset:file_offset + size]).hexdigest()
        result[name] = {'type': kind, 'flags': flags, 'address': address, 'bytes': size,
                        'alignment': alignment, 'entityBytes': entity_size, 'sha256': content}
    assert len(result) > 5
    program_offset = struct.unpack_from('<Q', raw, 32)[0]
    program_size, program_count = struct.unpack_from('<HH', raw, 54)
    assert program_size == 56 and program_offset + program_size * program_count <= len(raw)
    programs = raw[program_offset:program_offset + program_size * program_count]
    return {'sections': result, 'programHeadersSha256': hashlib.sha256(programs).hexdigest(),
            'fixedHeaderSha256': hashlib.sha256(raw[:40] + raw[48:58]).hexdigest()}


def main():
    assert os.environ.get('GITHUB_ACTIONS') == 'true', 'Genuine Actions required'
    temporary = Path(os.environ['RUNNER_TEMP'])
    repository = Path(__file__).resolve().parents[1]
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repository, text=True).strip()
    assert commit == os.environ['GITHUB_SHA']
    published = temporary / 'lyco-binding-capture-android/published'
    capture = json.loads((published / 'manifest.json').read_text())
    assert capture['run'] == os.environ['GITHUB_RUN_ID'] and capture['testedGitCommit'] == commit
    assert capture['actualInputsUnchangedDuringCompile'] is True
    assert capture['actualCompilerOutputsEqualPackagedLibraries'] is True
    aar = temporary / 'lyco-tunnel.aar'
    generated = temporary / 'lyco-generated-bindings-android.tar.gz'
    source = temporary / 'lyco-mobile-core-source.tar.gz'
    apk = temporary / 'LYCO-Browser-Android-preview.apk'
    assert sha(aar) == capture['componentAar']['sha256']
    assert aar.stat().st_size == capture['componentAar']['bytes']
    for path in (generated, source):
        assert path.with_name(path.name + '.sha256').read_text().split() == [sha(path), path.name]

    with checked_archive(generated) as archive:
        prefix = 'lyco-generated-bindings-android/'
        assert json_file(archive, prefix + 'manifest.json') == capture
        for row in capture['retainedWorkSourceFiles']:
            value = archive.extractfile(prefix + row['path']).read()
            assert len(value) == row['bytes'] and hashlib.sha256(value).hexdigest() == row['sha256']
        calls = capture['compilerCalls']
        assert len(calls) == 2 and {c['goarch'] for c in calls} == {'arm64', 'amd64'}
        for call in calls:
            assert call['workflowSha'] == commit and call['run'] == os.environ['GITHUB_RUN_ID']
            assert call['exitCode'] == 0 and call['inputsUnchanged'] is True
            folder = str(Path(call['receipt']).parent)
            for row in call['sourceFiles']:
                value = archive.extractfile(prefix + folder + '/sources/' + row['path']).read()
                assert len(value) == row['bytes'] and hashlib.sha256(value).hexdigest() == row['sha256']
            for name, expected in capture['resolvedCoreLocks'].items():
                value = archive.extractfile(prefix + folder + '/core-' + name).read()
                assert call['resolvedCoreLocks'][name] == expected
                assert hashlib.sha256(value).hexdigest() == expected

    with checked_archive(source) as archive:
        prefix = 'lyco-mobile-core-source/'
        parent = json_file(archive, prefix + 'manifest.json')
        assert parent['applicationCommit'] == commit
        assert parent['generatedBindings']['archiveSha256'] == sha(generated)
        assert parent['generatedBindings']['componentAar'] == capture['componentAar']
        assert hashlib.file_digest(archive.extractfile(prefix + 'generated-bindings-android.tar.gz'), 'sha256').hexdigest() == sha(generated)
        for name, expected in capture['resolvedCoreLocks'].items():
            assert hashlib.sha256(archive.extractfile(prefix + 'resolved-core-lock/' + name).read()).hexdigest() == expected
        expected_modules = {prefix + module['directory'] + '/' + name: expected
                            for module in parent['modules'] for name, expected in module['sha256'].items()}
        assert len(expected_modules) == len(parent['modules']) * 3
        # Follow physical tar order: numeric module indices are stored in
        # lexical order, so seeking index-by-index repeatedly rewinds gzip.
        for member in archive.getmembers():
            if member.name in expected_modules:
                assert hashlib.file_digest(archive.extractfile(member), 'sha256').hexdigest() == expected_modules.pop(member.name)
        assert not expected_modules

    expected = {'jni/arm64-v8a/libgojni.so': ('arm64', 183), 'jni/x86_64/libgojni.so': ('amd64', 62)}
    libraries = []
    with zipfile.ZipFile(aar) as component, zipfile.ZipFile(apk) as application:
        assert component.testzip() is None and application.testzip() is None
        assert len(application.namelist()) == len(set(application.namelist()))
        actual = {n for n in application.namelist() if n.endswith('/libgojni.so')}
        assert actual == {n.replace('jni/', 'lib/', 1) for n in expected}
        classes = component.read('classes.jar')
        assert hashlib.sha256(classes).hexdigest() == capture['componentAar']['classesJarSha256']
        installed = repository / 'apps/universal/modules/lyco-mobile-browser/android'
        assert (installed / 'libs/lyco-tunnel.jar').read_bytes() == classes
        with zipfile.ZipFile(io.BytesIO(classes)) as archive:
            assert archive.testzip() is None
        for name, (arch, machine) in expected.items():
            raw = component.read(name)
            target = name.replace('jni/', 'lib/', 1)
            assert (installed / 'src/main/jniLibs' / Path(name).relative_to('jni')).read_bytes() == raw
            assert raw[:6] == b'\x7fELF\x02\x01' and int.from_bytes(raw[18:20], 'little') == machine
            call, = [c for c in calls if c['goarch'] == arch]
            digest = hashlib.sha256(raw).hexdigest()
            assert call['output']['sha256'] == digest and call['output']['bytes'] == len(raw)
            intermediates = repository / 'apps/universal/android/app/build/intermediates'
            merged = intermediates / 'merged_native_libs/release/mergeReleaseNativeLibs/out' / target
            stripped = intermediates / 'stripped_native_libs/release/stripReleaseDebugSymbols/out' / target
            assert merged.read_bytes() == raw
            packaged = application.read(target)
            assert stripped.read_bytes() == packaged
            before, after = allocated_elf(raw), allocated_elf(packaged)
            assert before == after, 'Packaged core changes allocated ELF sections or program headers'
            libraries.append({'apkPath': target, 'compilerOutputSha256': digest, 'compilerOutputBytes': len(raw),
                              'apkSha256': hashlib.sha256(packaged).hexdigest(), 'apkBytes': len(packaged),
                              'elfMachine': machine, 'compilerCallReceipt': call['receipt'],
                              'actualMergedLibraryMatchesCompiler': True, 'actualStrippedLibraryMatchesApk': True,
                              'rawByteIdentical': raw == packaged, 'allocatedElf': before,
                              'strippingToolIdentityProven': False})

    signature = json.loads((temporary / 'ANDROID-SIGNATURE-PROVENANCE.json').read_text())
    version = json.loads((temporary / 'ANDROID-VERSION-PROVENANCE.json').read_text())
    assert version['commit'] == commit and version['run'] == os.environ['GITHUB_RUN_ID']
    artifacts = {p.name: {'bytes': p.stat().st_size, 'sha256': sha(p)} for p in (apk, aar, source, generated)}
    proof = {'run': os.environ['GITHUB_RUN_ID'], 'testedGitCommit': commit,
             'artifacts': artifacts, 'actualCompilerOutputsMatchInstalledAndMergedLibraries': True,
             'packagedBytesMatchActualGradleStrippedLibraries': True,
             'allocatedElfSectionsAndProgramHeadersMatchCompilerOutput': True,
             'generatedSourcesRetainedAndMatched': True, 'bothCompilerAndOuterLocksMatch': True,
             'nativeLibraries': libraries, 'sourceModuleCount': len(parent['modules']),
             'signatureProvenance': signature, 'versionProvenance': version,
             'completeCorrespondingSourceProven': False, 'reproducibleBuildProven': False,
             'allNativeLicensesCleared': False, 'browserPrivacyPassed': False,
             'scope': 'Current APK network-core compiler/source/AAR/installed/merged/stripped JNI chain. Actual APK bytes equal Gradle stripped output; allocated ELF sections and program headers equal actual compiler output. Raw byte equality is separately recorded, not assumed. Stripping tool identity, older APK correspondence, all native/SDK/NDK/JavaScript sources, privacy, runtime acceptance and commercial release remain unproven.'}
    (temporary / 'ANDROID-CORE-SOURCE-PROVENANCE.json').write_text(json.dumps(proof, indent=2) + '\n')
    names = list(artifacts) + ['ANDROID-CORE-SOURCE-PROVENANCE.json']
    (temporary / 'ANDROID-CORE-SOURCE-SHA256SUMS.txt').write_text(''.join(sha(temporary / n) + '  ' + n + '\n' for n in names))
    print(json.dumps({'coreSourceBoundToApk': True, 'libraries': len(libraries), 'modules': len(parent['modules']), 'completeCorrespondingSourceProven': False}))


if __name__ == '__main__':
    main()
