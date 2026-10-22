import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertWebglIdentity} from './browser-webgl-identity.mjs';

const sample = () => Object.fromEntries(['webgl', 'webgl2'].map(api => [api,
  {available: true, debugInfoAvailable: true, vendor: 'Vendor A', renderer: 'GPU A'}]));

test('requires real complete GPU observations and preserves each API identity', () => {
  assert.doesNotThrow(() => assertWebglIdentity(sample(), sample(), 'unchanged'));
  for (const api of ['webgl', 'webgl2']) {
    for (const field of ['vendor', 'renderer']) {
      const changed = sample(); changed[api][field] = 'different';
      assert.throws(() => assertWebglIdentity(changed, sample(), 'changed'), /identity changed/);
    }
    for (const incomplete of [{available: false}, {...sample()[api], debugInfoAvailable: false},
      {...sample()[api], renderer: null}]) {
      const value = sample(); value[api] = incomplete;
      assert.throws(() => assertWebglIdentity(value, null, 'incomplete'));
    }
  }
});
