'use strict';
// CI-only observer: never writes raw Mihomo output, config, arguments or env.
// Keep the real executable, arguments, cwd, permissions and connection logic.
const SIGNALS = [
  ['configuration-started', /initial configuration/i],
  ['configuration-ready', /initial configuration complete/i],
  ['mixed-listener-ready', /mixed\(http\+socks\).*listening/i],
  ['listener-error', /(?:listen|bind).*(?:error|failed|denied|in use)|(?:error|failed|denied).*listen/i],
  ['geodata-download', /(?:download|initial).*(?:geoip|geosite|mmdb)|(?:geoip|geosite|mmdb).*(?:download|initial)/i],
  ['database-lock', /database.*(?:lock|timeout)|(?:lock|timeout).*database/i],
  ['fatal-error', /level[=:](?:fatal|panic)|fatal error|panic:/i],
];

function observeCore(child, record) {
  for (const name of ['stdout', 'stderr']) {
    let tail = '';
    child[name]?.on('data', chunk => {
      record.outputBytes += chunk.length;
      // Bounded rolling window also recognizes signals split across chunks.
      tail = (tail + chunk.toString('utf8')).slice(-4096);
      for (const [code, pattern] of SIGNALS) {
        if (pattern.test(tail) && !record.signals.includes(code)) record.signals.push(code);
      }
    });
  }
  child.once('error', error => { record.spawnError = /^[A-Z0-9_]{1,40}$/.test(error.code || '') ? error.code : 'UNKNOWN'; });
  child.once('exit', (code, signal) => { record.exitCode = code; record.signal = signal; });
}

function installCoreStartupObserver(LycoNetwork) {
  // Called only by the Actions-gated harness. Its launched application keeps a
  // clean environment without CI/provider variables; do not weaken that policy.
  const records = [];
  const original = LycoNetwork.prototype.connectOnce;
  LycoNetwork.prototype.connectOnce = async function (...args) {
    const spawn = this.spawnFn;
    this.spawnFn = (...spawnArgs) => {
      const options = {...spawnArgs[2], stdio: ['ignore', 'pipe', 'pipe']};
      const child = spawn(spawnArgs[0], spawnArgs[1], options);
      const record = {pid: child.pid ?? null, outputBytes: 0, signals: [], exitCode: null, signal: null};
      records.push(record); observeCore(child, record); return child;
    };
    try { return await original.apply(this, args); }
    finally { this.spawnFn = spawn; }
  };
  return records;
}
module.exports = {observeCore, installCoreStartupObserver};
