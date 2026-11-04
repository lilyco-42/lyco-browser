"""Drive cold native launches, actual browser storage and exact owned-root clears."""
from pathlib import Path
import hashlib
import json
import os
import shlex
import shutil
import subprocess
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET

assert os.environ.get('GITHUB_ACTIONS') == 'true'
mode = os.environ['LYCO_STORAGE_CLOSE_MODE']
assert mode in ['abrupt', 'graceful']
base = Path(os.environ['RUNNER_TEMP']) / 'lyco-mobile-network'
root = base / ('storage-' + mode)
root.mkdir()
shutil.copy2(base / 'candidate.json', root / 'candidate.json')
here = Path(__file__).resolve().parent
package = 'top.lain42.lycoengineprobe'
ids = {'A': '11111111-1111-4111-8111-111111111111', 'B': '22222222-2222-4222-8222-222222222222'}
if mode == 'graceful':
    ids = {'A': '33333333-3333-4333-8333-333333333333', 'B': '44444444-4444-4444-8444-444444444444'}
processes = []
active_phase = None


def shell(args):
    return subprocess.check_output(['adb', 'shell', shlex.join(args)], text=True, timeout=30)


def stop(label):
    global active_phase
    acknowledged = False
    closed_phase = active_phase
    if mode == 'graceful' and active_phase is not None:
        shell(['am', 'start', '-W', '-n', package + '/.StorageProbeActivity', '--es', 'action', 'close'])
        deadline = time.monotonic() + 20
        while True:
            shell(['uiautomator', 'dump', '/data/local/tmp/lyco-storage-close.xml'])
            raw = shell(['cat', '/data/local/tmp/lyco-storage-close.xml'])
            (root / (label + '-shutdown-ui.xml')).write_text(raw)
            if any(n.get('text') == 'GECKO SHUTDOWN COMPLETE: ' + active_phase for n in ET.fromstring(raw).iter('node')):
                acknowledged = True
                break
            assert time.monotonic() < deadline, 'Actual Gecko shutdown callback missing'
            time.sleep(.25)
    shell(['am', 'force-stop', package])
    deadline = time.monotonic() + 20
    while True:
        names = shell(['ps', '-A', '-o', 'NAME']).splitlines()
        remaining = [name.strip() for name in names if name.strip().startswith(package)]
        if not remaining:
            break
        assert time.monotonic() < deadline, 'Native engine processes did not stop'
        time.sleep(.25)
    processes.append({'before': label, 'forceStopCompleted': True, 'remainingPackageProcesses': remaining,
                      'closeMode': mode, 'closedPhase': closed_phase,
                      'nativeShutdownCallbackObserved': acknowledged})
    active_phase = None
    (root / 'storage-processes.json').write_text(json.dumps(processes, indent=2) + '\n')


def launch(profile, phase, action='read', value='none'):
    global active_phase
    stop(phase)
    url = f'http://localhost:18080/storage?phase={phase}&action={action}&value={value}'
    output = shell(['am', 'start', '-W', '-n', package + '/.StorageProbeActivity', '--es', 'profile', ids[profile],
                    '--es', 'closeMode', mode, '-d', url])
    (root / (phase + '-launch.txt')).write_text(output)
    deadline = time.monotonic() + 60
    while True:
        data = json.loads((root / 'storage-network.json').read_text())
        found = [r for r in data['reports'] if r['observation']['phase'] == phase]
        if found:
            assert len(found) == 1
            active_phase = phase
            break
        assert time.monotonic() < deadline, 'Actual browser report missing: ' + phase
        time.sleep(.2)


def clear(profile, phase):
    stop(phase)
    shell(['am', 'start', '-W', '-n', package + '/.StorageProbeActivity', '--es', 'profile', ids[profile], '--es', 'action', 'clear'])
    deadline = time.monotonic() + 20
    while True:
        shell(['uiautomator', 'dump', '/data/local/tmp/lyco-storage-ui.xml'])
        raw = shell(['cat', '/data/local/tmp/lyco-storage-ui.xml'])
        (root / (phase + '-ui.xml')).write_text(raw)
        if any(n.get('text') == 'STORAGE CLEARED: ' + ids[profile] for n in ET.fromstring(raw).iter('node')):
            break
        assert time.monotonic() < deadline, 'Actual owned profile clear did not complete'
        time.sleep(.25)


source_files = [here / name for name in ['page.js', 'fixture.py', 'run-storage.py', 'assert-storage.py', 'run-matrix.py']]
source_files += [here.parent / 'app/src/main/java/top/lain42/lycoengineprobe/StorageProbeActivity.java', here.parent / 'app/src/main/AndroidManifest.xml']
(root / 'storage-source.json').write_text(json.dumps({'source': os.environ['GITHUB_SHA'], 'run': os.environ['GITHUB_RUN_ID'],
    'closeMode': mode, 'requestedFastShutdownStage': 0 if mode == 'graceful' else None,
    'preferenceReadbackProven': False,
    'files': [{'path': str(p.relative_to(Path(os.environ['GITHUB_WORKSPACE']))), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in source_files]}, indent=2) + '\n')
fixture_log = (root / 'storage-fixture.log').open('w')
fixture = subprocess.Popen([sys.executable, str(here / 'fixture.py')], stdout=fixture_log, stderr=subprocess.STDOUT)
try:
    deadline = time.monotonic() + 15
    while True:
        try:
            with urllib.request.urlopen('http://127.0.0.1:18080/snapshot', timeout=1) as response:
                assert json.load(response)['reports'] == []
            break
        except OSError:
            assert fixture.poll() is None and time.monotonic() < deadline, 'Owned fixture did not start'
            time.sleep(.1)
    for port in [18080, 18081]:
        subprocess.run(['adb', 'reverse', f'tcp:{port}', f'tcp:{port}'], check=True)
    subprocess.run(['adb', 'install', '-r', str(base / 'engine-probe.apk')], check=True)
    subprocess.run(['adb', 'logcat', '-c'], check=True)
    launch('A', 'a-empty')
    launch('A', 'a-seed', 'seed', 'A')
    launch('B', 'b-empty')
    launch('B', 'b-seed', 'seed', 'B')
    launch('A', 'a-reopen')
    launch('B', 'b-reopen')
    clear('A', 'clear-a')
    launch('A', 'a-cleared')
    launch('B', 'b-after-clear-a')
    clear('B', 'clear-b')
    launch('B', 'b-cleared')
    stop('finished')
    subprocess.run([sys.executable, str(here / 'assert-storage.py'), str(root)], check=True)
finally:
    with (root / 'storage-final-logcat.txt').open('w') as output:
        subprocess.run(['adb', 'logcat', '-d', '-v', 'threadtime'], stdout=output, check=False)
    with (root / 'storage-final-screen.png').open('wb') as output:
        subprocess.run(['adb', 'exec-out', 'screencap', '-p'], stdout=output, check=False)
    fixture.terminate()
    fixture.wait(timeout=15)
    fixture_log.close()
