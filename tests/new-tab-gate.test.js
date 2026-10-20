'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createPausedTabGate, createDocumentStartGuard, observeExecutionContexts, hasDefaultExecutionContext, activatePausedRestoredPage} = require('../src/new-tab-gate');

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

test('only an owned paused page in the active restore phase is activated, never resumed or navigated', async () => {
  const calls = [], connection = {async command(...args) {calls.push(args);}};
  const args = {connection, restoring: true, waitingForDebugger: true, targetInfo: {type: 'page', targetId: 'owned-page'}};
  await activatePausedRestoredPage({...args, restoring: false});
  await activatePausedRestoredPage({...args, waitingForDebugger: false});
  await activatePausedRestoredPage({...args, targetInfo: {type: 'service_worker'}});
  assert.equal(calls.length, 0);
  await activatePausedRestoredPage(args);
  assert.deepEqual(calls, [['Target.activateTarget', {targetId: 'owned-page'}, {timeout: 5000}]]);
  await assert.rejects(activatePausedRestoredPage({...args, targetInfo: {type: 'page', targetId: ''}}), /目标无效/);
  await assert.rejects(activatePausedRestoredPage({...args, connection: {async command() {throw Error('activation refused');}}}), /activation refused/);
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

test('future documents register without waiting for a nonexistent context and still require a receipt', () => {
  const connection = {}, method = 'Page.addScriptToEvaluateOnNewDocument';
  const guard = createDocumentStartGuard(true, () => hasDefaultExecutionContext(connection, 'page', 'root'));
  assert.deepEqual(guard.parameters(method, {source: 'original'}), {source: 'original', runImmediately: false});
  guard.succeeded(method, {}); assert.throws(() => guard.assertReady(), /未确认/);
  guard.succeeded(method, {identifier: 'future-document-script'}); guard.assertReady();
  const created = (id, frameId, isDefault) => observeExecutionContexts(connection, {
    sessionId: 'page', method: 'Runtime.executionContextCreated',
    params: {context: {id, uniqueId: `unique-${id}`, auxData: {frameId, isDefault}}},
  });
  created(1, 'root', false); created(2, 'child', true);
  assert.equal(guard.parameters(method, {}).runImmediately, false);
  // Without a frame restriction the protocol command covers every existing
  // default context, including child documents; future main documents still
  // receive the same registered source before their first script.
  assert.equal(hasDefaultExecutionContext(connection, 'page'), true);
  created(3, 'root', true);
  assert.equal(guard.parameters(method, {}).runImmediately, true);
  assert.equal(hasDefaultExecutionContext({}, 'page', 'root'), false);
  assert.equal(hasDefaultExecutionContext(connection, 'other-page', 'root'), false);
  observeExecutionContexts(connection, {sessionId: 'page', method: 'Runtime.executionContextDestroyed', params: {executionContextId: 1}});
  assert.equal(guard.parameters(method, {}).runImmediately, true);
  observeExecutionContexts(connection, {sessionId: 'page', method: 'Runtime.executionContextDestroyed', params: {executionContextUniqueId: 'unique-3'}});
  assert.equal(guard.parameters(method, {}).runImmediately, false);
  created(4, 'root', true);
  observeExecutionContexts(connection, {sessionId: 'page', method: 'Runtime.executionContextsCleared'});
  assert.equal(guard.parameters(method, {}).runImmediately, false);
  created(5, 'root', true);
  observeExecutionContexts(connection, {method: 'Target.detachedFromTarget', params: {sessionId: 'page'}});
  assert.equal(guard.parameters(method, {}).runImmediately, false);
  assert.equal(hasDefaultExecutionContext(connection, 'page'), false);
});
