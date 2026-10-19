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
