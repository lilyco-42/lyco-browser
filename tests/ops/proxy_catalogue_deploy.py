#!/usr/bin/python3
"""Restore complete manual catalogues, preserving automatic pools and concurrent app work."""
import ast,base64,copy,datetime,gzip,hashlib,importlib.util,json,os,pathlib,shutil,subprocess,sys,tempfile,time,urllib.request
os.umask(0o077)
assert os.environ.get('SSH_ORIGINAL_COMMAND')=='subscription-catalogue'
base=pathlib.Path('/opt/studio-billing');stage=base/'.subscription-catalogue-plan';plan=json.loads((stage/'plan.json').read_text())
compressed=sys.stdin.buffer.read(22846527)
assert len(compressed)==22846526 and hashlib.sha256(compressed).hexdigest()=='8451100836c9eda194331c2babfad490b2faf30cebc1a04b0e76fd8ac2d35d10'
binary=stage/'mihomo';binary.write_bytes(gzip.decompress(compressed));binary.chmod(0o700)
app=base/'app.py';original=app.read_bytes();tree=ast.parse(original)
assert hashlib.sha256(original).hexdigest()==plan['previousAppSha256']
target=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='sub_formats')
assert hashlib.sha256(ast.dump(target,include_attributes=False).encode()).hexdigest()==plan['previousSubAstSha256']
source=(stage/'sub_formats.py').read_text();assert hashlib.sha256(source.encode()).hexdigest()==plan['candidateSubSha256']
lines=original.decode().splitlines(keepends=True);candidate=''.join(lines[:target.lineno-1])+source+'\n'+''.join(lines[target.end_lineno:])
anchor='from proxy_region_labels import label_clash_config as _label_proxy_config, label_share_links as _label_proxy_links'
assert candidate.count(anchor)==1
candidate=candidate.replace(anchor,anchor+'\nfrom proxy_catalogue_visibility import complete_manual_config as _complete_proxy_catalogue, complete_share_links as _complete_proxy_links',1)
newtree=ast.parse(candidate)
old_other=[ast.dump(n,include_attributes=False) for n in tree.body if n is not target]
new_other=[ast.dump(n,include_attributes=False) for n in newtree.body if not (isinstance(n,ast.FunctionDef) and n.name=='sub_formats') and not (isinstance(n,ast.ImportFrom) and n.module=='proxy_catalogue_visibility')]
assert old_other==new_other,'Concurrent registration and all other app code must be preserved'
compile(candidate,'reviewed-catalogue-app.py','exec');(stage/'app.py').write_text(candidate)
module_path=base/'proxy_catalogue_visibility.py';assert not module_path.exists()
module_source=(stage/'proxy_catalogue_visibility.py').read_bytes();assert hashlib.sha256(module_source).hexdigest()==plan['catalogueSourceSha256']
config=pathlib.Path('/etc/sing-box/config.json');config_before=config.read_bytes()
proof=base/'proxy-gateway-preference.json';proof_before=proof.read_bytes()
assert hashlib.sha256(config_before).hexdigest()=='3f7ee6cc4af701cb22bacb09fe8b1494b73a57181e29882f51e4dfb443d70206'
assert hashlib.sha256(proof_before).hexdigest()=='1f5affd84e273c921488d9dcf77127afb37f4926843e6aaca201d49c49c57759'

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

module=load('reviewed_catalogue_visibility',stage/'proxy_catalogue_visibility.py')
labels=load('current_region_labels',base/'proxy_region_labels.py')
contract_path=pathlib.Path('/usr/local/sbin/lyco-proxy-subscription-contract.py')
assert hashlib.sha256(contract_path.read_bytes()).hexdigest()==plan['contractSha256']
contract=load('current_subscription_contract',contract_path);policy=load('current_gateway_policy',base/'proxy_gateway_policy.py')
flags=json.loads(proof_before)['site_probes']
kwargs={'decorate':labels.label_clash_config,'link_decorate':labels.label_share_links,
        'complete':module.complete_manual_config,'complete_links':module.complete_share_links}
contract.verify_subscription_contract(stage/'app.py',policy.prefer_gateway,flags,**kwargs)
ns,_,_=contract.fixture_generator(stage/'app.py',policy.prefer_gateway,flags,**kwargs)
names={'_lyco_managed_extras','_lyco_public_full_cached','_lyco_public_full_catalog','_lyco_proxy_share_links','_lyco_extra_share_links','_lyco_full_public_links'}
defs=[copy.deepcopy(n) for n in newtree.body if isinstance(n,ast.FunctionDef) and n.name in names]
assert {n.name for n in defs}==names
for n in defs:n.decorator_list=[]
ns.update(BASE=base,Path=pathlib.Path)
exec(compile(ast.Module(body=defs,type_ignores=[]),'actual-owned-catalogue-readers','exec'),ns)
managed,healthy=ns['_lyco_managed_extras'](include_unverified=True);full,regions=ns['_lyco_public_full_catalog']()
assert managed and full
assert not any(n.get('server')=='43.108.97.29' for n in managed+list(full))
observed=[]
def checked_complete(cfg,*args):
    automatic={g['name']:copy.deepcopy(g) for g in cfg['proxy-groups'] if g['type'] in ('fallback','url-test')}
    out=module.complete_manual_config(cfg,*args)
    for group in out['proxy-groups']:
        if group['name'] in automatic:assert group==automatic[group['name']]
        elif group['name'] not in {g['name'] for g in cfg['proxy-groups']}:assert group['type']=='select'
    return out
