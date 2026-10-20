'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {openSavedSession, prepareSessionBridge} = require('../src/session-restore');

function fixture(restored = true) {
  const calls = [], state = {closed: false};
  const workerUrl = 'chrome-extension://' + 'a'.repeat(32) + '/restore.js';
  class Connection {
    async open() {return this;}
    async command(method, params, options) {
      calls.push({method, params, options});
      if (method === 'Target.attachToTarget') return {sessionId: 'bridge-session'};
      if (method === 'Target.createTarget') return {targetId: 'trusted-bootstrap'};
      if (method === 'Runtime.evaluate') return {result: {value: params.expression.startsWith('typeof') ? true : {restored, tabCount: 2}}};
      return {};
    }
    close() {state.closed = true;}
  }
  const args = {bridge: {workerUrl}, port: 19341, cdp: {PersistentConnection: Connection,
    targets: async () => [{type: 'service_worker', targetId: 'owned-bridge', url: workerUrl}],
    browserSocket: async () => 'ws://127.0.0.1:19341/devtools/browser/owner'},
    assertActive() {}, isPrepared: () => true, isPagePrepared: () => true, hasPreparedPage: () => true, timeoutMs: 100};
  return {args, calls, state};
}

test('only the exact local extension session can request native window restoration once', async () => {
  const f = fixture();
  await openSavedSession(f.args);
  assert.deepEqual(f.calls.map(row => row.method), ['Target.attachToTarget', 'Runtime.evaluate', 'Target.createTarget',
    'Runtime.evaluate', 'Target.closeTarget', 'Target.detachFromTarget']);
  assert.deepEqual(f.calls[2].params, {url: 'about:blank', newWindow: true});
  assert.equal(f.calls[3].params.expression, 'globalThis.lycoRestoreSavedWindow()');
  assert.equal(f.calls[3].options.sessionId, 'bridge-session');
  assert.deepEqual(f.calls[4].params, {targetId: 'trusted-bootstrap'});
  assert.equal(f.state.closed, true);
});

test('never requests restore before protection or after a lifecycle cancellation', async () => {
  const f = fixture();
  await assert.rejects(openSavedSession({...f.args, isPrepared: () => false}), /未就绪/);
  await assert.rejects(openSavedSession({...f.args, assertActive() {throw Error('cancelled');}}), /cancelled/);
  assert.equal(f.calls.length, 0);
});

test('allocating the blank target cannot trigger restore until that exact page is ready', async () => {
  const f = fixture(), inspected = [];
  let prepared = false;
  const pending = openSavedSession({...f.args, timeoutMs: 1000,
    isPagePrepared(id) {inspected.push(id); return prepared;}});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.some(row => row.method === 'Target.createTarget'), true);
  assert.equal(f.calls.some(row => row.params?.expression === 'globalThis.lycoRestoreSavedWindow()'), false);
  assert.ok(inspected.length > 0 && inspected.every(id => id === 'trusted-bootstrap'));
  prepared = true;
  await pending;
  assert.equal(f.calls.filter(row => row.params?.expression === 'globalThis.lycoRestoreSavedWindow()').length, 1);
});

test('a blank context that never completes preparation is closed without requesting restore', async () => {
  const f = fixture();
  await assert.rejects(openSavedSession({...f.args, isPagePrepared: () => false}), /上下文尚未就绪/);
  assert.equal(f.calls.some(row => row.params?.expression === 'globalThis.lycoRestoreSavedWindow()'), false);
  assert.equal(f.calls.filter(row => row.method === 'Target.closeTarget').length, 1);
  assert.equal(f.state.closed, true);
});

test('no closed native window, missing prepared page and dropped protection fail closed', async () => {
  const refused = fixture(false);
  await assert.rejects(openSavedSession(refused.args), /没有可恢复/);
  assert.equal(refused.calls.filter(row => row.method === 'Target.closeTarget').length, 1);
  assert.equal(refused.state.closed, true);
  const f = fixture();
  await assert.rejects(openSavedSession({...f.args, hasPreparedPage: () => false}), /未完成身份准备/);
  let checked = 0;
  await assert.rejects(openSavedSession({...fixture().args, isPrepared: () => ++checked === 1}), /已断开/);
});

test('foreign debugger addresses and duplicate or missing extension targets are refused', async () => {
  const f = fixture();
  f.args.cdp.browserSocket = async () => 'ws://example.com:19341/devtools/browser/foreign';
  await assert.rejects(openSavedSession(f.args), /调试地址/);
  assert.equal(f.calls.length, 0);
  const g = fixture(), target = (await g.args.cdp.targets())[0];
  g.args.cdp.targets = async () => [target, target];
  await assert.rejects(openSavedSession(g.args), /重复目标/);
  assert.equal(g.calls.length, 0);
  g.args.cdp.targets = async () => [{...target, url: target.url.replace('a'.repeat(32), 'b'.repeat(32))}];
  await assert.rejects(openSavedSession(g.args), /尚未就绪/);
  assert.equal(g.calls.length, 0);
});

test('the local bridge keeps a stable per-profile identity and requests sessions permission only', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lyco-sessions-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const a = await prepareSessionBridge(root), again = await prepareSessionBridge(root);
  assert.deepEqual(a, again);
  const manifest = JSON.parse(await fs.readFile(path.join(a.directory, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.permissions, ['sessions']);
  for (const field of ['host_permissions', 'content_scripts', 'externally_connectable']) assert.equal(manifest[field], undefined);
  const script = await fs.readFile(path.join(a.directory, 'restore.js'), 'utf8');
  assert.match(script, /chrome\.sessions\.restore/);
  assert.match(script, /chrome\.sessions\.onChanged\.addListener/);
  assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|\.url\b|\.title\b/);
  const otherRoot = path.join(root, 'other'); await fs.mkdir(otherRoot);
  assert.notEqual((await prepareSessionBridge(otherRoot)).workerUrl, a.workerUrl);
  await fs.writeFile(path.join(a.directory, 'manifest.json'), '{broken');
  await assert.rejects(prepareSessionBridge(root), /标识损坏/);
});
