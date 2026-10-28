"""Owned native RTC boundary probe: observe real TCP and STUN, no third parties."""
import http.client
import http.server
import ipaddress
import json
import os
from pathlib import Path
import select
import socket
import struct
import threading
import time
from urllib.parse import parse_qs, urlsplit

if os.environ.get('GITHUB_ACTIONS') != 'true':
    raise SystemExit('Native network probes run only in GitHub Actions')
root = Path(os.environ['RUNNER_TEMP']) / 'lyco-mobile-network'
root.mkdir(parents=True, exist_ok=True)
lock = threading.RLock()
sources, active, ports = set(), set(), {}
state = {'pageRequests': [], 'reports': [], 'udp': [], 'proxyConnections': 0, 'stopped': False}
def save():
    with lock:
        temporary = root / 'network.json.tmp'
        temporary.write_text(json.dumps(state, indent=2))
        temporary.replace(root / 'network.json')

def stun(phase):
    udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    udp.bind(('127.0.0.1', 0)); ports[phase] = udp.getsockname()[1]
    while True:
        data, peer = udp.recvfrom(65535)
        valid = len(data) >= 20 and data[:2] == b'\x00\x01' and data[4:8] == b'\x21\x12\xa4\x42'
        with lock:
            state['udp'].append({'phase': phase, 'peer': peer[0], 'port': peer[1], 'validStun': valid})
            save()
        if valid:
            # XOR-MAPPED-ADDRESS reflects the real received endpoint. No fake
            # public IP/candidate is supplied to make the observation pass.
            address = int(ipaddress.IPv4Address(peer[0])) ^ 0x2112a442
            value = struct.pack('!BBHI', 0, 1, peer[1] ^ 0x2112, address)
            udp.sendto(b'\x01\x01\x00\x0c' + data[4:20] + b'\x00\x20\x00\x08' + value, peer)

def page(phase):
    config = json.dumps({'phase': phase, 'ports': ports})
    return ('''<!doctype html><meta name="viewport" content="width=device-width">
<h2 id="status">Running RTC</h2><div id="details" role="status"></div>
<button id="again">Run stopped-route RTC</button><script>
const config=CONFIG;
async function run(phase){
 const audit={phase,apiPresent:typeof RTCPeerConnection==='function',offerCreated:false,blocked:false,literalIP:false,candidates:[],gatheringState:null,completed:false};
 let pc;
 try{
  pc=new RTCPeerConnection({iceServers:[{urls:'stun:10.0.2.2:'+config.ports[phase]}]});
  pc.onicecandidate=event=>{
   if(!event.candidate)return;
   const value=String(event.candidate.candidate||'').split(/\\s+/),address=value[4]||'';
   if(/^(?:\\d{1,3}\\.){3}\\d{1,3}$/.test(address)||address.includes(':'))audit.literalIP=true;
   if(audit.candidates.length<64)audit.candidates.push({address,type:value[7]||'',protocol:value[2]||''});
  };
  pc.createDataChannel('lyco-owned-probe');
  await pc.setLocalDescription(await pc.createOffer());audit.offerCreated=true;
  await new Promise(resolve=>{
   const timeout=setTimeout(resolve,4500);
   const done=()=>{if(pc.iceGatheringState==='complete'){clearTimeout(timeout);resolve()}};
   pc.addEventListener('icegatheringstatechange',done);done();
  });
  audit.gatheringState=pc.iceGatheringState;
 }catch(error){audit.blocked=true;audit.errorType=error.name}
 finally{if(pc)pc.close()}
 audit.completed=true;
 document.getElementById('details').textContent='LYCO_RTC_JSON:'+JSON.stringify(audit);
 document.getElementById('status').textContent='LYCO RTC '+phase+' completed';
 try{await fetch('/report?phase='+encodeURIComponent(phase),{method:'POST',body:JSON.stringify(audit)})}catch{}
}
document.getElementById('again').onclick=()=>run('stopped');
run(config.phase);
</script>'''.replace('CONFIG', config)).encode()

