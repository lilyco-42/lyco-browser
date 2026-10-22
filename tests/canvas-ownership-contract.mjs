import assert from 'node:assert/strict';

// Validate the actual API used by each realm. A Worker has OffscreenCanvas,
// not HTMLCanvasElement. HTML/native parity across APIs is a separate measured
// compatibility property, never proof that a Worker belongs to another owner.
export function assertCanvasOwnership(initial, workers, native, label) {
  const fields = ['shapePixels', 'opaquePixels', 'offscreenPixels', 'offscreenOpaquePixels'];
  for (const field of fields) {
    assert.match(initial?.[field] || '', /^[0-9a-f]{8}$/, label + ': missing initial ' + field);
    assert.match(native?.[field] || '', /^[0-9a-f]{8}$/, label + ': missing native control ' + field);
  }
  assert.equal(initial.shapePixels, native.shapePixels, label + ': HTML differs from its own native control');
  assert.equal(initial.opaquePixels, native.opaquePixels, label + ': opaque HTML differs from its own native control');
  // The supported149 provider keeps native HTML noise and managed Offscreen
  // noise. Do not pass the ownership gate by removing the latter protection.
  assert.notEqual(initial.offscreenPixels, native.offscreenPixels, label + ': Offscreen noise is absent');
  assert.notEqual(initial.offscreenOpaquePixels, native.offscreenOpaquePixels, label + ': opaque Offscreen noise is absent');
  for (const realm of ['windowStart', 'windowNow', 'dedicated', 'service']) {
    const value = workers?.[realm];
    assert.ok(value, label + ': missing ' + realm);
    const isWindow = realm === 'windowStart' || realm === 'windowNow';
    assert.equal(value.shapePixels, isWindow ? initial.shapePixels : initial.offscreenPixels,
      label + ': ' + realm + ' primary canvas crossed owners or APIs');
    assert.equal(value.opaquePixels, isWindow ? initial.opaquePixels : initial.offscreenOpaquePixels,
      label + ': ' + realm + ' opaque primary canvas crossed owners or APIs');
    assert.equal(value.offscreenPixels, initial.offscreenPixels, label + ': ' + realm + ' OffscreenCanvas crossed owners');
    assert.equal(value.offscreenOpaquePixels, initial.offscreenOpaquePixels, label + ': ' + realm + ' opaque OffscreenCanvas crossed owners');
  }
}
