#!/usr/bin/python3
"""Root-owned forced-command probe; only redacted results cross SSH."""
import datetime, hashlib, json, os, pathlib, socket, subprocess, tempfile, time, shutil

os.umask(0o077)
PHASE = os.environ.get('SSH_ORIGINAL_COMMAND', '')
if PHASE not in ('before', 'after', 'observe', 'pool-observe', 'nearby-ssh', 'ordinary-labels', 'ordinary-quality', 'subscription-regions', 'subscription-catalogue', 'dns-forward', 'au-isolation', 'au-isolation-deploy', 'au-relay', 'au-relay-deploy', 'dns-ipv4', 'au-ipv4-isolation', 'au-ipv4-deploy', 'ssh-candidate', 'ssh-deploy', 'gateway-policy'):
    raise SystemExit('Only the fixed before/after probes are allowed')
BASE = pathlib.Path('/opt/studio-billing')
BIN = '/usr/local/bin/sing-box'
SAMPLE_BYTES = 1500000
if PHASE in ('gateway-policy', 'ordinary-labels', 'ordinary-quality', 'subscription-regions', 'subscription-catalogue'):
    import runpy
    try:
        helper = {'ordinary-labels':'lyco-ordinary-labels-deploy.py','ordinary-quality':'lyco-ordinary-quality-deploy.py','subscription-regions':'lyco-proxy-region-labels-deploy.py','subscription-catalogue':'lyco-proxy-catalogue-deploy.py'}.get(PHASE,'lyco-proxy-gateway-deploy.py')
        runpy.run_path('/usr/local/sbin/'+helper,run_name='__main__')
    except Exception as error:
        print(json.dumps({'phase':PHASE,'operationFailed':True,'failureType':type(error).__name__}),flush=True)
        raise
    raise SystemExit(0)
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

def probe(label, outbound, *, resolve_remote=False, live_config=None, download_bytes=SAMPLE_BYTES, github=False, site_checks=False):
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
            jobs = [
                ('cloudflare-page', 'https://cp.cloudflare.com/generate_204', 0),
                ('google-page', 'https://www.gstatic.com/generate_204', 0),
                ('download-1', 'https://speed.cloudflare.com/__down?bytes='+str(download_bytes), download_bytes),
                ('download-2', 'https://speed.cloudflare.com/__down?bytes='+str(download_bytes), download_bytes)]
            if github:
                jobs.append(('github-release-range','https://github.com/MetaCubeX/mihomo/releases/download/v1.19.32/mihomo-linux-amd64-v1.19.32.gz',4194304))
            if site_checks:
                jobs.extend([('youtube-page','https://www.youtube.com/generate_204',0),
                             ('openai-api','https://api.openai.com/v1/models',0)])
            for name, url, amount in jobs:
                body = pathlib.Path(folder) / 'body'
                start = time.monotonic()
                result = subprocess.run(['curl', '--silent', '--show-error', '--proxy', f'http://127.0.0.1:{port}',
                    '--noproxy', '', '--connect-timeout', '6', '--max-time', '18', '--max-filesize', str(max(SAMPLE_BYTES, amount)+100000),
                    '--output', str(body), '--write-out', '%{http_code} %{time_connect} %{time_appconnect} %{time_starttransfer} %{time_total}'] +
                    (['--location','--max-redirs','3','--range','0-4194303'] if name=='github-release-range' else []) + [url],
                    capture_output=True, timeout=22, env={**os.environ, 'ALL_PROXY': '', 'HTTPS_PROXY': '', 'HTTP_PROXY': ''})
                elapsed = time.monotonic() - start
                size = body.stat().st_size if body.exists() else 0
                fields = result.stdout.decode().split()
                status = fields[0] if fields else '000'
                timing = {}
                if len(fields) == 5:
                    for key, value in zip(('connectMs','tlsMs','firstByteMs','transferTotalMs'),fields[1:]):
                        try: timing[key] = round(float(value)*1000)
                        except ValueError: pass
                expected_status = ('401',) if name=='openai-api' else ('206',) if name=='github-release-range' else ('200','204')
                ok = result.returncode == 0 and status in expected_status and (size<=4096 if name=='openai-api' else size==amount)
                if name=='openai-api' and ok:
                    try: ok=isinstance(json.loads(body.read_bytes()).get('error'),dict)
                    except (ValueError,AttributeError): ok=False
                if name=='github-release-range' and ok:
                    with body.open('rb') as stream: ok=stream.read(2)==b'\x1f\x8b'
                samples.append({'name': name, 'ok': ok, 'httpStatus': status, 'bytes': size,
                                'elapsedMs': round(elapsed * 1000),
                                **timing,
                                'kibPerSecond': round(size / elapsed / 1024, 1) if ok and amount else None})
                body.unlink(missing_ok=True)
            return {'label': label, 'configurationAccepted': True, 'samples': samples,
                    'allPassed': all(s['ok'] for s in samples)}
        finally:
            process.terminate()
            try: process.wait(timeout=3)
            except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=3)


