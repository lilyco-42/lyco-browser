"""Inspect real product dependency compatibility in an isolated Actions copy."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import zipfile

if os.environ.get('GITHUB_ACTIONS') != 'true':
    raise SystemExit('Genuine Actions required')
assert '/.github/workflows/gecko-product-compat.yml@' in os.environ['GITHUB_WORKFLOW_REF']
assert sys.argv[1:] in (['source'], ['stage'], ['toolchain'], ['adapt'], ['collect'])
phase = sys.argv[1]
inputs = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text()).get('inputs', {}) or {}
compile_platform = inputs.get('compile_platform', 'generated')
compile_requested = inputs.get('compile_product', 'false') in (True, 'true')
assert compile_platform in ('generated', '37.2')
if compile_platform == '37.2':
    assert inputs.get('toolchain') == 'sdk58'
if compile_requested:
    assert inputs.get('inspect') in (True, 'true')
    assert inputs.get('toolchain') == 'sdk58' and compile_platform == '37.2'
root = Path(os.environ['GITHUB_WORKSPACE']).resolve()
temporary = Path(os.environ['RUNNER_TEMP']).resolve()
evidence = temporary / 'lyco-gecko-product-compat'
evidence.mkdir(parents=True, exist_ok=True)
stage = temporary / 'lyco-gecko-product-copy'
pins = {
    'apps/universal/modules/lyco-mobile-browser/android/build.gradle': '2e8f9ee1db5cbdcc2075d71c940d9cbf042c3e6bbafda0730c9768c26b26304c',
    'apps/universal/app.json': 'bae1e6598c92cd196b326653213acd9df7088c61b75903be36c50b6978b534cf',
    'apps/universal/package.json': '7a19a1a085c3f5bc146127ebdbd73a3bb9de2989e7ca7709770475d539863d60',
    'apps/universal/package-lock.json': '9bbdc713ccb2aaeb08dc1c34accedc7d84f52b3c17d155906c8732a5d8e035e6',
    'tests/mobile/engine/download-source-engine.sh': 'c74cc1910d02c97514603a19a3f45ccfbe70b46a36d50114c52178d82f4e6414',
}


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


for name, expected in pins.items():
    assert digest(root / name) == expected, name
core_tree = subprocess.check_output(['git', 'rev-parse', 'HEAD:mobile/core'],
                                    cwd=root, text=True).strip()
assert core_tree == '22e63f5e223f6466858f77be9516a3c2c680e0e4', 'Original Go core source changed'

if phase == 'source':
    source_files = {name: digest(root / name) for name in [
        'tests/mobile/engine/product-compat/prepare.py',
        'tests/mobile/engine/product-compat/inspect.gradle',
        '.github/workflows/gecko-product-compat.yml',
        'mobile/core/build-native.sh', 'mobile/core/install-android.py',
        'mobile/core/bundle-source.py', 'mobile/core/capture-go-build.py',
        'mobile/core/retain-generated.py',
    ]}
    for name in [*pins, *source_files]:
        target = evidence / 'source' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / name, target)
    (evidence / 'SOURCE.json').write_text(json.dumps({
        'run': os.environ['GITHUB_RUN_ID'], 'source': os.environ['GITHUB_SHA'],
        'originalPins': pins, 'newSources': source_files,
        'originalCoreTree': core_tree,
        'scope': 'Source integrity and real Actions parsing only; no dependency, native compile or runtime proof',
        'productChanged': False, 'compiled': False, 'runtimeProven': False,
    }, indent=2) + '\n')
elif phase == 'stage':
    assert not stage.exists(), 'Never reuse a previous product copy'
    stage.mkdir()
    archive = temporary / 'lyco-gecko-product-tracked.tar'
    with archive.open('wb') as output:
        subprocess.run(['git', 'archive', '--format=tar', os.environ['GITHUB_SHA']],
                       cwd=root, stdout=output, check=True)
    with tarfile.open(archive) as tracked:
        for entry in tracked.getmembers():
            assert not entry.name.startswith('/') and '..' not in Path(entry.name).parts
            assert entry.isfile() or entry.isdir(), 'No links or devices in product copy'
        tracked.extractall(stage, filter='data')
    archive.unlink()
    for name, expected in pins.items():
        assert digest(stage / name) == expected
    core_files = subprocess.check_output(['git', 'ls-files', 'mobile/core'],
                                        cwd=root, text=True).splitlines()
    for name in core_files:
        assert (stage / name).read_bytes() == (root / name).read_bytes(), name
    (evidence / 'STAGED-INPUTS.json').write_text(json.dumps({
        'source': os.environ['GITHUB_SHA'], 'originalPinsCopiedExactly': pins,
        'scope': 'Before npm/Expo generation; generated changes are retained separately',
    }, indent=2) + '\n')
    with Path(os.environ['GITHUB_ENV']).open('a') as environment:
        environment.write('LYCO_PRODUCT_COMPAT_ROOT=' + str(stage) + '\n')
        environment.write('LYCO_PRODUCT_COMPILE_REQUESTED=' + str(compile_requested).lower() + '\n')
elif phase == 'toolchain':
    # Only an explicit optional workflow path upgrades the disposable copy.
    # Keep complete lock/manifests at both official incremental SDK steps.
    expected = os.environ['LYCO_TOOLCHAIN_STAGE']
    assert expected in ('57', '58')
    product = stage / 'apps/universal'
    installed = {}
    for name in ['expo', 'react-native', 'react', 'expo-modules-core']:
        package = product / 'node_modules' / name / 'package.json'
        value = json.loads(package.read_text())
        installed[name] = value['version']
    assert installed['expo'].split('.')[0] == expected
    checkpoint = evidence / ('sdk-' + expected)
    checkpoint.mkdir()
    for name in ['package.json', 'package-lock.json', 'app.json']:
        shutil.copyfile(product / name, checkpoint / name)
    for name, original in pins.items():
        if name not in ('apps/universal/package.json', 'apps/universal/package-lock.json'):
            assert digest(stage / name) == original, 'Upgrade altered protected input: ' + name
    # An SDK upgrade may update dependency/configuration files, never our
    # browser module, profile storage, page scripts or other product sources.
    tracked = subprocess.check_output(['git', 'ls-files', 'apps/universal'],
                                      cwd=root, text=True).splitlines()
    allowed = {'apps/universal/package.json', 'apps/universal/package-lock.json'}
    for name in tracked:
        if name not in allowed:
            assert (stage / name).read_bytes() == (root / name).read_bytes(), name
    (checkpoint / 'VERSIONS.json').write_text(json.dumps({
        'source': os.environ['GITHUB_SHA'], 'run': os.environ['GITHUB_RUN_ID'],
        'stage': expected, 'installed': installed,
        'allOtherTrackedProductFilesUnchanged': True,
        'scope': 'Disposable candidate dependencies only; not product adoption or runtime',
    }, indent=2) + '\n')
elif phase == 'adapt':
    assert stage.is_dir()
    # Expo prebuild can generate script entries in package.json. Preserve those
    # actual generated bytes rather than assume all inputs remain byte-identical.
    for name in ['apps/universal/modules/lyco-mobile-browser/android/build.gradle',
                 'tests/mobile/engine/download-source-engine.sh']:
        assert digest(stage / name) == pins[name], 'Unexpected native/source adaptation: ' + name
    generated_inputs = {}
    for name in pins:
        generated_inputs[name] = digest(stage / name)
        target = evidence / 'after-prebuild' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(stage / name, target)
    engine = Path(os.environ['LYCO_ENGINE_AAR']).resolve()
    maven = Path(os.environ['LYCO_ENGINE_MAVEN_ROOT']).resolve()
    assert engine.is_relative_to(temporary) and maven.is_relative_to(temporary)
    assert digest(engine) == 'a141db25e9a2c3c8091f4b7c83e21f1d38ddd2b9a0ce43b1c1cb1433d824d016'
    assert engine.stat().st_size == 91628401
    with zipfile.ZipFile(engine) as aar:
        assert aar.testzip() is None
        metadata = aar.read('META-INF/com/android/build/gradle/aar-metadata.properties')
    (evidence / 'source-engine-aar-metadata.properties').write_bytes(metadata)
    module = stage / 'apps/universal/modules/lyco-mobile-browser/android/build.gradle'
    original = module.read_bytes()
    # Default: dependency/repository only. The explicit SDK58/API37.2 path
    # changes the consumer platform, never the source AAR or version checks.
    addition = '''
dependencies {
  implementation 'top.lain42.experimental:geckoview-source:159.0-route-experiment'
}
'''
    platform_addition = '''
android {
  compileSdk { version = release(37) { minorApiLevel = 2 } }
}
''' if compile_platform == '37.2' else ''
    addition += platform_addition
    module.write_bytes(original + addition.encode())
    (evidence / 'module-build.original.gradle').write_bytes(original)
    (evidence / 'module-build.adapted.gradle').write_bytes(module.read_bytes())
    # A library's repositories do not define the consuming app's repository
    # set. Register only this exact local coordinate for every product project.
    root_build = stage / 'apps/universal/android/build.gradle'
    original_root = root_build.read_bytes()
    repository_addition = '''
allprojects {
  repositories {
    maven {
      url uri(System.getenv('LYCO_ENGINE_MAVEN_ROOT'))
      content { includeModule 'top.lain42.experimental', 'geckoview-source' }
    }
  }
}
'''
    # Expo itself consumes the owned module. App-only SDK configuration passed
    # its metadata gate but the real native build exposed :expo at SDK37.0.
    # Finalize each ordinary Android module's DSL through the public AGP API,
    # after its own defaults and before variants/tasks. Never skip its checks.
    project_platform_preamble = '''
subprojects { candidateProject ->
  ['com.android.application', 'com.android.library'].each { pluginId ->
    candidateProject.pluginManager.withPlugin(pluginId) {
      candidateProject.extensions.getByName('androidComponents').finalizeDsl { androidDsl ->
        def before = [compileSdkHash: androidDsl.compileSdkVersion,
                      minSdk: androidDsl.defaultConfig.minSdk?.toString(),
                      targetSdk: androidDsl.defaultConfig.targetSdk?.toString()]
        androidDsl.compileSdk {
          version = release(37) { minorApiLevel = 2 }
        }
        def after = [compileSdkHash: androidDsl.compileSdkVersion,
                     minSdk: androidDsl.defaultConfig.minSdk?.toString(),
                     targetSdk: androidDsl.defaultConfig.targetSdk?.toString()]
        assert before.minSdk == after.minSdk && before.targetSdk == after.targetSdk
        def receipt = new File(System.getenv('RUNNER_TEMP'),
            'lyco-gecko-product-compat/module-platform-changes.jsonl')
        receipt << groovy.json.JsonOutput.toJson([project: candidateProject.path,
            before: before, after: after]) + '\\n'
      }
    }
  }
}
''' if compile_requested else ''
    # Expo's root plugin can eagerly evaluate/finalize children. Register the
    # public callbacks before that original plugin executes, not after it.
    root_build.write_bytes(project_platform_preamble.encode() + original_root + repository_addition.encode())
    (evidence / 'root-build.original.gradle').write_bytes(original_root)
    (evidence / 'root-build.adapted.gradle').write_bytes(root_build.read_bytes())
    app_build = stage / 'apps/universal/android/app/build.gradle'
    app_original = app_build.read_bytes()
    app_build.write_bytes(app_original + platform_addition.encode())
    (evidence / 'app-build.original.gradle').write_bytes(app_original)
    (evidence / 'app-build.adapted.gradle').write_bytes(app_build.read_bytes())
    (evidence / 'ADAPTATION.json').write_text(json.dumps({
        'source': os.environ['GITHUB_SHA'], 'run': os.environ['GITHUB_RUN_ID'],
        'originalPins': pins, 'afterPrebuildInputHashes': generated_inputs,
        'customNativeBuildFilesAdapted': [str(module.relative_to(stage)), str(root_build.relative_to(stage))]
                                      + ([str(app_build.relative_to(stage))] if platform_addition else []),
        'appendedText': addition, 'originalModuleSha256': hashlib.sha256(original).hexdigest(),
        'adaptedModuleSha256': digest(module), 'sourceEngineRun': 41940576338,
        'rootRepositoryAppendedText': repository_addition,
        'rootPlatformPrependedText': project_platform_preamble,
        'originalGeneratedRootSha256': hashlib.sha256(original_root).hexdigest(),
        'adaptedGeneratedRootSha256': digest(root_build),
        'sourceEngineAarSha256': digest(engine), 'sourceEngineAarBytes': engine.stat().st_size,
        'compileSdkOverridden': bool(platform_addition), 'versionChecksSuppressed': False,
        'requestedCompilePlatform': compile_platform,
        'appPlatformAppendedText': platform_addition,
        'originalGeneratedAppSha256': hashlib.sha256(app_original).hexdigest(),
        'adaptedGeneratedAppSha256': digest(app_build),
        'productRuntimeChanged': False, 'originalWebviewRootOrProfileSchemaChanged': False,
        'scope': 'Actual current Expo product dependency metadata gate in disposable copy; not bridge/runtime adoption',
    }, indent=2) + '\n')
    native = stage / 'apps/universal/android'
    for name in ['build.gradle', 'settings.gradle', 'gradle.properties',
                 'gradle/wrapper/gradle-wrapper.properties', 'app/build.gradle']:
        target = evidence / 'generated-android' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(native / name, target)
    # These exact installed catalogues distinguish actual npm bytes from
    # documentation/tag expectations. Missing catalogues fail the preparation.
    modules = stage / 'apps/universal/node_modules'
    for name in ['@react-native/gradle-plugin/gradle/libs.versions.toml',
                 '@react-native/gradle-plugin/package.json', 'react-native/package.json',
                 'expo/package.json', 'expo-modules-core/package.json']:
        target = evidence / 'installed' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(modules / name, target)
    shutil.copyfile(root / 'tests/mobile/engine/product-compat/inspect.gradle',
                    evidence / 'inspect.gradle')
elif phase == 'collect':
    if stage.is_dir():
        final = evidence / 'candidate-final'
        final.mkdir(exist_ok=True)
        for name in ['package.json', 'package-lock.json', 'app.json']:
            candidate = stage / 'apps/universal' / name
            if candidate.is_file():
                shutil.copyfile(candidate, final / name)
    receipt = evidence / 'gradle-exit-code.txt'
    exit_code = int(receipt.read_text()) if receipt.is_file() else None
    log = evidence / 'gradle-metadata.log'
    log_text = log.read_text(errors='replace') if log.is_file() else ''
    task_observed = bool(re.search(r'^> Task :app:checkReleaseAarMetadata(?:\s|$)', log_text, re.M))
    compile_receipt = evidence / 'compile-exit-code.txt'
    compile_exit = int(compile_receipt.read_text()) if compile_receipt.is_file() else None
    compile_log = evidence / 'gradle-compile.log'
    compile_text = compile_log.read_text(errors='replace') if compile_log.is_file() else ''
    assemble_observed = bool(re.search(r'^> Task :app:assembleRelease(?:\s|$)', compile_text, re.M))
    apk_records = []
    for apk in sorted((stage / 'apps/universal/android/app/build/outputs/apk/release').glob('*.apk')):
        with zipfile.ZipFile(apk) as packaged:
            assert packaged.testzip() is None
            assert 'classes.dex' in packaged.namelist()
            native_files = [name for name in packaged.namelist() if name.startswith('lib/') and name.endswith('.so')]
            assert 'lib/x86_64/libgojni.so' in native_files
            assert 'lib/x86_64/libxul.so' in native_files
            assert all(name.startswith('lib/x86_64/') for name in native_files)
            libraries = []
            for name in native_files:
                raw = packaged.read(name)
                assert raw[:6] == b'\x7fELF\x02\x01' and int.from_bytes(raw[18:20], 'little') == 62
                libraries.append({'path': name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})
        apk_records.append({'path': str(apk.relative_to(stage)), 'bytes': apk.stat().st_size,
                            'sha256': digest(apk), 'nativeLibraries': libraries})
    (evidence / 'NATIVE-COMPILE.json').write_text(json.dumps({
        'requested': compile_requested, 'source': os.environ['GITHUB_SHA'], 'run': os.environ['GITHUB_RUN_ID'],
        'originalCoreTree': core_tree, 'actualGradleExitCode': compile_exit,
        'assembleTaskObserved': assemble_observed, 'apks': apk_records,
        'compiledCandidate': compile_requested and compile_exit == 0 and assemble_observed and bool(apk_records),
        'engineBridgeAdopted': False, 'runtimeProven': False, 'ownerReleaseSigned': False,
        'scope': 'x86_64 compile only, original WebView runtime plus Gecko dependency. No ARM64 runtime, key migration, signing or five-platform release proof.',
    }, indent=2) + '\n')
    for name in ['source-engine-build.json', 'source-engine-artifact.json',
                 'source-engine-original.pom', 'source-engine-consumer.pom']:
        source = temporary / 'lyco-mobile-network' / name
        if source.is_file():
            shutil.copyfile(source, evidence / name)
    inventory = []
    for file in sorted(evidence.rglob('*')):
        if file.is_file() and file.name != 'RESULT.json':
            inventory.append({'path': str(file.relative_to(evidence)),
                              'bytes': file.stat().st_size, 'sha256': digest(file)})
    (evidence / 'RESULT.json').write_text(json.dumps({
        'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'source': os.environ['GITHUB_SHA'], 'run': os.environ['GITHUB_RUN_ID'],
        'task': ':app:checkReleaseAarMetadata', 'actualGradleExitCode': exit_code,
        'metadataGatePassed': exit_code == 0 and task_observed,
        'gradleInvocationCompleted': exit_code is not None, 'metadataTaskObservedInLog': task_observed,
        'compiledProduct': False, 'runtimeProven': False, 'productAdopted': False,
        'nativeCompileRequested': compile_requested,
        'compiledCandidate': compile_requested and compile_exit == 0 and assemble_observed and bool(apk_records),
        'requestedToolchain': inputs.get('toolchain', 'current'),
        'requestedCompilePlatform': compile_platform,
        'incrementalSdkCheckpoints': [name for name in ['sdk-57', 'sdk-58']
                                      if (evidence / name / 'VERSIONS.json').is_file()],
        'sourceEngineRun': 41940576338, 'originalProductPins': pins,
        'originalProductPinsStillEqual': all(digest(root / name) == value for name, value in pins.items()),
        'files': inventory,
        'scope': 'Original dependency gate and optional x86_64 candidate compile. Preserve actual failure; no suppressed gate, installed runtime, engine bridge, migration or release proof.',
    }, indent=2) + '\n')
