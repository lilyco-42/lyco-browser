"""Owned TURN ingress and real aiortc data-channel peer, CI only.

The ingress records TCP provenance before forwarding unchanged bytes to coturn.
It never invents ICE candidates, SDP answers, or data-channel responses.
"""
import asyncio
import os
import select
import socket
import threading

if os.environ.get('GITHUB_ACTIONS') != 'true':
    raise SystemExit('Native network peers run only in GitHub Actions')

from aiortc import RTCConfiguration, RTCPeerConnection, RTCSessionDescription


class TurnPeer:
    def __init__(self, phases, state, lock, save, sources, active):
        self.state, self.lock, self.save = state, lock, save
        self.sources, self.active = sources, active
        self.ports, self.peers = {}, set()
        self.loop = asyncio.new_event_loop()
        state['turnConnections'], state['peerMessages'], state['peerOffers'] = [], [], []
        threading.Thread(target=self.loop.run_forever, daemon=True).start()
        for phase in phases:
            listener = socket.socket()
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            listener.bind(('127.0.0.1', 0)); listener.listen()
            self.ports[phase] = listener.getsockname()[1]
            threading.Thread(target=self.accept, args=(listener, phase), daemon=True).start()

    def accept(self, listener, phase):
        while True:
            client, address = listener.accept()
            threading.Thread(target=self.forward, args=(client, address, phase), daemon=True).start()

    def forward(self, client, address, phase):
        remote, record = None, None
        try:
            client.settimeout(15)
            first = client.recv(65536)
            if not first:
                return
            with self.lock:
                record = {'phase': phase, 'route': 'selected' if address[1] in self.sources else 'direct',
                          'upstreamStopped': self.state['stopped'], 'clientBytes': len(first), 'serverBytes': 0}
                self.state['turnConnections'].append(record); self.save()
            remote = socket.create_connection(('127.0.0.1', 13478), 5)
            remote.sendall(first)
            readers = [client, remote]
            while readers:
                ready, _, _ = select.select(readers, [], [], 25)
                if not ready:
                    break
                for peer in ready:
                    data = peer.recv(65536)
                    other = remote if peer is client else client
                    if not data:
                        readers.remove(peer)
                        try: other.shutdown(socket.SHUT_WR)
                        except OSError: pass
                    else:
                        with self.lock:
                            record['clientBytes' if peer is client else 'serverBytes'] += len(data)
                            self.save()
                        other.sendall(data)
        except OSError:
            pass
        finally:
            client.close()
            if remote: remote.close()

    def answer(self, phase, value, route, context):
        return asyncio.run_coroutine_threadsafe(self.offer(phase, value, route, context), self.loop).result(20)

    async def offer(self, phase, value, route, context):
        # No STUN / third-party service: this is the other real ICE peer on the
        # same isolated runner. coturn owns the actual advertised relay socket.
        peer = RTCPeerConnection(RTCConfiguration(iceServers=[]))
        self.peers.add(peer)
        with self.lock:
            self.state['peerOffers'].append({'phase': phase, 'case': context, 'route': route, 'type': value['type'], 'sdp': value['sdp']})
            self.save()

        @peer.on('datachannel')
        def datachannel(channel):
            @channel.on('message')
            def message(value):
                with self.lock:
                    self.state['peerMessages'].append({'phase': phase, 'case': context, 'message': value if isinstance(value, str) else '<binary>'})
                    self.save()
                if value == 'LYCO_OWNED_TURN_PING':
                    channel.send('LYCO_OWNED_TURN_ACK')

        @peer.on('connectionstatechange')
        async def changed():
            if peer.connectionState in ('failed', 'closed'):
                await peer.close(); self.peers.discard(peer)

        await peer.setRemoteDescription(RTCSessionDescription(sdp=value['sdp'], type=value['type']))
        await peer.setLocalDescription(await peer.createAnswer())
        return {'sdp': peer.localDescription.sdp, 'type': peer.localDescription.type}
