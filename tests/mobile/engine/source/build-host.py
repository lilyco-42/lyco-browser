"""Keep a failed source compiler inside a disposable Actions resource group."""
from pathlib import Path
import datetime
import json
import os
import subprocess
import sys
import threading

if os.environ.get('GITHUB_ACTIONS') != 'true':
    raise SystemExit('Genuine Actions build host required')
if sys.argv[1:] not in ([], ['--check']):
    raise SystemExit('Unsupported build-host operation')

check = sys.argv[1:] == ['--check']
evidence = Path(os.environ['RUNNER_TEMP']) / 'lyco-gecko-build-evidence'
evidence.mkdir(parents=True, exist_ok=True)
memory = dict(line.split(':', 1) for line in Path('/proc/meminfo').read_text().splitlines())
total = int(memory['MemTotal'].split()[0]) * 1024
group_root = Path('/sys/fs/cgroup')
if not (group_root / 'cgroup.controllers').is_file():
    raise SystemExit('Unified resource controllers required; no unbounded fallback')
current_group = next(line.split(':', 2)[2] for line in Path('/proc/self/cgroup').read_text().splitlines()
                     if line.startswith('0::'))
if not current_group.startswith('/') or '..' in current_group.split('/'):
    raise SystemExit('Invalid runner resource group')
parent = group_root / current_group.lstrip('/')
# The v2 hierarchy root intentionally has no memory.max. Child/ancestor limits
# still constrain usable capacity; the actual build child must expose limits.
while True:
    limit_path = parent / 'memory.max'
    if limit_path.is_file():
        limit = limit_path.read_text().strip()
        if limit != 'max':
            total = min(total, int(limit))
    if parent == group_root:
        break
    parent = parent.parent
maximum = (total - max(2 * 1024**3, total // 5)) // 4096 * 4096
if maximum < 4 * 1024**3:
    raise SystemExit('Build host has insufficient memory after reserving runner capacity')
high = (maximum * 85 // 100) // 4096 * 4096
swap = min(int(memory['SwapTotal'].split()[0]) * 1024, 1024**3)
quota = max(100, (os.cpu_count() or 1) * 75)
unit = 'lyco-gecko-' + os.environ['GITHUB_RUN_ID'] + ('-check' if check else '-build') + '.service'
policy = {'unit': unit, 'memoryMaxBytes': maximum, 'memoryHighBytes': high,
          'memorySwapMaxBytes': swap, 'cpuQuotaPercent': quota,
          'reservedMemoryBytes': total - maximum, 'checkOnly': check,
          'scope': 'Disposable build-host containment; no native product or acceptance changes'}
(evidence / ('host-check-policy.json' if check else 'host-policy.json')).write_text(json.dumps(policy, indent=2) + '\n')

command = ['sudo', '-n', 'systemd-run', '--unit=' + unit, '--service-type=exec',
           '--wait', '--pipe', '--expand-environment=no',
           '--uid=' + str(os.getuid()), '--gid=' + str(os.getgid()),
           '--working-directory=' + os.environ['GITHUB_WORKSPACE'],
           '--property=MemoryAccounting=yes', '--property=MemoryMax=' + str(maximum),
           '--property=MemoryHigh=' + str(high), '--property=MemorySwapMax=' + str(swap),
           '--property=CPUQuota=' + str(quota) + '%', '--property=OOMPolicy=stop']
# The build needs tool paths and public run identifiers, never the runner's
# authentication environment or its artifact/runtime tokens.
for key in ['HOME', 'USER', 'PATH', 'JAVA_HOME', 'LD_LIBRARY_PATH', 'RUNNER_TEMP', 'GITHUB_WORKSPACE',
            'GITHUB_ACTIONS', 'GITHUB_SHA', 'GITHUB_RUN_ID', 'CI', 'LANG']:
    if key in os.environ:
        command.append('--setenv=' + key + '=' + os.environ[key])
if check:
    command += [sys.executable, '-c',
                "from pathlib import Path; import os; "
                "group=next(v.split(':',2)[2] for v in Path('/proc/self/cgroup').read_text().splitlines() if v.startswith('0::')); "
                "root=Path('/sys/fs/cgroup')/group.lstrip('/'); "
                f"assert int((root/'memory.max').read_text())=={maximum}; "
                f"assert int((root/'memory.high').read_text())=={high}; "
                f"assert int((root/'memory.swap.max').read_text())=={swap}; "
                "assert os.environ['GITHUB_ACTIONS']=='true'; "
                "assert os.getuid()!=0; "
                "assert not any(k in os.environ for k in ['ACTIONS_RUNTIME_TOKEN','GITHUB_TOKEN','GH_TOKEN']); "
                "print('Actual non-root build resource group and credential isolation confirmed')"]
else:
    command += ['/usr/bin/bash', str(Path(__file__).with_name('build-engine.sh').resolve())]

stop = threading.Event()


def observe():
    while not stop.is_set():
        props = subprocess.run(['systemctl', 'show', unit, '-p', 'ControlGroup', '-p', 'Result',
                                '-p', 'ExecMainStatus', '-p', 'MemoryCurrent', '-p', 'MemoryPeak'],
                               capture_output=True, text=True, timeout=10)
        row = {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'unitProperties': props.stdout.splitlines(),
               'diskAvailableBytes': os.statvfs(evidence).f_bavail * os.statvfs(evidence).f_frsize}
        values = dict(line.split('=', 1) for line in props.stdout.splitlines() if '=' in line)
        group = values.get('ControlGroup')
        if group and group.startswith('/') and '..' not in group.split('/'):
            root = Path('/sys/fs/cgroup') / group.lstrip('/')
            for name in ['memory.events', 'memory.current', 'memory.peak', 'memory.pressure', 'cpu.stat']:
                try:
                    row[name] = (root / name).read_text()
                except FileNotFoundError:
                    pass
        line = json.dumps(row)
        print('Build host containment: ' + line, flush=True)
        with (evidence / 'host-resources.jsonl').open('a') as output:
            output.write(line + '\n')
        stop.wait(30)


monitor = threading.Thread(target=observe, daemon=True)
monitor.start()
try:
    result = subprocess.run(command, check=False)
    status = result.returncode if result.returncode >= 0 else 128 - result.returncode
    properties = subprocess.run(['systemctl', 'show', unit, '-p', 'Result', '-p', 'ExecMainStatus',
                                 '-p', 'MemoryPeak'], capture_output=True, text=True, timeout=10)
    (evidence / ('host-check-result.json' if check else 'host-result.json')).write_text(json.dumps({
        **policy, 'exitCode': status, 'unitProperties': properties.stdout.splitlines(),
    }, indent=2) + '\n')
finally:
    stop.set()
    monitor.join(timeout=12)
    subprocess.run(['sudo', '-n', 'systemctl', 'stop', unit], capture_output=True, timeout=30)
    subprocess.run(['sudo', '-n', 'systemctl', 'reset-failed', unit], capture_output=True, timeout=10)
raise SystemExit(status)
