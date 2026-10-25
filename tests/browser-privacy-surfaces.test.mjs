import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {createBrowserProfileFixture} from './browser-profile-fixture.mjs';
import {readBrowserPrivacySurfaces, captureClientHintHeaders, parseBrandHeader, describeNativeUserAgentFields,
  assertClientHintConsistency} from './browser-privacy-surfaces.mjs';

const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/149.0.0.0 Safari/537.36';
const low = [{brand: 'Chromium', version: '149'}, {brand: 'Not/A)Brand', version: '8'}];
const high = {architecture: 'x86', bitness: '64', model: '', platformVersion: '19.0.0', wow64: false,
  fullVersionList: [{brand: 'Chromium', version: '149.0.7827.0'}, {brand: 'Not/A)Brand', version: '8.0.0.0'}]};
const headers = {'user-agent': ua, 'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="149"',
  'sec-ch-ua-platform': '"Windows"', 'sec-ch-ua-mobile': '?0'};
const sample = () => ({schema: 1, first: {secureContext: true, webdriver: false, userAgent: ua,
  clientHints: {status: 'observed', brands: structuredClone(low), mobile: false, platform: 'Windows'}},
  highEntropy: {status: 'observed', value: structuredClone(high)}, webgpu: {status: 'unsupported'}});

test('real Client Hint headers agree semantically with the first script and survive a restart', () => {
  const before = sample();
  const snapshot = assertClientHintConsistency(before, headers, ua, 'first');
  assert.deepEqual(assertClientHintConsistency(sample(), headers, ua, 'restart', snapshot), snapshot);
  assert.deepEqual(before, sample(), 'Validator must not rewrite observations');
  assert.deepEqual(captureClientHintHeaders({...headers, authorization: 'do-not-copy', cookie: 'private'}), headers);
});

test('matching Client Hints cannot hide a missing or contradictory first HTTP User-Agent', () => {
  const wrong = {...headers, 'user-agent': ua.replace('149.0.0.0', '148.0.0.0')};
  assert.throws(() => assertClientHintConsistency(sample(), wrong, ua, 'wrong-ua'), /first HTTP User-Agent/);
  const missing = {...headers};delete missing['user-agent'];
  assert.throws(() => assertClientHintConsistency(sample(), missing, ua, 'missing-ua'), /first HTTP User-Agent/);
  const wrongScript = sample();wrongScript.first.userAgent = wrong['user-agent'];
  assert.throws(() => assertClientHintConsistency(wrongScript, headers, ua, 'wrong-script'), /first script User-Agent/);
  const missingScript = sample();delete missingScript.first.userAgent;
  assert.throws(() => assertClientHintConsistency(missingScript, headers, ua, 'missing-script'), /first script User-Agent/);
  assert.equal(wrong['user-agent'].includes('148.0.0.0'), true, 'A mismatch must remain unmodified');
});

test('missing, contradictory and incomplete surfaces cannot masquerade as passed observations', () => {
  for (const mutate of [
    value => {value.first.clientHints.status = 'unsupported';},
    value => {value.highEntropy.status = 'timeout';},
    value => {value.highEntropy.value.fullVersionList[0].version = '155.0.0.0';},
    value => {value.first.clientHints.platform = 'Linux';},
    value => {value.webgpu = null;},
  ]) {
    const value = sample(); mutate(value);
    assert.throws(() => assertClientHintConsistency(value, headers, ua, 'bad'));
  }
  assert.throws(() => assertClientHintConsistency(sample(), {...headers, 'sec-ch-ua-mobile': '?1'}, ua, 'bad-header'));
  const changed = sample(); changed.highEntropy.value.platformVersion = '20.0.0';
  assert.throws(() => assertClientHintConsistency(changed, headers, ua, 'changed',
    assertClientHintConsistency(sample(), headers, ua, 'first')));
  for (const bad of ['', 'unquoted;v="149"', '"Chromium";v="149" trailing', '"Chromium";v="x"'])
    assert.throws(() => parseBrandHeader(bad));
});

test('collector is standalone, bounded and read-only and records real adapter metadata', async () => {
  let calls = 0;
  const navigator = {webdriver: false, userAgent: ua, userAgentData: {brands: low, mobile: false, platform: 'Windows',
    async getHighEntropyValues() {return high;}}, gpu: {async requestAdapter() {
    calls++; return {info: {vendor: 'intel', architecture: 'xe', device: 'unit-device', description: 'CI adapter'}};
  }}};
  const descriptors = Object.getOwnPropertyDescriptors(navigator);
  const result = JSON.parse(JSON.stringify(await vm.runInNewContext('(' + readBrowserPrivacySurfaces.toString() + ')()',
    {navigator, isSecureContext: true, setTimeout, clearTimeout})));
  assert.equal(calls, 1);
  assert.equal(result.webgpu.status, 'observed');
  assert.equal(result.webgpu.value.vendor, 'intel');
  assert.deepEqual(result.highEntropy.value, high);
  assert.equal(typeof result.first.observedAt, 'number');
  assert.equal(result.first.clientHintShape.interfaceAvailable, false);
  assert.equal(result.first.clientHintShape.navigatorOwn, true);
  assert.deepEqual(Object.getOwnPropertyDescriptors(navigator), descriptors);
  assertClientHintConsistency(result, headers, ua, 'collected');
});

