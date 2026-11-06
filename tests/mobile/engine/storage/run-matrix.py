"""Keep the failed abrupt-stop gate and add a real normal-shutdown comparison."""
from pathlib import Path
import json
import os
import subprocess
import sys

assert os.environ.get('GITHUB_ACTIONS') == 'true'
root = Path(os.environ['RUNNER_TEMP']) / 'lyco-mobile-network'
results = {}
for mode in ['abrupt', 'graceful']:
    process = subprocess.run([sys.executable, str(Path(__file__).with_name('run-storage.py'))],
                             env={**os.environ, 'LYCO_STORAGE_CLOSE_MODE': mode}, check=False)
    path = root / ('storage-' + mode) / 'STORAGE-RESULT.json'
    original = json.loads(path.read_text()) if path.exists() else None
    results[mode] = {'exitCode': process.returncode, 'originalResultPresent': original is not None,
                     'passed': process.returncode == 0 and original is not None and original['passed'] is True,
                     'originalResult': original}
summary = {'passed': all(row['passed'] for row in results.values()), 'variants': results,
           'abruptForceStopGateRetained': True, 'allNinePhasesAndAssertionsRetainedPerVariant': True,
           'normalCloseCapabilityProven': results['graceful']['passed'],
           'abruptPersistenceProven': results['abrupt']['passed'],
           'productAdopted': False, 'webViewMigrationProven': False,
           'scope': 'Original abrupt-stop matrix plus acknowledged native Gecko shutdown comparison. A normal-close pass never masks an abrupt-stop failure; no time delay, state replay, key export or read-phase regeneration.'}
(root / 'STORAGE-MATRIX.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps({k: v for k, v in summary.items() if k != 'variants'}, indent=2))
raise SystemExit(0 if summary['passed'] else 1)
