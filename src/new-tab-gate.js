'use strict';

// A Chromium tab can be paused while its child page reports waiting=false.
// Keep the parent paused until the existing page preparation has completed.
function createPausedTabGate({timeoutMs = 8000, onRefused = () => {}} = {}) {
  const pending = new Map();
  const finish = (sessionId, failed, error) => {
    const entry = pending.get(sessionId);
    if (!entry) return;
    pending.delete(sessionId); clearTimeout(entry.timer);
    if (failed) {
      try { onRefused(sessionId, entry.targetId); } catch {}
      entry.reject(error || Error('新标签身份准备失败，已阻止该标签运行'));
    } else entry.resolve();
  };
  return {
    begin(sessionId, targetId) {
      if (pending.has(sessionId)) return pending.get(sessionId).promise;
      const entry = {targetId};
      entry.promise = new Promise((resolve, reject) => {entry.resolve = resolve; entry.reject = reject;});
      // A child may fail while the parent's setAutoAttach command is pending.
      // Keep rejection handled until the parent reaches its explicit await.
      entry.promise.catch(() => {});
      entry.timer = setTimeout(() => finish(sessionId, true, Error('新标签身份准备超时，已阻止该标签运行')), timeoutMs);
      pending.set(sessionId, entry);
      return entry.promise;
    },
    has: sessionId => pending.has(sessionId),
    ready: sessionId => finish(sessionId, false),
    fail: (sessionId, error) => finish(sessionId, true, error),
  };
}
// Observe only protocol metadata on the owning connection. A restored target
// can be paused before it has a default context; runImmediately then waits for
// a context that cannot be created until that same target is resumed.
const defaultContexts = new WeakMap();
function observeExecutionContexts(connection, event) {
  if (!connection || !event) return;
  const sessionId = event.sessionId;
  if (event.method === 'Target.detachedFromTarget') {
    defaultContexts.get(connection)?.delete(event.params?.sessionId);
    return;
  }
  if (!sessionId) return;
  let sessions = defaultContexts.get(connection);
  if (!sessions) { sessions = new Map(); defaultContexts.set(connection, sessions); }
  if (event.method === 'Runtime.executionContextsCleared') { sessions.delete(sessionId); return; }
  if (event.method === 'Runtime.executionContextDestroyed') {
    const contexts = sessions.get(sessionId), params = event.params || {};
    if (!contexts) return;
    for (const [id, context] of contexts) {
      if (id === params.executionContextId || (params.executionContextUniqueId && context.uniqueId === params.executionContextUniqueId)) contexts.delete(id);
    }
    if (!contexts.size) sessions.delete(sessionId);
    return;
  }
  if (event.method !== 'Runtime.executionContextCreated') return;
  const context = event.params?.context;
  if (!context?.auxData?.isDefault || !context.auxData.frameId || context.id == null) return;
  let contexts = sessions.get(sessionId);
  if (!contexts) { contexts = new Map(); sessions.set(sessionId, contexts); }
  contexts.set(context.id, {frameId: context.auxData.frameId, uniqueId: context.uniqueId});
}
function hasDefaultExecutionContext(connection, sessionId, frameId) {
  return Boolean(frameId && [...defaultContexts.get(connection)?.get(sessionId)?.values() || []].some(context => context.frameId === frameId));
}
function createDocumentStartGuard(enabled, hasExistingContext = () => true) {
  let failure = null;
  const applies = method => enabled && method === 'Page.addScriptToEvaluateOnNewDocument';
  return {
    parameters(method, params) { return applies(method) ? {...params, runImmediately: Boolean(hasExistingContext())} : params; },
    succeeded(method, result) {
      if (applies(method)) failure = typeof (result?.identifier ?? result?.result?.identifier) === 'string'
        ? null : Error('内核未确认页面初始化脚本，已阻止页面运行');
    },
    failed(method, error) { if (applies(method)) failure = error || Error('页面初始化脚本注册失败'); },
    assertReady() { if (failure) throw failure; },
  };
}
module.exports = {createPausedTabGate, createDocumentStartGuard, observeExecutionContexts, hasDefaultExecutionContext};
