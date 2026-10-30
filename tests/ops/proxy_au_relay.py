#!/usr/bin/python3
"""Measure independent authenticated AU SSH flows before altering shared production."""
import copy,datetime,hashlib,ipaddress,json,os,pathlib,re,socket,subprocess,tempfile,time
assert os.environ.get('SSH_ORIGINAL_COMMAND')=='au-relay'
os.umask(0o077);probe=globals()['LYCO_PROBE'];p=pathlib.Path('/etc/sing-box/config.json');raw=p.read_bytes();live=json.loads(raw)
assert hashlib.sha256(raw).hexdigest()=='3f7ee6cc4af701cb22bacb09fe8b1494b73a57181e29882f51e4dfb443d70206'
assert hashlib.sha256(pathlib.Path('/etc/lyco-proxy-egress/au-hk-relay-known-hosts').read_bytes()).hexdigest()=='ed49b5221bb683c4cfe7c1a86fb3583cc1b375c7401e83f148f942e3ba40e6cd'
DOMAINS=['google.com','gstatic.com','chatgpt.com','openai.com','oaistatic.com','oaiusercontent.com','cp.cloudflare.com','youtube.com']
current=next(n for n in live['outbounds'] if n['tag']=='yt-proxy')
def config(bulk,interactive,domain_forward=False):
    cfg=copy.deepcopy(live);out=next(n for n in cfg['outbounds'] if n['tag']=='ssh-fast');assert out['server_port']==1085;out['server_port']=bulk
    cfg['outbounds'].append({'type':'socks','tag':'ssh-interactive','server':'127.0.0.1','server_port':interactive,'version':'5','network':'tcp'})
    dns=next(n for n in cfg['dns']['servers'] if n['tag']=='lyco-egress-dns');assert dns['detour']=='ssh-fast';dns['detour']='ssh-interactive'
    assert cfg['route']['rules'][2]=={'inbound':['panel-in'],'network':'tcp','outbound':'ssh-fast'}
    cfg['route']['rules'].insert(2,{'domain_suffix':DOMAINS,'network':'tcp','outbound':'ssh-interactive'})
    if domain_forward:
        for i in (0,1):cfg['route']['rules'][i]['network']='udp'
    assert cfg['inbounds']==live['inbounds']
    return cfg
def test(label,cfg):return probe(label,current,live_config=cfg,download_bytes=4194304,github=True,site_checks=True)
def passes(value):
    files=[n for n in value.get('samples',[]) if n['name'].startswith('download') or n['name']=='github-release-range']
    pages=[n for n in value.get('samples',[]) if n['name'] in ('cloudflare-page','google-page')]
    return value.get('allPassed') is True and len(files)==3 and all(n['ok'] and n['bytes']==4194304 and n['kibPerSecond']>=900 for n in files) and len(pages)==2 and all(n['firstByteMs']<=2000 for n in pages)
report={'phase':'au-relay','probeSourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'observationOnly':True,'baseline':test('shared-australian-ssh-baseline',live),'candidates':[]}
ports=[];tunnels=[]
with tempfile.TemporaryFile() as log:
    try:
        for _ in range(2):
            with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
            tunnel=subprocess.Popen(['/usr/bin/ssh','-vv','-F','/dev/null','-NT','-D','127.0.0.1:'+str(port),'-i','/etc/lyco-proxy-egress/au-ssh','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile=/etc/lyco-proxy-egress/known_hosts','-o','ProxyCommand=/usr/bin/ssh -F /dev/null -i /etc/lyco-proxy-egress/au-hk-relay -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/etc/lyco-proxy-egress/au-hk-relay-known-hosts -o ConnectTimeout=8 -o ServerAliveInterval=15 -o ServerAliveCountMax=2 -W 13.236.116.49:22 root@119.12.174.132','-o','ExitOnForwardFailure=yes','-o','ConnectTimeout=8','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=2','ec2-user@13.236.116.49'],stdout=subprocess.DEVNULL,stderr=log)
            tunnels.append(tunnel);ports.append(port)
            for attempt in range(60):
                assert tunnel.poll() is None,'AU tunnel exited'
                try:
                    with socket.create_connection(('127.0.0.1',port),timeout=.2):break
                except OSError:time.sleep(.2)
            else:raise RuntimeError('AU tunnel not ready')
        selected=None
        for mode,bulk,forward in (('au-via-hk-domain-forwarding',ports[0],True),):
            start=log.seek(0,2)
            cfg=config(bulk,ports[1],forward);first=test(mode+'-first',cfg);row={'mode':mode,'first':first};report['candidates'].append(row)
            if passes(first):
                row['repeat']=test(mode+'-repeat',cfg)
                if passes(row['repeat']):
                    log.seek(start);hosts=re.findall(r'dynamic request: socks5 host ([^ ]+) port [0-9]+',log.read().decode(errors='replace'))
                    def domain(host):
                        try:ipaddress.ip_address(host);return False
                        except ValueError:return True
                    row['domainRequests']=sorted(set(hosts))
                    row['allRequestsForwardedAsDomain']=bool(hosts) and all(domain(h) for h in hosts)
                    if not forward or (row['allRequestsForwardedAsDomain'] and {'cp.cloudflare.com','www.gstatic.com','speed.cloudflare.com','github.com','www.youtube.com','api.openai.com'}<=set(hosts)):
                        selected=mode;break
        report['qualified']=selected is not None;report['selectedMode']=selected
    finally:
        for tunnel in tunnels:
            tunnel.terminate()
            try:tunnel.wait(timeout=4)
            except subprocess.TimeoutExpired:tunnel.kill();tunnel.wait(timeout=3)
report['liveConfigurationUnchanged']=p.read_bytes()==raw;assert report['liveConfigurationUnchanged']
if report['qualified']:
    path=p.parent/'.lyco-au-relay-plan.json';assert not path.exists()
    path.write_text(json.dumps({'configuration':config(1085,1086,selected=='au-via-hk-domain-forwarding'),'previousSha256':hashlib.sha256(raw).hexdigest(),'proof':report},indent=2)+'\n');path.chmod(0o600)
print(json.dumps(report,indent=2),flush=True)
