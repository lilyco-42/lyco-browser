#!/usr/bin/python3
"""Guarded promotion of a genuinely observed owned SSH egress; no customer tokens."""
import datetime, hashlib, importlib.util, json, os, pathlib, shutil, socket, subprocess, tempfile, time, urllib.request

os.umask(0o077)
assert os.environ.get('SSH_ORIGINAL_COMMAND') == 'ssh-deploy'
probe = globals()['LYCO_PROBE']
plan_path = pathlib.Path('/etc/sing-box/.lyco-ph-egress-plan.json')
plan = json.loads(plan_path.read_text())
assert plan['schemaVersion'] == 1
assert plan['observationRun'].isdigit() and plan['probeSourceSha256'] == plan['observationSourceSha256']
checked = datetime.datetime.fromisoformat(plan['checkedAt'])
assert 0 <= (datetime.datetime.now(datetime.timezone.utc)-checked).total_seconds() < 1800
config = pathlib.Path('/etc/sing-box/config.json')
raw = config.read_bytes(); before = json.loads(raw)
assert hashlib.sha256(raw).hexdigest() == plan['previousSha256']
candidate = plan['configuration']; expected = json.loads(raw)
domains = ['google.com','gstatic.com','chatgpt.com','openai.com','oaistatic.com','oaiusercontent.com','cp.cloudflare.com']
assert expected['route']['rules'][2] == {'inbound':['panel-in'],'network':'tcp','outbound':'ssh-fast'}
expected['route']['rules'].insert(2, {'domain_suffix':domains,'network':'tcp','outbound':'yt-proxy'})
assert candidate == expected, 'Only the reviewed interactive rule is allowed'
assert candidate['inbounds'] == before['inbounds'] and candidate['outbounds'] == before['outbounds']
assert next(n for n in candidate['outbounds'] if n['tag']=='ssh-fast') == {
    'type':'socks','tag':'ssh-fast','server':'127.0.0.1','server_port':1085,'version':'5','network':'tcp'}

def verify_result(value, interactive=False):
    assert value['allPassed'] is True
    files = [n for n in value['samples'] if n['name'].startswith('download') or n['name']=='github-release-range']
    assert len(files)==3 and all(n['ok'] and n['bytes']==4194304 and n['kibPerSecond']>=900 for n in files)
    if interactive:
        pages = [n for n in value['samples'] if n['name'] in ('cloudflare-page','google-page')]
        assert len(pages)==2 and all(n['ok'] and n['elapsedMs']<=700 for n in pages)
        sites = {n['name']:n for n in value['samples'] if n['name'] in ('youtube-page','openai-api')}
        assert sites['youtube-page']['ok'] and sites['youtube-page']['httpStatus']=='204'
        assert sites['openai-api']['ok'] and sites['openai-api']['httpStatus']=='401'
    return min(n['kibPerSecond'] for n in files)

ph = plan['proof']['philippines']
assert ph['region']=='philippines' and ph['sshConnected'] and ph['stoppedBlocked']
assert plan['proof']['baseline']['allPassed']
assert ph['result']['allPassed'] is True
verify_result(ph['fullRoute'], interactive=True)
prior=plan['previousFullProof'];assert prior['run']=='40979188672' and prior['stoppedBlocked']
verify_result(prior['fullRoute'], interactive=True)
folder = pathlib.Path('/etc/lyco-proxy-egress')
key = folder/'.nearby-speed-id'; hosts = folder/'.nearby-known-hosts'
assert key.stat().st_uid==0 and key.stat().st_mode&0o777==0o600
assert hashlib.sha256(key.with_suffix('.pub').read_bytes()).hexdigest()==plan['keyPublicSha256']
assert hashlib.sha256(hosts.read_bytes()).hexdigest()=='a05eb37fb77f71c90a3b2658ef670f06cc817c458ae4ed634853ed6e7efd2adc'
ph_hosts = '\n'.join(n for n in hosts.read_text().splitlines() if n.startswith('8.212.147.126 '))+'\n'
assert ph_hosts.strip()
new_key = folder/'ph-ssh'; new_hosts = folder/'ph-known-hosts'
unit = pathlib.Path('/etc/systemd/system/lyco-ph-ssh-egress.service')
assert not any(p.exists() for p in (new_key,new_hosts,unit))
old_unit = pathlib.Path('/etc/systemd/system/lyco-au-ssh-egress.service')
assert hashlib.sha256(old_unit.read_bytes()).hexdigest()==plan['previousAuUnitSha256']

