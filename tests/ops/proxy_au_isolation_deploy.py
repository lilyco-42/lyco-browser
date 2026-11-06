#!/usr/bin/python3
"""Deploy a twice-verified independent AU interactive tunnel with guarded rollback."""
import copy,datetime,hashlib,importlib.util,json,os,pathlib,shutil,socket,subprocess,tempfile,time,urllib.request
assert os.environ.get('SSH_ORIGINAL_COMMAND')=='au-isolation-deploy'
os.umask(0o077);probe=globals()['LYCO_PROBE'];base=pathlib.Path('/opt/studio-billing');config=pathlib.Path('/etc/sing-box/config.json')
plan_path=config.parent/'.lyco-au-isolation-plan.json';plan=json.loads(plan_path.read_text());proof=plan['proof'];mode=proof['selectedMode']
assert proof['qualified'] is True and proof['liveConfigurationUnchanged'] is True and plan['observationRun'].isdigit()
assert 0<=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(proof['checkedAt'])).total_seconds()<1800
assert mode in ('dedicated-interactive','independent-bulk-and-interactive','independent-domain-forwarding')
row=next(n for n in proof['candidates'] if n['mode']==mode)
def verify(value):
    assert value['allPassed'] is True
    files=[n for n in value['samples'] if n['name'].startswith('download') or n['name']=='github-release-range']
    assert len(files)==3 and all(n['ok'] and n['bytes']==4194304 and n['kibPerSecond']>=900 for n in files)
    sites={n['name']:n for n in value['samples']};assert sites['youtube-page']['httpStatus']=='204' and sites['openai-api']['httpStatus']=='401'
    assert all(sites[n]['firstByteMs']<=2000 for n in ('cloudflare-page','google-page'))
    return min(n['kibPerSecond'] for n in files)
verify(row['first']);verify(row['repeat'])
if mode=='independent-domain-forwarding':
    assert row['allRequestsForwardedAsDomain'] is True
    assert {'cp.cloudflare.com','www.gstatic.com','speed.cloudflare.com','github.com','www.youtube.com','api.openai.com'}<=set(row['domainRequests'])
raw=config.read_bytes();assert hashlib.sha256(raw).hexdigest()==plan['previousSha256']=='3f7ee6cc4af701cb22bacb09fe8b1494b73a57181e29882f51e4dfb443d70206'
before=json.loads(raw);expected=copy.deepcopy(before)
DOMAINS=['google.com','gstatic.com','chatgpt.com','openai.com','oaistatic.com','oaiusercontent.com','cp.cloudflare.com','youtube.com']
expected['outbounds'].append({'type':'socks','tag':'ssh-interactive','server':'127.0.0.1','server_port':1086,'version':'5','network':'tcp'})
dns=next(n for n in expected['dns']['servers'] if n['tag']=='lyco-egress-dns');assert dns['detour']=='ssh-fast';dns['detour']='ssh-interactive'
assert expected['route']['rules'][2]=={'inbound':['panel-in'],'network':'tcp','outbound':'ssh-fast'}
expected['route']['rules'].insert(2,{'domain_suffix':DOMAINS,'network':'tcp','outbound':'ssh-interactive'})
if mode=='independent-domain-forwarding':
    for i in (0,1):assert expected['route']['rules'][i]['action']=='resolve' and 'network' not in expected['route']['rules'][i];expected['route']['rules'][i]['network']='udp'
assert plan['configuration']==expected and expected['inbounds']==before['inbounds']
preference=base/'proxy-gateway-preference.json';old_proof=preference.read_bytes();assert hashlib.sha256(old_proof).hexdigest()=='1f5affd84e273c921488d9dcf77127afb37f4926843e6aaca201d49c49c57759'
app=base/'app.py';app_raw=app.read_bytes();assert hashlib.sha256(app_raw).hexdigest()=='5f80b1a7e86385f96a25bacc771ef1b4a75dd1ff4743285082a9199f12a1eb1a'
unit=pathlib.Path('/etc/systemd/system/lyco-au-interactive-egress.service');assert not unit.exists()
original_unit=pathlib.Path('/etc/systemd/system/lyco-au-ssh-egress.service').read_bytes();assert hashlib.sha256(original_unit).hexdigest()=='68e673495f80c8e69de284c36eb6262ce0883e1f80a89a296887e6923157ffde'
unit_data=original_unit.replace(b'Description=LYCO authenticated Australian SSH TCP egress',b'Description=LYCO independent Australian SSH interactive and DNS egress').replace(b'-D 127.0.0.1:1085',b'-D 127.0.0.1:1086')
assert unit_data!=original_unit and unit_data.count(b'-D 127.0.0.1:1086')==1
subprocess.run(['systemctl','is-active','--quiet','lyco-au-ssh-egress.service'],check=True)
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
mods={}
for name,item in plan['modules'].items():
    p=pathlib.Path(item['path']);assert hashlib.sha256(p.read_bytes()).hexdigest()==item['sha256'];mods[name]=load('isolation_deploy_'+name,p)
policy=mods['policy'];contract=mods['contract'];labels=mods['labels'];catalogue=mods['catalogue']
encoded=(json.dumps(expected,ensure_ascii=False,indent=2)+'\n').encode()
with socket.socket() as s:s.bind(('127.0.0.1',0));closed_port=s.getsockname()[1]
closed=copy.deepcopy(expected)
for out in closed['outbounds']:
    if out['tag'] in ('ssh-fast','ssh-interactive'):out['server_port']=closed_port
