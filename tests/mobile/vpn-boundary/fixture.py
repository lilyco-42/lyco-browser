"""Owned HTTP pages and real STUN endpoint observations; no target library runs."""
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import json
import os
import socket
import struct
import subprocess
import threading
import zlib
from urllib.parse import parse_qs, urlsplit

assert os.environ.get('GITHUB_ACTIONS') == 'true'
root = Path(os.environ['RUNNER_TEMP']) / 'lyco-vpn-boundary'
root.mkdir(exist_ok=True)
host, = [s for s in subprocess.check_output(['hostname', '-I'], text=True).split()
         if '.' in s and ipaddress.ip_address(s).is_private and not ipaddress.ip_address(s).is_loopback][:1]
assert host != '43.108.97.29'
phases = ['before', 'vpn', 'after']
cases = ['top', 'initial-empty', 'nested-empty']
state = {'host': host, 'ports': {p: {} for p in phases}, 'reports': [], 'stun': []}
lock = threading.RLock()


def save():
    path = root / 'network.json'
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(state, indent=2) + '\n')
    temporary.replace(path)


def endpoint(udp, phase, case):
    while True:
        data, peer = udp.recvfrom(65535)
        valid = len(data) >= 20 and data[:2] == b'\0\1' and data[4:8] == b'\x21\x12\xa4\x42'
        row = {'phase': phase, 'case': case, 'validStun': valid, 'peerAddress': peer[0], 'peerPort': peer[1]}
        if valid:
            address = int(ipaddress.IPv4Address(peer[0])) ^ 0x2112a442
            value = struct.pack('!BBHI', 0, 1, peer[1] ^ 0x2112, address)
            attributes = b'\x00\x20\x00\x08' + value
            response = b'\x01\x01' + struct.pack('!H', len(attributes) + 8) + data[4:20] + attributes
            response += struct.pack('!HHI', 0x8028, 4, (zlib.crc32(response) & 0xffffffff) ^ 0x5354554e)
            row['responseBytes'] = udp.sendto(response, peer)
        with lock:
            state['stun'].append(row)
            save()


for phase in phases:
    for case in cases:
        udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        udp.bind(('0.0.0.0', 0))
        state['ports'][phase][case] = udp.getsockname()[1]
        threading.Thread(target=endpoint, args=(udp, phase, case), daemon=True).start()


class Origin(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def reply(self, raw, kind='application/json'):
        self.send_response(200)
        self.send_header('Content-Type', kind)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path == '/snapshot':
            with lock:
                self.reply(json.dumps(state).encode())
        elif url.path == '/probe':
            phase = parse_qs(url.query).get('phase', [''])[0]
            if phase not in phases:
                self.send_error(400)
                return
            config = json.dumps({'host': host, 'ports': state['ports'][phase], 'phase': phase})
            script = Path(__file__).with_name('page.js').read_text().replace('LYCO_VPN_CONFIGURATION', config)
            self.reply(('<!doctype html><body><script>' + script + '</script></body>').encode(), 'text/html; charset=utf-8')
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path != '/report':
            self.send_error(404)
            return
        size = int(self.headers.get('Content-Length', '0'))
        assert 0 < size < 512 * 1024
        raw = self.rfile.read(size)
        value = json.loads(raw)
        assert value['phase'] in phases
        with lock:
            state['reports'].append(value)
            save()
        self.reply(b'{}')


save()
ThreadingHTTPServer(('127.0.0.1', 18080), Origin).serve_forever()
