'use strict';
(function(root, factory) {
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(typeof root.document === 'object') root.LycoDiagnostics = api;
})(globalThis, () => {
  const targets = Object.freeze({claude: 'https://ip.net.coffee/claude/', gpt: 'https://ip.net.coffee/gpt/',
    dns: 'https://ip.net.coffee/dns/', webrtc: 'https://ip.net.coffee/webrtc/'});
  const fail = code => {throw Object.assign(Error(code), {code});};
  const ready = row => row?.running === true && !row.starting && !row.stopping && !row.verificationBlocked &&
    Number.isInteger(row.port) && row.port > 1023 && row.port <= 65535 &&
    typeof row.id === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(row.id);
  function create({getProfiles, openTab}) {
    let busy = false;
    const available = async () => (await getProfiles()).filter(ready).map(row => ({id: row.id,
      label: String(row.title || row.name || row.id).slice(0, 160)}));
    return {available, async open(id, key) {
      if(typeof key !== 'string' || !Object.hasOwn(targets, key)) fail('INVALID_TARGET');
      if(typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(id)) fail('NOT_RUNNING');
      if(busy) fail('BUSY');
      busy = true;
      try {
        if(!(await available()).some(row => row.id === id)) fail('NOT_RUNNING');
        const result = await openTab([id], 'new', {url: targets[key]});
        if(result?.success !== true || result.count !== 1) fail('NO_TARGET');
        return {id, key, url: targets[key]};
      } finally {busy = false;}
    }};
  }
  return {targets, create};
});
