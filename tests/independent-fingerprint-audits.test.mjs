import test from 'node:test';
import assert from 'node:assert/strict';
import {assertIndependentResult, assertSdkContinuity} from './independent-fingerprint-audits.mjs';

const expected = {language: 'en-GB', timezone: 'Asia/Tokyo', cores: 6, memory: 4};
test('SDK continuity requires all genuine scenarios and rejects cross-owner or reopened identity drift', () => {
  const runs = () => Object.fromEntries(['a-first', 'b-parallel', 'a-reopen'].map(phase => {
    const marker = phase === 'b-parallel' ? 'b' : 'a';
    return [phase, {suites: {sdk: {status: 'passed', raw: {
      fingerprintjs: {visitorId: marker.repeat(32)}, audio: {activeHash: marker.repeat(64)},
    }}}}];
  }));
  assert.deepEqual(assertSdkContinuity(runs()), {visitorAStable: true, visitorDistinct: true, audioAStable: true, audioDistinct: true});
  for (const alter of [value => value['b-parallel'].suites.sdk.status = 'failed',
    value => value['a-reopen'].suites.sdk.raw.fingerprintjs.visitorId = 'c'.repeat(32),
    value => value['b-parallel'].suites.sdk.raw.audio.activeHash = 'a'.repeat(64),
    value => delete value['a-first'].suites.sdk.raw.audio]) {
    const value = runs(); alter(value);
    assert.throws(() => assertSdkContinuity(value));
  }
});
const locale = () => ({score: 0, band: 'low', signals: [
  ['timezone', 'Asia/Tokyo'], ['language', 'en-GB, en'], ['fonts', 'none'],
  ['intlLocale', 'en-GB'], ['timezoneOffset', '-540'], ['emoji', 'Windows'],
].map(([id, value]) => ({id, value, contribution: '+0', verdict: 'low'}))});
const creep = () => ({fingerprint: {
  navigator: {hardwareConcurrency: 6, deviceMemory: 4, lied: false},
  workerScope: {hardwareConcurrency: 6, deviceMemory: 4, language: 'en-GB', timezoneLocation: 'Asia/Tokyo', lied: false},
  lies: {totalLies: 0}, fonts: {}, timezone: {}, canvas2d: {}, headless: {},
  clientRects: Object.fromEntries(['elementClientRects', 'elementBoundingClientRect', 'rangeClientRects', 'rangeBoundingClientRect']
    .map(key => [key, Array.from({length: 12}, () => ({x: 0, y: 0, left: 0, top: 0, width: 1, height: 1, right: 1, bottom: 1}))])),
  offlineAudioContext: {sampleSum: 1, noise: 0, binsSample: Array(100).fill(0.1), copySample: Array(100).fill(0.1)},
  capturedErrors: {data: []},
}});

test('missing detector data and suppressed signal errors cannot be called a pass', () => {
  for (const suite of ['locale', 'creepjs', 'sdk']) for (const value of [null, {}, {fingerprint: {}}]) {
    assert.throws(() => assertIndependentResult(suite, value, expected));
  }
  const value = locale(); value.signals[2].value = '—';
  assert.throws(() => assertIndependentResult('locale', value, expected), /detector failed/);
});

test('locale reporting keeps real weighted scores and rejects wrong-owner or unfinished results', () => {
  assert.doesNotThrow(() => assertIndependentResult('locale', locale(), expected));
  for (const alter of [value => value.signals.pop(), value => value.score = 1,
    value => value.band = 'high', value => value.signals[0].value = 'Europe/Paris',
    value => value.signals[0].verdict = undefined]) {
    const value = locale(); alter(value);
    assert.throws(() => assertIndependentResult('locale', value, expected));
  }
  const value = locale(); value.signals[2].contribution = '+20'; value.score = 20;
  assert.doesNotThrow(() => assertIndependentResult('locale', value, expected), 'Do not require a fabricated zero');
});

test('CreepJS contradictions and missing Worker surfaces remain failures', () => {
  assert.doesNotThrow(() => assertIndependentResult('creepjs', creep(), expected));
  const nativeWorker = creep(); nativeWorker.fingerprint.workerScope.lied = 0;
  assert.doesNotThrow(() => assertIndependentResult('creepjs', nativeWorker, expected));
  for (const alter of [value => delete value.fingerprint.workerScope, value => value.fingerprint.lies.totalLies = 1,
    value => value.fingerprint.workerScope.hardwareConcurrency = 8, value => value.fingerprint.navigator.lied = true,
    value => value.fingerprint.workerScope.timezoneLocation = 'Europe/Paris',
    value => delete value.fingerprint.workerScope.lied,
    value => value.fingerprint.clientRects.elementClientRects = [],
    value => value.fingerprint.offlineAudioContext.noise = 0.001,
    value => value.fingerprint.offlineAudioContext.copySample[0] = 0.2,
    value => value.fingerprint.capturedErrors.data.push('failed')]) {
    const value = creep(); alter(value);
    assert.throws(() => assertIndependentResult('creepjs', value, expected));
  }
});

test('SDKs must actually collect critical components and cannot suppress a bot verdict', () => {
  const sdk = () => ({fingerprintjs: {visitorId: 'a'.repeat(32), version: '5.3.0', confidence: {score: 0.6},
    components: Object.fromEntries(Object.entries({canvas: {}, fonts: [], languages: [['en-GB']],
      timezone: 'Asia/Tokyo', hardwareConcurrency: 6, deviceMemory: 4}).map(([key, value]) => [key, {value}]))},
  botd: {detection: {bot: false}, components: {webdriver: {value: false}}, detections: {webdriver: {bot: false}}},
  audio: {leadSilent: true, tailSilent: true, signalPresent: true, copiesMatch: true, activeHash: 'a'.repeat(64)}});
  assert.doesNotThrow(() => assertIndependentResult('sdk', sdk(), expected));
  for (const alter of [value => value.botd.detection.bot = true, value => value.botd.components = {},
    value => delete value.fingerprintjs.components.canvas, value => value.fingerprintjs.components.fonts.error = {message: 'failed'},
    value => value.fingerprintjs.visitorId = '', value => value.fingerprintjs.components.hardwareConcurrency.value = 8,
    value => value.audio.leadSilent = false, value => value.audio.tailSilent = false,
    value => value.audio.signalPresent = false, value => value.audio.copiesMatch = false]) {
    const value = sdk(); alter(value);
    assert.throws(() => assertIndependentResult('sdk', value, expected));
  }
});
