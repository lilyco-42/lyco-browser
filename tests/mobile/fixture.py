"""CI-owned origin and HTTP/CONNECT proxy. Never uses customer routes or credentials."""
import argparse, http.server, http.client, json, select, socket, threading, time
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
parser=argparse.ArgumentParser()
parser.add_argument('--evidence',required=True)
args=parser.parse_args()
evidence=Path(args.evidence);evidence.mkdir(parents=True,exist_ok=True)
state={'reports':[],'requests':[],'proxyRequests':[],'responseBodies':[],'tunnels':[]}
lock=threading.Lock()
def save():
    with lock: (evidence/'network.json').write_text(json.dumps(state,indent=2))
class Origin(http.server.BaseHTTPRequestHandler):
    def log_message(self,*_): pass
    def do_GET(self):
        state['requests'].append(self.path);save()
        owner=parse_qs(urlsplit(self.path).query).get('owner',[''])[0]
        if owner not in ('mobile-A','mobile-B','mobile-C'):
            self.send_error(404);return
        page='''<!doctype html><meta name="viewport" content="width=device-width"><h1 id="status" role="status" aria-live="polite" aria-atomic="true">Loading</h1><script>
        (async()=>{const owner=OWNER;
        const readCookie=()=>document.cookie.split('; ').find(x=>x.startsWith('owner='))?.slice(6)||null;
        const before={cookie:readCookie(),local:localStorage.getItem('owner')};
        document.cookie='owner='+owner+'; Path=/; Max-Age=600; SameSite=Lax';localStorage.setItem('owner',owner);
        const report={owner,before,after:{cookie:readCookie(),local:localStorage.getItem('owner')}};
        const result=await fetch('/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)});
        if(!result.ok)throw Error('report failed');document.getElementById('status').textContent='LYCO verified '+owner;
        })().catch(()=>document.getElementById('status').textContent='LYCO fixture failed');</script>'''.replace('OWNER',json.dumps(owner))
        payload=page.encode()
        self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(payload)));self.send_header('Connection','close');self.end_headers();state['responseBodies'].append({'path':self.path,'bytes':len(payload)});save();self.wfile.write(payload)
    def do_POST(self):
        if self.path!='/report': self.send_error(404);return
        report=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))))
        state['reports'].append(report);save()
        self.send_response(200);self.send_header('Content-Length','2');self.send_header('Connection','close');self.end_headers();self.wfile.write(b'OK')
class Proxy(http.server.BaseHTTPRequestHandler):
    def log_message(self,*_): pass
    def target(self,host,port):
        if host not in ('lyco-fixture.invalid','127.0.0.1','10.0.2.2') or port!=18080:
            raise ValueError('Unexpected proxy target')
        return ('127.0.0.1',18080)
    def do_CONNECT(self):
        host,port=self.path.rsplit(':',1)
        try:
            upstream=socket.create_connection(self.target(host,int(port)),5)
            state['proxyRequests'].append({'method':'CONNECT','host':host});save()
            self.send_response(200);self.end_headers()
            self.connection.settimeout(20);upstream.settimeout(20)
            traffic={'sent':0,'received':0};state['tunnels'].append(traffic)
            with upstream:
                # TCP half-close ends one direction, not the still-pending HTTP
                # response in the other direction. Keep draining before closing.
                readers=[self.connection,upstream]
                while readers:
                    ready,_,_=select.select(readers,[],[],20)
                    if not ready: break
                    for source in ready:
                        data=source.recv(65536)
                        destination=upstream if source is self.connection else self.connection
                        if not data:
                            readers.remove(source)
                            try: destination.shutdown(socket.SHUT_WR)
                            except OSError: pass
                            continue
                        traffic['sent' if source is self.connection else 'received']+=len(data);save()
                        destination.sendall(data)
        except (OSError,ValueError): self.close_connection=True
    def relay(self):
        url=urlsplit(self.path)
        try:
            target=self.target(url.hostname,url.port or 80)
            body=self.rfile.read(int(self.headers.get('Content-Length',0)))
            connection=http.client.HTTPConnection(*target,timeout=10)
            headers={k:v for k,v in self.headers.items() if k.lower() not in ('proxy-connection','connection','transfer-encoding')}
            connection.request(self.command,url.path+('?' + url.query if url.query else ''),body,headers)
            response=connection.getresponse();payload=response.read()
            state['proxyRequests'].append({'method':self.command,'path':url.path});save()
            self.send_response(response.status)
            for name,value in response.getheaders():
                if name.lower() not in ('connection','transfer-encoding','content-length'): self.send_header(name,value)
            self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload);connection.close()
        except (OSError,ValueError): self.send_error(502)
    do_GET=relay
    do_POST=relay
origin=http.server.ThreadingHTTPServer(('127.0.0.1',18080),Origin)
proxy=http.server.ThreadingHTTPServer(('127.0.0.1',18081),Proxy)
for server in (origin,proxy):
    threading.Thread(target=server.serve_forever,daemon=True).start()
save()
# Separate stop-file leaves the origin available for the failed-proxy control.
while True:
    if (evidence/'stop-proxy').exists() and proxy:
        proxy.shutdown();proxy.server_close();proxy=None
        (evidence/'proxy-stopped').write_text('stopped')
    time.sleep(.1)
