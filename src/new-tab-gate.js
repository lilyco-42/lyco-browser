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
module.exports = {createPausedTabGate};