class Origin(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def reply(self, value, kind='application/json'):
        body = value if isinstance(value, bytes) else json.dumps(value).encode()
        self.send_response(200); self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body))); self.send_header('Connection', 'close')
        self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        url = urlsplit(self.path)
        if url.path == '/rtc':
            phase = parse_qs(url.query).get('phase', [''])[0]
            if phase not in ports: self.send_error(400); return
            with lock:
                state['pageRequests'].append({'phase': phase, 'route': 'selected' if self.client_address[1] in sources else 'direct'})
                save()
            self.reply(page(phase), 'text/html; charset=utf-8')
        elif url.path == '/health': self.reply({'alive': True})
        else: self.send_error(404)
    def do_POST(self):
        url = urlsplit(self.path)
        if int(self.headers.get('Content-Length', '0')) > 16384: self.send_error(413); return
        body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
        if url.path == '/control':
            action = json.loads(body)
            if action.get('stop'):
                with lock: state['stopped'] = True; peers = list(active)
                for peer in peers:
                    try: peer.shutdown(socket.SHUT_RDWR); peer.close()
                    except OSError: pass
                proxy.shutdown(); proxy.server_close()
            save(); self.reply({'ok': True}); return
        if url.path != '/report': self.send_error(404); return
        phase = parse_qs(url.query).get('phase', [''])[0]
        with lock:
            state['reports'].append({'phase': phase, 'route': 'selected' if self.client_address[1] in sources else 'direct', 'observation': json.loads(body)})
            save()
        self.reply({'ok': True})

class Proxy(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def do_CONNECT(self):
        if self.path != '10.0.2.2:18080': self.send_error(502); return
        remote = socket.create_connection(('127.0.0.1', 18080), 5)
        source = remote.getsockname()[1]
        with lock:
            sources.add(source); active.update([self.connection, remote]); state['proxyConnections'] += 1
        try:
            self.send_response(200); self.end_headers()
            readers = [self.connection, remote]
            while readers:
                ready, _, _ = select.select(readers, [], [], 15)
                if not ready: break
                for peer in ready:
                    data = peer.recv(65536)
                    other = remote if peer is self.connection else self.connection
                    if not data:
                        readers.remove(peer)
                        try: other.shutdown(socket.SHUT_WR)
                        except OSError: pass
                    else: other.sendall(data)
        except OSError: pass
        finally:
            with lock: sources.discard(source); active.discard(self.connection); active.discard(remote)
            remote.close(); save()
    def relay(self):
        url = urlsplit(self.path)
        if url.hostname != '10.0.2.2' or url.port != 18080: self.send_error(502); return
        connection = http.client.HTTPConnection('127.0.0.1', 18080, timeout=10)
        source = None
        try:
            connection.connect(); source = connection.sock.getsockname()[1]
            with lock: sources.add(source); active.add(connection.sock); state['proxyConnections'] += 1
            body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
            headers = {k: v for k, v in self.headers.items() if k.lower() not in ('host', 'proxy-connection', 'connection')}
            connection.request(self.command, url.path + ('?' + url.query if url.query else ''), body, headers)
            response = connection.getresponse(); payload = response.read()
            self.send_response(response.status)
            self.send_header('Content-Type', response.getheader('Content-Type', 'text/plain'))
            self.send_header('Content-Length', str(len(payload))); self.end_headers(); self.wfile.write(payload)
        except OSError: self.close_connection = True
        finally:
            with lock:
                sources.discard(source)
                if connection.sock: active.discard(connection.sock)
            connection.close(); save()
    do_GET = relay
    do_POST = relay

for phase in ['control', 'lyco', 'stopped', 'control-after']:
    threading.Thread(target=stun, args=(phase,), daemon=True).start()
while len(ports) != 4: time.sleep(.01)
origin = http.server.ThreadingHTTPServer(('127.0.0.1', 18080), Origin)
proxy = http.server.ThreadingHTTPServer(('127.0.0.1', 18081), Proxy)
for server in [origin, proxy]: threading.Thread(target=server.serve_forever, daemon=True).start()
(root / 'fixture.json').write_text(json.dumps({'ports': ports}))
while True: save(); time.sleep(.25)