if PHASE in ('dns-forward','au-isolation','au-isolation-deploy','au-relay','au-relay-deploy','dns-ipv4','au-ipv4-isolation','au-ipv4-deploy'):
    import runpy
    runpy.run_path('/usr/local/sbin/'+{'dns-forward':'lyco-proxy-dns-forward.py','au-isolation':'lyco-proxy-au-isolation.py','au-isolation-deploy':'lyco-proxy-au-isolation-deploy.py','au-relay':'lyco-proxy-au-relay.py','au-relay-deploy':'lyco-proxy-au-relay-deploy.py','dns-ipv4':'lyco-proxy-dns-ipv4.py','au-ipv4-isolation':'lyco-proxy-au-ipv4-isolation.py','au-ipv4-deploy':'lyco-proxy-au-ipv4-deploy.py'}[PHASE],init_globals={'LYCO_PROBE':probe},run_name='__main__')
    raise SystemExit(0)

INTERACTIVE_DOMAINS=['google.com','gstatic.com','chatgpt.com','openai.com',
    'oaistatic.com','oaiusercontent.com','cp.cloudflare.com']

def interactive_config(live, ssh_port=1085):
    optimized=json.loads(json.dumps(live));rules=optimized['route']['rules']
    assert rules[0]['action']=='resolve' and rules[1]['action']=='resolve'
    interactive={'domain_suffix':INTERACTIVE_DOMAINS,'network':'tcp','outbound':'yt-proxy'}
    bulk={'inbound':['panel-in'],'network':'tcp','outbound':'ssh-fast'}
    if rules[2]==interactive:
        assert rules.count(interactive)==1 and rules[3]==bulk
    else:
        assert rules[2]==bulk
        rules.insert(2,interactive)
    ssh_out=next(n for n in optimized['outbounds'] if n['tag']=='ssh-fast')
    assert ssh_out=={'type':'socks','tag':'ssh-fast','server':'127.0.0.1','server_port':1085,'version':'5','network':'tcp'}
    ssh_out['server_port']=ssh_port
    return optimized



if PHASE=='ssh-deploy' and pathlib.Path('/etc/sing-box/.lyco-dns-recovery-plan.json').exists():
    import runpy
    helper=pathlib.Path('/usr/local/sbin/lyco-proxy-dns-recovery-deploy.py')
    assert hashlib.sha256(helper.read_bytes()).hexdigest()=='97f6d6a77ee98d55f5a5f864859042e175c91efa7115f34b344d4b8764e1ccae'
    try:
        result=runpy.run_path(str(helper),init_globals={'LYCO_PROBE':probe},run_name='__main__')['LYCO_DEPLOY_RESULT']
    except Exception as error:
        print(json.dumps({'phase':PHASE,'operationFailed':True,'failureType':type(error).__name__}),flush=True)
        raise
    result['probeSourceSha256']=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
    print(json.dumps(result,indent=2),flush=True)
    raise SystemExit(0)

if PHASE=='ssh-deploy' and pathlib.Path('/etc/sing-box/.lyco-ph-egress-plan.json').exists():
    import runpy
    helper=pathlib.Path('/usr/local/sbin/lyco-proxy-ph-egress-deploy.py')
    assert hashlib.sha256(helper.read_bytes()).hexdigest()=='53bd248b591aa8503662fbefd6d38981b02724ec9179c62f4c573c31e402ab8a'
    try:
        result=runpy.run_path(str(helper),init_globals={'LYCO_PROBE':probe},run_name='__main__')['LYCO_DEPLOY_RESULT']
    except Exception as error:
        print(json.dumps({'phase':PHASE,'operationFailed':True,'failureType':type(error).__name__}),flush=True)
        raise
    result['probeSourceSha256']=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
    print(json.dumps(result,indent=2),flush=True)
    raise SystemExit(0)


