"""One bounded simulator launch, retaining actual startup failure on Actions."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import re
import signal
import subprocess
import time

assert os.environ.get('GITHUB_ACTIONS') == 'true', 'Genuine Actions required'
assert '/.github/workflows/probe-ios-proxy-routing.yml@' in os.environ['GITHUB_WORKFLOW_REF']
evidence = Path(os.environ['RUNNER_TEMP']) / 'lyco-ios-proxy-probe'
device = (evidence / 'simulator-udid.txt').read_text().strip()
assert re.fullmatch(r'[A-Fa-f0-9-]{36}', device)
prepared = json.loads((evidence / 'prepared.json').read_text())
assert prepared['run'] == os.environ['GITHUB_RUN_ID'] and prepared['source'] == os.environ['GITHUB_SHA']
assert prepared['device'] == device
bundle = 'top.lain42.lycoproxyprobe'


def command(args, name, budget):
    started = time.monotonic()
    record = {'command': args, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'budgetSeconds': budget, 'timedOut': False}
    with (evidence / (name + '.txt')).open('xb') as output, \
            (evidence / (name + '-stderr.txt')).open('xb') as error:
        process = subprocess.Popen(args, stdout=output, stderr=error, start_new_session=True)
        try:
            process.wait(timeout=budget)
        except subprocess.TimeoutExpired:
            record['timedOut'] = True
            # Stop only this owned command group, never the simulator or other
            # jobs. No second launch, reboot, erase or changed acceptance timer.
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait()
    record.update({'exitCode': process.returncode, 'elapsedSeconds': time.monotonic() - started,
                   'stdoutBytes': (evidence / (name + '.txt')).stat().st_size,
                   'stderrBytes': (evidence / (name + '-stderr.txt')).stat().st_size})
    return record


launch = command(['xcrun', 'simctl', 'launch', device, bundle], 'launch', 60)
text = (evidence / 'launch.txt').read_text(errors='replace')
pid = re.search(r'^' + re.escape(bundle) + r':\s+([1-9][0-9]*)\s*$', text, re.M)
accepted = not launch['timedOut'] and launch['exitCode'] == 0 and pid is not None
receipt = {'run': os.environ['GITHUB_RUN_ID'], 'source': os.environ['GITHUB_SHA'],
           'workflow': os.environ['GITHUB_WORKFLOW_REF'], 'device': device,
           'helperSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
           'launch': launch, 'observedPid': int(pid.group(1)) if pid else None,
           'singleLaunchAccepted': accepted, 'nativeCasesCompleted': False,
           'diagnostics': [], 'scope': 'CLI launch receipt only, not native routing, product or release acceptance.'}
(evidence / 'launch-status.json').write_text(json.dumps(receipt, indent=2) + '\n')
if not accepted:
    receipt['diagnostics'].append(command(['xcrun', 'simctl', 'spawn', device, 'launchctl', 'list'],
                                         'launch-services', 15))
    receipt['diagnostics'].append(command([
        'xcrun', 'simctl', 'spawn', device, 'log', 'show', '--style', 'compact', '--last', '3m',
        '--predicate', 'process == "LYCOProxyProbe" OR eventMessage CONTAINS[c] "top.lain42.lycoproxyprobe"',
    ], 'launch-native-log', 15))
(evidence / 'launch-status.json').write_text(json.dumps(receipt, indent=2) + '\n')
if not accepted:
    raise SystemExit('Original single simulator launch did not return a successful PID; retained exact failure')
print('Original simulator launch returned PID', receipt['observedPid'])
