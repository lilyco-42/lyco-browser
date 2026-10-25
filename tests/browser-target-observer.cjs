'use strict';
// Actions harness only. Observe protocol ordering without retaining page URLs,
// fingerprint parameters, scripts, responses, credentials or environment.
function installBrowserTargetObserver({BrowserEngine, cdp}) {
  const records = [], sessions = new Map();
  const nativeCalls = [];
  Object.defineProperty(records, 'nativeCalls', {value: nativeCalls});
  const startupReadiness = [];
  Object.defineProperty(records, 'startupReadiness', {value: startupReadiness});
  const nativeMethods = new Set(['Wayfern.getFingerprint', 'Wayfern.setFingerprint', 'Emulation.setHardwareConcurrencyOverride',
    'Emulation.setUserAgentOverride', 'Network.setUserAgentOverride']);
  const reasonFor = error => {
    const message = String(error?.message || '');
    return /timed?\s*out|timeout/i.test(message) ? 'timeout'
      : /session.*(?:not found|not exist|closed)|no session/i.test(message) ? 'session-unavailable'
      : /target.*closed|connection.*closed|socket.*closed/i.test(message) ? 'target-or-connection-closed'
      : /(?:method|command).*(?:not found|not supported)|wasn't found/i.test(message) ? 'method-unavailable'
      : /execution context/i.test(message) ? 'execution-context-unavailable'
      : /license|licence|authoriz|permission/i.test(message) ? 'authorization'
      : /invalid.*param/i.test(message) ? 'invalid-parameters' : 'other';
  };
  const id = value => {
    if (!value) return null;
    if (!sessions.has(value) && sessions.size < 2048) sessions.set(value, sessions.size + 1);
    return sessions.get(value) || 0;
  };
  const record = value => { if (records.length < 1200) records.push(value); };
  // Observe the existing readiness probes, without issuing more network
  // requests, changing timeouts or storing endpoint/root/device values.
  const versionProbes = new Map();
  const json = cdp.json;
  if (typeof json === 'function') cdp.json = async function (url, ...args) {
    let endpoint;
    try {endpoint = new URL(url);} catch {}
    if (!endpoint || endpoint.pathname !== '/json/version' || endpoint.protocol !== 'http:'
        || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)) return json.call(this, url, ...args);
    const key = endpoint.port;
    let state = versionProbes.get(key);
    if (!state && versionProbes.size < 128) {state = {attempts: 0, failures: 0}; versionProbes.set(key, state);}
    if (state) state.attempts++;
    try {const result = await json.call(this, url, ...args); if (state) state.succeeded = true; return result;}
    catch (error) {if (state) {state.failures++; state.lastReason = reasonFor(error);} throw error;}
  };
  const waitForPort = BrowserEngine.prototype.waitForPort;
  if (typeof waitForPort === 'function') BrowserEngine.prototype.waitForPort = async function (root, timeout, child) {
    const row = {startedAt: Date.now(), done: false, failed: false};
    if (startupReadiness.length < 64) startupReadiness.push(row);
    try {const result = await waitForPort.call(this, root, timeout, child); row.done = true; return result;}
    catch (error) {
      row.done = true; row.failed = true; row.reason = reasonFor(error);
      const fs = require('node:fs/promises'), path = require('node:path');
      try {
        const lines = (await fs.readFile(path.join(root, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/);
        const port = Number(lines[0]);
        row.filePresent = true; row.validPort = Number.isInteger(port) && port > 0 && port < 65536;
        row.validBrowserPath = /^\/devtools\/browser\/[A-Za-z0-9-]+$/.test(lines[1] || '');
        row.probes = {...versionProbes.get(String(port))};
        const listening = String(child?._startupDiagnostic?.stderr || '').match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//g)?.at(-1);
        row.listeningReported = Boolean(listening);
        if (listening) row.fileMatchesListeningPort = listening.includes(':' + port + '/');
      } catch {row.filePresent = false;}
      throw error;
    } finally {row.elapsedMs = Math.max(0, Date.now() - row.startedAt);}
  };
  // Initial identity preparation uses one-shot page calls, not cdp.connect.
  // Keep these bounded, separate diagnostics so busy iframe traces cannot
  // hide which native operation failed. Never retain params/results/raw errors.
  const call = cdp.call;
  if (typeof call === 'function') cdp.call = async function (socket, method, params, timeout) {
    if (!nativeMethods.has(method)) return call.call(this, socket, method, params, timeout);
    const event = {kind: 'native-call', transport: 'page', target: id(socket), method,
      startedAt: Date.now(), done: false, failed: false};
    if (nativeCalls.length < 256) nativeCalls.push(event);
    const started = Date.now();
    try {const result = await call.call(this, socket, method, params, timeout); event.done = true; return result;}
    catch (error) {event.done = true; event.failed = true; event.reason = reasonFor(error); throw error;}
    finally {event.elapsedMs = Math.max(0, Date.now() - started);}
  };
  const connect = cdp.connect;
  cdp.connect = async function (socket, options = {}) {
    const onEvent = options.onEvent;
    const connection = await connect.call(this, socket, {...options, onEvent: function (event, ...rest) {
      if (event?.method === 'Target.attachedToTarget') {
        const info = event.params?.targetInfo || {};
        record({kind: 'attached', type: ['page', 'tab', 'iframe', 'worker', 'service_worker', 'shared_worker'].includes(info.type) ? info.type : 'other',
          session: id(event.params?.sessionId), parent: id(event.sessionId), waiting: Boolean(event.params?.waitingForDebugger)});
      }
      if (event?.method === 'Runtime.exceptionThrown') {
        const name = event.params?.exceptionDetails?.exception?.className;
        record({kind: 'runtime-exception', session: id(event.sessionId),
          type: ['Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError'].includes(name) ? name : 'other'});
      }
      return onEvent?.call(this, event, ...rest);
    }});
    const command = connection.command;
    connection.command = async function (method, params, options) {
      if (!nativeMethods.has(method) && !['Target.setAutoAttach', 'Page.enable', 'Runtime.enable', 'Page.addScriptToEvaluateOnNewDocument', 'Runtime.runIfWaitingForDebugger', 'Target.closeTarget'].includes(method)) {
        return command.call(this, method, params, options);
      }
      const event = {kind: 'command', method, session: id(options?.sessionId), startedAt: Date.now(), done: false, failed: false};
      if (method === 'Page.addScriptToEvaluateOnNewDocument') event.immediate = params?.runImmediately === true;
      if (method === 'Target.setAutoAttach') {
        event.pause = Boolean(params?.waitForDebuggerOnStart);
        event.filter = params?.filter?.map(row => ({type: row.type, exclude: Boolean(row.exclude)}));
      }
      record(event);
      if (nativeMethods.has(method) && nativeCalls.length < 256) nativeCalls.push(event);
      const started = Date.now();
      try { const result = await command.call(this, method, params, options); event.done = true; return result; }
      catch (error) {
        event.done = true; event.failed = true;
        // Fixed enums only: raw errors may include URLs, source or credentials.
        // A failed command alone does not prove timeout or renderer deadlock.
        event.reason = reasonFor(error);
        throw error;
      } finally { event.elapsedMs = Math.max(0, Date.now() - started); }
    };
    return connection;
  };
  const start = BrowserEngine.prototype.startWorkerFingerprintInjection;
  BrowserEngine.prototype.startWorkerFingerprintInjection = function (item, ...args) {
    record({kind: 'worker-setup', nativeIdentity: Boolean(item.lycoNativeIdentity)});
    return start.call(this, item, ...args);
  };
  const apply = BrowserEngine.prototype.applyFingerprintToSession;
  BrowserEngine.prototype.applyFingerprintToSession = function (connection, sessionId, item, fingerprint, targetInfo) {
    const profile = item?.profile || {}, fp = fingerprint || item?.fingerprint || {};
    // Export comparisons only, never user settings or the native device.
    record({kind: 'page-config', session: id(sessionId),
      currentLanguage: fp.languages?.[0] === item?.fingerprint?.languages?.[0],
      declaredLanguage: fp.languages?.[0] === profile.language,
      declaredCores: fp.hardwareConcurrency === profile.privacy?.cores,
      declaredMemory: fp.deviceMemory === profile.privacy?.memory,
      declaredTimezone: fp.timezone === profile.privacy?.timezone});
    return apply.call(this, connection, sessionId, item, fingerprint, targetInfo);
  };
  return records;
}
module.exports = {installBrowserTargetObserver};
