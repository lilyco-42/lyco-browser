import test from 'node:test';
import assert from 'node:assert/strict';
import {hostFontControlFamily, assertHostFontLayout, assertFontControlIsolation} from './browser-font-control.mjs';

const baseline = () => ({family: hostFontControlFamily,
  canvas: {fallback: [12, 13, 14], requested: [15, 13, 16]},
  dom: {fallback: [12, 13, 14], requested: [15, 13, 16]}, face: {api: true, local: 'loaded'}});
const blocked = () => ({family: hostFontControlFamily,
  canvas: {fallback: [12, 13, 14], requested: [12, 13, 14]},
  dom: {fallback: [12, 13, 14], requested: [12, 13, 14]}, face: {api: true, local: 'rejected'}});
const host = () => ({positive: true, layout: baseline()});

test('font isolation cannot pass without a real host Canvas, DOM and FontFace positive control', () => {
  assert.doesNotThrow(() => assertHostFontLayout(baseline()));
  for (const field of ['canvas', 'dom']) {
    const missing = baseline(); missing[field].requested = [...missing[field].fallback];
    assert.throws(() => assertHostFontLayout(missing), /did not see/);
    assert.throws(() => assertFontControlIsolation(blocked(), {positive: true, layout: missing}, 'page'));
  }
  for (const control of [null, {}, {positive: true}]) assert.throws(() => assertFontControlIsolation(blocked(), control, 'page'));
});

test('each independent exposure surface fails even when the other surfaces are blocked', () => {
  assert.doesNotThrow(() => assertFontControlIsolation(blocked(), host(), 'page'));
  for (const field of ['canvas', 'dom']) {
    const leak = blocked(); leak[field].requested[0]++;
    assert.throws(() => assertFontControlIsolation(leak, host(), field), /leaked/);
  }
  for (const local of ['loaded', 'timeout', 'error', 'absent']) {
    const leak = blocked(); leak.face.local = local;
    assert.throws(() => assertFontControlIsolation(leak, host(), local), /exposed or unreadable/);
  }
  const invalid = blocked(); invalid.canvas.requested[0] = NaN;
  assert.throws(() => assertFontControlIsolation(invalid, host(), 'invalid'), /metrics/);
});

test('worker absence of a DOM or FontFace API stays explicit and never permits a positive load', () => {
  const worker = blocked(); worker.dom = null;
  assert.throws(() => assertFontControlIsolation(worker, host(), 'page'), /metrics/);
  assert.doesNotThrow(() => assertFontControlIsolation(worker, host(), 'worker', {requireDom: false}));
  worker.face = {api: false, local: 'absent'};
  assert.doesNotThrow(() => assertFontControlIsolation(worker, host(), 'worker', {requireDom: false}));
  worker.face.local = 'loaded';
  assert.throws(() => assertFontControlIsolation(worker, host(), 'worker', {requireDom: false}));
});
