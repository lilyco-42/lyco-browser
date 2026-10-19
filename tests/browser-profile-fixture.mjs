// CI-owned pages observe the real bundled browser. They do not patch navigator,
// storage, canvas, Chromium, or the application's production fingerprint code.
const phases = new Map([
  ['a-first', 'A'], ['b-first', 'B'], ['a-reopen', 'A'], ['b-reopen', 'B'],
  ['a-corrupt', 'A'], ['a-recover', 'A'],
  ['a-first-extra', 'A'], ['a-reopen-extra', 'A'],
  ['a-first-new-tab', 'A'], ['a-reopen-new-tab', 'A'],
]);

async function observeProfile(marker, readOnly = false) {
  // Read these synchronously in the page's first script, before font readiness
  // or network awaits can hide a late runtime injection.
  const initial = {
    userAgent: navigator.userAgent, platform: navigator.platform,
    language: navigator.language, languages: Array.from(navigator.languages),
    cores: navigator.hardwareConcurrency, memory: navigator.deviceMemory,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  const key = 'lyco_native_profile_storage';
  const cookie = () => document.cookie.split(';').map(part => part.trim())
    .find(part => part.startsWith(key + '='))?.slice(key.length + 1) ?? null;
  const before = {cookie: cookie(), local: localStorage.getItem(key)};
  if (!readOnly) {
    document.cookie = key + '=' + marker + '; Path=/; Max-Age=600; SameSite=Lax';
    localStorage.setItem(key, marker);
  }
  let textWidth = null;
  const draw = (withText = true) => {
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 100;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw Error('Actual browser has no usable 2D canvas');
    ctx.fillStyle = '#e7c8a4'; ctx.fillRect(0, 0, 320, 100);
    ctx.fillStyle = '#156c53'; ctx.font = '17px Arial';
    textWidth = ctx.measureText('LYCO native profile 0123456789').width;
    if (withText) ctx.fillText('LYCO native profile 0123456789', 11, 34);
    ctx.globalAlpha = 0.6; ctx.fillStyle = '#b42455';
    ctx.beginPath(); ctx.arc(175, 66, 23, 0, Math.PI * 2); ctx.fill();
    const png = canvas.toDataURL('image/png');
    if (!png.startsWith('data:image/png;base64,') || png.length < 100) {
      throw Error('Canvas did not produce a real image');
    }
    let hash = 2166136261;
    for (let i = 0; i < png.length; i++) hash = Math.imul(hash ^ png.charCodeAt(i), 16777619) >>> 0;
    return hash.toString(16).padStart(8, '0');
  };
  const initialShape = [draw(false), draw(false)];
  await document.fonts.ready;
  return {
    ...initial,
    before, after: {cookie: cookie(), local: localStorage.getItem(key)},
    canvas: [draw(), draw()], canvasControl: initialShape, textWidth,
  };
}

// A second observation only: it never changes navigator, native settings,
// storage, document scripts or navigation. Initial-page assertions stay intact.
export function readOnlyProfileProbeSource() {
  return '(' + observeProfile.toString() + ')("A",true)';
}

export function createBrowserProfileFixture() {
  if (process.env.GITHUB_ACTIONS !== 'true') throw Error('CI only');
  const observations = new Map();
  function route(req, res, proxied) {
    const url = new URL(req.url, 'http://ci.invalid');
    if (!['/profile-probe', '/profile-report'].includes(url.pathname)) return false;
    const phase = url.searchParams.get('phase');
    if (!phases.has(phase)) { res.writeHead(400); res.end('Unknown CI phase'); return true; }
    const entry = observations.get(phase) || {};
    observations.set(phase, entry);
    if (url.pathname === '/profile-probe') {
      entry.pageProxied = Boolean(proxied);
      const reportPath = '/profile-report?phase=' + encodeURIComponent(phase);
      const post = 'value=>fetch(' + JSON.stringify(reportPath) + ',{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(value)})';
      const readOnly = phase.endsWith('-extra') || phase.endsWith('-new-tab');
      const script = '(' + observeProfile.toString() + ')(' + JSON.stringify(phases.get(phase)) + ',' + String(readOnly) + ')'
        + '.then(' + post + ').catch(error=>(' + post + ')({error:String(error)}));';
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
      res.end('<!doctype html><meta charset="utf-8"><title>LYCO CI profile probe</title><script>' + script + '</script>');
      return true;
    }
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return true; }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 8192) req.destroy(); });
    req.on('end', () => {
      try {
        entry.value = JSON.parse(body);
        entry.reportProxied = Boolean(proxied);
        res.writeHead(200, {'Content-Type': 'text/plain', 'Cache-Control': 'no-store'}); res.end('ok');
      } catch { res.writeHead(400); res.end('Invalid CI report'); }
    });
    return true;
  }
  return {route, snapshot: () => Object.fromEntries(observations), result: phase => observations.get(phase)};
}
