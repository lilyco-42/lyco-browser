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
import zlib
from urllib.parse import parse_qs, urlsplit
from turn_peer import TurnPeer

if os.environ.get('GITHUB_ACTIONS') != 'true':
    raise SystemExit('Native network probes run only in GitHub Actions')
root = Path(os.environ['RUNNER_TEMP']) / 'lyco-mobile-network'
root.mkdir(parents=True, exist_ok=True)
lock = threading.RLock()
sources, active, ports = set(), set(), {}
phases = ['control', 'lyco', 'stopped', 'control-after']
cases = json.loads((Path(__file__).parent/'rtc-cases.json').read_text())
engine_probe = os.environ.get('LYCO_NATIVE_ENGINE_PROBE') == 'true'
rtc_bind_host = os.environ.get('LYCO_RTC_INTERFACE_IP', '127.0.0.1')
rtc_client_host = rtc_bind_host if engine_probe else '10.0.2.2'
state = {'pageRequests': [], 'reports': [], 'udp': [], 'proxyConnections': 0, 'stopped': False, 'stopEvents': [], 'loopbackRequests': []}
def save():
    with lock:
        temporary = root / 'network.json.tmp'
        temporary.write_text(json.dumps(state, indent=2))
        temporary.replace(root / 'network.json')

def route_for(connection):
    # Compare the entire live TCP tuple. Ports can be reused across different
    # destinations; an unrelated live connection is not selected-route proof.
    key = (*connection.getpeername(), *connection.getsockname())
    with lock: return 'selected' if key in sources else 'direct'

def stun(phase, case):
    udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    udp.bind((rtc_bind_host, 0)); ports[phase][case] = udp.getsockname()[1]
    while True:
        data, peer = udp.recvfrom(65535)
        valid = len(data) >= 20 and data[:2] == b'\x00\x01' and data[4:8] == b'\x21\x12\xa4\x42'
        with lock:
            record = {'phase': phase, 'case': case, 'peer': peer[0], 'port': peer[1], 'validStun': valid, 'upstreamStopped': state['stopped'], 'requestHex': data[:2048].hex(), 'requestTruncated': len(data)>2048}
            state['udp'].append(record)
            save()
        if valid:
            # XOR-MAPPED-ADDRESS reflects the real received endpoint. No fake
            # public IP/candidate is supplied to make the observation pass.
            address = int(ipaddress.IPv4Address(peer[0])) ^ 0x2112a442
            value = struct.pack('!BBHI', 0, 1, peer[1] ^ 0x2112, address)
            attributes = b'\x00\x20\x00\x08' + value
            message = b'\x01\x01' + struct.pack('!H', len(attributes)+8) + data[4:20] + attributes
            fingerprint = (zlib.crc32(message) & 0xffffffff) ^ 0x5354554e
            response = message + struct.pack('!HHI', 0x8028, 4, fingerprint)
            sent = udp.sendto(response, peer)
            with lock:
                record.update({'responseHex': response.hex(), 'responseBytes': sent}); save()

def page(phase, case=None, script=False):
    config = json.dumps({'phase': phase, 'case': case, 'cases': cases, 'ports': ports, 'turnPorts': turn.ports, 'rtcHost': rtc_client_host,
                         'loopbacks': ['127.0.0.1', '[::1]', 'localhost'] if engine_probe else []})
    source = (Path(__file__).parent/'rtc-page.js').read_text().replace('LYCO_FIXTURE_CONFIGURATION', config)
    if script: return source.encode()
    # The fixture's first page script starts native RTC before any page script
    # or dynamically-created frame can act. The product policy stays unchanged.
    return ('''<!doctype html><script>''' + source + '''</script><meta name="viewport" content="width=device-width">
<h2 id="status">Running RTC</h2><div id="details" role="status" style="max-height:160px;overflow:auto;word-break:break-all;font-size:10px"></div>
<button id="again">Run stopped-route RTC</button>
<button id="upload">Upload retained RTC report</button>''').encode()

