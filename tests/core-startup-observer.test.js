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

test('workspace restarts expose actual child signals and keep failures unchanged', async () => {
  const child = new EventEmitter(); child.pid = 456; child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  const spawn = () => child;
  class Network {constructor() {this.spawnFn = spawn;} async connectOnce() {return 'unchanged';}}
  class Routes {
    constructor(network) {this.network = network;}
    async start(...args) {
      assert.deepEqual(args, ['same-id', 'same-route']);
      this.network.spawnFn('real-core', ['-f', 'PRIVATE_CONFIG'], {cwd: 'PRIVATE_PATH', stdio: 'ignore'});
      child.stderr.emit('data', Buffer.from('PRIVATE_TOKEN database locked; failed to listen'));
      throw Error('original listen timeout');
    }
  }
  const records = installCoreStartupObserver(Network, Routes), network = new Network();
  await assert.rejects(new Routes(network).start('same-id', 'same-route'), /original listen timeout/);
  assert.equal(network.spawnFn, spawn); assert.equal(records.length, 1);
  assert.ok(records[0].signals.includes('database-lock')); assert.ok(records[0].signals.includes('listener-error'));
  assert.doesNotMatch(JSON.stringify(records), /PRIVATE_/);
});

test('overlapping core operations are observed once and restore the original spawn after the last operation', async () => {
  let finishFirst, finishSecond;
  const firstStarted = [], child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  const spawn = () => child;
  class Network {
    constructor() {this.spawnFn = spawn;}
    async connectOnce() {
      await new Promise(resolve => {finishFirst = resolve;});
      this.spawnFn('real-core', [], {stdio: 'ignore'}); return 'connected';
    }
  }
  class Routes {
    constructor(network) {this.network = network;}
    async start() {
      await new Promise(resolve => {finishSecond = resolve;});
      this.network.spawnFn('real-core', [], {stdio: 'ignore'}); return 'started';
    }
  }
  const records = installCoreStartupObserver(Network, Routes), network = new Network(), routes = new Routes(network);
  const first = network.connectOnce(), second = routes.start();
  assert.equal(typeof finishFirst, 'function'); assert.equal(typeof finishSecond, 'function');
  finishFirst(); firstStarted.push(await first); assert.notEqual(network.spawnFn, spawn);
  finishSecond(); assert.equal(await second, 'started');
  assert.deepEqual(firstStarted, ['connected']); assert.equal(records.length, 2); assert.equal(network.spawnFn, spawn);
});
