import test from 'node:test';
import assert from 'node:assert/strict';
import {assertCanvasOwnership} from './canvas-ownership-contract.mjs';

function samples() {
  const initial = {shapePixels: '11111111', opaquePixels: '22222222',
    offscreenPixels: '33333333', offscreenOpaquePixels: '44444444'};
  const native = {...initial, offscreenPixels: '55555555', offscreenOpaquePixels: '66666666'};
  const worker = {...initial, shapePixels: initial.offscreenPixels, opaquePixels: initial.offscreenOpaquePixels};
  return {initial, native, workers: {windowStart: {...initial}, windowNow: {...initial},
    dedicated: {...worker}, service: {...worker}}};
}
const check = fixture => assertCanvasOwnership(fixture.initial, fixture.workers, fixture.native, 'A');

test('matched APIs pass even when native HTML and managed Offscreen differ', () => {
  assert.doesNotThrow(() => check(samples()));
});

test('a wrong-owner DedicatedWorker or ServiceWorker must still fail', () => {
  for (const realm of ['dedicated', 'service']) {
    const f = samples();
    f.workers[realm] = {...f.workers[realm], shapePixels: 'bbbbbbbb', offscreenPixels: 'bbbbbbbb'};
    assert.throws(() => check(f), /crossed owners/);
  }
});

test('opaque data catches ownership errors even if the other drawing matches', () => {
  const f = samples(); f.workers.service.offscreenOpaquePixels = 'bbbbbbbb';
  assert.throws(() => check(f), /opaque OffscreenCanvas crossed owners/);
});

test('HTML must match its actual native control and remain stable', () => {
  const f = samples(); f.native.shapePixels = 'bbbbbbbb';
  assert.throws(() => check(f), /native control/);
  const g = samples(); g.workers.windowNow.opaquePixels = 'bbbbbbbb';
  assert.throws(() => check(g), /opaque primary/);
});

test('disabling Offscreen noise or omitting native control cannot pass', () => {
  const f = samples(); f.initial.offscreenPixels = f.native.offscreenPixels;
  assert.throws(() => check(f), /noise is absent/);
  const g = samples(); delete g.native.offscreenPixels;
  assert.throws(() => check(g), /missing native control/);
});

test('the contract does not require the two product APIs to be different', () => {
  const f = samples();
  f.initial.shapePixels = f.initial.offscreenPixels; f.native.shapePixels = f.initial.shapePixels;
  f.initial.opaquePixels = f.initial.offscreenOpaquePixels; f.native.opaquePixels = f.initial.opaquePixels;
  f.workers.windowStart = {...f.initial}; f.workers.windowNow = {...f.initial};
  assert.doesNotThrow(() => check(f));
});
