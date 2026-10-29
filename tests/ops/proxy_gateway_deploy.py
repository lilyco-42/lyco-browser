#!/usr/bin/python3
"""One guarded backend policy deployment, invoked only by the SSH CI command."""
import functools,hashlib,importlib.util,json,os,pathlib,shutil,subprocess,tempfile,time,urllib.request,datetime
os.umask(0o077)
assert os.environ.get('SSH_ORIGINAL_COMMAND')=='gateway-policy'
BASE=pathlib.Path('/opt/studio-billing');STAGE=BASE/'.gateway-policy-plan';plan=json.loads((STAGE/'plan.json').read_text())
app=BASE/'app.py';old=app.read_text();assert hashlib.sha256(app.read_bytes()).hexdigest()==plan['previousAppSha256']
expected=old
anchor='from proxy_quality import cached_report as get_proxy_quality'
assert expected.count(anchor)==1;expected=expected.replace(anchor,anchor+'\nfrom proxy_gateway_policy import prefer_gateway as prefer_proxy_gateway',1)
anchor='        cfg = {"allow-lan": False, "log-level": "info", "mixed-port": 7890, "mode": "rule",'
assert expected.count(anchor)==1;expected=expected.replace(anchor,'        _auto_candidates = prefer_proxy_gateway(cproxies[:_core_count], _auto_candidates)\n'+anchor,1)
for site,var in (('youtube','_youtube'),('chatgpt','_chatgpt')):
    anchor=f'        {var}=_lyco_site_candidates(_extra,"{site}")';assert expected.count(anchor)==1
    expected=expected.replace(anchor,f'        {var}=prefer_proxy_gateway(cproxies[:_core_count],_lyco_site_candidates(_extra,"{site}"),site="{site}")',1)
assert (STAGE/'app.py').read_text()==expected
compile(expected,'app.py','exec')
policy_source=(STAGE/'proxy_gateway_policy.py').read_bytes()
assert hashlib.sha256(policy_source).hexdigest()==plan['policySha256']
spec=importlib.util.spec_from_file_location('verified_gateway_policy',STAGE/'proxy_gateway_policy.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
verified=pathlib.Path(plan['verifiedBackup']);assert verified.parent==pathlib.Path('/root/website-backups') and verified.name.startswith('ssh-proxy-speed-')
performance=json.loads((verified/'RESULT.json').read_text());assert performance['result']['allPassed'] and performance['rolledBack'] is False
network=json.loads(pathlib.Path('/etc/sing-box/config.json').read_text());original_plan=json.loads((verified/'deployment-plan.json').read_text())
assert module.routing_digest(network)==module.routing_digest(original_plan['configuration'])
files=[s for s in performance['result']['samples'] if s['name'].startswith('download') or s['name']=='github-release-range']
assert len(files)==3 and all(s['ok'] and s['bytes']==4194304 for s in files)
minimum=min(s['kibPerSecond'] for s in files);assert minimum>=900
sites={}
for site,url,status in (('youtube','https://www.youtube.com/generate_204',b'204'),('chatgpt','https://api.openai.com/v1/models',b'401')):
    response=subprocess.run(['curl','--silent','--proxy','http://127.0.0.1:1081','--noproxy','','--connect-timeout','6','--max-time','15','--output','/dev/null','--write-out','%{http_code}',url],capture_output=True,timeout=18)
    sites[site]={'reachable':response.returncode==0 and response.stdout.strip()==status,'httpStatus':response.stdout.decode().strip()}
proof={'schema_version':1,'enabled':True,'routing_sha256':module.routing_digest(network),'verification_run':'40865149238',
       'minimum_complete_sample_bytes':4194304,'minimum_kib_s':minimum,'site_probes':{k:v['reachable'] for k,v in sites.items()}}
(STAGE/'proxy-gateway-preference.json').write_text(json.dumps(proof,indent=2)+'\n')
contract_path=pathlib.Path('/usr/local/sbin/lyco-proxy-subscription-contract.py')
contract_spec=importlib.util.spec_from_file_location('owned_subscription_contract',contract_path);contract=importlib.util.module_from_spec(contract_spec);contract_spec.loader.exec_module(contract)
contracts=contract.verify_subscription_contract(STAGE/'app.py',functools.partial(module.prefer_gateway,proof_file=STAGE/'proxy-gateway-preference.json'),proof['site_probes'])
fixture=[{'name':'owned-ci-relay','type':'vmess','network':'ws','tls':True,'port':443,'ws-opts':{'path':'/panel-ws'}}]
assert module.prefer_gateway(fixture,['owned-ci-backup'],STAGE/'proxy-gateway-preference.json')==['owned-ci-relay','owned-ci-backup']
backup=pathlib.Path('/root/website-backups')/('proxy-gateway-policy-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S'));backup.mkdir(mode=0o700)
names=('proxy_gateway_policy.py','proxy-gateway-preference.json','app.py');prior={}
for name in names:
    target=BASE/name;prior[name]=target.exists()
    if target.exists():shutil.copy2(target,backup/name)

