"""Verify original browser reports and independent transport/process observations."""
from pathlib import Path
import json
import re
import sys
import xml.etree.ElementTree as ET

root = Path(sys.argv[1])
raw = json.loads((root / 'storage-network.json').read_text())
expected = {'a-empty': None, 'a-seed': 'A', 'b-empty': None, 'b-seed': 'B',
            'a-reopen': 'A', 'b-reopen': 'B', 'a-cleared': None, 'b-after-clear-a': 'B', 'b-cleared': None}
observed = {r['observation']['phase']: r for r in raw['reports']}
checks = {'all-nine-original-reports': len(raw['reports']) == len(observed) == 9 and set(observed) == set(expected),
          'all-nine-actual-page-requests': len(raw['pages']) == 9 and {p['phase'] for p in raw['pages']} == set(expected)}
for phase, value in expected.items():
    row = observed.get(phase, {})
    result = row.get('observation', {})
    checks[phase + '-real-origin-and-WebCrypto'] = result.get('origin') == 'http://localhost:18080' and result.get('secureContext') is True and result.get('errors') == []
    checks[phase + '-actual-cookie-ls-idb'] = all(result.get(name) == value for name in ['cookie', 'localStorage', 'indexedDB'])
    checks[phase + '-no-read-rekey'] = result.get('generatedKey') is phase.endswith('-seed')
    if value is None:
        checks[phase + '-no-key-after-isolation-or-clear'] = result.get('hasKey') is False and result.get('extractable') is None and result.get('ciphertextSha256') is None
    else:
        checks[phase + '-actual-nonexportable-key-usable'] = (result.get('hasKey') is True and result.get('extractable') is False
            and result.get('roundTripOk') is True and result.get('exportRejected') is True
            and result.get('exportError') == 'InvalidAccessError' and bool(re.fullmatch('[0-9a-f]{64}', result.get('ciphertextSha256', ''))))
    checks[phase + '-actual-selected-upstream'] = (row.get('route') == 'selected'
        and any(p['phase'] == phase and p['route'] == 'selected' for p in raw['pages'])
        and any(p['method'] == 'POST' and p['path'] == '/report' and p['bodySha256'] == row.get('originalBodySha256') for p in raw['proxyRequests']))
fingerprints = {name: observed.get(name, {}).get('observation', {}).get('ciphertextSha256') for name in expected}
checks['A-identical-encrypted-record-after-process-restart'] = bool(fingerprints['a-seed']) and fingerprints['a-seed'] == fingerprints['a-reopen']
checks['B-identical-encrypted-record-after-restart-and-clear-A'] = bool(fingerprints['b-seed']) and fingerprints['b-seed'] == fingerprints['b-reopen'] == fingerprints['b-after-clear-a']
checks['A-and-B-independent-encrypted-records'] = fingerprints['a-seed'] != fingerprints['b-seed']
processes = json.loads((root / 'storage-processes.json').read_text())
checks['actual-complete-process-close-before-every-step'] = (len(processes) == 12
    and {r['before'] for r in processes} == set(expected) | {'clear-a', 'clear-b', 'finished'}
    and all(r['forceStopCompleted'] is True and r['remainingPackageProcesses'] == [] for r in processes))
mode = root.name.removeprefix('storage-')
assert mode in ['abrupt', 'graceful']
if mode == 'graceful':
    acknowledgements = [r for r in processes if r.get('nativeShutdownCallbackObserved') is True]
    checks['actual-Gecko-shutdown-before-every-reporting-process-stop'] = (
        len(acknowledgements) == 9 and {r.get('closedPhase') for r in acknowledgements} == set(expected))
for profile, name in [('A', 'clear-a'), ('B', 'clear-b')]:
    wanted = '11111111-1111-4111-8111-111111111111' if profile == 'A' else '22222222-2222-4222-8222-222222222222'
    if mode == 'graceful':
        wanted = '33333333-3333-4333-8333-333333333333' if profile == 'A' else '44444444-4444-4444-8444-444444444444'
    checks[name + '-native-root-removal-completed'] = any(n.get('text') == 'STORAGE CLEARED: ' + wanted for n in ET.parse(root / (name + '-ui.xml')).iter('node'))
candidate = json.loads((root / 'candidate.json').read_text())
checks['same-verified-source-built-native-engine'] = (candidate.get('packagedNativeLibrariesMatchSourceAar') is True
    and candidate.get('sourceEngineBuild', {}).get('run') == '41772782539' and candidate.get('notProductAPK') is True
    and candidate.get('debuggable') is False and candidate.get('pagePolicyScript') is False)
result = {'passed': all(checks.values()), 'closeMode': mode, 'checks': checks, 'observations': raw['reports'],
          'encryptedRecordSha256': fingerprints, 'candidate': candidate,
          'scope': 'Genuine API35 non-debuggable x86_64 Gecko capability only: cold per-UUID profile roots, same-origin Cookie/localStorage/IndexedDB, actual non-exportable AES-GCM CryptoKey persistence and exact root clearing. No product adoption, WebView migration, ARM64 runtime, customer credential/key export, all-network or release proof.',
          'productAdopted': False, 'webViewMigrationProven': False, 'arm64RuntimeProven': False,
          'privateStorageOrKeyMaterialExported': False}
(root / 'STORAGE-RESULT.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
assert result['passed'], 'Original native storage or CryptoKey observations failed'
