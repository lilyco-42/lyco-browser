#!/usr/bin/python3
"""Fixed DNS-only repair on the owned Korean proxy; credentials stay on node."""
import copy,datetime,hashlib,json,os,pathlib,shutil,socket,subprocess,tempfile,time
os.umask(0o077)
PHASE=os.environ.get('SSH_ORIGINAL_COMMAND');assert PHASE in ('node-dns','node-throughput','node-au-throughput')
CONFIG=pathlib.Path('/etc/s-box/sb.json')
BIN='/etc/s-box/sing-box'

def atomic(value, metadata):
    fd,name=tempfile.mkstemp(dir=str(CONFIG.parent),prefix='.lyco-dns-')
    try:
        with os.fdopen(fd,'w') as f:
            json.dump(value,f,ensure_ascii=False,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
        os.chown(name,metadata.st_uid,metadata.st_gid);os.chmod(name,metadata.st_mode&0o777)
        os.replace(name,str(CONFIG))
    finally:
        if os.path.exists(name):os.unlink(name)

def probe(config,downloads):
    with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='lyco-node-dns-') as folder:
        candidate=copy.deepcopy(config)
        candidate['inbounds']=[{'type':'http','tag':'ci-dns','listen':'127.0.0.1','listen_port':port}]
        candidate['log']={'level':'error'};candidate.pop('experimental',None)
        path=pathlib.Path(folder)/'config.json';path.write_text(json.dumps(candidate))
        checked=subprocess.run([BIN,'check','-c',str(path)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=8)
        if checked.returncode:return {'configurationAccepted':False,'allPassed':False}
        log=pathlib.Path(folder)/'startup.log'
        log_stream=log.open('wb')
        process=subprocess.Popen([BIN,'run','-c',str(path)],stdout=log_stream,stderr=log_stream)
        try:
            time.sleep(.5);samples=[]
            if process.poll() is not None:
                log_stream.flush()
                message=log.read_text(errors='replace')[-2400:]
                def scrub(value):
                    nonlocal message
                    if isinstance(value,dict):
                        for key,item in value.items():
                            if key in ('uuid','password','private_key') and isinstance(item,str):message=message.replace(item,'[redacted]')
                            else:scrub(item)
                    elif isinstance(value,list):
                        for item in value:scrub(item)
                scrub(candidate)
                return {'configurationAccepted':True,'allPassed':False,'startupError':message}
            jobs=[('google-page','https://www.gstatic.com/generate_204',0),('cloudflare-page','https://cp.cloudflare.com/generate_204',0)]
            if downloads:jobs += [('download-'+str(i),'https://speed.cloudflare.com/__down?bytes=4194304',4194304) for i in (1,2)]
            if downloads and PHASE.endswith('throughput'):
                jobs.append(('github-release-range','https://github.com/MetaCubeX/mihomo/releases/download/v1.19.32/mihomo-linux-amd64-v1.19.32.gz',4194304))
            for name,url,amount in jobs:
                body=pathlib.Path(folder)/'body';start=time.monotonic()
                r=subprocess.run(['curl','--silent','--proxy','http://127.0.0.1:'+str(port),'--noproxy','',
                    '--connect-timeout','6','--max-time','25','--max-filesize','4194400','--output',str(body),'--write-out','%{http_code}']+(['--location','--max-redirs','3','--range','0-4194303'] if name=='github-release-range' else [])+[url],
                    stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=29)
                elapsed=time.monotonic()-start;size=body.stat().st_size if body.exists() else 0;status=r.stdout.decode().strip()
                ok=r.returncode==0 and status in (('206',) if name=='github-release-range' else ('200','204')) and size==amount
                if name=='github-release-range' and ok:
                    with body.open('rb') as stream:ok=stream.read(2)==b'\x1f\x8b'
                samples.append({'name':name,'ok':ok,'httpStatus':status,'bytes':size,'elapsedMs':round(elapsed*1000),
                                'kibPerSecond':round(size/elapsed/1024,1) if ok and amount else None})
                if body.exists():body.unlink()
            return {'configurationAccepted':True,'allPassed':all(x['ok'] for x in samples),'samples':samples}
        finally:
            process.terminate()
            try:process.wait(timeout=3)
            except subprocess.TimeoutExpired:process.kill();process.wait(timeout=3)
            log_stream.close()

raw=CONFIG.read_bytes();old=json.loads(raw);new=copy.deepcopy(old)
if PHASE.endswith('throughput'):
    result=probe(old,True)
    print(json.dumps({'phase':PHASE,'probeSourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
        'tcpCongestionControl':subprocess.check_output(['sysctl','-n','net.ipv4.tcp_congestion_control']).decode().strip(),
        'scope':'Actual deployed node routing/DNS with two exact 4MiB HTTPS downloads; server-side only.',
        'liveConfigSha256':hashlib.sha256(raw).hexdigest(),'result':result},indent=2))
    raise SystemExit(0 if result['allPassed'] else 1)
assert not old.get('dns'),'Existing custom DNS must be merged explicitly'
new['dns']={'servers':[{'type':'https','tag':'lyco-egress-dns','server':'1.1.1.1'}],'strategy':'prefer_ipv4'}
rules=new['route']['rules'];i=1 if rules and rules[0].get('action')=='sniff' else 0
rules.insert(i,{'action':'resolve','server':'lyco-egress-dns','strategy':'prefer_ipv4'})
assert new['inbounds']==old['inbounds'] and new['outbounds']==old['outbounds']
report={'phase':'node-dns','probeSourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
        'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'scope':'Owned Korean server outbound DNS, actual HTTPS and two exact 4MiB downloads. No user credentials exported.',
        'before':probe(old,False),'candidate':probe(new,True)}
if not report['candidate']['allPassed']:
    print(json.dumps(report,indent=2));raise SystemExit(1)
with tempfile.TemporaryDirectory(prefix='lyco-node-plan-') as folder:
    path=pathlib.Path(folder)/'config.json';path.write_text(json.dumps(new))
    check=subprocess.run([BIN,'check','-c',str(path)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=8)
    assert check.returncode==0,'Full candidate service configuration rejected'
backup=pathlib.Path('/root')/('lyco-node-dns-backup-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S'))
backup.mkdir(mode=0o700);shutil.copy2(CONFIG,str(backup/'sb.json'));metadata=CONFIG.stat()
assert CONFIG.read_bytes()==raw,'Concurrent server configuration change'
try:
    atomic(new,metadata)
    subprocess.run(['systemctl','restart','sing-box.service'],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=20)
    subprocess.run(['systemctl','is-active','--quiet','sing-box.service'],check=True,timeout=5)
    report['after']=probe(json.loads(CONFIG.read_text()),True)
    assert report['after']['allPassed'],'Deployed DNS verification failed'
except Exception:
    current=json.loads(CONFIG.read_text());current['route']=old['route']
    if 'dns' in old:current['dns']=old['dns']
    else:current.pop('dns',None)
    atomic(current,metadata)
    subprocess.run(['systemctl','restart','sing-box.service'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=20)
    report['rolledBack']=True;print(json.dumps(report,indent=2));raise
report.update({'accountsPreserved':True,'rolledBack':False,'backup':str(backup),'liveConfigSha256':hashlib.sha256(CONFIG.read_bytes()).hexdigest()})
(backup/'RESULT.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
