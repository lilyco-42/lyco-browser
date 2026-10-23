'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {observeCore, installCoreStartupObserver} = require('./core-startup-observer.cjs');

test('core evidence keeps bounded signal codes instead of secrets and raw output', () => {
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  const record = {outputBytes: 0, signals: []}; observeCore(child, record);
  child.stdout.emit('data', Buffer.from('token=CI_SECRET server=private.example Initial config'));
  child.stdout.emit('data', Buffer.from('uration complete\nMixed(http+socks) proxy listening at: 127.0.0.1:9000'));
  child.stderr.emit('data', Buffer.from('Failed to listen: bind access denied\n' + 'CI_SECRET'.repeat(10000)));
  child.emit('error', Object.assign(new Error('private path CI_SECRET'), {code: 'EACCES'}));
  child.emit('exit', 1, null);
  assert.ok(record.signals.includes('configuration-ready'));
  assert.ok(record.signals.includes('mixed-listener-ready'));
  assert.equal(record.spawnError, 'EACCES'); assert.equal(record.exitCode, 1);
  assert.doesNotMatch(JSON.stringify(record), /CI_SECRET|private.example|127\.0\.0\.1/);
  assert.ok(JSON.stringify(record).length < 500);
});

test('observer preserves the actual spawn contract and restores it on failure', async () => {
  const calls = [];
  const child = new EventEmitter(); child.pid = 123; child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  const options = {cwd: 'CI owned directory', windowsHide: true, stdio: 'ignore'};
  const args = ['-f', 'CI private config', '-d', 'CI owned directory'];
  const spawn = (...values) => { calls.push(values); return child; };
  class Network {
    constructor() { this.spawnFn = spawn; }
    async connectOnce() { this.spawnFn('actual-core.exe', args, options); throw Error('original failure'); }
  }
  const records = installCoreStartupObserver(Network), network = new Network();
  await assert.rejects(() => network.connectOnce(), /original failure/);
  assert.equal(network.spawnFn, spawn);
  assert.equal(calls[0][0], 'actual-core.exe'); assert.equal(calls[0][1], args);
  assert.deepEqual(calls[0][2], {...options, stdio: ['ignore', 'pipe', 'pipe']});
  assert.equal(options.stdio, 'ignore'); assert.equal(records[0].pid, 123);
  assert.doesNotMatch(JSON.stringify(records), /private config|owned directory/);
});

test('listener evidence distinguishes occupied, forbidden and unavailable addresses without retaining endpoints', () => {
  for (const [message, expected] of [
    ['bind: address already in use', 'listener-address-in-use'],
    ['Only one usage of each socket address (protocol/network address/port) is normally permitted.', 'listener-address-in-use'],
    ['bind: An attempt was made to access a socket in a way forbidden by its access permissions.', 'listener-permission-denied'],
    ['bind: WSAEACCES 10013', 'listener-permission-denied'],
    ['bind: cannot assign requested address', 'listener-address-unavailable'],
  ]) {
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    const record = {outputBytes: 0, signals: []}; observeCore(child, record);
    child.stderr.emit('data', Buffer.from('127.0.0.1:49123 token=CI_LISTENER_SECRET ' + message));
    assert.ok(record.signals.includes(expected));
    assert.doesNotMatch(JSON.stringify(record), /CI_LISTENER_SECRET|127\.0\.0\.1|49123|token=/);
  }
});
