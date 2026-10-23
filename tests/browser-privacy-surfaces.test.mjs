import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readBrowserPrivacySurfaces, captureClientHintHeaders, parseBrandHeader,
  assertClientHintConsistency} from './browser-privacy-surfaces.mjs';

const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/149.0.0.0 Safari/537.36';
const low = [{brand: 'Chromium', version: '149'}, {brand: 'Not/A)Brand', version: '8'}];
const high = {architecture: 'x86', bitness: '64', model: '', platformVersion: '19.0.0', wow64: false,
  fullVersionList: [{brand: 'Chromium', version: '149.0.7827.0'}, {brand: 'Not/A)Brand', version: '8.0.0.0'}]};
const headers = {'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="149"',
  'sec-ch-ua-platform': '"Windows"', 'sec-ch-ua-mobile': '?0'};
const sample = () => ({schema: 1, first: {secureContext: true, webdriver: false,
  clientHints: {status: 'observed', brands: structuredClone(low), mobile: false, platform: 'Windows'}},
  highEntropy: {status: 'observed', value: structuredClone(high)}, webgpu: {status: 'unsupported'}});

test('real Client Hint headers agree semantically with the first script and survive a restart', () => {
  const before = sample();
  const snapshot = assertClientHintConsistency(before, headers, ua, 'first');
  assert.deepEqual(assertClientHintConsistency(sample(), headers, ua, 'restart', snapshot), snapshot);
  assert.deepEqual(before, sample(), 'Validator must not rewrite observations');
  assert.deepEqual(captureClientHintHeaders({...headers, authorization: 'do-not-copy', cookie: 'private'}), headers);
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
  const navigator = {webdriver: false, userAgentData: {brands: low, mobile: false, platform: 'Windows',
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
  assert.deepEqual(Object.getOwnPropertyDescriptors(navigator), descriptors);
  assertClientHintConsistency(result, headers, ua, 'collected');
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
