'use strict';
// Actions harness only. Observe protocol ordering without retaining page URLs,
// fingerprint parameters, scripts, responses, credentials or environment.
function installBrowserTargetObserver({BrowserEngine, cdp}) {
  const records = [], sessions = new Map();
  const id = value => {
    if (!value) return null;
    if (!sessions.has(value) && sessions.size < 2048) sessions.set(value, sessions.size + 1);
    return sessions.get(value) || 0;
  };
  const record = value => { if (records.length < 1200) records.push(value); };
  const connect = cdp.connect;
  cdp.connect = async function (socket, options = {}) {
    const onEvent = options.onEvent;
    const connection = await connect.call(this, socket, {...options, onEvent: function (event, ...rest) {
      if (event?.method === 'Target.attachedToTarget') {
        const info = event.params?.targetInfo || {};
        record({kind: 'attached', type: ['page', 'tab', 'iframe', 'worker', 'service_worker', 'shared_worker'].includes(info.type) ? info.type : 'other',
          session: id(event.params?.sessionId), parent: id(event.sessionId), waiting: Boolean(event.params?.waitingForDebugger)});
      }
      return onEvent?.call(this, event, ...rest);
    }});
    const command = connection.command;
    connection.command = async function (method, params, options) {
      if (!['Target.setAutoAttach', 'Wayfern.setFingerprint', 'Page.addScriptToEvaluateOnNewDocument', 'Runtime.runIfWaitingForDebugger', 'Target.closeTarget'].includes(method)) {
        return command.call(this, method, params, options);
      }
      const event = {kind: 'command', method, session: id(options?.sessionId), done: false, failed: false};
      if (method === 'Page.addScriptToEvaluateOnNewDocument') event.immediate = params?.runImmediately === true;
      if (method === 'Target.setAutoAttach') {
        event.pause = Boolean(params?.waitForDebuggerOnStart);
        event.filter = params?.filter?.map(row => ({type: row.type, exclude: Boolean(row.exclude)}));
      }
      record(event);
      try { const result = await command.call(this, method, params, options); event.done = true; return result; }
      catch (error) { event.done = true; event.failed = true; throw error; }
    };
    return connection;
  };
  const start = BrowserEngine.prototype.startWorkerFingerprintInjection;
  BrowserEngine.prototype.startWorkerFingerprintInjection = function (item, ...args) {
    record({kind: 'worker-setup', nativeIdentity: Boolean(item.lycoNativeIdentity)});
    return start.call(this, item, ...args);
  };
  return records;
}
module.exports = {installBrowserTargetObserver};