ns['_complete_proxy_catalogue']=checked_complete
def canonical(link):
    if link.startswith('vmess://'):
        b=link[8:];d=json.loads(base64.urlsafe_b64decode(b+'='*(-len(b)%4)));d.pop('ps',None);return 'vmess:'+json.dumps(d,sort_keys=True)
    return link.split('#',1)[0]

for fmt in ('clash','clashjp','clashcommunity','clashall'):
    cfg=ns['sub_formats']('owned-fixture-token-never-sent',fmt)['config']
    assert len(cfg['proxies'])>=len(managed)+len(full)
    assert any(g['name'].startswith('🗂️ 会员节点') for g in cfg['proxy-groups'])
    assert any(g['name'].startswith('🗂️ 普通节点') for g in cfg['proxy-groups'])
    assert not any(n.get('server')=='43.108.97.29' for n in cfg['proxies'])
    p=stage/(fmt+'.json');p.write_text(json.dumps(cfg,ensure_ascii=False));p.chmod(0o600)
    data=stage/'core-data';data.mkdir(exist_ok=True)
    result=subprocess.run([str(binary),'-t','-f',str(p),'-d',str(data)],capture_output=True,timeout=150,
        env={**os.environ,'HTTP_PROXY':'http://127.0.0.1:1081','HTTPS_PROXY':'http://127.0.0.1:1081'})
    (stage/(fmt+'-parser.log')).write_bytes(result.stdout+result.stderr)
    assert result.returncode==0,'Actual complete catalogue rejected by pinned Mihomo; details stay private'
    observed.append({'format':fmt,'visibleEntries':len(cfg['proxies']),'coreParserPassed':True,'automaticGroupsUnchanged':True})
expected_links={canonical(n) for n in ns['_lyco_extra_share_links'](include_unverified=True)+ns['_lyco_full_public_links']()}
for fmt in ('v2ray','base64','base64all'):
    content=ns['sub_formats']('owned-fixture-token-never-sent',fmt)['content']
    text=base64.b64decode(content).decode() if fmt.startswith('base64') else content
    actual={canonical(n) for n in text.splitlines()};assert expected_links<=actual
    observed.append({'format':fmt,'completeManagedAndOrdinaryLinksPreserved':True,'visibleLinks':len(text.splitlines())})
backup=pathlib.Path('/root/website-backups')/('subscription-catalogue-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S'));backup.mkdir(mode=0o700)
shutil.copy2(app,backup/'app.py');(backup/'app.py').chmod(0o600)
def atomic(source,path):
    st=path.stat() if path.exists() else None;fd,n=tempfile.mkstemp(prefix='.catalogue-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as f:f.write(source.read_bytes());f.flush();os.fsync(f.fileno())
        if st:os.chown(n,st.st_uid,st.st_gid)
        os.chmod(n,st.st_mode&0o777 if st else 0o644);os.replace(n,path)
    finally:pathlib.Path(n).unlink(missing_ok=True)
changed=False
try:
    assert app.read_bytes()==original and config.read_bytes()==config_before and proof.read_bytes()==proof_before
    atomic(stage/'proxy_catalogue_visibility.py',module_path);changed=True;atomic(stage/'app.py',app)
    subprocess.run(['systemctl','restart','studio-billing.service'],check=True,capture_output=True,timeout=25)
    for attempt in range(20):
        try:
            with urllib.request.urlopen('http://127.0.0.1:4700/api/health',timeout=2) as r:
                if json.load(r).get('ok'):break
        except Exception:time.sleep(.5)
    else:raise RuntimeError('Billing service not ready')
    contract.verify_subscription_contract(app,policy.prefer_gateway,flags,**kwargs)
    with urllib.request.urlopen('http://127.0.0.1:4700/api/products',timeout=5) as r:products=json.load(r)['products']
    values={n['code']:(n['points_price'],n['duration_days']) for n in products if n.get('code') in ('proxy_1m','proxy_3m','proxy_4m','proxy_1y')}
    assert values=={'proxy_1m':(299,30),'proxy_3m':(852,90),'proxy_4m':(1136,120),'proxy_1y':(3050,365)}
    assert config.read_bytes()==config_before and proof.read_bytes()==proof_before
except Exception:
    if changed:
        assert app.read_bytes() in (original,candidate.encode()),'Do not overwrite concurrent app updates'
        atomic(backup/'app.py',app);module_path.unlink(missing_ok=True)
        subprocess.run(['systemctl','restart','studio-billing.service'],capture_output=True,timeout=25)
    raise
result={'phase':'subscription-catalogue','probeSourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
    'catalogueSourceSha256':hashlib.sha256(module_source).hexdigest(),'subscriptionContractSourceSha256':hashlib.sha256(contract_path.read_bytes()).hexdigest(),
    'backendSource':plan['backendSource'],'preservedLiveAppSha256':plan['previousAppSha256'],'backendAppSha256':hashlib.sha256(app.read_bytes()).hexdigest(),
    'backup':str(backup),'managedCatalogueEntries':len(managed),'managedEntryServers':len({n['server'] for n in managed}),
    'ordinaryCatalogueEntries':len(full),'managedCurrentlyApproved':len(healthy),'formats':observed,
    'routingPreferenceCredentialsProductsUnchanged':True,'unrelatedRegistrationCodePreserved':True,
    'officialCoreCompressedSha256':hashlib.sha256(compressed).hexdigest()}
(backup/'RESULT.json').write_text(json.dumps(result,indent=2)+'\n');shutil.move(str(stage),str(backup/'staged-source'))
print(json.dumps(result,indent=2),flush=True)