if PHASE == 'nearby-ssh':
    key = pathlib.Path('/etc/lyco-proxy-egress/.nearby-speed-id')
    hosts = pathlib.Path('/etc/lyco-proxy-egress/.nearby-known-hosts')
    assert key.stat().st_uid==0 and key.stat().st_mode & 0o777 == 0o600
    known_hash=hashlib.sha256(hosts.read_bytes()).hexdigest()
    assert known_hash=='a05eb37fb77f71c90a3b2658ef670f06cc817c458ae4ed634853ed6e7efd2adc'
    config_raw=CONFIG.read_bytes();live=json.loads(config_raw);current=next(n for n in live['outbounds'] if n['tag']=='yt-proxy')
    report={'phase':PHASE,'observationOnly':True,'probeSourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
        'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'knownHostsSha256':known_hash,
        'baseline':probe('current-paid-route',current,live_config=live,download_bytes=4194304,github=True),'candidates':[]}
    for label,host in [('philippines','8.212.147.126'),('hong-kong','119.12.174.132'),('korea','43.108.85.230')]:
        with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        with tempfile.TemporaryFile() as log:
            tunnel=subprocess.Popen(['/usr/bin/ssh','-F','/dev/null','-NT','-D','127.0.0.1:'+str(port),
                '-i',str(key),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes',
                '-o','UserKnownHostsFile='+str(hosts),'-o','ExitOnForwardFailure=yes','-o','ConnectTimeout=8',
                '-o','ServerAliveInterval=10','-o','ServerAliveCountMax=2','root@'+host],stdout=subprocess.DEVNULL,stderr=log)
            row={'region':label}
            try:
                ready=False
                for attempt in range(60):
                    if tunnel.poll() is not None:break
                    try:
                        with socket.create_connection(('127.0.0.1',port),timeout=.2):ready=True;break
                    except OSError:time.sleep(.2)
                row['sshConnected']=ready and tunnel.poll() is None
                if row['sshConnected']:
                    outbound={'type':'socks','tag':'nearby-ssh','server':'127.0.0.1','server_port':port,'version':'5','network':'tcp'}
                    row['result']=probe(label+'-strict-ssh',outbound,download_bytes=4194304,github=True)
                    if label=='philippines':
                        row['fullRoute']=probe('interactive-korea-bulk-philippines',current,
                            live_config=interactive_config(live,port),download_bytes=4194304,github=True,site_checks=True)
            finally:
                tunnel.terminate()
                try:tunnel.wait(timeout=4)
                except subprocess.TimeoutExpired:tunnel.kill();tunnel.wait(timeout=3)
            log.seek(0);diagnostic=log.read(8192).decode(errors='replace')
            row['sshExitCode']=tunnel.returncode
            reasons=[('host-key','Host key verification failed'),('authentication','Permission denied'),
                ('timeout','Connection timed out'),('refused','Connection refused'),('unreachable','No route to host'),
                ('key-exchange','no matching key exchange'),('host-key-algorithm','no matching host key type'),
                ('signature-algorithm','no mutual signature algorithm'),('banner','banner exchange'),
                ('key-exchange-closed','kex_exchange_identification')]
            row['sshFailure']=next((name for name,text in reasons if text in diagnostic),
                'connectivity' if not row.get('sshConnected') else None)
            stopped=subprocess.run(['curl','--silent','--proxy','http://127.0.0.1:'+str(port),'--noproxy','',
                '--connect-timeout','1','--max-time','3','--output','/dev/null','--write-out','%{http_code}',
                'https://cp.cloudflare.com/generate_204'],capture_output=True,timeout=5)
            row['stoppedBlocked']=stopped.returncode!=0 and stopped.stdout.strip()==b'000'
            report['candidates'].append(row)
    report['workingCandidate']=any(x.get('result',{}).get('allPassed') and x['stoppedBlocked'] for x in report['candidates'])
    ph=next(x for x in report['candidates'] if x['region']=='philippines')
    def fast_files(row):
        samples=[x for x in row.get('samples',[]) if x['name'].startswith('download') or x['name']=='github-release-range']
        return len(samples)==3 and all(x['ok'] and x['bytes']==4194304 and x['kibPerSecond']>=900 for x in samples)
    full=ph.get('fullRoute',{});pages=[x for x in full.get('samples',[]) if x['name'] in ('cloudflare-page','google-page')]
    qualified=(report['baseline'].get('allPassed') is True and ph.get('stoppedBlocked') is True
        and ph.get('result',{}).get('allPassed') is True and full.get('allPassed') is True
        and fast_files(full) and len(pages)==2
        and all(x['ok'] and x['elapsedMs']<=700 for x in pages))
    # The full production candidate retains KR DoH. Bare SSH controls use
    # remote-default DNS and do not represent this candidate's CDN routing.
    prior_path=pathlib.Path('/etc/sing-box/.lyco-ph-full-route-proof.json')
    assert hashlib.sha256(prior_path.read_bytes()).hexdigest()=='cc65a2d86d120c34f7c5239957141f35fc906de59f274d1343172da74b73935c'
    prior=json.loads(prior_path.read_text())
    assert prior['probeSourceSha256']=='c706445e4c24bb36a18bd1a43a080f26e03b2bbec627aafb26d9c772cfb37e3c'
    assert prior['previousSha256']==hashlib.sha256(config_raw).hexdigest() and prior['stoppedBlocked']
    prior_pages=[x for x in prior['fullRoute']['samples'] if x['name'] in ('cloudflare-page','google-page')]
    qualified=qualified and prior['fullRoute']['allPassed'] and fast_files(prior['fullRoute']) and len(prior_pages)==2 and all(x['elapsedMs']<=700 for x in prior_pages)
    report['fullRouteQualifiedForDeployment']=qualified
    report['previousFullRouteRun']=prior['run']
    assert CONFIG.read_bytes()==config_raw,'Concurrent production configuration change'
    if qualified:
        plan={'schemaVersion':1,'previousSha256':hashlib.sha256(config_raw).hexdigest(),
            'probeSourceSha256':report['probeSourceSha256'],'checkedAt':report['checkedAt'],
            'configuration':interactive_config(live),'proof':{'baseline':report['baseline'],'philippines':ph},'previousFullProof':prior}
        prepared=pathlib.Path('/etc/sing-box/.lyco-ph-egress-plan.json')
        assert not prepared.exists(),'Do not overwrite a pending plan'
        prepared.write_text(json.dumps(plan,indent=2)+'\n');prepared.chmod(0o600)
    print(json.dumps(report,indent=2),flush=True)
    raise SystemExit(0 if report['workingCandidate'] else 1)

