'use strict';

// Self-contained: apply.js serializes this into the upstream document script.
// A Navigator prototype is not a valid receiver for its Web IDL getters. Read
// the original getter with the actual navigator from that same window/worker,
// so matching native values keep their descriptors and brand checks intact.
function nativeGetterMatches(prototype, key, receiver, expected) {
  if (!prototype || !receiver) return false;
  try {
    for (let cursor = prototype; cursor; cursor = Object.getPrototypeOf(cursor)) {
      const descriptor = Object.getOwnPropertyDescriptor(cursor, key);
      if (descriptor) {
        return typeof descriptor.get === 'function'
          && Reflect.apply(descriptor.get, receiver, []) === expected;
      }
    }
  } catch (_) {}
  return false;
}

module.exports = {nativeGetterMatches};
