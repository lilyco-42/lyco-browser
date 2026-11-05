"""Ordinary owned pages and an independently recorded HTTP proxy; no key export."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hashlib
import http.client
import json
import os
from pathlib import Path
import threading
import urllib.parse
import uuid

assert os.environ.get('GITHUB_ACTIONS') == 'true'
mode = os.environ['LYCO_STORAGE_CLOSE_MODE']
assert mode in ['abrupt', 'graceful', 'eager-cookie', 'eager-storage']
root = Path(os.environ['RUNNER_TEMP']) / 'lyco-mobile-network' / ('storage-' + mode)
state = {'reports': [], 'pages': [], 'proxyRequests': []}
lock = threading.Lock()


def save():
    path = root / 'storage-network.json'
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(state, indent=2) + '\n')
    temporary.replace(path)


class Origin(BaseHTTPRequestHandler):
    def reply(self, body, kind='application/json'):
        self.send_response(200)
        self.send_header('Content-Type', kind)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def route(self):
        receipt = self.headers.get('X-Lyco-Owned-Receipt')
        return 'selected' if any(x['id'] == receipt and x['path'] == self.path and x['method'] == self.command for x in state['proxyRequests']) else 'direct'

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path == '/snapshot':
            with lock:
                self.reply(json.dumps(state).encode())
        elif parsed.path == '/storage':
            with lock:
                state['pages'].append({'path': self.path, 'phase': urllib.parse.parse_qs(parsed.query)['phase'][0], 'route': self.route()})
                save()
            self.reply(b'<!doctype html><meta charset="utf-8"><title>Storage starting</title><script src="/storage.js"></script>', 'text/html; charset=utf-8')
        elif parsed.path == '/storage.js':
            self.reply(Path(__file__).with_name('page.js').read_bytes(), 'text/javascript')
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path != '/report':
            self.send_error(404)
            return
        size = int(self.headers.get('Content-Length', '0'))
        assert 0 < size < 16384
        raw = self.rfile.read(size)
        observation = json.loads(raw)
        with lock:
            state['reports'].append({'observation': observation, 'route': self.route(), 'originalBodySha256': hashlib.sha256(raw).hexdigest()})
            save()
        self.reply(b'{}')


class Proxy(BaseHTTPRequestHandler):
    def forward(self):
        url = urllib.parse.urlsplit(self.path)
        if url.scheme != 'http' or url.hostname != 'localhost' or url.port != 18080 or url.path not in ['/storage', '/storage.js', '/report', '/favicon.ico']:
            self.send_error(403)
            return
        target = urllib.parse.urlunsplit(('', '', url.path, url.query, ''))
        body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
        receipt = str(uuid.uuid4())
        with lock:
            state['proxyRequests'].append({'id': receipt, 'path': target, 'method': self.command, 'bodySha256': hashlib.sha256(body).hexdigest()})
            save()
        headers = {key: value for key, value in self.headers.items() if key.lower() not in ['host', 'connection', 'proxy-connection', 'x-lyco-owned-receipt']}
        headers.update({'Host': 'localhost:18080', 'X-Lyco-Owned-Receipt': receipt, 'Connection': 'close'})
        connection = http.client.HTTPConnection('127.0.0.1', 18080, timeout=15)
        connection.request(self.command, target, body=body, headers=headers)
        response = connection.getresponse()
        raw = response.read()
        self.send_response(response.status)
        for key in ['Content-Type', 'Cache-Control']:
            if response.getheader(key):
                self.send_header(key, response.getheader(key))
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)
        connection.close()

    do_GET = forward
    do_POST = forward


save()
proxy = ThreadingHTTPServer(('0.0.0.0', 18081), Proxy)
threading.Thread(target=proxy.serve_forever, daemon=True).start()
ThreadingHTTPServer(('0.0.0.0', 18080), Origin).serve_forever()