if PHASE in ('observe', 'pool-observe'):
    live = json.loads(CONFIG.read_text())
    current = next(n for n in live['outbounds'] if n['tag'] == 'yt-proxy')
    report = {'phase':PHASE,'observationOnly':True,
        'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'probeSourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
        'liveConfigSha256':hashlib.sha256(CONFIG.read_bytes()).hexdigest(),
        'sampleBytes':4194304,
        'baseline':probe('current-paid-tcp-route',current,live_config=live,download_bytes=4194304,github=True)}
    if PHASE == 'observe':
        resolver=next(n for n in live['dns']['servers'] if n['tag']=='lyco-egress-dns')
        if not report['baseline']['allPassed'] and resolver.get('detour')=='yt-proxy':
            recovery=json.loads(json.dumps(live));rules=recovery['route']['rules']
            interactive={'domain_suffix':INTERACTIVE_DOMAINS,'network':'tcp','outbound':'yt-proxy'}
            assert rules.count(interactive)==1 and rules[2]==interactive
            rules.remove(interactive)
            next(n for n in recovery['dns']['servers'] if n['tag']=='lyco-egress-dns')['detour']='ssh-fast'
            result=probe('ph-ssh-with-independent-https-dns',current,live_config=recovery,
                download_bytes=4194304,github=True,site_checks=True)
            files=[n for n in result.get('samples',[]) if n['name'].startswith('download') or n['name']=='github-release-range']
            qualified=result.get('allPassed') is True and len(files)==3 and all(n['ok'] and n['bytes']==4194304 and n['kibPerSecond']>=900 for n in files)
            report['philippinesRecoveryComparison']=result
            egress='philippines'
            if not qualified:
                with socket.socket() as sock:sock.bind(('127.0.0.1',0));au_port=sock.getsockname()[1]
                with tempfile.TemporaryFile() as diagnostic:
                    tunnel=subprocess.Popen(['/usr/bin/ssh','-F','/dev/null','-NT','-D','127.0.0.1:'+str(au_port),
                        '-i','/etc/lyco-proxy-egress/au-ssh','-o','BatchMode=yes','-o','IdentitiesOnly=yes',
                        '-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile=/etc/lyco-proxy-egress/known_hosts',
                        '-o','ExitOnForwardFailure=yes','-o','ConnectTimeout=8','-o','ServerAliveInterval=15',
                        '-o','ServerAliveCountMax=2','ec2-user@13.236.116.49'],stdout=subprocess.DEVNULL,stderr=diagnostic)
                    au=json.loads(json.dumps(recovery))
                    next(n for n in au['outbounds'] if n['tag']=='ssh-fast')['server_port']=au_port
                    try:
                        for attempt in range(60):
                            if tunnel.poll() is not None:break
                            try:
                                with socket.create_connection(('127.0.0.1',au_port),timeout=.2):break
                            except OSError:time.sleep(.2)
                        alternative=probe('australian-ssh-with-independent-https-dns',current,live_config=au,
                            download_bytes=4194304,github=True,site_checks=True)
                    finally:
                        tunnel.terminate()
                        try:tunnel.wait(timeout=4)
                        except subprocess.TimeoutExpired:tunnel.kill();tunnel.wait(timeout=3)
                stopped=probe('stopped-australian-forwarding',current,live_config=au,download_bytes=262144)
                blocked=bool(stopped.get('samples')) and all(not n['ok'] and n['bytes']==0 for n in stopped['samples'])
                report['australiaRecoveryComparison']=alternative;report['australiaStoppedBlocked']=blocked
                files=[n for n in alternative.get('samples',[]) if n['name'].startswith('download') or n['name']=='github-release-range']
                if alternative.get('allPassed') is True and blocked and len(files)==3 and all(n['ok'] and n['bytes']==4194304 and n['kibPerSecond']>=900 for n in files):
                    result=alternative;qualified=True;egress='australia'
            report['recoveryComparison']=result;report['recoveryQualified']=qualified;report['recoveryEgress']=egress
            if qualified:
                path=pathlib.Path('/etc/sing-box/.lyco-dns-recovery-plan.json');assert not path.exists()
                plan={'previousSha256':report['liveConfigSha256'],'configuration':recovery,
                    'proof':result,'egress':egress,'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    'observationSourceSha256':report['probeSourceSha256']}
                path.write_text(json.dumps(plan,indent=2)+'\n');path.chmod(0o600)
        else:
            optimized=json.loads(json.dumps(live)) if resolver.get('detour')=='ssh-fast' else interactive_config(live)
            report['interactiveDomains']=INTERACTIVE_DOMAINS if resolver.get('detour')=='yt-proxy' else []
            report['interactiveComparison'] = probe('current-member-route-with-site-checks',current,
                live_config=optimized,download_bytes=4194304,github=True,site_checks=True)
        report['liveConfigurationUnchanged'] = report['liveConfigSha256']==hashlib.sha256(CONFIG.read_bytes()).hexdigest()
        assert report['liveConfigurationUnchanged']
    else:
        import ast, ipaddress
        source = pathlib.Path('/opt/freeproxy-pool/cache/community-verified.json')
        raw = source.read_bytes(); document = json.loads(raw)
        expire = datetime.datetime.fromisoformat(document['expires_at_utc'])
        assert document['schema_version']==2 and document['scope']=='paid-verified-all'
        assert expire.tzinfo is not None and expire > datetime.datetime.now(datetime.timezone.utc)
        entries = document['nodes']; assert len(entries)==document['verified_count'] and len(entries)<=60
        converter = pathlib.Path('/opt/freeproxy-pool/verify_community.py')
        converter_raw = converter.read_bytes()
        expected_converter = 'c2bc34310711acb43718ca02aa1aff2ec1f19db1e8fd0682e6e68d7c2eae5c28'
        assert hashlib.sha256(converter_raw).hexdigest()==expected_converter
        tree = ast.parse(converter_raw)
        definitions = [n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('valid','outbound','public_ipv4')]
        assert len(definitions)==3
        namespace = {'ipaddress':ipaddress,'SS_METHODS':{'aes-128-gcm','aes-256-gcm','chacha20-ietf-poly1305'}}
        exec(compile(ast.Module(body=definitions,type_ignores=[]),str(converter),'exec'),namespace)
        quality = json.loads(pathlib.Path('/opt/freeproxy-pool/cache/community-quality.json').read_text())
        scores = {x['name']:min(x['samples_kib_s']) for x in quality.get('results',[])
            if isinstance(x,dict) and x.get('samples_kib_s')}
        if quality.get('source_verified_at_utc') != document['verified_at_utc']: scores = {}
        selected=[]; seen=set()
        for item in sorted(entries,key=lambda x:(-scores.get(x['node']['name'],0),x.get('https_204_ms',999999))):
            node=item['node']
            assert namespace['valid'](node), 'Verified public snapshot contains invalid configuration'
            if node['server']=='43.108.97.29' or node['server'] in seen: continue
            selected.append(node);seen.add(node['server'])
            if len(selected)==4:break
        report.update(sourceSnapshotSha256=hashlib.sha256(raw).hexdigest(),
            sourceVerifiedAt=document['verified_at_utc'],converterSha256=expected_converter,
            availableOrdinary=len(entries),ordinaryBatchSize=len(selected),ordinary=[])
        for node in selected:
            label='ordinary-'+node['type']+'-'+hashlib.sha256(node['name'].encode()).hexdigest()[:8]
            outbound=namespace['outbound'](node)
            small=probe(label+'-256k',outbound,download_bytes=262144)
            large=probe(label+'-4MiB',outbound,download_bytes=4194304,github=True)
            report['ordinary'].append({'label':label,'protocol':node['type'],'smallSample':small,'largeSample':large})
    report['validBaseline']=report['baseline'].get('allPassed') is True
    print(json.dumps(report,indent=2),flush=True)
    raise SystemExit(0 if report['validBaseline'] or report.get('recoveryQualified') else 1)

if PHASE == 'ssh-deploy':
    plan_file=pathlib.Path('/etc/sing-box/.lyco-ssh-speed-plan.json')
    plan=json.loads(plan_file.read_text())
    raw=CONFIG.read_bytes();before=json.loads(raw);updated=plan['configuration'];metadata=CONFIG.stat()
    assert hashlib.sha256(raw).hexdigest()==plan['previousSha256']
    assert updated['inbounds']==before['inbounds'] and updated.get('dns')==before.get('dns')
    assert updated['outbounds'][:-1]==before['outbounds']
    assert updated['outbounds'][-1]=={'type':'socks','tag':'ssh-fast','server':'127.0.0.1','server_port':1085,'version':'5','network':'tcp'}
    assert updated['route']['rules'][:2]==before['route']['rules'][:2]
    assert updated['route']['rules'][4:]==before['route']['rules'][2:]
    added=updated['route']['rules'][2:4]
    assert added[0]=={'inbound':['panel-in'],'network':'tcp','outbound':'ssh-fast'}
    domains=sorted({'gstatic.com'}|{domain for rule in before['route']['rules']
        if rule.get('outbound') in ('yt-proxy','node-vless','node-vmess') for domain in rule.get('domain_suffix',[])})
    assert added[1]=={'domain_suffix':domains,'network':'tcp','outbound':'ssh-fast'}
    assert {k:v for k,v in updated.items() if k not in ('outbounds','route')}=={k:v for k,v in before.items() if k not in ('outbounds','route')}
    assert {k:v for k,v in updated['route'].items() if k!='rules'}=={k:v for k,v in before['route'].items() if k!='rules'}
    proof=plan['proof'];assert proof['candidate']['allPassed'] and proof['stoppedTunnelBlocked']
    speeds=[s['kibPerSecond'] for s in proof['candidate']['samples'] if s['name'].startswith('download')]
    assert len(speeds)==2 and min(speeds)>=1000
    with tempfile.TemporaryDirectory(prefix='lyco-ssh-apply-') as folder:
        path=pathlib.Path(folder)/'config.json';path.write_text(json.dumps(updated))
        assert subprocess.run([BIN,'check','-c',str(path)],capture_output=True,timeout=8).returncode==0
    unit=pathlib.Path('/etc/systemd/system/lyco-au-ssh-egress.service')
    assert hashlib.sha256(unit.read_bytes()).hexdigest()==plan['unitSha256']
    assert subprocess.run(['systemd-analyze','verify',str(unit)],capture_output=True,timeout=10).returncode==0
    backup=pathlib.Path('/root/website-backups')/('ssh-proxy-speed-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S'))
    backup.mkdir(mode=0o700);shutil.copy2(CONFIG,backup/'config.json')
    subprocess.run(['systemctl','daemon-reload'],check=True,capture_output=True,timeout=15)
    report={'phase':PHASE,'probeSourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'backup':str(backup)}
    changed=False
    try:
        subprocess.run(['systemctl','enable','--now','lyco-au-ssh-egress.service'],check=True,capture_output=True,timeout=20)
        for attempt in range(30):
            try:
                with socket.create_connection(('127.0.0.1',1085),timeout=.2):break
            except OSError:time.sleep(.3)
        assert CONFIG.read_bytes()==raw,'Concurrent account/configuration change'
        atomic_config(updated,metadata);changed=True
        subprocess.run(['systemctl','restart','sing-box.service'],check=True,capture_output=True,timeout=20)
        subprocess.run(['systemctl','is-active','--quiet','sing-box.service'],check=True,timeout=5)
        actual=json.loads(CONFIG.read_text())
        report['result']=probe('deployed-paid-tcp-over-ssh',actual['outbounds'][-1],live_config=actual,download_bytes=4194304,github=True)
        assert report['result']['allPassed'],'Deployed real file verification failed'
        report['accountsPreserved']=actual['inbounds']==before['inbounds']
        report['udpRulesPreserved']=True
        report['rolledBack']=False
        report['liveConfigSha256']=hashlib.sha256(CONFIG.read_bytes()).hexdigest()
        plan_file.rename(backup/'deployment-plan.json')
        (backup/'RESULT.json').write_text(json.dumps(report,indent=2)+'\n')
    except Exception:
        if changed:rollback(before,metadata)
        subprocess.run(['systemctl','disable','--now','lyco-au-ssh-egress.service'],capture_output=True,timeout=15)
        report['rolledBack']=True;print(json.dumps(report,indent=2),flush=True);raise
    print(json.dumps(report,indent=2),flush=True)
    raise SystemExit(0)

if PHASE == 'ssh-candidate':
    live=json.loads(CONFIG.read_text())
    current=next(n for n in live['outbounds'] if n['tag']=='yt-proxy')
    result={'phase':PHASE,'probeSourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
            'baseline':probe('current-paid-route',current,live_config=live,download_bytes=4194304)}
    with tempfile.TemporaryDirectory(prefix='lyco-ssh-candidate-') as folder:
        with (pathlib.Path(folder)/'ssh.log').open('wb') as log:
            tunnel=subprocess.Popen(['/usr/bin/ssh','-F','/dev/null','-NT','-D','127.0.0.1:1085',
                '-i','/etc/lyco-proxy-egress/au-ssh','-o','BatchMode=yes','-o','IdentitiesOnly=yes',
                '-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile=/etc/lyco-proxy-egress/known_hosts',
                '-o','ExitOnForwardFailure=yes','-o','ConnectTimeout=8','-o','ServerAliveInterval=15',
                '-o','ServerAliveCountMax=2','ec2-user@13.236.116.49'],stdout=subprocess.DEVNULL,stderr=log)
            try:
                for attempt in range(30):
                    if tunnel.poll() is not None:break
                    try:
                        with socket.create_connection(('127.0.0.1',1085),timeout=.2):break
                    except OSError:time.sleep(.3)
                ob={'type':'socks','tag':'ssh-egress','server':'127.0.0.1','server_port':1085,'version':'5','network':'tcp'}
                result['candidate']=probe('australia-over-authenticated-ssh',ob,resolve_remote=True,download_bytes=4194304)
            finally:
                tunnel.terminate()
                try:tunnel.wait(timeout=4)
                except subprocess.TimeoutExpired:tunnel.kill();tunnel.wait(timeout=3)
            log.flush()
            result['sshDiagnostic']=(pathlib.Path(folder)/'ssh.log').read_text(errors='replace')[-1800:]
        result['stopped']=probe('stopped-ssh-no-direct-fallback',ob,resolve_remote=True)
    result['stoppedTunnelBlocked']=not result['stopped'].get('allPassed') and all(
        not s['ok'] and s['bytes']==0 for s in result['stopped'].get('samples',[])) and bool(result['stopped'].get('samples'))
    print(json.dumps(result,indent=2),flush=True)
    raise SystemExit(0 if result['candidate'].get('allPassed') and result['stoppedTunnelBlocked'] else 1)

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
