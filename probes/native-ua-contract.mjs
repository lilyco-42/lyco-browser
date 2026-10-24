import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {readBrowserPrivacySurfaces, captureClientHintHeaders, parseBrandHeader,
  assertClientHintConsistency} from '../tests/browser-privacy-surfaces.mjs';

if (process.env.GITHUB_ACTIONS !== 'true' || process.platform !== 'win32') throw Error('Disposable Windows Actions probe only');
const appRoot = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
await fs.mkdir(output, {recursive: true});
const binary = path.join(appRoot, 'kernels/windows-x64/chrome.exe');
const cdp = createRequire(path.join(appRoot, 'package.json'))('./cdp.js');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lyco-ua-contract-'));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hashFile = async file => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
};
const fields = device => Object.fromEntries(['brand', 'brandVersion', 'platformVersion', 'userAgent', 'platform', 'hardwareConcurrency'].map(key => {
  const value = device?.[key], present = Object.hasOwn(device || {}, key);
  const safe = typeof value === 'string' && (['brandVersion', 'platformVersion'].includes(key)
    ? /^\d+(?:\.\d+){0,3}$/.test(value) : key === 'brand' && ['Chromium', 'Google Chrome', 'Chrome', 'Microsoft Edge'].includes(value));
  const safeCores = key === 'hardwareConcurrency' && Number.isInteger(value) && value > 0 && value <= 256;
  return [key, {present, type: typeof value, ...(present ? {digest: digest(value), ...(safe || safeCores ? {value} : {})} : {})}];
}));
const unpack = result => {
  const raw = result?.fingerprint ?? result, value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  return value;
};
// Public local protocol structure only: no descriptions, command responses,
// credentials or browser-profile data are copied into this schema inventory.
const schemaShape = (entry, depth = 0) => {
  if (!entry || typeof entry !== 'object' || depth > 4) return null;
  const shape = {};
  for (const key of ['name', 'id', 'type', '$ref']) {
    if (typeof entry[key] === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(entry[key])) shape[key] = entry[key];
  }
  if (typeof entry.optional === 'boolean') shape.optional = entry.optional;
  for (const key of ['parameters', 'returns', 'properties']) {
    if (Array.isArray(entry[key])) shape[key] = entry[key].slice(0, 64).map(value => schemaShape(value, depth + 1));
  }
  if (entry.items) shape.items = schemaShape(entry.items, depth + 1);
  return shape;
};
const observations = new Map();
const report = {commit: process.env.GITHUB_SHA, run: process.env.GITHUB_RUN_ID,
  upstream: '5fa3b9d0bd218a948da15820b35fe598c362eba0', diagnosticOnly: true,
  productAcceptance: false, externalAccounts: false, cases: []};
