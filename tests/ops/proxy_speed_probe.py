#!/usr/bin/python3
"""Root-owned forced-command probe; only redacted results cross SSH."""
import datetime, hashlib, json, os, pathlib, socket, subprocess, tempfile, time

os.umask(0o077)
PHASE = os.environ.get('SSH_ORIGINAL_COMMAND', '')
if PHASE not in ('before', 'after'):
    raise SystemExit('Only the fixed before/after probes are allowed')
BASE = pathlib.Path('/opt/studio-billing')
BIN = '/usr/local/bin/sing-box'
SAMPLE_BYTES = 1500000

def candidate():
    nodes = json.loads((BASE / 'proxy-extras.json').read_text())
    node = next(n for n in nodes if n.get('server') == '43.108.85.230' and n.get('type') == 'tuic')
    return {'type': 'tuic', 'tag': 'yt-proxy', 'server': node['server'], 'server_port': node['port'],
            'uuid': node['uuid'], 'password': node['password'], 'congestion_control': 'bbr',
            'tls': {'enabled': True, 'server_name': node['sni'], 'alpn': ['h3'],
                    'certificate_path': '/etc/sing-box/lyco-kr2-trusted-certificate.pem'}}

def probe(label, outbound):
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='lyco-speed-probe-') as folder:
        config = pathlib.Path(folder) / 'config.json'
        config.write_text(json.dumps({'log': {'level': 'error'},
            'inbounds': [{'type': 'http', 'tag': 'ci', 'listen': '127.0.0.1', 'listen_port': port}],
            'outbounds': [outbound], 'route': {'final': outbound['tag']}}))
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

live = json.loads(pathlib.Path('/etc/sing-box/config.json').read_text())
current = next(n for n in live['outbounds'] if n['tag'] == 'yt-proxy')
results = [probe('live-configured-panel-egress', current)]
if PHASE == 'before':
    results.append(probe('candidate-korean-tls-verified-egress', candidate()))
report = {'probeSourceSha256': hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(), 'phase': PHASE, 'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'liveConfigSha256': hashlib.sha256(pathlib.Path('/etc/sing-box/config.json').read_bytes()).hexdigest(),
          'scope': 'Actual HTTPS pages and two exact 1.5MB downloads via isolated copies of live panel egress and candidate. TLS verified. Not a customer device last-mile measurement.',
          'results': results}
print(json.dumps(report, indent=2), flush=True)
required = results[-1]
raise SystemExit(0 if required.get('allPassed') else 1)
