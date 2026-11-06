'use strict';
(function(root, factory) {
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(typeof root.document === 'object') root.LycoDiagnostics = api;
})(globalThis, () => {
  const targets = Object.freeze({claude: 'https://ip.net.coffee/claude/', gpt: 'https://ip.net.coffee/gpt/',
    dns: 'https://ip.net.coffee/dns/', webrtc: 'https://ip.net.coffee/webrtc/'});
  const supportTargets = Object.freeze({
    subscribe: 'https://support.claude.com/en/articles/9612892-how-do-i-sign-up-for-claude-pro-on-claude-for-android',
    payments: 'https://support.google.com/googleplay/answer/1267137',
    certification: 'https://support.google.com/googleplay/answer/7165974',
    verification: 'https://support.claude.com/en/articles/14328960-identity-verification-on-claude',
  });
  const fail = code => {throw Object.assign(Error(code), {code});};
  const ready = row => row?.running === true && !row.starting && !row.stopping && !row.verificationBlocked &&
    Number.isInteger(row.port) && row.port > 1023 && row.port <= 65535 &&
    typeof row.id === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(row.id);
  function create({getProfiles, openTab}) {
    let busy = false;
    const available = async () => (await getProfiles()).filter(ready).map(row => ({id: row.id,
      label: String(row.title || row.name || row.id).slice(0, 160)}));
    async function openFrom(allowlist, id, key) {
      if(typeof key !== 'string' || !Object.hasOwn(allowlist, key)) fail('INVALID_TARGET');
      if(typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(id)) fail('NOT_RUNNING');
      if(busy) fail('BUSY');
      busy = true;
      try {
        if(!(await available()).some(row => row.id === id)) fail('NOT_RUNNING');
        const result = await openTab([id], 'new', {url: allowlist[key]});
        if(result?.success !== true || result.count !== 1) fail('NO_TARGET');
        return {id, key, url: allowlist[key]};
      } finally {busy = false;}
    }
    return {available, open: (id, key) => openFrom(targets, id, key),
      openSupport: (id, key) => openFrom(supportTargets, id, key)};
  }
  return {targets, supportTargets, create};
});
