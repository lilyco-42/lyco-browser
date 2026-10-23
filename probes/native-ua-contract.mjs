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
import {readBrowserPrivacySurfaces, captureClientHintHeaders} from '../tests/browser-privacy-surfaces.mjs';

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
const observations = new Map();
const report = {commit: process.env.GITHUB_SHA, run: process.env.GITHUB_RUN_ID,
  upstream: '5fa3b9d0bd218a948da15820b35fe598c362eba0', diagnosticOnly: true,
  productAcceptance: false, externalAccounts: false, cases: []};
const phases = new Set(['baseline', 'native-cpu-control', 'platform-only', 'selected-brand', 'cdp-cpu-control']);
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://fixture.invalid'), phase = url.searchParams.get('phase');
  if (!phases.has(phase)) {res.writeHead(404); res.end(); return;}
  const row = observations.get(phase) || {}; observations.set(phase, row);
  if (url.pathname === '/probe') {
    row.requests = (row.requests || 0) + 1;
    if (row.requests === 1) {row.requestAt = Date.now(); row.requestHints = captureClientHintHeaders(req.headers);}
    const script = `const ua=navigator.userAgent,hardwareConcurrency=navigator.hardwareConcurrency;(${readBrowserPrivacySurfaces.toString()})().then(surfaces=>fetch(${JSON.stringify('/report?phase=' + phase)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ua,hardwareConcurrency,surfaces})}));`;
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
  for (const [phase, wanted] of [
    ['native-cpu-control', {hardwareConcurrency: device.hardwareConcurrency === 2 ? 4 : 2}],
    ['platform-only', {platformVersion: device.platformVersion === '15.0.0' ? '14.0.0' : '15.0.0'}],
    ['selected-brand', {brand: 'Google Chrome', brandVersion: '149.0.0.0', platformVersion: '15.0.0'}],
  ]) {
    const eligible = Object.fromEntries(Object.entries(wanted).filter(([key]) => Object.hasOwn(device, key)
      && (key === 'hardwareConcurrency' ? Number.isInteger(device[key]) && device[key] > 0 && device[key] <= 256 : typeof device[key] === 'string')));
    const record = {phase, changedKeys: Object.keys(eligible), omittedKeys: Object.keys(wanted).filter(key => !Object.hasOwn(eligible, key))};
    report.cases.push(record);
    if (!record.changedKeys.length) {record.status = 'no-supported-field-observed'; continue;}
    const candidate = {...device, ...eligible};
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
    record.seedUnchanged = digest(current.canvasNoiseSeed ?? null) === seedDigest;
    record.status = 'observed-not-product-acceptance';
    await browser.command('Target.closeTarget', {targetId: created.targetId}, {timeout: 5000});
  }
  // Independent transport/fixture control. This deliberately uses standard CDP
  // only for CPU on the owned original target, never for UA or product settings.
  // Success does not prove Wayfern.setFingerprint supports any edited field.
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
