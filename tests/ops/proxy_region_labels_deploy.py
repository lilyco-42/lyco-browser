#!/usr/bin/python3
"""Deploy only subscription display labels and evidence-bound gateway country."""
import datetime,functools,hashlib,importlib.util,json,os,pathlib,shutil,subprocess,tempfile,time,urllib.request
os.umask(0o077)
assert os.environ.get('SSH_ORIGINAL_COMMAND')=='subscription-regions'
base=pathlib.Path('/opt/studio-billing');stage=base/'.subscription-regions-plan'
plan=json.loads((stage/'plan.json').read_text())
app=base/'app.py';old=app.read_text()
assert hashlib.sha256(app.read_bytes()).hexdigest()=='9438dd924dbb287694d174f2df22491a853bd348db90e7e54da0db71a723a2c0'
expected=old
changes=[('from proxy_gateway_policy import prefer_gateway as prefer_proxy_gateway',
 'from proxy_gateway_policy import prefer_gateway as prefer_proxy_gateway\nfrom proxy_region_labels import label_clash_config as _label_proxy_config, label_share_links as _label_proxy_links'),
 ('return JSONResponse(cfg,headers=_profile_headers)','return JSONResponse(_label_proxy_config(cfg),headers=_profile_headers)'),
 ('return Response(content="\\n".join(links), media_type="text/plain; charset=utf-8")',
 'links = _label_proxy_links(links)\n        return Response(content="\\n".join(links), media_type="text/plain; charset=utf-8")'),
 ('return Response(content=_b64.b64encode("\\n".join(links).encode()).decode(),',
 'links = _label_proxy_links(links)\n        return Response(content=_b64.b64encode("\\n".join(links).encode()).decode(),')]
for before,after in changes:
    assert expected.count(before)==1;expected=expected.replace(before,after,1)
assert (stage/'app.py').read_text()==expected
compile(expected,'reviewed-subscription-app.py','exec')
module_bytes=(stage/'proxy_region_labels.py').read_bytes()
assert hashlib.sha256(module_bytes).hexdigest()==plan['regionLabelsSha256']
assert not (base/'proxy_region_labels.py').exists()
config=pathlib.Path('/etc/sing-box/config.json');config_raw=config.read_bytes()
assert hashlib.sha256(config_raw).hexdigest()=='3f7ee6cc4af701cb22bacb09fe8b1494b73a57181e29882f51e4dfb443d70206'
subprocess.run(['systemctl','is-active','--quiet','lyco-au-ssh-egress.service'],check=True)
proof_path=base/'proxy-gateway-preference.json';proof_raw=proof_path.read_bytes()
assert hashlib.sha256(proof_raw).hexdigest()=='575e703135f0c927fda963b69e631ca1d03573886556b3dec1ea13603952747f'
proof=json.loads(proof_raw);proof['egress_country']='AU'
(stage/'preference.json').write_text(json.dumps(proof,indent=2)+'\n')

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

labels=load('reviewed_region_labels',stage/'proxy_region_labels.py')
contract_path=pathlib.Path('/usr/local/sbin/lyco-proxy-subscription-contract.py')
assert hashlib.sha256(contract_path.read_bytes()).hexdigest()==plan['contractSha256']
contract=load('reviewed_region_contract',contract_path)
policy=load('verified_region_policy',base/'proxy_gateway_policy.py')
metadata=labels.context({},proof,json.loads(config_raw))
assert metadata['gateway']=='🇦🇺 澳大利亚'

def contracts(path):
    return contract.verify_subscription_contract(path,policy.prefer_gateway,proof['site_probes'],
        decorate=functools.partial(labels.label_clash_config,metadata=metadata),
        link_decorate=functools.partial(labels.label_share_links,metadata=metadata))

contracts(stage/'app.py')
# Actual cached nodes are transformed privately; only aggregate checks leave SSH.
catalog_path=pathlib.Path('/opt/freeproxy-pool/cache/public-full-catalog.json')
catalog=json.loads(catalog_path.read_text());actual_metadata=labels.context(catalog,proof,json.loads(config_raw))
full=catalog['nodes'];full_before=json.dumps(full,sort_keys=True)
fixture={'proxies':full,'proxy-groups':[{'name':'PROXY','type':'select','proxies':[n['name'] for n in full]}]}
labelled=labels.label_clash_config(fixture,metadata=actual_metadata)
assert len(labelled['proxies'])==len(full) and json.dumps(full,sort_keys=True)==full_before
for before,after in zip(full,labelled['proxies']):
    assert {k:v for k,v in before.items() if k!='name'}=={k:v for k,v in after.items() if k not in ('name','x-lyco-original-name')}
    assert after['name'] in labelled['proxy-groups'][0]['proxies']