stopped=probe('closed-au-tunnels-no-direct-fallback',next(n for n in closed['outbounds'] if n['tag']=='yt-proxy'),live_config=closed,download_bytes=262144)
assert stopped.get('configurationAccepted') is True and bool(stopped.get('samples')) and all(not n['ok'] and n['bytes']==0 for n in stopped['samples'])
with tempfile.TemporaryDirectory(prefix='lyco-au-isolation-check-') as folder:
    p=pathlib.Path(folder)/'config.json';p.write_bytes(encoded)
    subprocess.run(['/usr/local/bin/sing-box','check','-c',str(p)],check=True,capture_output=True,timeout=8)
backup=pathlib.Path('/root/website-backups')/('proxy-au-isolation-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S'));backup.mkdir(mode=0o700)
for p,name in ((config,'config.json'),(preference,'preference.json'),(plan_path,'plan.json')):shutil.copy2(p,backup/name);(backup/name).chmod(0o600)
def atomic(path,data):
    st=path.stat();fd,tmp=tempfile.mkstemp(prefix='.au-isolation-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
        os.chmod(tmp,st.st_mode&0o777);os.chown(tmp,st.st_uid,st.st_gid);os.replace(tmp,path)
    finally:pathlib.Path(tmp).unlink(missing_ok=True)
changed=False;new_proof=None;unit_created=False
try:
    assert config.read_bytes()==raw and preference.read_bytes()==old_proof and app.read_bytes()==app_raw
    with socket.socket() as s:s.bind(('127.0.0.1',1086))
    unit.write_bytes(unit_data);unit.chmod(0o644);unit_created=True
    subprocess.run(['systemctl','daemon-reload'],check=True,capture_output=True,timeout=20)
    subprocess.run(['systemctl','enable','--now','lyco-au-interactive-egress.service'],check=True,capture_output=True,timeout=25)
    if mode!='dedicated-interactive':subprocess.run(['systemctl','restart','lyco-au-ssh-egress.service'],check=True,capture_output=True,timeout=25)
    for port in (1085,1086):
        for attempt in range(60):
            try:
                with socket.create_connection(('127.0.0.1',port),timeout=.2):break
            except OSError:time.sleep(.2)
        else:raise RuntimeError('AU forwarding not ready')
    atomic(config,encoded);changed=True
    subprocess.run(['systemctl','restart','sing-box.service'],check=True,capture_output=True,timeout=25)
    subprocess.run(['systemctl','is-active','--quiet','sing-box.service'],check=True)
    current=next(n for n in expected['outbounds'] if n['tag']=='yt-proxy')
    after=probe('deployed-independent-australian-ssh',current,live_config=expected,download_bytes=4194304,github=True,site_checks=True);minimum=verify(after)
    updated=json.loads(old_proof);updated.update(routing_sha256=policy.routing_digest(expected),verification_run=plan['observationRun'],minimum_kib_s=minimum)
    new_proof=(json.dumps(updated,indent=2)+'\n').encode();atomic(preference,new_proof)
    contracts=contract.verify_subscription_contract(app,policy.prefer_gateway,updated['site_probes'],decorate=labels.label_clash_config,link_decorate=labels.label_share_links,complete=catalogue.complete_manual_config,complete_links=catalogue.complete_share_links)
    with urllib.request.urlopen('http://127.0.0.1:4700/api/products',timeout=5) as r:products=json.load(r)['products']
    assert {p['code']:(p['points_price'],p['duration_days']) for p in products if p.get('code') in ('proxy_1m','proxy_3m','proxy_4m','proxy_1y')}=={'proxy_1m':(299,30),'proxy_3m':(852,90),'proxy_4m':(1136,120),'proxy_1y':(3050,365)}
    assert app.read_bytes()==app_raw and config.read_bytes()==encoded and preference.read_bytes()==new_proof
except Exception:
    if changed:
        assert config.read_bytes()==encoded and preference.read_bytes() in (old_proof,new_proof),'Concurrent routing change; do not overwrite'
        atomic(config,raw);atomic(preference,old_proof)
        subprocess.run(['systemctl','restart','sing-box.service'],check=True,capture_output=True,timeout=25)
    if unit_created:
        assert unit.read_bytes()==unit_data
        subprocess.run(['systemctl','disable','--now','lyco-au-interactive-egress.service'],capture_output=True,timeout=25);unit.unlink()
        subprocess.run(['systemctl','daemon-reload'],capture_output=True,timeout=20)
    failure={'phase':'au-isolation-deploy','probeSourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'rolledBack':True,'result':locals().get('after'),'backup':str(backup)}
    (backup/'FAILURE.json').write_text(json.dumps(failure,indent=2)+'\n');print(json.dumps(failure,indent=2),flush=True);raise
result={'phase':'au-isolation-deploy','probeSourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
    'observationRun':plan['observationRun'],'selectedMode':mode,'result':after,'backup':str(backup),'rolledBack':False,'subscriptionContracts':contracts,
    'configurationSha256':hashlib.sha256(encoded).hexdigest(),'preferenceSha256':hashlib.sha256(new_proof).hexdigest(),'interactiveUnitSha256':hashlib.sha256(unit_data).hexdigest(),
    'closedTunnelBlocked':True,'appAndAccountsUnchanged':True,'egressCountry':'AU','tcpDns':'exit-resolver-through-ssh' if mode=='independent-domain-forwarding' else 'https-through-dedicated-ssh','udpDns':'https-through-dedicated-ssh'}
(backup/'RESULT.json').write_text(json.dumps(result,indent=2)+'\n');shutil.move(str(plan_path),str(backup/'consumed-plan.json'))
print(json.dumps(result,indent=2),flush=True)