def atomic(source,target):
    metadata=target.stat() if target.exists() else None
    fd,temp=tempfile.mkstemp(dir=BASE,prefix='.gateway-policy-')
    try:
        with os.fdopen(fd,'wb') as stream:stream.write(source.read_bytes());stream.flush();os.fsync(stream.fileno())
        if metadata:os.chown(temp,metadata.st_uid,metadata.st_gid)
        os.chmod(temp,(metadata.st_mode&0o777) if metadata else (0o600 if target.suffix=='.json' else 0o644))
        os.replace(temp,target)
    finally:pathlib.Path(temp).unlink(missing_ok=True)

def get(path):
    with urllib.request.urlopen('http://127.0.0.1:4700'+path,timeout=3) as response:return json.loads(response.read(2*1024*1024))
changed=[]
try:
    assert app.read_text()==old,'Concurrent backend source change'
    for name in names:atomic(STAGE/name,BASE/name);changed.append(name)
    subprocess.run(['systemctl','restart','studio-billing.service'],check=True,capture_output=True,timeout=20)
    for attempt in range(15):
        try:
            if get('/api/health').get('ok') is True:break
        except Exception:time.sleep(.5)
    assert get('/api/health')['ok'] is True
    products={n['code']:(n['points_price'],n['duration_days']) for n in get('/api/products')['products'] if n.get('code') in ('proxy_1m','proxy_3m','proxy_4m','proxy_1y')}
    assert all(products[k]==v for k,v in {'proxy_1m':(299,30),'proxy_3m':(852,90),'proxy_4m':(1136,120),'proxy_1y':(3050,365)}.items())
    assert module.prefer_gateway(fixture,['owned-ci-backup'],BASE/'proxy-gateway-preference.json')==['owned-ci-relay','owned-ci-backup']
except Exception:
    for name in reversed(changed):
        if prior[name]:atomic(backup/name,BASE/name)
        else:(BASE/name).unlink(missing_ok=True)
    subprocess.run(['systemctl','restart','studio-billing.service'],capture_output=True,timeout=20)
    raise
report={'phase':'gateway-policy','probeSourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
        'policySourceSha256':hashlib.sha256(policy_source).hexdigest(),'subscriptionContractSourceSha256':hashlib.sha256(contract_path.read_bytes()).hexdigest(),'generatedSubscriptionContracts':contracts,'backendSource':plan['backendSource'],
        'backup':str(backup),'backendAppSha256':hashlib.sha256(app.read_bytes()).hexdigest(),
        'existingNamesCredentialsAndFallbacksPreserved':True,'productsUnchanged':True,'serviceHealthy':True,
        'siteProbes':sites,'scope':'Client fallback preference and site-specific unauthenticated reachability only; no real customer token, video playback or ChatGPT login.'}
(backup/'RESULT.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
