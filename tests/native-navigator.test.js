'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {nativeGetterMatches} = require('../src/native-navigator');

function realm(value) {
  return vm.runInNewContext(`(() => {
    const branded = new WeakSet();
    class Navigator {}
    const navigator = new Navigator(); branded.add(navigator);
    Object.defineProperty(Navigator.prototype, 'userAgent', {enumerable: true, configurable: true,
      get() {if (!branded.has(this)) throw new TypeError('Illegal invocation'); return ${JSON.stringify(value)};}});
    return {prototype: Navigator.prototype, navigator};
  })()`);
}

test('native receiver check preserves the real getter, descriptor and illegal-invocation behavior', () => {
  const own = realm('configured UA');
  const before = Object.getOwnPropertyDescriptor(own.prototype, 'userAgent');
  assert.throws(() => before.get.call(own.prototype), /Illegal invocation/);
  assert.equal(nativeGetterMatches(own.prototype, 'userAgent', own.navigator, 'configured UA'), true);
  assert.deepEqual(Object.getOwnPropertyDescriptor(own.prototype, 'userAgent'), before);
  assert.throws(() => before.get.call(own.prototype), /Illegal invocation/);
  assert.equal(nativeGetterMatches(own.prototype, 'userAgent', own.navigator, 'different UA'), false,
    'Keep the existing configured-value fallback when native values really differ');
});

test('cross-realm checks must use the navigator belonging to that prototype', () => {
  const a = realm('A'), b = realm('B');
  assert.equal(nativeGetterMatches(a.prototype, 'userAgent', a.navigator, 'A'), true);
  assert.equal(nativeGetterMatches(b.prototype, 'userAgent', b.navigator, 'B'), true);
  assert.equal(nativeGetterMatches(b.prototype, 'userAgent', a.navigator, 'B'), false);
  assert.equal(nativeGetterMatches(a.prototype, 'userAgent', a.prototype, 'A'), false);
  assert.equal(nativeGetterMatches(a.prototype, 'missing', a.navigator, undefined), false);
  assert.equal(nativeGetterMatches(null, 'userAgent', a.navigator, 'A'), false);
});
