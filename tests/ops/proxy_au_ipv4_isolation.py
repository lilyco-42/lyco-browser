#!/usr/bin/python3
"""Measure independent authenticated AU SSH flows before altering shared production."""
import copy,datetime,hashlib,json,os,pathlib,socket,subprocess,tempfile,time
assert os.environ.get('SSH_ORIGINAL_COMMAND')=='au-ipv4-isolation'
os.umask(0o077);probe=globals()['LYCO_PROBE'];p=pathlib.Path('/etc/sing-box/config.json');raw=p.read_bytes();live=json.loads(raw)
assert hashlib.sha256(raw).hexdigest()=='3f7ee6cc4af701cb22bacb09fe8b1494b73a57181e29882f51e4dfb443d70206'
DOMAINS=['google.com','gstatic.com','chatgpt.com','openai.com','oaistatic.com','oaiusercontent.com','cp.cloudflare.com','youtube.com']
current=next(n for n in live['outbounds'] if n['tag']=='yt-proxy')
def config(bulk,interactive):
    cfg=copy.deepcopy(live);out=next(n for n in cfg['outbounds'] if n['tag']=='ssh-fast');assert out['server_port']==1085;out['server_port']=bulk
    cfg['outbounds'].append({'type':'socks','tag':'ssh-interactive','server':'127.0.0.1','server_port':interactive,'version':'5','network':'tcp'})
    dns=next(n for n in cfg['dns']['servers'] if n['tag']=='lyco-egress-dns');assert dns=={'detour':'ssh-fast','server':'1.1.1.1','tag':'lyco-egress-dns','type':'https'};dns.update(type='tls',server_port=853,tls={'enabled':True,'server_name':'one.one.one.one'},detour='ssh-interactive')
    original=copy.deepcopy(cfg['route']['rules'][:2]);tcp=[];udp=[]
    for rule in original:
        assert rule['action']=='resolve' and rule['strategy']=='prefer_ipv4' and 'network' not in rule
        a=copy.deepcopy(rule);a.update(network='tcp',strategy='ipv4_only');tcp.append(a)
        a=copy.deepcopy(rule);a['network']='udp';udp.append(a)
    cfg['route']['rules']=tcp+udp+cfg['route']['rules'][2:]
    assert cfg['route']['rules'][4]=={'inbound':['panel-in'],'network':'tcp','outbound':'ssh-fast'}
    cfg['route']['rules'].insert(4,{'domain_suffix':DOMAINS,'network':'tcp','outbound':'ssh-interactive'})
    assert cfg['inbounds']==live['inbounds']
    return cfg
def test(label,cfg):return probe(label,current,live_config=cfg,download_bytes=4194304,github=True,site_checks=True)
def passes(value):
    files=[n for n in value.get('samples',[]) if n['name'].startswith('download') or n['name']=='github-release-range']
    pages=[n for n in value.get('samples',[]) if n['name'] in ('cloudflare-page','google-page')]
    return value.get('allPassed') is True and len(files)==3 and all(n['ok'] and n['bytes']==4194304 and n['kibPerSecond']>=900 for n in files) and len(pages)==2 and all(n['firstByteMs']<=2000 for n in pages)
report={'phase':'au-ipv4-isolation','probeSourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'observationOnly':True,'udpDualFamilyDnsPreserved':True,'dnsTransport':'tls','baseline':test('shared-australian-ssh-baseline',live),'candidates':[]}
ports=[];tunnels=[]
with tempfile.TemporaryFile() as log:
    try:
        for _ in range(2):
            with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
            tunnel=subprocess.Popen(['/usr/bin/ssh','-F','/dev/null','-NT','-D','127.0.0.1:'+str(port),'-i','/etc/lyco-proxy-egress/au-ssh','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile=/etc/lyco-proxy-egress/known_hosts','-o','ExitOnForwardFailure=yes','-o','ConnectTimeout=8','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=2','ec2-user@13.236.116.49'],stdout=subprocess.DEVNULL,stderr=log)
            tunnels.append(tunnel);ports.append(port)
            for attempt in range(60):
                assert tunnel.poll() is None,'AU tunnel exited'
                try:
                    with socket.create_connection(('127.0.0.1',port),timeout=.2):break
                except OSError:time.sleep(.2)
            else:raise RuntimeError('AU tunnel not ready')
        selected=None
        for mode,bulk in (('dedicated-interactive-ipv4',1085),('independent-bulk-and-interactive-ipv4',ports[0])):
            cfg=config(bulk,ports[1]);first=test(mode+'-first',cfg);row={'mode':mode,'first':first};report['candidates'].append(row)
            if passes(first):
                row['repeat']=test(mode+'-repeat',cfg)
                if passes(row['repeat']):selected=mode;break
        report['qualified']=selected is not None;report['selectedMode']=selected
    finally:
        for tunnel in tunnels:
            tunnel.terminate()
            try:tunnel.wait(timeout=4)
            except subprocess.TimeoutExpired:tunnel.kill();tunnel.wait(timeout=3)
report['liveConfigurationUnchanged']=p.read_bytes()==raw;assert report['liveConfigurationUnchanged']
if report['qualified']:
    path=p.parent/'.lyco-au-ipv4-plan.json';assert not path.exists()
    path.write_text(json.dumps({'configuration':config(1085,1086),'previousSha256':hashlib.sha256(raw).hexdigest(),'proof':report},indent=2)+'\n');path.chmod(0o600)
print(json.dumps(report,indent=2),flush=True)
