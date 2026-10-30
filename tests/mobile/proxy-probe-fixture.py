"""Isolated iOS routing investigation; never contacts customer services."""
import http.server,json,select,socket,threading
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
import sys

root=Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=True)
lock=threading.Lock();ports=set();events=[]
def record(row):
    with lock:
        events.append(row);(root/'network.json').write_text(json.dumps(events,indent=2)+'\n')
class Origin(http.server.BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        case=parse_qs(urlsplit(self.path).query).get('case',[''])[0]
        if not case or len(case)>100:self.send_error(400);return
        with lock:proxied=self.client_address[1] in ports
        record({'case':case,'viaProxy':proxied})
        content=('<!doctype html><meta name="viewport" content="width=device-width"><p>LYCO_ORIGIN '+case+'</p>').encode()
        self.send_response(200);self.send_header('Content-Length',str(len(content)));self.send_header('Cache-Control','no-store');self.send_header('Connection','close');self.end_headers();self.wfile.write(content)
class Proxy(http.server.BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_CONNECT(self):
        host,port=self.path.rsplit(':',1)
        if host not in ('127.0.0.1','lyco-fixture.invalid') or port!='18080':self.send_error(403);return
        upstream=socket.create_connection(('127.0.0.1',18080),5)
        source_port=upstream.getsockname()[1]
        with lock:ports.add(source_port)
        self.send_response(200);self.end_headers()
        try:
            readers=[self.connection,upstream]
            while readers:
                ready,_,_=select.select(readers,[],[],10)
                if not ready:break
                for source in ready:
                    destination=upstream if source is self.connection else self.connection
                    data=source.recv(65536)
                    if data:destination.sendall(data)
                    else:
                        readers.remove(source)
                        try:destination.shutdown(socket.SHUT_WR)
                        except OSError:pass
        except OSError:pass
        finally:
            upstream.close()
            with lock:ports.discard(source_port)
        self.close_connection=True
for port,handler in [(18080,Origin),(18081,Proxy)]:
    server=http.server.ThreadingHTTPServer(('127.0.0.1',port),handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
class IPv6Server(http.server.ThreadingHTTPServer):
    address_family=socket.AF_INET6
server=IPv6Server(('::1',18081),Proxy)
threading.Thread(target=server.serve_forever,daemon=True).start()
(root/'network.json').write_text('[]\n')
threading.Event().wait()
