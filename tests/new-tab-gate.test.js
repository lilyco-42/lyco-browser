'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createPausedTabGate, createDocumentStartGuard} = require('../src/new-tab-gate');

test('parent remains paused while a child with waiting=false is being prepared', async () => {
  const refused = [], gate = createPausedTabGate({onRefused: (...args) => refused.push(args)});
  let released = false;
  const pending = gate.begin('parent', 'new-tab').then(() => {released = true;});
  assert.equal(gate.has('parent'), true);
  await Promise.resolve(); assert.equal(released, false);
  gate.ready('unrelated'); await Promise.resolve(); assert.equal(released, false);
  gate.ready('parent'); await pending;
  assert.equal(released, true); assert.equal(gate.has('parent'), false);
  assert.deepEqual(refused, []);
});

test('failed child preparation refuses only its parent before the wait rejects', async () => {
  const refused = [], gate = createPausedTabGate({onRefused: (...args) => refused.push(args)});
  const first = gate.begin('parent-a', 'tab-a'), second = gate.begin('parent-b', 'tab-b');
  const failed = assert.rejects(first, /native refusal/);
  gate.fail('parent-a', Error('native refusal'));
  assert.deepEqual(refused, [['parent-a', 'tab-a']]);
  assert.equal(gate.has('parent-b'), true);
  await failed; gate.ready('parent-b'); await second;
});

test('a missing child has a bounded failure and is never treated as ready', async () => {
  const refused = [], gate = createPausedTabGate({timeoutMs: 20, onRefused: (...args) => refused.push(args)});
  await assert.rejects(gate.begin('parent', 'new-tab'), /超时/);
  assert.deepEqual(refused, [['parent', 'new-tab']]);
  assert.equal(gate.has('parent'), false);
});

test('a failed child without an error object is not mistaken for readiness', async () => {
  const gate = createPausedTabGate();
  const failed = assert.rejects(gate.begin('parent', 'new-tab'), /失败/);
  gate.fail('parent', null); await failed;
});

test('paused native pages register for the existing context without changing script source', () => {
  const guard = createDocumentStartGuard(true), params = {source: 'CI full original script', worldName: 'main'};
  assert.deepEqual(guard.parameters('Page.addScriptToEvaluateOnNewDocument', params), {...params, runImmediately: true});
  assert.equal(params.runImmediately, undefined);
  assert.equal(guard.parameters('Runtime.enable', params), params);
  const legacy = createDocumentStartGuard(false);
  assert.equal(legacy.parameters('Page.addScriptToEvaluateOnNewDocument', params), params);
});

test('a swallowed registration failure or missing receipt cannot release a native page', () => {
  const guard = createDocumentStartGuard(true), method = 'Page.addScriptToEvaluateOnNewDocument';
  guard.failed(method, Error('native registration refused'));
  assert.throws(() => guard.assertReady(), /refused/);
  guard.succeeded(method, {}); assert.throws(() => guard.assertReady(), /未确认/);
  guard.succeeded(method, {identifier: 'real-script-id'}); assert.doesNotThrow(() => guard.assertReady());
});