class Origin(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def signaling_cors(self):
        # Only the owned cross-origin frame may signal to the owned peer.
        if urlsplit(self.path).path=='/offer' and self.headers.get('Origin')=='http://10.0.2.2:18082':
            self.send_header('Access-Control-Allow-Origin', 'http://10.0.2.2:18082')
            self.send_header('Vary', 'Origin')
    def reply(self, value, kind='application/json'):
        body = value if isinstance(value, bytes) else json.dumps(value).encode()
        self.send_response(200); self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body))); self.send_header('Connection', 'close')
        self.send_header('Cache-Control', 'no-store'); self.signaling_cors(); self.end_headers(); self.wfile.write(body)
    def do_OPTIONS(self):
        url=urlsplit(self.path); query=parse_qs(url.query)
        if (url.path!='/offer' or query.get('phase',[''])[0] not in ports or query.get('case',[''])[0] not in cases
                or self.headers.get('Origin')!='http://10.0.2.2:18082'
                or self.headers.get('Access-Control-Request-Method')!='POST'
                or self.headers.get('Access-Control-Request-Headers','').lower()!='content-type'):
            self.send_error(403); return
        self.send_response(204); self.signaling_cors()
        self.send_header('Access-Control-Allow-Methods', 'POST')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Length', '0'); self.end_headers()
    def do_GET(self):
        url = urlsplit(self.path)
        if url.path in ('/rtc', '/frame'):
            phase = parse_qs(url.query).get('phase', [''])[0]
            if phase not in ports: self.send_error(400); return
            case = parse_qs(url.query).get('case', [None])[0]
            script = parse_qs(url.query).get('script', [''])[0]=='1'
            if url.path=='/frame' and case not in cases: self.send_error(400); return
            with lock:
                state['pageRequests'].append({'phase': phase, 'case': case, 'route': route_for(self.connection), 'upstreamStopped': state['stopped']})
                save()
            self.reply(page(phase, case, script), 'application/javascript' if script else 'text/html; charset=utf-8')
        elif url.path == '/loopback':
            phase = parse_qs(url.query).get('phase', [''])[0]
            family = parse_qs(url.query).get('family', [''])[0]
            with lock:
                state['loopbackRequests'].append({'phase': phase, 'family': family, 'route': route_for(self.connection), 'upstreamStopped': state['stopped']})
                save()
            body = json.dumps({'alive': True}).encode()
            self.send_response(200); self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body)))
            self.send_header('Connection', 'close'); self.end_headers(); self.wfile.write(body)
        elif url.path == '/health': self.reply({'alive': True})
        else: self.send_error(404)
    def do_POST(self):
        url = urlsplit(self.path)
        global proxy
        if int(self.headers.get('Content-Length', '0')) > 262144: self.send_error(413); return
        body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
        if url.path == '/control':
            action = json.loads(body)
            if action.get('stop'):
                with lock:
                    state['stopped'] = True; peers = list(active)
                    state['stopEvents'].append({'action': 'stop', 'time': time.time()})
                for peer in peers:
                    try: peer.shutdown(socket.SHUT_RDWR); peer.close()
                    except OSError: pass
                proxy.shutdown(); proxy.server_close()
            if action.get('recover'):
                # Recovery is only to upload the original retained observation.
                # The stopped peer has already completed and was screenshotted.
                proxy = http.server.ThreadingHTTPServer(('127.0.0.1', 18081), Proxy)
                with lock:
                    state['stopped'] = False
                    state['stopEvents'].append({'action': 'recover', 'time': time.time()})
                threading.Thread(target=proxy.serve_forever, daemon=True).start()
            save(); self.reply({'ok': True}); return
        if url.path == '/offer':
            phase = parse_qs(url.query).get('phase', [''])[0]
            context = parse_qs(url.query).get('case', [''])[0]
            if phase not in ports: self.send_error(400); return
            if context not in cases: self.send_error(400); return
            self.reply(turn.answer(phase, json.loads(body), route_for(self.connection), context)); return
        if url.path != '/report': self.send_error(404); return
        phase = parse_qs(url.query).get('phase', [''])[0]
        with lock:
            state['reports'].append({'phase': phase, 'route': route_for(self.connection), 'observation': json.loads(body)})
            save()
        self.reply({'ok': True})

class Proxy(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def allowed(self, url, ports):
        hosts = ['10.0.2.2'] + ([rtc_bind_host, '127.0.0.1', '::1', 'localhost'] if engine_probe else [])
        return url.hostname in hosts and url.port in ports
    def do_CONNECT(self):
        url = urlsplit('http://'+self.path)
        if not self.allowed(url, [18080, 18082, *turn.ports.values()]): self.send_error(502); return
        remote = socket.create_connection((rtc_bind_host if url.port in turn.ports.values() else '127.0.0.1', url.port), 5)
        source = (*remote.getsockname(), *remote.getpeername())
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
        if not self.allowed(url, (18080, 18082)): self.send_error(502); return
        connection = http.client.HTTPConnection('127.0.0.1', url.port, timeout=25)
        source, remote_socket = None, None
        try:
            connection.connect(); remote_socket = connection.sock
            source = (*remote_socket.getsockname(), *remote_socket.getpeername())
            with lock: sources.add(source); active.add(remote_socket); state['proxyConnections'] += 1
            body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
            headers = {k: v for k, v in self.headers.items() if k.lower() not in ('host', 'proxy-connection', 'connection')}
            connection.request(self.command, url.path + ('?' + url.query if url.query else ''), body, headers)
            response = connection.getresponse(); payload = response.read()
            self.send_response(response.status)
            self.send_header('Content-Type', response.getheader('Content-Type', 'text/plain'))
            for name in ['Access-Control-Allow-Origin','Access-Control-Allow-Methods','Access-Control-Allow-Headers','Vary']:
                if response.getheader(name): self.send_header(name, response.getheader(name))
            self.send_header('Content-Length', str(len(payload))); self.end_headers(); self.wfile.write(payload)
        except OSError: self.close_connection = True
        finally:
            with lock:
                sources.discard(source)
                if remote_socket: active.discard(remote_socket)
            connection.close(); save()
    do_GET = relay
    do_POST = relay
    do_OPTIONS = relay

for phase in phases:
    ports[phase] = {}
    for case in cases: threading.Thread(target=stun, args=(phase, case), daemon=True).start()
while any(len(ports[phase])!=len(cases) for phase in phases): time.sleep(.01)
turn = TurnPeer(phases, state, lock, save, sources, active)
origin = http.server.ThreadingHTTPServer(('127.0.0.1', 18080), Origin)
frames = http.server.ThreadingHTTPServer(('127.0.0.1', 18082), Origin)
proxy = http.server.ThreadingHTTPServer(('127.0.0.1', 18081), Proxy)
for server in [origin, frames, proxy]: threading.Thread(target=server.serve_forever, daemon=True).start()
(root / 'fixture.json').write_text(json.dumps({'ports': ports, 'turnPorts': turn.ports, 'rtcHost': rtc_client_host, 'rtcBindHost': rtc_bind_host}))
while True: save(); time.sleep(.25)