def systemctl(*args):
    return subprocess.run(['systemctl',*args],check=True,capture_output=True,timeout=30)

systemctl('is-active','--quiet','lyco-au-ssh-egress.service')
was_enabled = subprocess.run(['systemctl','is-enabled','--quiet','lyco-au-ssh-egress.service']).returncode==0
base = pathlib.Path('/opt/studio-billing')
proof_path = base/'proxy-gateway-preference.json'; old_proof = proof_path.read_bytes()
assert hashlib.sha256(old_proof).hexdigest()==plan['previousPreferenceSha256']
policy_path = base/'proxy_gateway_policy.py'
assert hashlib.sha256(policy_path.read_bytes()).hexdigest()==plan['policySha256']
spec=importlib.util.spec_from_file_location('verified_owned_gateway_policy',policy_path)
policy=importlib.util.module_from_spec(spec);spec.loader.exec_module(policy)
contract_path=pathlib.Path('/usr/local/sbin/lyco-proxy-subscription-contract.py')
assert hashlib.sha256(contract_path.read_bytes()).hexdigest()==plan['contractSha256']
spec=importlib.util.spec_from_file_location('verified_owned_subscription_contract',contract_path)
contract=importlib.util.module_from_spec(spec);spec.loader.exec_module(contract)
backup=pathlib.Path('/root/website-backups')/('proxy-ph-egress-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S'))
backup.mkdir(mode=0o700)
for source,name in [(config,'config.json'),(proof_path,'proxy-gateway-preference.json'),(old_unit,'au.service'),(plan_path,'deployment-plan.json')]:
    shutil.copy2(source,backup/name);(backup/name).chmod(0o600)

def atomic(target, data):
    metadata=target.stat();fd,name=tempfile.mkstemp(prefix='.lyco-egress-',dir=target.parent)
    try:
        with os.fdopen(fd,'wb') as out:out.write(data);out.flush();os.fsync(out.fileno())
        os.chown(name,metadata.st_uid,metadata.st_gid);os.chmod(name,metadata.st_mode&0o777);os.replace(name,target)
    finally:pathlib.Path(name).unlink(missing_ok=True)

service='''[Unit]
Description=LYCO authenticated Philippine SSH TCP egress
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
User=root
ExecStart=/usr/bin/ssh -F /dev/null -NT -D 127.0.0.1:1085 -i /etc/lyco-proxy-egress/ph-ssh -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/etc/lyco-proxy-egress/ph-known-hosts -o ExitOnForwardFailure=yes -o ConnectTimeout=8 -o ServerAliveInterval=15 -o ServerAliveCountMax=2 root@8.212.147.126
Restart=always
RestartSec=3
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
CapabilityBoundingSet=
UMask=0077

[Install]
WantedBy=multi-user.target
'''
encoded=(json.dumps(candidate,ensure_ascii=False,indent=2)+'\n').encode()
with tempfile.TemporaryDirectory(prefix='lyco-ph-config-') as temp:
    p=pathlib.Path(temp)/'config.json';p.write_bytes(encoded)
    subprocess.run(['/usr/local/bin/sing-box','check','-c',str(p)],check=True,capture_output=True,timeout=8)
