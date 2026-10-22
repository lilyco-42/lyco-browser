'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {targets, create} = require('../src/diagnostics-controller');
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
