#!/usr/bin/python3
"""Compare exit-side domain forwarding against explicit DoH without changing production."""
import copy,datetime,hashlib,json,os,pathlib,select,socket,socketserver,statistics,threading
assert os.environ.get('SSH_ORIGINAL_COMMAND')=='dns-forward'
probe=globals()['LYCO_PROBE'];path=pathlib.Path('/etc/sing-box/config.json');raw=path.read_bytes();live=json.loads(raw)
assert hashlib.sha256(raw).hexdigest()=='3f7ee6cc4af701cb22bacb09fe8b1494b73a57181e29882f51e4dfb443d70206'
optimized=copy.deepcopy(live)
for i in (0,1):
    rule=optimized['route']['rules'][i]
    assert rule['action']=='resolve' and 'network' not in rule
    rule['network']='udp'
assert live['dns']==optimized['dns'] and live['inbounds']==optimized['inbounds'] and live['outbounds']==optimized['outbounds']
current=next(n for n in live['outbounds'] if n['tag']=='yt-proxy')
class Tap(socketserver.ThreadingTCPServer):
    daemon_threads=True
    allow_reuse_address=False
class Forward(socketserver.BaseRequestHandler):
    def handle(self):
        buf=b'';recorded=False
        try:
            with socket.create_connection(('127.0.0.1',1085),timeout=8) as upstream:
                upstream.settimeout(None);self.request.settimeout(None)
                while True:
                    ready,_,_=select.select([self.request,upstream],[],[],22)
                    if not ready:return
                    for src in ready:
                        b=src.recv(65536)
                        if not b:return
                        if src is self.request:
                            if not recorded:
                                buf+=b
                                if len(buf)>=2:
                                    offset=2+buf[1]
                                    if len(buf)>=offset+4:
                                        header=buf[offset:];kind=header[3];length={1:4,4:16}.get(kind)
                                        if kind==3 and len(header)>=5:length=1+header[4]
                                        if length is not None and len(header)>=4+length+2:
                                            host=header[5:4+length].decode('ascii') if kind==3 else None
                                            with self.server.lock:self.server.requests.append({'addressType':kind,'domain':host})
                                            recorded=True;buf=b''
                                if len(buf)>1024:raise ValueError('Oversized SOCKS header')
                            upstream.sendall(b)
                        else:self.request.sendall(b)
        except (OSError,ValueError,UnicodeError):
            with self.server.lock:self.server.errors+=1

def samples(cfg,label):
    return probe(label,current,live_config=cfg,download_bytes=4194304,github=True,site_checks=True)
def files(value):return [n for n in value.get('samples',[]) if n['name'].startswith('download') or n['name']=='github-release-range']
def qualified(value):return value.get('allPassed') is True and len(files(value))==3 and all(n['ok'] and n['bytes']==4194304 and n['kibPerSecond']>=900 for n in files(value))
def page_ms(values):return [n['firstByteMs'] for value in values for n in value['samples'] if n['name'] in ('cloudflare-page','google-page') and n['ok']]
report={'phase':'dns-forward','probeSourceSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
        'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'observationOnly':True,'baseline':[],'candidate':[]}
with Tap(('127.0.0.1',0),Forward) as tap:
    tap.requests=[];tap.errors=0;tap.lock=threading.Lock()
    thread=threading.Thread(target=tap.serve_forever,daemon=True);thread.start()
    instrumented=copy.deepcopy(optimized)
    outbound=next(n for n in instrumented['outbounds'] if n['tag']=='ssh-fast');assert outbound['server']=='127.0.0.1' and outbound['server_port']==1085
    outbound['server_port']=tap.server_address[1]
    try:
        for i in range(2):
            report['baseline'].append(samples(live,'baseline-explicit-https-dns-'+str(i+1)))
            report['candidate'].append(samples(instrumented,'candidate-exit-domain-forwarding-'+str(i+1)))
    finally:tap.shutdown();thread.join(timeout=3)
    report['socksRequests']=list(tap.requests);report['forwardingErrors']=tap.errors
    report['allRequestsForwardedAsDomain']=bool(tap.requests) and all(n['addressType']==3 and n['domain'] for n in tap.requests)
    domains={n['domain'] for n in tap.requests}
    report['expectedDomainsObserved']={'cp.cloudflare.com','www.gstatic.com','speed.cloudflare.com','github.com','www.youtube.com','api.openai.com'}<=domains
base_pages=page_ms(report['baseline']);new_pages=page_ms(report['candidate'])
report['baselineMedianPageMs']=statistics.median(base_pages) if len(base_pages)==4 else None
report['candidateMedianPageMs']=statistics.median(new_pages) if len(new_pages)==4 else None
report['speedGatePassed']=all(qualified(n) for n in report['candidate'])
report['latencyImproved']=bool(len(base_pages)==len(new_pages)==4 and statistics.median(new_pages)<=.8*statistics.median(base_pages))
base_speeds=[n['kibPerSecond'] for v in report['baseline'] for n in files(v) if n['ok']]
new_speeds=[n['kibPerSecond'] for v in report['candidate'] for n in files(v) if n['ok']]
report['downloadNoRegression']=bool(len(base_speeds)==len(new_speeds)==6 and statistics.median(new_speeds)>=.9*statistics.median(base_speeds))
stopped=probe('closed-forwarder-no-direct-fallback',current,live_config=instrumented,download_bytes=262144)
report['stoppedBlocked']=bool(stopped.get('samples')) and all(not n['ok'] and n['bytes']==0 for n in stopped['samples'])
report['qualified']=all(report[n] for n in ('speedGatePassed','latencyImproved','downloadNoRegression','allRequestsForwardedAsDomain','expectedDomainsObserved','stoppedBlocked'))
report['liveConfigurationUnchanged']=path.read_bytes()==raw;assert report['liveConfigurationUnchanged']
if report['qualified']:
    plan=pathlib.Path('/etc/sing-box/.lyco-dns-forward-plan.json');assert not plan.exists()
    plan.write_text(json.dumps({'configuration':optimized,'previousSha256':hashlib.sha256(raw).hexdigest(),'proof':report},indent=2)+'\n');plan.chmod(0o600)
print(json.dumps(report,indent=2),flush=True)
