'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const path = require('node:path');
const {openSavedSession} = require('../src/session-restore');

function fixture(code = 0) {
  const calls = [], child = new EventEmitter();
  child.exitCode = null; child.signalCode = null;
  child.kill = () => {child.signalCode = 'SIGTERM'; child.emit('exit', null, 'SIGTERM');};
  const args = {binary: path.resolve('kernel', 'browser.exe'), root: path.resolve('private', 'owned-profile'),
    assertActive() {}, isPrepared: () => true, hasPreparedPage: () => true, timeoutMs: 100,
    spawn(...args) {calls.push(args); queueMicrotask(() => {child.exitCode = code; child.emit('exit', code, null);}); return child;}};
  return {args, calls, child};
}

test('opens the same profile through one original singleton command after protection is ready', async () => {
  const f = fixture();
  await openSavedSession(f.args);
  assert.deepEqual(f.calls, [[f.args.binary, [`--user-data-dir=${f.args.root}`, '--profile-directory=Default',
    '--restore-last-session', '--no-first-run', '--no-default-browser-check'], {windowsHide: true, stdio: 'ignore'}]]);
});

test('never requests restore before protection or after a lifecycle cancellation', async () => {
  const f = fixture();
  await assert.rejects(openSavedSession({...f.args, isPrepared: () => false}), /未就绪/);
  await assert.rejects(openSavedSession({...f.args, assertActive() {throw Error('cancelled');}}), /cancelled/);
  assert.equal(f.calls.length, 0);
});

test('refused singleton request, missing prepared page and dropped protection fail closed', async () => {
  await assert.rejects(openSavedSession(fixture(1).args), /未接受/);
  const f = fixture();
  await assert.rejects(openSavedSession({...f.args, hasPreparedPage: () => false}), /未完成身份准备/);
  let checked = 0;
  await assert.rejects(openSavedSession({...fixture().args, isPrepared: () => ++checked === 1}), /已断开/);
});

test('a stalled notification child is stopped without touching the original browser', async () => {
  const f = fixture();
  f.args.spawn = () => f.child;
  await assert.rejects(openSavedSession(f.args), /请求超时/);
  assert.equal(f.child.signalCode, 'SIGTERM');
});
