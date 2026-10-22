'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {SDK_REVISION, parseAppearance, createDesktopAppearance} = require('../src/desktop-appearance');
const payload = () => ({schema: 1, sdk: 'UniDesktop/SDK', revision: SDK_REVISION, platform: 'windows',
  theme: 'dark', accent: [17, 128, 234, 255], capabilities: {detectTheme: true, readAccent: true}});

test('rejects malformed, incompatible and contradictory native capability output', () => {
  for (const modify of [v => v.schema = 2, v => v.revision = 'wrong', v => v.theme = 'system',
    v => v.accent = [0, -1, 2, 255], v => v.accent = [1, 2, 3], v => v.accent = 'red',
    v => v.capabilities.detectTheme = false, v => v.capabilities.readAccent = false]) {
    const value = payload(); modify(value); assert.throws(() => parseAppearance(JSON.stringify(value)));
  }
  for (const invalid of ['null', '{}', 'broken', ' '.repeat(4097)]) assert.throws(() => parseAppearance(invalid));
  const partial = payload(); partial.theme = null; partial.accent = null;
  assert.equal(parseAppearance(JSON.stringify(partial)).theme, null);
  assert.deepEqual(parseAppearance(JSON.stringify(payload())).accent, [17, 128, 234, 255]);
});

test('fixed executable, no shell or user arguments, bounded lifetime and no credential environment', async () => {
  const secretKey = 'LYCO_DESKTOP_TEST_TOKEN'; process.env[secretKey] = 'must-not-inherit';
  try {
    const read = createDesktopAppearance({directory: '/packaged/lyco', platform: 'win32', run: async (file, args, options) => {
      assert.equal(file, path.join('/packaged/lyco', 'desktop', 'lyco-desktop-probe.exe'));
      assert.deepEqual(args, []); assert.equal(options.shell, false); assert.equal(options.windowsHide, true);
      assert.equal(options.timeout, 3000); assert.equal(options.maxBuffer, 4096);
      assert.equal(options.env[secretKey], undefined);
      return {stdout: JSON.stringify(payload())};
    }});
    assert.equal((await read({command: 'shutdown', path: '/untrusted'})).state, 'ready');
  } finally {delete process.env[secretKey];}
});

test('coalesces concurrent calls and caches for five seconds without suppressing later changes', async () => {
  let calls = 0, time = 100, complete;
  const read = createDesktopAppearance({directory: '/app', platform: 'win32', now: () => time,
    run: async () => {calls++; await new Promise(resolve => complete = resolve); return {stdout: JSON.stringify(payload())};}});
  const first = read(), second = read(); assert.equal(calls, 1); complete();
  assert.deepEqual(await first, await second); await read(); assert.equal(calls, 1);
  time += 5000; const next = read(); assert.equal(calls, 2); complete(); await next;
});

test('missing, timed out and unsupported backends remain explicit and do not invent an OS theme', async () => {
  for (const code of ['ENOENT', 'ETIMEDOUT']) {
    const read = createDesktopAppearance({directory: '/app', platform: 'win32', run: async () => {throw Object.assign(Error('private path'), {code});}});
    assert.deepEqual(await read(), {state: code === 'ENOENT' ? 'missing' : 'unavailable', theme: null, accent: null});
  }
  const read = createDesktopAppearance({directory: '/app', platform: 'linux', run: () => {throw Error('must not run Windows executable');}});
  assert.equal((await read()).state, 'unsupported');
});