changed=False
try:
    assert config.read_bytes()==raw and proof_path.read_bytes()==old_proof
    changed=True
    shutil.copy2(key,new_key);new_key.chmod(0o600);new_hosts.write_text(ph_hosts);new_hosts.chmod(0o600)
    unit.write_text(service);unit.chmod(0o644)
    systemctl('daemon-reload');systemctl('disable','--now','lyco-au-ssh-egress.service')
    systemctl('enable','--now','lyco-ph-ssh-egress.service')
    for attempt in range(60):
        try:
            with socket.create_connection(('127.0.0.1',1085),timeout=.2):break
        except OSError:time.sleep(.2)
    else:raise RuntimeError('Promoted SSH forwarding did not become ready')
    atomic(config,encoded);systemctl('restart','sing-box.service')
    systemctl('is-active','--quiet','lyco-ph-ssh-egress.service','sing-box.service')
    current=next(n for n in candidate['outbounds'] if n['tag']=='yt-proxy')
    after=probe('deployed-interactive-korea-bulk-philippines',current,live_config=json.loads(config.read_bytes()),
        download_bytes=4194304,github=True,site_checks=True)
    minimum=verify_result(after,interactive=True)
    live_sites={}
    for label,url,status in [('youtube','https://www.youtube.com/generate_204',b'204'),
                             ('openai','https://api.openai.com/v1/models',b'401')]:
        reply=subprocess.run(['curl','--silent','--proxy','http://127.0.0.1:1081','--noproxy','',
            '--connect-timeout','6','--max-time','15','--output','/dev/null','--write-out','%{http_code}',url],
            capture_output=True,timeout=18)
        assert reply.returncode==0 and reply.stdout.strip()==status
        live_sites[label]=reply.stdout.decode().strip()
    proof={'schema_version':1,'enabled':True,'routing_sha256':policy.routing_digest(candidate),
        'verification_run':plan['observationRun'],'minimum_complete_sample_bytes':4194304,
        'minimum_kib_s':minimum,'site_probes':{'youtube':True,'chatgpt':True}}
    atomic(proof_path,(json.dumps(proof,indent=2)+'\n').encode())
    contracts=contract.verify_subscription_contract(base/'app.py',policy.prefer_gateway,proof['site_probes'])
    with urllib.request.urlopen('http://127.0.0.1:4700/api/products',timeout=5) as response:products=json.load(response)['products']
    actual={p['code']:(p['points_price'],p['duration_days']) for p in products if p.get('code') in ('proxy_1m','proxy_3m','proxy_4m','proxy_1y')}
    assert actual=={'proxy_1m':(299,30),'proxy_3m':(852,90),'proxy_4m':(1136,120),'proxy_1y':(3050,365)}
except Exception:
    if changed:
        subprocess.run(['systemctl','disable','--now','lyco-ph-ssh-egress.service'],capture_output=True,timeout=30)
        atomic(config,raw);atomic(proof_path,old_proof)
        for p in (unit,new_key,new_hosts):p.unlink(missing_ok=True)
        systemctl('daemon-reload')
        if was_enabled:systemctl('enable','lyco-au-ssh-egress.service')
        systemctl('start','lyco-au-ssh-egress.service');systemctl('restart','sing-box.service')
        (backup/'FAILURE.json').write_text(json.dumps({'rolledBack':True,'auServiceRestored':True})+'\n')
    raise
result={'phase':'ssh-deploy','deploySourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
    'backup':str(backup),'observationRun':plan['observationRun'],'result':after,
    'customerAccountsUnchanged':True,'subscriptionContracts':contracts,'productsUnchanged':True,
    'liveServiceSiteStatuses':live_sites,
    'interactiveDomains':domains,'bulkEgress':'owned-philippine-strict-ssh','rolledBack':False}
(backup/'RESULT.json').write_text(json.dumps(result,indent=2)+'\n')
shutil.move(str(plan_path),str(backup/'consumed-plan.json'))
LYCO_DEPLOY_RESULT=result
