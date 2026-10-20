'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {installBrowserTargetObserver} = require('./browser-target-observer.cjs');

test('browser trace keeps protocol ordering without parameters, responses or URLs', async () => {
  let forwarded = 0;
  const calls = [], secret = 'CI_PRIVATE_PAYLOAD';
  const cdp = {async connect(socket, options) {
    options.onEvent({method: 'Target.attachedToTarget', params: {sessionId: secret, waitingForDebugger: true, targetInfo: {type: 'page', url: secret}}});
    return {async command(...args) { calls.push(args); return {secret}; }};
  }};
  class BrowserEngine { startWorkerFingerprintInjection(item) { return item; } }
  const trace = installBrowserTargetObserver({BrowserEngine, cdp});
  const connection = await cdp.connect(secret, {onEvent() {forwarded++;}});
  const params = {fingerprint: secret};
  assert.deepEqual(await connection.command('Wayfern.setFingerprint', params, {sessionId: secret}), {secret});
  assert.equal(calls[0][1], params); assert.equal(forwarded, 1);
  const item = {lycoNativeIdentity: params}; assert.equal(new BrowserEngine().startWorkerFingerprintInjection(item), item);
  assert.deepEqual(trace.map(row => row.kind), ['attached', 'command', 'worker-setup']);
  assert.equal(trace[1].done, true); assert.equal(trace[1].failed, false);
  assert.doesNotMatch(JSON.stringify(trace), /CI_PRIVATE_PAYLOAD|fingerprint":/);
});

test('page diagnostics retain only configuration comparisons and fixed exception classes', async () => {
  let eventHandler;
  const marker = 'CI_PRIVATE_DEVICE';
  const cdp = {async connect(socket, options) {eventHandler = options.onEvent; return {command() {}};}};
  const expected = {languages: [marker], hardwareConcurrency: 6, deviceMemory: 4, timezone: marker};
  const item = {fingerprint: expected, profile: {language: marker, privacy: {cores: 6, memory: 4, timezone: marker}}};
  const result = {};
  class BrowserEngine {
    startWorkerFingerprintInjection() {}
    applyFingerprintToSession(...args) {assert.equal(args[2], item); assert.equal(args[3], expected); return result;}
  }
  const trace = installBrowserTargetObserver({BrowserEngine, cdp});
  await cdp.connect(marker);
  assert.equal(new BrowserEngine().applyFingerprintToSession({}, marker, item, expected, {}), result);
  eventHandler({method: 'Runtime.exceptionThrown', sessionId: marker, params: {exceptionDetails: {text: marker, url: marker,
    exception: {className: 'TypeError', description: marker}}}});
  assert.equal(trace[0].declaredLanguage, true); assert.equal(trace[0].declaredCores, true);
  assert.equal(trace[0].declaredMemory, true); assert.equal(trace[0].declaredTimezone, true);
  assert.equal(trace[1].type, 'TypeError');
  assert.doesNotMatch(JSON.stringify(trace), /CI_PRIVATE_DEVICE|description|exceptionDetails|url/);
});

test('failed preparation records bounded error classes rather than leaking raw errors', async () => {
  const secret = 'CI_PRIVATE_PAYLOAD';
  for (const [message, reason] of [
    ['CDP command timed out', 'timeout'], ['No session with given id', 'session-unavailable'],
    ['Target closed', 'target-or-connection-closed'], ["Method wasn't found", 'method-unavailable'],
    ['Cannot find execution context', 'execution-context-unavailable'], ['unclassified', 'other'],
  ]) {
    class BrowserEngine { startWorkerFingerprintInjection() {} }
    const failure = Error(message + ' ' + secret);
    const cdp = {async connect() {return {async command() {throw failure;}};}};
    const trace = installBrowserTargetObserver({BrowserEngine, cdp});
    const connection = await cdp.connect(secret);
    await assert.rejects(connection.command('Runtime.enable', {}, {sessionId: secret}), error => error === failure);
    assert.equal(trace[0].reason, reason);
    assert.equal(trace[0].failed, true); assert.equal(trace[0].done, true);
    assert.ok(Number.isFinite(trace[0].elapsedMs) && trace[0].elapsedMs >= 0);
    assert.doesNotMatch(JSON.stringify(trace), /CI_PRIVATE_PAYLOAD|message|stack/);
  }
});
