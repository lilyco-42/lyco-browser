#!/usr/bin/python3
"""Root-owned forced-command probe; only redacted results cross SSH."""
import datetime, hashlib, json, os, pathlib, socket, subprocess, tempfile, time, shutil

os.umask(0o077)
PHASE = os.environ.get('SSH_ORIGINAL_COMMAND', '')
if PHASE not in ('before', 'after'):
    raise SystemExit('Only the fixed before/after probes are allowed')
BASE = pathlib.Path('/opt/studio-billing')
BIN = '/usr/local/bin/sing-box'
SAMPLE_BYTES = 1500000
CONFIG = pathlib.Path('/etc/sing-box/config.json')
PLAN = pathlib.Path('/etc/sing-box/.lyco-speed-p0-plan.json')

def atomic_config(data, metadata):
    fd, name = tempfile.mkstemp(prefix='.lyco-speed-', dir=CONFIG.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(data, stream, ensure_ascii=False, indent=2)
            stream.write('\n'); stream.flush(); os.fsync(stream.fileno())
        os.chown(name, metadata.st_uid, metadata.st_gid)
        os.chmod(name, metadata.st_mode & 0o777)
        os.replace(name, CONFIG)
    finally:
        pathlib.Path(name).unlink(missing_ok=True)

def apply_plan():
    plan = json.loads(PLAN.read_text())
    original = CONFIG.read_bytes()
    assert hashlib.sha256(original).hexdigest() == plan['previousSha256'], 'Live configuration changed'
    before = json.loads(original)
    updated = plan['configuration']
    assert updated['inbounds'] == before['inbounds'], 'Inbound accounts must be preserved'
    assert {k:v for k,v in updated.items() if k not in ('outbounds','dns','route')} == {
        k:v for k,v in before.items() if k not in ('outbounds','dns','route')}
    old = {n['tag']:n for n in before['outbounds']}
    new = {n['tag']:n for n in updated['outbounds']}
    assert old.keys() == new.keys()
    for tag in old:
        if tag in ('yt-proxy','node-vless','node-vmess'):
            expected = candidate(); expected['tag'] = tag
            assert old[tag]['server'] == '43.108.11.215' and new[tag] == expected
        else:
            assert old[tag] == new[tag]
    assert plan['proof']['results'][-1]['allPassed'] is True
    assert json.loads(PLAN.with_suffix('.config.json').read_text()) == updated
    checked = subprocess.run([BIN,'check','-c',str(PLAN.with_suffix('.config.json'))],
                             capture_output=True, timeout=8)
    assert checked.returncode == 0, 'Prepared full service configuration rejected'
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S')
    backup = pathlib.Path('/root/website-backups') / ('proxy-speed-'+stamp)
    backup.mkdir(mode=0o700)
    shutil.copy2(CONFIG, backup/'config.json')
    metadata = CONFIG.stat()
    assert CONFIG.read_bytes() == original, 'Concurrent configuration change'
    atomic_config(updated, metadata)
    try:
        subprocess.run(['systemctl','restart','sing-box.service'],check=True,timeout=20,capture_output=True)
        subprocess.run(['systemctl','is-active','--quiet','sing-box.service'],check=True,timeout=5)
    except Exception:
        atomic_config(before, metadata)
        subprocess.run(['systemctl','restart','sing-box.service'],timeout=20,capture_output=True)
        raise
    return before, metadata, backup

def rollback(before, metadata):
    current = json.loads(CONFIG.read_text())
    for key in ('outbounds','route','dns'):
        if key in before: current[key] = before[key]
        else: current.pop(key, None)
    atomic_config(current, metadata)
    subprocess.run(['systemctl','restart','sing-box.service'],check=True,timeout=20,capture_output=True)

def candidate():
    nodes = json.loads((BASE / 'proxy-extras.json').read_text())
    node = next(n for n in nodes if n.get('server') == '43.108.85.230' and n.get('type') == 'tuic')
    return {'type': 'tuic', 'tag': 'yt-proxy', 'server': node['server'], 'server_port': node['port'],
            'uuid': node['uuid'], 'password': node['password'], 'congestion_control': 'bbr',
            'tls': {'enabled': True, 'server_name': node['sni'], 'alpn': ['h3'],
                    'certificate_path': '/etc/sing-box/lyco-kr2-trusted-certificate.pem'}}

def probe(label, outbound, *, resolve_remote=False, live_config=None):
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='lyco-speed-probe-') as folder:
        config = pathlib.Path(folder) / 'config.json'
        cfg = {'log': {'level': 'error'},
            'inbounds': [{'type': 'http', 'tag': 'panel-in', 'listen': '127.0.0.1', 'listen_port': port}],
            'outbounds': [outbound], 'route': {'final': outbound['tag']}}
        if resolve_remote:
            cfg['dns'] = {'servers': [{'type': 'https', 'tag': 'lyco-egress-dns',
                'server': '1.1.1.1', 'detour': outbound['tag']}], 'strategy': 'prefer_ipv4'}
            cfg['route']['rules'] = [{'action': 'resolve', 'server': 'lyco-egress-dns', 'strategy': 'prefer_ipv4'}]
        if live_config is not None:
            cfg['outbounds'] = live_config['outbounds']
            cfg['route'] = live_config['route']
            if 'dns' in live_config: cfg['dns'] = live_config['dns']
        config.write_text(json.dumps(cfg))
        check = subprocess.run([BIN, 'check', '-c', str(config)], capture_output=True, timeout=8)
        if check.returncode:
            return {'label': label, 'configurationAccepted': False}
        process = subprocess.Popen([BIN, 'run', '-c', str(config)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            time.sleep(.5)
            samples = []
            for name, url, amount in (
                ('cloudflare-page', 'https://cp.cloudflare.com/generate_204', 0),
                ('google-page', 'https://www.gstatic.com/generate_204', 0),
                ('download-1', 'https://speed.cloudflare.com/__down?bytes=1500000', SAMPLE_BYTES),
                ('download-2', 'https://speed.cloudflare.com/__down?bytes=1500000', SAMPLE_BYTES)):
                body = pathlib.Path(folder) / 'body'
                start = time.monotonic()
                result = subprocess.run(['curl', '--silent', '--show-error', '--proxy', f'http://127.0.0.1:{port}',
                    '--noproxy', '', '--connect-timeout', '6', '--max-time', '18', '--max-filesize', '1600000',
                    '--output', str(body), '--write-out', '%{http_code}', url],
                    capture_output=True, timeout=22, env={**os.environ, 'ALL_PROXY': '', 'HTTPS_PROXY': '', 'HTTP_PROXY': ''})
                elapsed = time.monotonic() - start
                size = body.stat().st_size if body.exists() else 0
                status = result.stdout.decode().strip()
                ok = result.returncode == 0 and status in ('200', '204') and size == amount
                samples.append({'name': name, 'ok': ok, 'httpStatus': status, 'bytes': size,
                                'elapsedMs': round(elapsed * 1000),
                                'kibPerSecond': round(size / elapsed / 1024, 1) if ok and amount else None})
                body.unlink(missing_ok=True)
            return {'label': label, 'configurationAccepted': True, 'samples': samples,
                    'allPassed': all(s['ok'] for s in samples)}
        finally:
            process.terminate()
            try: process.wait(timeout=3)
            except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=3)

deployment = apply_plan() if PHASE == 'after' and PLAN.exists() else None
try:
    live = json.loads(CONFIG.read_text())
    current = next(n for n in live['outbounds'] if n['tag'] == 'yt-proxy')
    results = [probe('live-configured-panel-egress', current, live_config=live)]
    if PHASE == 'before':
        results.append(probe('candidate-korean-tls-verified-egress-with-remote-dns', candidate(), resolve_remote=True))
    if PHASE == 'after':
        pages = []
        for url in ('https://www.gstatic.com/generate_204', 'https://www.google.com/generate_204'):
            test = subprocess.run(['curl','--silent','--proxy','http://127.0.0.1:1081',
                '--noproxy','','--connect-timeout','6','--max-time','18','--output','/dev/null',
                '--write-out','%{http_code}',url],capture_output=True,timeout=22)
            pages.append({'url':url,'ok':test.returncode==0 and test.stdout.strip()==b'204'})
        results[-1]['realServicePages'] = pages
        results[-1]['allPassed'] = results[-1]['allPassed'] and all(p['ok'] for p in pages)
        results.append(probe('korean-tuic-with-node-native-dns', candidate()))
except Exception:
    if deployment: rollback(deployment[0], deployment[1])
    raise
report = {'probeSourceSha256': hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(), 'phase': PHASE, 'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'liveConfigSha256': hashlib.sha256(pathlib.Path('/etc/sing-box/config.json').read_bytes()).hexdigest(),
          'scope': 'Actual HTTPS pages and two exact 1.5MB downloads via isolated copies of live panel egress and candidate. TLS verified. Not a customer device last-mile measurement.',
          'results': results}
if deployment:
    before, metadata, backup = deployment
    report['deployment'] = {'backup': str(backup), 'accountsPreserved': True,
                            'rolledBack': not all(r.get('allPassed', False) for r in results)}
    if report['deployment']['rolledBack']:
        rollback(before, metadata)
    else:
        PLAN.rename(backup/'deployment-plan.json')
        PLAN.with_suffix('.config.json').unlink(missing_ok=True)
        (backup/'RESULT.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report, indent=2), flush=True)
passed = results[-1].get('allPassed') if PHASE == 'before' else all(r.get('allPassed') for r in results)
raise SystemExit(0 if passed else 1)
