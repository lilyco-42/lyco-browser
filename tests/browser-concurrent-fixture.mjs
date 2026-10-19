// Ordinary CI pages/workers read their own first-script values. No navigator,
// native identity, canvas implementation, or application setting is patched.
function readRealm() {
  const draw = (offscreen, opaquePattern) => {
    const canvas = offscreen ? new OffscreenCanvas(320, 100) : document.createElement('canvas');
    canvas.width = 320; canvas.height = 100;
    const context = canvas.getContext('2d');
    if (!context) throw Error('No actual 2D canvas in this realm');
    if (opaquePattern) {
      // Integer rectangles isolate pixel-noise ownership from curved-edge GPU
      // rasterization differences. No alpha, fonts or PNG encoder is involved.
      for (let y = 0; y < 100; y += 10) for (let x = 0; x < 320; x += 10) {
        context.fillStyle = `rgb(${(x * 7 + y * 3) % 256},${(x * 11 + y * 5) % 256},${(x * 13 + y * 17) % 256})`;
        context.fillRect(x, y, 10, 10);
      }
    } else {
      context.fillStyle = '#e7c8a4'; context.fillRect(0, 0, 320, 100);
      context.fillStyle = '#156c53'; context.beginPath(); context.arc(175, 66, 23, 0, Math.PI * 2); context.fill();
    }
    let hash = 2166136261;
    for (const value of context.getImageData(0, 0, 320, 100).data) hash = Math.imul(hash ^ value, 16777619) >>> 0;
    return hash.toString(16).padStart(8, '0');
  };
  const offscreen = typeof document !== 'object';
  return {language: navigator.language, languages: Array.from(navigator.languages),
    cores: navigator.hardwareConcurrency, memory: navigator.deviceMemory,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, shapePixels: draw(offscreen, false),
    offscreenPixels: draw(true, false), opaquePixels: draw(offscreen, true), offscreenOpaquePixels: draw(true, true)};
}

// Reuse the exact detached-canvas drawing/readback in a diagnostic context.
// The source contains readers only, with no application overrides or URLs.
export function readOnlyConcurrentRealmSource() { return '(' + readRealm.toString() + ')()'; }

function pageProbe(read, phase) {
  const initial = read();
  const key = 'lyco_native_profile_storage';
  const before = {local: localStorage.getItem(key), cookie: document.cookie.split(';').map(part => part.trim())
    .find(part => part.startsWith(key + '='))?.slice(key.length + 1) ?? null};
  const send = (kind, value) => fetch('/concurrent-report?phase=' + phase + '&kind=' + kind,
    {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(value)});
  void send('page', {initial, before});
  document.getElementById('read-workers').onclick = async function () {
    this.disabled = true;
    const releaseButton = document.getElementById('release-workers');
    let dedicated, registration;
    try {
      const current = read();
      const firstDedicated = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Dedicated worker did not report')), 15000);
        dedicated = new Worker('/concurrent-worker.js?phase=' + phase + '&kind=dedicated');
        dedicated.onmessage = event => {clearTimeout(timer); resolve(event.data);};
        dedicated.onerror = () => {clearTimeout(timer); reject(Error('Dedicated worker failed'));};
      });
      registration = await navigator.serviceWorker.register('/concurrent-worker.js?phase=' + phase + '&kind=service',
        {scope: '/ci-concurrent-workers/'});
      const service = registration.active || registration.installing || registration.waiting;
      if (!service) throw Error('No actual service worker');
      if (service.state !== 'activated') await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Service worker did not activate')), 15000);
        service.addEventListener('statechange', () => {
          if (service.state === 'activated') {clearTimeout(timer); resolve();}
          if (service.state === 'redundant') {clearTimeout(timer); reject(Error('Service worker became redundant'));}
        });
        if (service.state === 'activated') {clearTimeout(timer); resolve();}
      });
      const firstService = await new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => {channel.port1.close(); reject(Error('Service worker did not report'));}, 15000);
        channel.port1.onmessage = event => {clearTimeout(timer); channel.port1.close(); resolve(event.data);};
        service.postMessage({kind: 'read-first-script'}, [channel.port2]);
      });
      await send('workers', {windowStart: initial, windowNow: current, dedicated: firstDedicated, service: firstService});
      // Keep the actual workers alive only after their first-script report.
      // The normal page button releases them after the read-only protocol query.
      await new Promise(resolve => {
        const finish = () => {clearTimeout(timer); releaseButton.disabled = true; releaseButton.onclick = null; resolve();};
        const timer = setTimeout(finish, 45000);
        releaseButton.disabled = false;
        releaseButton.onclick = finish;
      });
    } catch (error) {
      await send('workers', {error: String(error)});
    } finally {
      dedicated?.terminate();
      await registration?.unregister();
      releaseButton.disabled = true;
      releaseButton.onclick = null;
      this.disabled = false;
      await send('released', {complete: true});
    }
  };
}

export function createConcurrentBrowserFixture() {
  const observations = new Map();
  function route(req, res, proxied) {
    const url = new URL(req.url, 'http://ci.invalid');
    if (!['/concurrent-probe', '/concurrent-worker.js', '/concurrent-report'].includes(url.pathname)) return false;
    const phase = url.searchParams.get('phase');
    if (!['a-concurrent', 'b-concurrent'].includes(phase)) {res.writeHead(400); res.end(); return true;}
    const entry = observations.get(phase) || {requests: []}; observations.set(phase, entry);
    if (url.pathname === '/concurrent-probe') {
      entry.pageProxied = Boolean(proxied);
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
      res.end('<!doctype html><meta charset="utf-8"><button id="read-workers">Read workers</button><button id="release-workers" disabled>Release workers</button><script>('
        + pageProbe.toString() + ')(' + readRealm.toString() + ',' + JSON.stringify(phase) + ')</script>');
      return true;
    }
    const kind = url.searchParams.get('kind');
    if (url.pathname === '/concurrent-worker.js') {
      if (!['dedicated', 'service'].includes(kind)) {res.writeHead(400); res.end(); return true;}
      entry.requests.push({kind, proxied: Boolean(proxied), language: req.headers['accept-language'] || ''});
      res.writeHead(200, {'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store'});
      const first = 'const first=(' + readRealm.toString() + ')();';
      res.end(first + (kind === 'service'
        ? 'self.addEventListener("install",event=>event.waitUntil(self.skipWaiting()));self.addEventListener("message",event=>event.ports[0]?.postMessage(first));'
        : 'self.postMessage(first);'));
      return true;
    }
    if (req.method !== 'POST' || !['page', 'workers', 'released'].includes(kind)) {res.writeHead(405); res.end(); return true;}
    let body = '';
    req.on('data', chunk => {body += chunk; if (body.length > 8192) req.destroy();});
    req.on('end', () => {
      try {
        entry[kind] = JSON.parse(body); entry[kind + 'ReportProxied'] = Boolean(proxied);
        res.writeHead(200); res.end('ok');
      } catch {res.writeHead(400); res.end();}
    });
    return true;
  }
  return {route, result: phase => observations.get(phase), snapshot: () => Object.fromEntries(observations),
    clearWorkers(phase) {const entry = observations.get(phase); if (entry) {delete entry.workers; delete entry.workersReportProxied; delete entry.released; entry.requests = [];}}};
}