verified=json.loads(pathlib.Path('/opt/freeproxy-pool/cache/community-verified.json').read_text())['nodes']
verified_labelled=labels.label_clash_config({'proxies':[n['node'] for n in verified],'proxy-groups':[]},metadata=actual_metadata)['proxies']
assert len(verified_labelled)==len(verified)
assert all(any(area in n['name'] for area in labels.AREAS.values()) or labels.UNKNOWN in n['name'] for n in verified_labelled)
backup=pathlib.Path('/root/website-backups')/('subscription-regions-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S'));backup.mkdir(mode=0o700)
for path,name in [(app,'app.py'),(proof_path,'preference.json')]:
    shutil.copy2(path,backup/name);(backup/name).chmod(0o600)

def atomic(source,target):
    st=target.stat() if target.exists() else None;fd,name=tempfile.mkstemp(prefix='.region-labels-',dir=target.parent)
    try:
        with os.fdopen(fd,'wb') as f:f.write(source.read_bytes());f.flush();os.fsync(f.fileno())
        if st:os.chown(name,st.st_uid,st.st_gid)
        os.chmod(name,st.st_mode&0o777 if st else 0o644);os.replace(name,target)
    finally:pathlib.Path(name).unlink(missing_ok=True)

changed=[]
try:
    assert app.read_text()==old and proof_path.read_bytes()==proof_raw and config.read_bytes()==config_raw
    for origin,target in [(stage/'proxy_region_labels.py',base/'proxy_region_labels.py'),(stage/'app.py',app),(stage/'preference.json',proof_path)]:
        atomic(origin,target);changed.append(target)
    subprocess.run(['systemctl','restart','studio-billing.service'],check=True,capture_output=True,timeout=25)
    for attempt in range(20):
        try:
            with urllib.request.urlopen('http://127.0.0.1:4700/api/health',timeout=2) as r:
                if json.load(r).get('ok'):break
        except Exception:time.sleep(.5)
    else:raise RuntimeError('Billing service did not become ready')
    actual_contracts=contracts(app)
    with urllib.request.urlopen('http://127.0.0.1:4700/api/products',timeout=5) as r:products=json.load(r)['products']
    values={p['code']:(p['points_price'],p['duration_days']) for p in products if p.get('code') in ('proxy_1m','proxy_3m','proxy_4m','proxy_1y')}
    assert values=={'proxy_1m':(299,30),'proxy_3m':(852,90),'proxy_4m':(1136,120),'proxy_1y':(3050,365)}
    assert config.read_bytes()==config_raw
except Exception:
    if app in changed:atomic(backup/'app.py',app)
    if proof_path in changed:atomic(backup/'preference.json',proof_path)
    if base/'proxy_region_labels.py' in changed:(base/'proxy_region_labels.py').unlink(missing_ok=True)
    subprocess.run(['systemctl','restart','studio-billing.service'],capture_output=True,timeout=25)
    raise
result={'phase':'subscription-regions','probeSourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
    'regionLabelsSourceSha256':hashlib.sha256(module_bytes).hexdigest(),'subscriptionContractSourceSha256':hashlib.sha256(contract_path.read_bytes()).hexdigest(),
    'backendSource':plan['backendSource'],'backup':str(backup),'subscriptionContracts':actual_contracts,
    'shareLinkFormats':['v2ray','base64','base64all'],'fullCataloguePreserved':len(full),'verifiedNodesLabelled':len(verified_labelled),
    'sourceRegionsShown':sum('来源标注' in n['name'] for n in verified_labelled),'gatewayCountry':'AU',
    'routingAccountsCredentialsProductsUnchanged':True,'backendAppSha256':hashlib.sha256(app.read_bytes()).hexdigest(),
    'preferenceSha256':hashlib.sha256(proof_path.read_bytes()).hexdigest()}
(backup/'RESULT.json').write_text(json.dumps(result,indent=2)+'\n');shutil.move(str(stage),str(backup/'staged-source'))
print(json.dumps(result,indent=2),flush=True)
