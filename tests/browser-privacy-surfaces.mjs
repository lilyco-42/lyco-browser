import assert from 'node:assert/strict';

// Serialize this read-only collector into CI-owned browser documents. No
// prototype writes, permission prompts, device creation or external requests.
export async function readBrowserPrivacySurfaces() {
  const bounded = async task => {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(task).then(value => ({status: 'observed', value}),
          error => ({status: 'error', error: String(error?.name || 'Error').slice(0, 80)})),
        new Promise(resolve => {timer = setTimeout(() => resolve({status: 'timeout'}), 1500);}),
      ]);
    } finally {clearTimeout(timer);}
  };
  const text = value => typeof value === 'string' ? value.slice(0, 160) : null;
  const brands = value => Array.isArray(value)
    ? value.slice(0, 8).map(row => ({brand: text(row.brand), version: text(row.version)})) : null;
  const nav = globalThis.navigator;
  const data = nav.userAgentData;
  // Capture low-entropy properties in the first synchronous script turn.
  const first = {secureContext: globalThis.isSecureContext === true,
    webdriver: typeof nav.webdriver === 'boolean' ? nav.webdriver : null,
    clientHints: data ? {status: 'observed', brands: brands(data.brands),
      mobile: data.mobile, platform: text(data.platform)} : {status: 'unsupported'}};
  const highTask = data && typeof data.getHighEntropyValues === 'function'
    ? bounded(async () => {
      const value = await data.getHighEntropyValues([
        'architecture', 'bitness', 'model', 'platformVersion', 'fullVersionList', 'wow64',
      ]);
      return {architecture: text(value.architecture), bitness: text(value.bitness),
        model: text(value.model), platformVersion: text(value.platformVersion),
        fullVersionList: brands(value.fullVersionList),
        wow64: typeof value.wow64 === 'boolean' ? value.wow64 : null};
    }) : Promise.resolve({status: 'unsupported'});
  const gpuTask = nav.gpu && typeof nav.gpu.requestAdapter === 'function'
    ? bounded(async () => {
      const adapter = await nav.gpu.requestAdapter();
      if (!adapter) return {adapterAvailable: false};
      const info = adapter.info || (typeof adapter.requestAdapterInfo === 'function'
        ? await adapter.requestAdapterInfo() : null);
      return {adapterAvailable: true, infoAvailable: Boolean(info),
        vendor: text(info?.vendor), architecture: text(info?.architecture),
        device: text(info?.device), description: text(info?.description),
        isFallbackAdapter: typeof adapter.isFallbackAdapter === 'boolean' ? adapter.isFallbackAdapter : null};
    }) : Promise.resolve({status: 'unsupported'});
  const [highEntropy, webgpu] = await Promise.all([highTask, gpuTask]);
  return {schema: 1, first, highEntropy, webgpu};
}

export function captureClientHintHeaders(headers) {
  return Object.fromEntries(['sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform']
    .map(name => [name, typeof headers[name] === 'string' ? headers[name].slice(0, 1024) : null]));
}

function normalizedBrands(rows) {
  assert.ok(Array.isArray(rows) && rows.length > 0 && rows.length <= 8, 'Client Hint brands missing');
  return rows.map(row => {
    assert.ok(typeof row.brand === 'string' && row.brand.trim() && row.brand.length <= 160);
    assert.match(row.version || '', /^\d+(?:\.\d+){0,3}$/);
    return {brand: row.brand, version: row.version};
  }).sort((a, b) => a.brand.localeCompare(b.brand) || a.version.localeCompare(b.version));
}

export function parseBrandHeader(header) {
  assert.ok(typeof header === 'string' && header.length > 0 && header.length <= 1024,
    'Browser Client Hint request header missing');
  const rows = [];
  const pattern = /"((?:[^"\\]|\\.)*)"\s*;\s*v="((?:[^"\\]|\\.)*)"/g;
  let end = 0;
  for (const match of header.matchAll(pattern)) {
    assert.match(header.slice(end, match.index), rows.length ? /^\s*,\s*$/ : /^\s*$/);
    rows.push({brand: JSON.parse('"' + match[1] + '"'), version: JSON.parse('"' + match[2] + '"')});
    end = match.index + match[0].length;
  }
  assert.match(header.slice(end), /^\s*$/);
  return normalizedBrands(rows);
}

// A narrow consistency gate, not a Claude detector or eligibility oracle.
// Unsupported/timeouts remain explicit and cannot satisfy this secure Chromium
// Client Hints contract. WebGPU observations are retained, not called a pass.
export function assertClientHintConsistency(surface, headers, userAgent, phase, prior) {
  assert.equal(surface?.schema, 1, phase + ': missing surface report');
  assert.equal(surface.first?.secureContext, true, phase + ': secure-origin control missing');
  const low = surface.first.clientHints;
  assert.equal(low?.status, 'observed', phase + ': Client Hints unavailable');
  assert.equal(typeof low.mobile, 'boolean');
  const lowBrands = normalizedBrands(low.brands);
  assert.deepEqual(parseBrandHeader(headers?.['sec-ch-ua']), lowBrands,
    phase + ': request and first-script brand values disagree');
  assert.equal(headers['sec-ch-ua-mobile'], low.mobile ? '?1' : '?0', phase + ': mobile header mismatch');
  assert.equal(JSON.parse(headers['sec-ch-ua-platform'] || 'null'), low.platform, phase + ': platform header mismatch');
  if (userAgent.includes('Windows NT')) assert.equal(low.platform, 'Windows', phase + ': Windows UA platform mismatch');
  const major = userAgent.match(/Chrome\/(\d+)\./)?.[1];
  assert.ok(major, phase + ': expected Chromium UA missing');
  const chromiumBrands = rows => rows.filter(row => /^(Chromium|Google Chrome|Microsoft Edge)$/.test(row.brand));
  assert.ok(chromiumBrands(lowBrands).length, phase + ': Chromium brand unavailable');
  for (const row of chromiumBrands(lowBrands)) assert.equal(row.version.split('.')[0], major, phase + ': UA/brand version mismatch');
  assert.equal(surface.highEntropy?.status, 'observed', phase + ': high-entropy hints incomplete');
  const high = surface.highEntropy.value;
  assert.ok(high && typeof high.architecture === 'string' && high.architecture.trim());
  assert.match(high.bitness || '', /^(32|64)$/);
  assert.match(high.platformVersion || '', /^\d+(?:\.\d+){0,3}$/);
  const fullBrands = normalizedBrands(high.fullVersionList);
  assert.ok(chromiumBrands(fullBrands).length, phase + ': full Chromium version missing');
  for (const row of chromiumBrands(fullBrands)) assert.equal(row.version.split('.')[0], major, phase + ': full UA version mismatch');
  assert.ok(['observed', 'unsupported', 'error', 'timeout'].includes(surface.webgpu?.status), phase + ': WebGPU observation missing');
  const snapshot = {low: {brands: lowBrands, mobile: low.mobile, platform: low.platform},
    high: {...high, fullVersionList: fullBrands}};
  if (prior) assert.deepEqual(snapshot, prior, phase + ': Client Hints changed within the same environment');
  return snapshot;
}
