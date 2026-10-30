#!/usr/bin/python3
"""Remove a failed DNS/interactive dependency after an actual replacement probe."""
import datetime, hashlib, importlib.util, json, os, pathlib, shutil, subprocess, tempfile, urllib.request
os.umask(0o077)
assert os.environ.get('SSH_ORIGINAL_COMMAND')=='ssh-deploy'
probe=globals()['LYCO_PROBE']
config=pathlib.Path('/etc/sing-box/config.json');raw=config.read_bytes();before=json.loads(raw)
plan_path=pathlib.Path('/etc/sing-box/.lyco-dns-recovery-plan.json');plan=json.loads(plan_path.read_text())
assert hashlib.sha256(raw).hexdigest()==plan['previousSha256']=='469c98de3070acb3b15f8273c1cdd5f2e1fc12e2a7ab8e416892fb620d2895a4'
assert plan['observationRun'].isdigit()
assert plan['egress'] in ('philippines','australia')
assert 0<=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(plan['checkedAt'])).total_seconds()<1800
expected=json.loads(raw)
rule={'domain_suffix':['google.com','gstatic.com','chatgpt.com','openai.com','oaistatic.com','oaiusercontent.com','cp.cloudflare.com'],'network':'tcp','outbound':'yt-proxy'}
assert expected['route']['rules'][2]==rule and expected['route']['rules'].count(rule)==1
expected['route']['rules'].remove(rule)
resolver=next(n for n in expected['dns']['servers'] if n['tag']=='lyco-egress-dns')
assert resolver=={'detour':'yt-proxy','server':'1.1.1.1','tag':'lyco-egress-dns','type':'https'}
resolver['detour']='ssh-fast'
assert plan['configuration']==expected
assert expected['inbounds']==before['inbounds'] and expected['outbounds']==before['outbounds']

def verify(value):
    assert value['allPassed'] is True
    files=[n for n in value['samples'] if n['name'].startswith('download') or n['name']=='github-release-range']
    assert len(files)==3 and all(n['ok'] and n['bytes']==4194304 and n['kibPerSecond']>=900 for n in files)
    sites={n['name']:n for n in value['samples']}
    assert sites['youtube-page']['ok'] and sites['youtube-page']['httpStatus']=='204'
    assert sites['openai-api']['ok'] and sites['openai-api']['httpStatus']=='401'
    return min(n['kibPerSecond'] for n in files)

verify(plan['proof'])
subprocess.run(['systemctl','is-active','--quiet','lyco-ph-ssh-egress.service'],check=True)
base=pathlib.Path('/opt/studio-billing');proof_path=base/'proxy-gateway-preference.json';old_proof=proof_path.read_bytes()
assert hashlib.sha256(old_proof).hexdigest()=='1e664679a0b3a3044806f8866ee18a2bb68edc790567f9d293a9c82f461e7237'
policy_path=base/'proxy_gateway_policy.py'
assert hashlib.sha256(policy_path.read_bytes()).hexdigest()=='f0c4680589793c9d351e5deec84b3227f626300b36e53992fc840c0ff1ff3c89'
spec=importlib.util.spec_from_file_location('recovery_policy',policy_path);policy=importlib.util.module_from_spec(spec);spec.loader.exec_module(policy)
contract_path=pathlib.Path('/usr/local/sbin/lyco-proxy-subscription-contract.py')
assert hashlib.sha256(contract_path.read_bytes()).hexdigest()==plan['contractSha256']
spec=importlib.util.spec_from_file_location('recovery_contract',contract_path);contract=importlib.util.module_from_spec(spec);spec.loader.exec_module(contract)
backup=pathlib.Path('/root/website-backups')/('proxy-dns-recovery-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S'));backup.mkdir(mode=0o700)
for path,name in [(config,'config.json'),(proof_path,'preference.json'),(plan_path,'plan.json')]:
    shutil.copy2(path,backup/name);(backup/name).chmod(0o600)

def atomic(path,data):
    st=path.stat();fd,tmp=tempfile.mkstemp(prefix='.lyco-recovery-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
        os.chown(tmp,st.st_uid,st.st_gid);os.chmod(tmp,st.st_mode&0o777);os.replace(tmp,path)
    finally:pathlib.Path(tmp).unlink(missing_ok=True)

encoded=(json.dumps(expected,ensure_ascii=False,indent=2)+'\n').encode()
with tempfile.TemporaryDirectory(prefix='lyco-recovery-') as folder:
    p=pathlib.Path(folder)/'config.json';p.write_bytes(encoded)
    subprocess.run(['/usr/local/bin/sing-box','check','-c',str(p)],check=True,capture_output=True,timeout=8)
try:
    assert config.read_bytes()==raw and proof_path.read_bytes()==old_proof
    if plan['egress']=='australia':
        subprocess.run(['systemctl','disable','--now','lyco-ph-ssh-egress.service'],check=True,capture_output=True,timeout=25)
        subprocess.run(['systemctl','enable','--now','lyco-au-ssh-egress.service'],check=True,capture_output=True,timeout=25)
    atomic(config,encoded)
    subprocess.run(['systemctl','restart','sing-box.service'],check=True,capture_output=True,timeout=25)
    actual=json.loads(config.read_bytes());current=next(n for n in actual['outbounds'] if n['tag']=='yt-proxy')
    after=probe('deployed-ph-ssh-https-dns-recovery',current,live_config=actual,download_bytes=4194304,github=True,site_checks=True)
    minimum=verify(after)
    proof={'schema_version':1,'enabled':True,'routing_sha256':policy.routing_digest(actual),'verification_run':plan['observationRun'],
        'minimum_complete_sample_bytes':4194304,'minimum_kib_s':minimum,'site_probes':{'youtube':True,'chatgpt':True}}
    atomic(proof_path,(json.dumps(proof,indent=2)+'\n').encode())
    contracts=contract.verify_subscription_contract(base/'app.py',policy.prefer_gateway,proof['site_probes'])
    with urllib.request.urlopen('http://127.0.0.1:4700/api/products',timeout=5) as r:products=json.load(r)['products']
    values={p['code']:(p['points_price'],p['duration_days']) for p in products if p.get('code') in ('proxy_1m','proxy_3m','proxy_4m','proxy_1y')}
    assert values=={'proxy_1m':(299,30),'proxy_3m':(852,90),'proxy_4m':(1136,120),'proxy_1y':(3050,365)}
except Exception:
    atomic(config,raw);atomic(proof_path,old_proof)
    if plan['egress']=='australia':
        subprocess.run(['systemctl','disable','--now','lyco-au-ssh-egress.service'],capture_output=True,timeout=25)
        subprocess.run(['systemctl','enable','--now','lyco-ph-ssh-egress.service'],capture_output=True,timeout=25)
    subprocess.run(['systemctl','restart','sing-box.service'],capture_output=True,timeout=25)
    (backup/'FAILURE.json').write_text('{"rolledBack":true}\n')
    raise
result={'phase':'ssh-deploy','deploySourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
    'observationRun':plan['observationRun'],'result':after,'backup':str(backup),'rolledBack':False,
    'subscriptionContracts':contracts,'accountsNodesAndProductsPreserved':True,'dnsEgress':plan['egress']+'-ssh-strict-https',
    'configurationSha256':hashlib.sha256(config.read_bytes()).hexdigest(),'preferenceSha256':hashlib.sha256(proof_path.read_bytes()).hexdigest()}
(backup/'RESULT.json').write_text(json.dumps(result,indent=2)+'\n')
shutil.move(str(plan_path),str(backup/'consumed-plan.json'))
LYCO_DEPLOY_RESULT=result
