#!/usr/bin/python3
"""Guarded ordinary-node metadata and existing website-entry update; no node or billing mutations."""
import ast,asyncio,datetime,hashlib,json,os,pathlib,shutil,subprocess,tempfile,time,urllib.request

os.umask(0o077)
assert os.environ.get('SSH_ORIGINAL_COMMAND')=='ordinary-labels'
BASE=pathlib.Path('/opt/studio-billing');STAGE=BASE/'.ordinary-labels-plan'
plan=json.loads((STAGE/'plan.json').read_text())
allowed={'/opt/studio-billing/app.py','/var/www/studio/assets/store.js',
         '/var/www/studio/sub/index.html','/var/www/studio/vpn/quality.html'}
assert {x['target'] for x in plan['files']}==allowed and len(plan['files'])==4
assert plan['websiteRun']=='40909652301' and plan['websiteSource']=='65f05d1d85b19be8644a8118ddcdb6be3e66e2f7'
assert plan['backendSource'].startswith('5cc838c')
sources={};old={}
for entry in plan['files']:
    assert pathlib.Path(entry['source']).name==entry['source']
    target=pathlib.Path(entry['target']);source=STAGE/entry['source']
    assert hashlib.sha256(target.read_bytes()).hexdigest()==entry['previousSha256'], 'Concurrent source change'
    assert hashlib.sha256(source.read_bytes()).hexdigest()==entry['sha256']
    sources[target]=source;old[target]=target.read_bytes()
app=BASE/'app.py';new=sources[app].read_text();previous=old[app].decode()
assert hashlib.sha256(old[app]).hexdigest()=='d0e170e48d7ec124393778137f7bf6087086069d63cad5d5ee3ecf332cd4b7dd'
tree=ast.parse(new);functions={x.name:x for x in tree.body if isinstance(x,(ast.FunctionDef,ast.AsyncFunctionDef))}
helper=functions['_lyco_ordinary_catalog_summary'];lines=new.splitlines(keepends=True)
reverted=''.join(lines[:helper.lineno-1]+lines[helper.end_lineno:])
assert reverted.count('         **_lyco_ordinary_catalog_summary(),\n')==1
reverted=reverted.replace('         **_lyco_ordinary_catalog_summary(),\n','',1)
for before,after in [('LYCO Connect · 公共备用','LYCO Connect · 普通节点 · 已验证'),
                     ('LYCO Connect · 实验全量','LYCO Connect · 普通节点 · 完整目录')]:
    assert reverted.count(after)==1;reverted=reverted.replace(after,before,1)
assert ast.dump(ast.parse(reverted),include_attributes=False)==ast.dump(ast.parse(previous),include_attributes=False)
assert not any(isinstance(x,(ast.Import,ast.ImportFrom,ast.With,ast.AsyncWith)) for x in ast.walk(helper))
compile(new,'candidate-app.py','exec')
selected=[]
for name in ('_lyco_ordinary_catalog_summary','public_community_summary'):
    node=functions[name];node.decorator_list=[];selected.append(node)
namespace={'_lyco_public_full_catalog':lambda:([
    {'type':kind,'server':'CI_PRIVATE_ADDRESS','password':'CI_PRIVATE_PASSWORD','uuid':'CI_PRIVATE_UUID'}
    for kind in ('vless','vmess','ss','trojan','hysteria2','tuic','anytls')],
    {'🇯🇵 日本':['a','b'],'CI_PRIVATE_REGION':['x']}),
    '_lyco_community_report':lambda:{'nodes':[],'tested':300,'verified':17,'eligible':300,'updated':'CI_DATE','expired':False},
    'JSONResponse':lambda content,headers:content}
exec(compile(ast.Module(body=selected,type_ignores=[]),'owned-ordinary-contract','exec'),namespace)
summary=asyncio.run(namespace['public_community_summary']())
assert summary['catalog_total']==7 and summary['available']==0 and summary['verified']==17
assert len(summary['catalog_protocols'])==7 and all(n==1 for n in summary['catalog_protocols'].values())
assert summary['catalog_regions']=={'🇯🇵 日本':2} and 'CI_PRIVATE_' not in json.dumps(summary)

def atomic(source,target):
    metadata=target.stat();fd,name=tempfile.mkstemp(prefix='.ordinary-labels-',dir=target.parent)
    try:
        with os.fdopen(fd,'wb') as stream:stream.write(source.read_bytes());stream.flush();os.fsync(stream.fileno())
        os.chown(name,metadata.st_uid,metadata.st_gid);os.chmod(name,metadata.st_mode&0o777);os.replace(name,target)
    finally:pathlib.Path(name).unlink(missing_ok=True)

def get(path):
    with urllib.request.urlopen('http://127.0.0.1:4700'+path,timeout=4) as response:return json.loads(response.read(2*1024*1024))

backup=pathlib.Path('/root/website-backups')/('ordinary-nodes-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S'))
backup.mkdir(mode=0o700);prior={}
for index,target in enumerate(sources):
    prior[target]=backup/str(index);shutil.copy2(target,prior[target])
changed=[]
try:
    for target,source in sources.items():
        assert target.read_bytes()==old[target], 'Concurrent update'
        atomic(source,target);changed.append(target)
    subprocess.run(['systemctl','restart','studio-billing.service'],check=True,capture_output=True,timeout=20)
    for attempt in range(20):
        try:
            if get('/api/health').get('ok') is True:break
        except Exception:time.sleep(.5)
    assert get('/api/health')['ok'] is True
    actual=get('/api/proxy/community/summary')
    assert actual['node_category']=='ordinary' and actual['catalog_total']>0
    assert len(actual['catalog_protocols'])==7 and sum(actual['catalog_protocols'].values())==actual['catalog_total']
    products={x['code']:(x.get('points_price'),x.get('duration_days')) for x in get('/api/products')['products']}
    assert all(products[k]==v for k,v in {'proxy_1m':(299,30),'proxy_3m':(852,90),'proxy_4m':(1136,120),'proxy_1y':(3050,365)}.items())
except Exception:
    for target in reversed(changed):atomic(prior[target],target)
    subprocess.run(['systemctl','restart','studio-billing.service'],capture_output=True,timeout=20)
    raise
report={'phase':'ordinary-labels','probeSourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
    'websiteRun':plan['websiteRun'],'websiteSource':plan['websiteSource'],'backendSource':plan['backendSource'],
    'backup':str(backup),'ordinarySummary':actual,'ownedSummaryContractPassed':True,'productsUnchanged':True,
    'backendAppSha256':hashlib.sha256(app.read_bytes()).hexdigest(),
    'deployedFiles':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}}
(backup/'RESULT.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
shutil.move(str(STAGE),str(backup/'staged-source'))
print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
