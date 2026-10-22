'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {noisyRectGeometry} = require('../src/rect-geometry');

test('empty and unrepresentable geometry retains its native values', () => {
  for (const rect of [{x: 0, y: 0, width: 0, height: 0}, {x: 123.5, y: -9.25, width: 0, height: 0},
    {x: Infinity, y: 0, width: 10, height: 10}]) {
    assert.equal(noisyRectGeometry(rect, 0.0003, -0.0002), rect);
  }
});

test('rendered geometry keeps stable per-profile perturbation without changing the input', () => {
  const rect = Object.freeze({x: -10.25, y: 31.125, width: 300.5, height: 20.75});
  const a = noisyRectGeometry(rect, 0.0003, -0.0002);
  assert.deepEqual(a, noisyRectGeometry(rect, 0.0003, -0.0002));
  assert.notDeepEqual(a, noisyRectGeometry(rect, -0.0001, 0.0004));
  assert.notEqual(a.x, rect.x); assert.notEqual(a.width, rect.width);
  assert.equal(rect.x, -10.25); assert.equal(rect.width, 300.5);
});

test('subpixel, negative-position and scaled boxes maintain exact edge-size identities', () => {
  let state = 123456789;
  const random = () => {state = (1664525 * state + 1013904223) >>> 0; return state / 2 ** 32;};
  for (let i = 0; i < 5000; i++) {
    const rect = {x: (random() - 0.5) * 2 ** (i % 33), y: (random() - 0.5) * 2 ** (i % 29),
      width: random() * 2 ** ((i % 38) - 12), height: random() * 2 ** ((i % 34) - 10)};
    const value = noisyRectGeometry(rect, ((i % 97) - 48) * 0.00001, ((i % 89) - 44) * 0.00001);
    assert.equal((value.x + value.width) - value.x, value.width, 'horizontal bounds at case ' + i);
    assert.equal((value.y + value.height) - value.y, value.height, 'vertical bounds at case ' + i);
    assert.ok(value.width >= 0 && value.height >= 0);
  }
});
