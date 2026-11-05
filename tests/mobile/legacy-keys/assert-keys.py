"""Additional real-browser key evidence; leaves the original paid result intact."""
import hashlib
import json
import os
from pathlib import Path
import re
import sys

assert os.environ.get('GITHUB_ACTIONS') == 'true', 'Genuine Actions only'
root = Path(sys.argv[1])
data = json.loads((root / 'network.json').read_text())
original = json.loads((root / 'RESULT.json').read_text())
assert len(original['checks']) == 14 and original['realPayments'] is False
rows = data['observations']
assert len(rows) == 8 and len(data['pageRequests']) == 8
expected = [('A', 'direct', True), ('A', 'A', False), ('B', 'B', True),
            ('A', 'A', False), ('A', 'A', False), ('B', 'B', False),
            ('A', 'B', False), ('A', 'B', False)]
digests = {}
observed = []
origin = json.loads((root / 'fixture.json').read_text())['origin']
assert origin.startswith('http://127.0.0.1:')
for row, (owner, route, generated) in zip(rows, expected):
    evidence = row['keyEvidence']
    assert row['route'] == route and evidence['owner'] == evidence['storedOwner'] == owner
    assert evidence['phase'] == row['phase'] and evidence['origin'] == origin
    assert evidence['secureContext'] is True and evidence['errors'] == []
    assert evidence['requestedSeed'] is generated and evidence['generatedKey'] is generated
    assert evidence['hasKey'] is True and evidence['extractable'] is False
    assert evidence['algorithm'] == {'name': 'AES-GCM', 'length': 256}
    assert set(evidence['usages']) == {'encrypt', 'decrypt'}
    assert evidence['exportRejected'] is True and evidence['exportError'] == 'InvalidAccessError'
    assert evidence['originalCiphertextDecrypted'] is True
    digest = evidence['ciphertextSha256']
    assert re.fullmatch('[0-9a-f]{64}', digest)
    if generated:
        assert owner not in digests
        digests[owner] = digest
    else:
        assert digest == digests[owner], 'Original ciphertext changed after reopen/install/edit/route switch'
    observed.append({'phase': row['phase'], 'route': route, **evidence})
assert set(digests) == {'A', 'B'} and digests['A'] != digests['B']
proof = {'run': os.environ['GITHUB_RUN_ID'], 'source': os.environ['GITHUB_SHA'],
         'candidate': original['candidate'], 'originalPaidChecksRetained': 14,
         'allEightOriginalKeyObservationsPassed': True, 'observations': observed,
         'originalResultSha256': hashlib.sha256((root / 'RESULT.json').read_bytes()).hexdigest(),
         'keyBytesOrPrivateDatabasesExported': False, 'newEngineAdopted': False,
         'crossEngineMigrationProven': False, 'realPayments': False,
         'scope': 'Owned secure-loopback API35 website on actual old/current owner-signed APKs. '
                  'Old A key seeded only before upgrade; B only on first B page. '
                  'Original key, export refusal and ciphertext decryption survive original '
                  'reopens/edit/route switch/downgrade/return-to-current. '
                  'Not Gecko adoption, generic engine migration, power-loss or a release.'}
(root / 'LEGACY-KEY-RESULT.json').write_text(json.dumps(proof, indent=2) + '\n')
print(json.dumps(proof, indent=2))
