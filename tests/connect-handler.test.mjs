import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {protectConnectHandler} from './connect-handler.mjs';

test('a rejected CONNECT owns reset errors before its early return', () => {
  const socket = new EventEmitter(), records = [];
  let closed = 0, ended = 0;
  socket.destroy = () => {closed++;};
  socket.end = () => {
    ended++;
    socket.emit('error', Object.assign(Error('PRIVATE_EXTERNAL_HOST'), {code: 'ECONNRESET'}));
  };
  const handler = protectConnectHandler((_req, incoming) => {
    incoming.end('HTTP/1.1 502 CI fixture only\r\n\r\n');
    return 'denied';
  }, row => records.push(row));
  assert.equal(handler({url: 'PRIVATE_EXTERNAL_HOST'}, socket, Buffer.alloc(0)), 'denied');
  assert.equal(ended, 1); assert.equal(closed, 1);
  assert.deepEqual(records, [{code: 'ECONNRESET'}]);
  assert.doesNotMatch(JSON.stringify(records), /PRIVATE_EXTERNAL_HOST|message|stack/);
});

test('accepted tunnels retain forwarding and peer cleanup while unknown errors stay observable', () => {
  const socket = new EventEmitter(), records = [], context = {};
  socket.destroy = () => {};
  let peerClosed = false;
  const handler = protectConnectHandler(function (req, incoming, head) {
    assert.equal(this, context); assert.equal(head.toString(), 'pending request');
    assert.equal(req.url, 'fixture:1234');
    incoming.on('error', () => {peerClosed = true;});
    return 'forwarded';
  }, row => records.push(row));
  assert.equal(handler.call(context, {url: 'fixture:1234'}, socket, Buffer.from('pending request')), 'forwarded');
  socket.emit('error', Error('PRIVATE_ERROR'));
  assert.equal(peerClosed, true); assert.deepEqual(records, [{code: 'OTHER'}]);
});

test('the guard does not swallow handler programming errors or mark a request successful', () => {
  const socket = new EventEmitter(), failure = Error('fixture bug');
  socket.destroy = () => {};
  const handler = protectConnectHandler(() => {throw failure;});
  assert.throws(() => handler({}, socket, Buffer.alloc(0)), error => error === failure);
});
