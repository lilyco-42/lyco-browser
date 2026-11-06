'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {targets, supportTargets, create} = require('../src/diagnostics-controller');
const ready = id => ({id, title: '<untrusted profile title>', running: true, port: 12345});

test('four fixed checks open once in exactly the selected live environment', async () => {
  const calls = [], controller = create({getProfiles: async () => [ready('owner-a'), ready('owner-b')],
    openTab: async (...args) => {calls.push(args); return {success: true, count: 1};}});
  assert.equal(Object.keys(targets).length, 4);
  for(const key of ['claude', 'gpt', 'dns', 'webrtc']) {
    const result = await controller.open('owner-b', key);
    assert.deepEqual(calls.at(-1), [['owner-b'], 'new', {url: `https://ip.net.coffee/${key}/`}]);
    assert.equal(result.id, 'owner-b');
  }
  assert.equal(calls.length, 4);
});

test('rejects arbitrary/prototype URLs and stopped, blocked or changing environments without fallback', async () => {
  let calls = 0;
  const controller = create({getProfiles: async () => [ready('a'), {...ready('stopped'), running: false},
    {...ready('blocked'), verificationBlocked: true}, {...ready('starting'), starting: true}],
    openTab: async () => {calls++; return {success: true, count: 0};}});
  for(const key of ['__proto__', 'constructor', 'https://evil.invalid', {}, null])
    await assert.rejects(controller.open('a', key), {code: 'INVALID_TARGET'});
  for(const id of ['stopped', 'blocked', 'starting', 'missing', '../a'])
    await assert.rejects(controller.open(id, 'claude'), {code: 'NOT_RUNNING'});
  assert.equal(calls, 0);
  await assert.rejects(controller.open('a', 'dns'), {code: 'NO_TARGET'});
  assert.equal(calls, 1);
});

test('concurrent clicks cannot duplicate an in-flight tab operation or replay a failed action', async () => {
  let release, started, calls = 0;
  const entered = new Promise(resolve => started = resolve);
  const controller = create({getProfiles: async () => [ready('a')], openTab: async () => {
    calls++; await new Promise(resolve => {release = resolve; started();}); throw Error('Connection closed');
  }});
  const first = controller.open('a', 'gpt');
  await entered;
  await assert.rejects(controller.open('a', 'gpt'), {code: 'BUSY'});
  release(); await assert.rejects(first, /Connection closed/);
  assert.equal(calls, 1);
});

test('official support uses its own fixed allowlist inside the selected environment', async () => {
  const calls = [], controller = create({getProfiles: async () => [ready('a'), ready('b')],
    openTab: async (...args) => {calls.push(args); return {success: true, count: 1};}});
  const expected = {
    subscribe: 'https://support.claude.com/en/articles/9612892-how-do-i-sign-up-for-claude-pro-on-claude-for-android',
    payments: 'https://support.google.com/googleplay/answer/1267137',
    certification: 'https://support.google.com/googleplay/answer/7165974',
    verification: 'https://support.claude.com/en/articles/14328960-identity-verification-on-claude',
  };
  assert.deepEqual(supportTargets, expected); assert.equal(Object.isFrozen(supportTargets), true);
  for(const [key, url] of Object.entries(expected)) {
    assert.deepEqual(await controller.openSupport('b', key), {id: 'b', key, url});
    assert.deepEqual(calls.at(-1), [['b'], 'new', {url}]);
    assert.equal(new URL(url).search, '', 'No account, order or payment data is sent in help URLs');
  }
  for(const key of ['claude', '__proto__', 'constructor', 'https://evil.invalid', {}, null])
    await assert.rejects(controller.openSupport('b', key), {code: 'INVALID_TARGET'});
  await assert.rejects(controller.open('b', 'payments'), {code: 'INVALID_TARGET'});
  assert.equal(calls.length, 4);
});

test('official support rechecks stopped or revoked environments and never falls back or retries', async () => {
  let rows = [ready('a')], calls = 0;
  const controller = create({getProfiles: async () => rows,
    openTab: async () => {calls++; return {success: true, count: 0};}});
  assert.equal((await controller.available()).length, 1);
  for(const row of [{...ready('a'), running: false}, {...ready('a'), verificationBlocked: true},
    {...ready('a'), stopping: true}, ready('other-owner')]) {
    rows = [row];
    await assert.rejects(controller.openSupport('a', 'payments'), {code: 'NOT_RUNNING'});
  }
  assert.equal(calls, 0);
  rows = [ready('a')];
  await assert.rejects(controller.openSupport('a', 'payments'), {code: 'NO_TARGET'});
  assert.equal(calls, 1);
});

test('support and diagnostics share a lock and a failed help request releases it', async () => {
  let release, entered;
  const started = new Promise(resolve => entered = resolve);
  let calls = 0;
  const controller = create({getProfiles: async () => [ready('a')], openTab: async () => {
    if(++calls === 1) {await new Promise(resolve => {release = resolve; entered();}); throw Error('Closed');}
    return {success: true, count: 1};
  }});
  const first = controller.openSupport('a', 'subscribe'); await started;
  await assert.rejects(controller.open('a', 'dns'), {code: 'BUSY'});
  await assert.rejects(controller.openSupport('a', 'payments'), {code: 'BUSY'});
  release(); await assert.rejects(first, /Closed/);
  await controller.open('a', 'dns'); assert.equal(calls, 2);
});