const phases = new Set(['baseline', 'native-cpu-control', 'platform-only', 'selected-brand',
  'platform-delta', 'brand-delta', 'ua-marker-delta', 'platform-marker-delta', 'cdp-cpu-control',
  'cdp-ua-emulation-control', 'cdp-ua-network-control', 'cdp-ua-both-control']);
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://fixture.invalid'), phase = url.searchParams.get('phase');
  if (!phases.has(phase)) {res.writeHead(404); res.end(); return;}
  const row = observations.get(phase) || {}; observations.set(phase, row);
  if (url.pathname === '/probe') {
    row.requests = (row.requests || 0) + 1;
    if (row.requests === 1) {
      row.requestAt = Date.now(); row.requestHints = captureClientHintHeaders(req.headers);
      // Only the ephemeral CI browser's UA; never collect cookies or credentials.
      row.requestUserAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 512) : null;
    }
    const script = `const ua=navigator.userAgent,platform=navigator.platform,hardwareConcurrency=navigator.hardwareConcurrency;(${readBrowserPrivacySurfaces.toString()})().then(surfaces=>fetch(${JSON.stringify('/report?phase=' + phase)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ua,platform,hardwareConcurrency,surfaces})}));`;
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
    res.end('<!doctype html><meta charset="utf-8"><title>Native contract probe</title><script>' + script + '</script>');
    return;
  }
  if (url.pathname !== '/report' || req.method !== 'POST') {res.writeHead(404); res.end(); return;}
  let body = '';
  req.on('data', chunk => {body += chunk; if (body.length > 8192) req.destroy();});
  req.on('end', () => {
    try {
      const value = JSON.parse(body); row.reports = (row.reports || 0) + 1;
      if (row.reports === 1) {row.value = value; row.reportAt = Date.now();}
      res.end('ok');
    } catch {res.writeHead(400); res.end();}
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const exec = promisify(execFile);
let child, browser, page;
try {
  report.stage = 'hash-pinned-kernel';
  report.binarySha256 = await hashFile(binary);
  report.librarySha256 = await hashFile(path.join(path.dirname(binary), 'chrome.dll'));
  // Same normal first-run acceptance flag used by the pinned distribution.
  // No licence tokens, binary patches, account access or custom permissions.
  report.stage = 'normal-first-run-terms';
  await exec(binary, ['--accept-terms-and-conditions'], {windowsHide: true, timeout: 20000, maxBuffer: 65536});
  report.stage = 'launch-native-browser';
  child = spawn(binary, [`--user-data-dir=${root}`, '--remote-debugging-port=0', '--no-first-run',
    '--no-default-browser-check', '--disable-background-mode', '--disable-background-networking',
    '--disable-component-update', '--proxy-server=http://127.0.0.1:9',
    '--proxy-bypass-list=127.0.0.1;localhost', 'about:blank'], {windowsHide: true, stdio: 'ignore'});
  let spawnFailed = false; child.once('error', () => {spawnFailed = true;});
  let port, browserPath;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (spawnFailed || child.exitCode !== null) throw Error('Native browser exited before CDP readiness');
    try {
      const lines = (await fs.readFile(path.join(root, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/);
      port = Number(lines[0]); browserPath = lines[1];
      if (Number.isInteger(port) && port > 1023 && port < 65536 && /^\/devtools\/browser\/[A-Za-z0-9-]+$/.test(browserPath)) break;
    } catch {}
    await sleep(100);
  }
  assert.ok(Number.isInteger(port) && port > 1023 && port < 65536
    && /^\/devtools\/browser\/[A-Za-z0-9-]+$/.test(browserPath || ''), 'No bounded CDP readiness');
  report.stage = 'read-public-local-protocol';
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/protocol`, {signal: AbortSignal.timeout(5000), redirect: 'error'});
    assert.equal(response.status, 200);
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length; assert.ok(bytes <= 4 * 1024 * 1024, 'Protocol inventory exceeded bound'); chunks.push(chunk);
    }
    const protocol = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const domain = protocol.domains?.find(value => value.domain === 'Wayfern');
    report.protocolSchema = {status: 'observed', nativeDomainPresent: Boolean(domain),
      methods: (domain?.commands || []).filter(value => ['getFingerprint', 'setFingerprint'].includes(value.name)).map(value => schemaShape(value)),
      // A missing published schema does not imply the executable lacks a command.
      types: (domain?.types || []).filter(value => /fingerprint|device/i.test(value.id || '')).slice(0, 16).map(value => schemaShape(value))};
    // Documentation from the executable's public protocol, not runtime state.
    report.protocolParameterNotes = (domain?.commands?.find(value => value.name === 'setFingerprint')?.parameters || [])
      .filter(value => ['userAgent', 'platform', 'platformVersion', 'brand', 'brandVersion', 'hardwareConcurrency'].includes(value.name))
      .map(value => ({name: value.name, description: typeof value.description === 'string' ? value.description.slice(0, 2048) : null}));
  } catch {
    report.protocolSchema = {status: 'unavailable-not-a-capability-verdict'};
  }
  browser = await new cdp.PersistentConnection(`ws://127.0.0.1:${port}${browserPath}`).open(5000);
  const initial = (await cdp.tabs(port)).find(tab => tab.type === 'page' && tab.url === 'about:blank');
  assert.ok(initial?.webSocketDebuggerUrl);
  const endpoint = new URL(initial.webSocketDebuggerUrl);
  assert.equal(endpoint.hostname, '127.0.0.1'); assert.equal(Number(endpoint.port), port);
  page = await new cdp.PersistentConnection(initial.webSocketDebuggerUrl).open(5000);
  report.stage = 'read-original-native-device';
  const device = unpack(await page.command('Wayfern.getFingerprint', {}, {timeout: 5000}));
  report.originalFields = fields(device);
  const seedDigest = digest(device.canvasNoiseSeed ?? null);
  const waitObservation = async phase => {
    const limit = Date.now() + 15000;
    while (Date.now() < limit && !observations.get(phase)?.value) await sleep(50);
    assert.ok(observations.get(phase)?.value, phase + ': first-script report missing');
    return observations.get(phase);
  };
  report.stage = 'observe-unmodified-baseline';
  await page.command('Page.enable', {}, {timeout: 5000});
  await page.command('Page.navigate', {url: origin + '/probe?phase=baseline'}, {timeout: 5000});
  report.baseline = await waitObservation('baseline');
  for (const [phase, wanted, payloadMode = 'whole-device'] of [
    ['native-cpu-control', {hardwareConcurrency: device.hardwareConcurrency === 2 ? 4 : 2}],
    ['platform-only', {platformVersion: device.platformVersion === '15.0.0' ? '14.0.0' : '15.0.0'}],
    ['selected-brand', {brand: 'Google Chrome', brandVersion: '149.0.0.0', platformVersion: '15.0.0'}],
    ['platform-delta', {platformVersion: device.platformVersion === '15.0.0' ? '14.0.0' : '15.0.0'}, 'declared-optional-fields'],
    ['brand-delta', {brand: 'Google Chrome', brandVersion: '149.0.0.0', platformVersion: '15.0.0'}, 'declared-optional-fields'],
    // Obvious synthetic markers distinguish a working configurable UA/platform
    // from the UA-metadata fields; they are not intended to resemble a real user.
    ['ua-marker-delta', {userAgent: String(device.userAgent).slice(0, 320) + ' LYCO-Contract-Control/1.0'}, 'declared-optional-fields'],
    ['platform-marker-delta', {platform: 'LYCO-Contract-Control'}, 'declared-optional-fields'],
  ]) {
    const eligible = Object.fromEntries(Object.entries(wanted).filter(([key]) => Object.hasOwn(device, key)
      && (key === 'hardwareConcurrency' ? Number.isInteger(device[key]) && device[key] > 0 && device[key] <= 256 : typeof device[key] === 'string')));
    const record = {phase, payloadMode, changedKeys: Object.keys(eligible), omittedKeys: Object.keys(wanted).filter(key => !Object.hasOwn(eligible, key))};
    report.cases.push(record);
    if (!record.changedKeys.length) {record.status = 'no-supported-field-observed'; continue;}
    // Compare full-device restoration with the same API's optional scalar
    // parameters. Only disposable CI state is touched; seed changes are reported.
    const candidate = payloadMode === 'declared-optional-fields' ? eligible : {...device, ...eligible};
    report.stage = phase + ':apply-owned-temporary-device';
    try {
      const response = unpack(await page.command('Wayfern.setFingerprint', candidate, {timeout: 5000}));
      record.acknowledged = true; record.responseFields = fields(response);
    } catch {
      // A rejected capability is retained, never treated as protection.
      record.status = 'native-command-rejected'; continue;
    }
    // A same-session read separates ignored edits from new-target propagation.
    const samePage = unpack(await page.command('Wayfern.getFingerprint', {}, {timeout: 5000}));
    record.samePageFields = fields(samePage);
    record.samePageMatchesSettings = Object.fromEntries(Object.entries(eligible).map(([key, value]) => [key, samePage[key] === value]));
    report.stage = phase + ':observe-ordinary-new-target';
    const created = await browser.command('Target.createTarget', {url: origin + '/probe?phase=' + phase}, {timeout: 5000});
    assert.ok(created.targetId);
    record.first = await waitObservation(phase);
    const target = (await cdp.tabs(port)).find(tab => tab.id === created.targetId);
    assert.ok(target?.webSocketDebuggerUrl);
    const targetEndpoint = new URL(target.webSocketDebuggerUrl);
    assert.equal(targetEndpoint.protocol, 'ws:'); assert.equal(targetEndpoint.hostname, '127.0.0.1');
    assert.equal(Number(targetEndpoint.port), port); assert.equal(targetEndpoint.username, ''); assert.equal(targetEndpoint.password, '');
    const current = unpack(await cdp.call(target.webSocketDebuggerUrl, 'Wayfern.getFingerprint', {}, 5000));
    record.observedFields = fields(current);
    record.nativeFieldsMatchSettings = Object.fromEntries(Object.entries(eligible).map(([key, value]) => [key, current[key] === value]));
    if (Object.hasOwn(eligible, 'hardwareConcurrency')) record.firstScriptMatchesCpu = record.first.value.hardwareConcurrency === eligible.hardwareConcurrency;
    if (Object.hasOwn(eligible, 'userAgent')) {
      record.firstScriptMatchesUa = record.first.value.ua === eligible.userAgent;
      record.firstRequestMatchesUa = record.first.requestUserAgent === eligible.userAgent;
    }
    if (Object.hasOwn(eligible, 'platform')) record.firstScriptMatchesPlatform = record.first.value.platform === eligible.platform;
    record.seedUnchanged = digest(current.canvasNoiseSeed ?? null) === seedDigest;
    record.status = 'observed-not-product-acceptance';
    await browser.command('Target.closeTarget', {targetId: created.targetId}, {timeout: 5000});
  }
  // Independent UA-metadata controls on new about:blank targets. Apply each
  // documented standard method before that target's first fixture navigation.
  // This is not the production auto-attach path or a Wayfern setter verdict.
  // Synthetic markers are CI-only; no document/prototype/score is modified.
  report.stage = 'restore-original-before-independent-cdp-controls';
  await page.command('Wayfern.setFingerprint', device, {timeout: 5000});
  report.cdpUaControls = [];
  assert.equal(typeof device.userAgent, 'string', 'Original UA control input missing');
  assert.equal(typeof device.platform, 'string', 'Original platform control input missing');
  const wantedUa = String(device.userAgent).slice(0, 320) + ' LYCO-CDP-Contract-Control/1.0';
  const wantedMetadata = {
    brands: [{brand: 'Chromium', version: '149'}, {brand: 'LYCO Contract Control', version: '149'}],
    fullVersionList: [{brand: 'Chromium', version: '149.0.7827.114'},
      {brand: 'LYCO Contract Control', version: '149.0.0.0'}],
    platform: 'Windows', platformVersion: '15.0.0', architecture: 'x86',
    model: '', mobile: false, bitness: '64', wow64: false,
  };
  const sortedBrands = rows => Array.isArray(rows)
    ? rows.map(row => ({brand: row.brand, version: row.version})).sort((a, b) => a.brand.localeCompare(b.brand)) : null;
  for (const [phase, methods] of [
    ['cdp-ua-emulation-control', ['Emulation.setUserAgentOverride']],
    ['cdp-ua-network-control', ['Network.setUserAgentOverride']],
    ['cdp-ua-both-control', ['Emulation.setUserAgentOverride', 'Network.setUserAgentOverride']],
  ]) {
    const record = {phase, methods, appliedBeforeNavigation: false,
      syntheticMetadata: structuredClone(wantedMetadata), acknowledgedMethods: []};
    report.cdpUaControls.push(record);
    let targetId, control;
    report.stage = phase + ':prepare-new-blank-target';
    try {
      const created = await browser.command('Target.createTarget', {url: 'about:blank'}, {timeout: 5000});
      assert.ok(created.targetId); targetId = created.targetId;
      const target = (await cdp.tabs(port)).find(tab => tab.id === targetId && tab.url === 'about:blank');
      assert.ok(target?.webSocketDebuggerUrl);
      const endpoint = new URL(target.webSocketDebuggerUrl);
      assert.equal(endpoint.protocol, 'ws:'); assert.equal(endpoint.hostname, '127.0.0.1');
      assert.equal(Number(endpoint.port), port); assert.equal(endpoint.username, ''); assert.equal(endpoint.password, '');
      control = await new cdp.PersistentConnection(target.webSocketDebuggerUrl).open(5000);
      await control.command('Page.enable', {}, {timeout: 5000});
      await control.command('Network.enable', {}, {timeout: 5000});
      for (const method of methods) {
        await control.command(method, {userAgent: wantedUa, platform: String(device.platform),
          userAgentMetadata: structuredClone(wantedMetadata)}, {timeout: 5000});
        record.acknowledgedMethods.push(method);
      }
      record.appliedBeforeNavigation = true;
      report.stage = phase + ':observe-first-navigation';
      await control.command('Page.navigate', {url: origin + '/probe?phase=' + phase}, {timeout: 5000});
      record.first = await waitObservation(phase);
      assert.equal(record.first.requests, 1, 'Expected one first navigation request');
      assert.equal(record.first.reports, 1, 'Expected one first-script report');
      record.firstRequestMatchesUa = record.first.requestUserAgent === wantedUa;
      record.firstScriptMatchesUa = record.first.value.ua === wantedUa;
      const surface = record.first.value.surfaces;
      const low = surface?.first?.clientHints, high = surface?.highEntropy;
      record.firstScriptMatchesMetadata = {
        brands: low?.status === 'observed' && isDeepStrictEqual(sortedBrands(low.brands), sortedBrands(wantedMetadata.brands)),
        mobile: low?.status === 'observed' && low.mobile === wantedMetadata.mobile,
        platform: low?.status === 'observed' && low.platform === wantedMetadata.platform,
        platformVersion: high?.status === 'observed' && high.value?.platformVersion === wantedMetadata.platformVersion,
        fullVersionList: high?.status === 'observed'
          && isDeepStrictEqual(sortedBrands(high.value?.fullVersionList), sortedBrands(wantedMetadata.fullVersionList)),
      };
      try {
        record.firstRequestMatchesMetadata = isDeepStrictEqual(
          parseBrandHeader(record.first.requestHints?.['sec-ch-ua']), sortedBrands(wantedMetadata.brands))
          && record.first.requestHints['sec-ch-ua-mobile'] === '?0'
          && JSON.parse(record.first.requestHints['sec-ch-ua-platform'] || 'null') === wantedMetadata.platform;
      } catch { record.firstRequestMatchesMetadata = false; }
      try {
        assertClientHintConsistency(surface, record.first.requestHints, wantedUa, phase);
        record.requestAndFirstScriptConsistent = true;
      } catch { record.requestAndFirstScriptConsistent = false; }
      const current = unpack(await control.command('Wayfern.getFingerprint', {}, {timeout: 5000}));
      record.nativeFields = fields(current);
      record.seedObserved = Object.hasOwn(device, 'canvasNoiseSeed') && Object.hasOwn(current, 'canvasNoiseSeed');
      record.seedUnchanged = record.seedObserved ? digest(current.canvasNoiseSeed) === seedDigest : null;
      record.status = 'observed-not-native-setter-or-product-acceptance';
    } catch (error) {
      record.status = 'control-unavailable';
      record.errorReason = /timed?\s*out|timeout/i.test(String(error?.message || '')) ? 'timeout'
        : /not found|wasn't found|not supported/i.test(String(error?.message || '')) ? 'method-unavailable'
        : 'required-control-observation-unavailable';
    } finally {
      control?.close();
      if (targetId) await browser.command('Target.closeTarget', {targetId}, {timeout: 5000}).catch(() => {});
    }
  }
  // Independent CPU transport/fixture control on the owned original target.
  // Neither this nor the UA controls certify the native setter or product.
  report.stage = 'cdp-cpu-control';
  const wantedCores = report.baseline.value.hardwareConcurrency === 2 ? 4 : 2;
  report.transportControl = {method: 'Emulation.setHardwareConcurrencyOverride', wantedCores};
  try {
    await page.command('Emulation.setHardwareConcurrencyOverride', {hardwareConcurrency: wantedCores}, {timeout: 5000});
    report.transportControl.acknowledged = true;
    await page.command('Page.navigate', {url: origin + '/probe?phase=cdp-cpu-control'}, {timeout: 5000});
    report.transportControl.first = await waitObservation('cdp-cpu-control');
    report.transportControl.firstScriptMatchesCpu = report.transportControl.first.value.hardwareConcurrency === wantedCores;
    report.transportControl.status = 'observed-not-native-setter-or-product-acceptance';
  } catch {
    report.transportControl.status = 'control-unavailable';
  }
  report.status = 'observations-complete-not-a-privacy-pass';
  report.stage = 'observations-complete';
} catch (error) {
  report.status = 'probe-failed'; report.errorType = ['AssertionError', 'Error', 'TypeError'].includes(error?.name) ? error.name : 'other';
  report.errorReason = /timed?\s*out|timeout/i.test(String(error?.message || '')) ? 'timeout'
    : /not found|wasn't found|unknown method|not supported/i.test(String(error?.message || '')) ? 'method-unavailable'
    : /license|licence|authoriz|permission/i.test(String(error?.message || '')) ? 'authorization'
    : /assert|missing|No bounded/i.test(String(error?.message || '')) ? 'required-observation-missing' : 'other';
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(output, 'native-ua-contract.json'), JSON.stringify(report, null, 2));
  page?.close();
  if (browser) {await browser.command('Browser.close', {}, {timeout: 3000}).catch(() => {}); browser.close();}
  if (child && child.exitCode === null) await exec('taskkill', ['/PID', String(child.pid), '/T', '/F'],
    {windowsHide: true, timeout: 10000}).catch(() => {});
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  // Temporary profile is not uploaded; Actions discards its runner.
}