test('native UA inventory exports only allowed field names, types and hashes without payloads', () => {
  const secret = 'CI_PRIVATE_NATIVE_UA';
  const source = {userAgent: secret, userAgentMetadata: {nested: secret}, platformVersion: '12.0.0',
    token: secret, unknownCredentials: {password: secret}};
  const before = structuredClone(source);
  const rows = describeNativeUserAgentFields(source, {userAgent: secret, platformVersion: '15.0.0'});
  assert.equal(rows.find(row => row.key === 'userAgent').matchesDeclared, true);
  assert.equal(rows.find(row => row.key === 'platformVersion').matchesDeclared, false);
  assert.deepEqual(rows.find(row => row.key === 'brands'), {key: 'brands', present: false});
  assert.match(rows.find(row => row.key === 'userAgentMetadata').digest, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(rows), /CI_PRIVATE_NATIVE_UA|unknownCredentials|password|token|nested/);
  assert.deepEqual(source, before);
  assert.ok(describeNativeUserAgentFields(null).every(row => row.present === false));
});

test('interface shape observation preserves prototype getters and a native-style UA data instance', async () => {
  class NavigatorUAData {
    get brands() {return low;}
    get mobile() {return false;}
    get platform() {return 'Windows';}
    async getHighEntropyValues() {return high;}
  }
  const data = new NavigatorUAData(), navPrototype = {get userAgentData() {return data;}};
  const navigator = Object.create(navPrototype);
  const before = Object.getOwnPropertyDescriptors(NavigatorUAData.prototype);
  const result = JSON.parse(JSON.stringify(await vm.runInNewContext('(' + readBrowserPrivacySurfaces.toString() + ')()',
    {navigator, NavigatorUAData, isSecureContext: true, setTimeout, clearTimeout})));
  assert.deepEqual(result.first.clientHintShape, {status: 'observed', interfaceAvailable: true, navigatorOwn: false,
    navigatorPrototypeGetter: true, objectPrototypeMatches: true, brandsOwn: false,
    brandsPrototypeGetter: true, brandsPrototypeConfigurable: true});
  assert.deepEqual(Object.getOwnPropertyDescriptors(NavigatorUAData.prototype), before);
  assert.equal(Object.getPrototypeOf(navigator), navPrototype);
  assert.equal(navigator.userAgentData, data);
});

test('later requests and reports cannot overwrite a profile or parser frame first observation', () => {
  const fixture = createBrowserProfileFixture();
  const send = (url, method, hintHeaders, value, proxied) => {
    const req = new EventEmitter();
    Object.assign(req, {url, method, headers: {host: '127.0.0.1:19876', ...hintHeaders}, destroy() {}});
    const res = {writeHead() {}, end() {}};
    assert.equal(fixture.route(req, res, proxied), true);
    if (method === 'POST') {req.emit('data', JSON.stringify(value)); req.emit('end');}
  };
  for (const [url, reportUrl, read] of [
    ['/profile-probe?phase=a-first', '/profile-report?phase=a-first', () => fixture.result('a-first')],
    ['/profile-frame?phase=a-first-new-tab&realm=same', '/profile-frame-report?phase=a-first-new-tab&realm=same',
      () => fixture.frameResult('a-first-new-tab', 'same')],
  ]) {
    send(url, 'GET', headers, null, false);
    const requestTime = read().requestObservedAt;
    send(url, 'GET', {'sec-ch-ua': 'later'}, null, true);
    send(reportUrl, 'POST', headers, {marker: 'first'}, false);
    const reportTime = read().reportObservedAt;
    send(reportUrl, 'POST', {'sec-ch-ua': 'later'}, {marker: 'later'}, true);
    const entry = read();
    assert.equal(entry.requestCount, 2); assert.equal(entry.reportCount, 2);
    assert.equal(entry.requestObservedAt, requestTime); assert.equal(entry.reportObservedAt, reportTime);
    assert.deepEqual(entry.requestClientHints, headers); assert.deepEqual(entry.reportClientHints, headers);
    assert.equal(entry.pageProxied, false); assert.equal(entry.reportProxied, false);
    assert.deepEqual(entry.value, {marker: 'first'});
  }
});

test('unavailable and timed-out adapters remain distinct and never become safe-network verdicts', async () => {
  const collect = navigator => vm.runInNewContext('(' + readBrowserPrivacySurfaces.toString() + ')()',
    {navigator, isSecureContext: true, setTimeout, clearTimeout});
  const absent = await collect({});
  assert.equal(absent.webgpu.status, 'unsupported');
  assert.equal(absent.highEntropy.status, 'unsupported');
  const unavailable = await collect({gpu: {async requestAdapter() {return null;}}});
  assert.equal(unavailable.webgpu.status, 'observed');
  assert.equal(unavailable.webgpu.value.adapterAvailable, false);
  const denied = await collect({gpu: {async requestAdapter() {
    throw Object.assign(new Error('private detail'), {name: 'NotAllowedError'});
  }}});
  assert.equal(denied.webgpu.status, 'error');
  assert.equal(denied.webgpu.error, 'NotAllowedError');
  assert.doesNotMatch(JSON.stringify(denied), /private detail/);
  const stalled = await collect({gpu: {requestAdapter() {return new Promise(() => {});}}});
  assert.equal(stalled.webgpu.status, 'timeout');
  assert.equal(stalled.webgpu.value, undefined);
});
