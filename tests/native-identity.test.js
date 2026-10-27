'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {prepareNativeIdentity, nativeCanvasFingerprint, nativeRuntimeFingerprint, hasNativeFontInventory} = require('../src/native-identity');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lyco-identity-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const tabs = [{type: 'page', webSocketDebuggerUrl: 'ws://127.0.0.1:19341/devtools/page/first'}];
  const calls = [];
  let counter = 0;
  const cdp = {tabs: async () => tabs, call: async (target, method, params) => {
    calls.push({target, method, params});
    return method === 'Wayfern.getFingerprint' ? {fingerprint: {canvasSeed: ++counter, fonts: '["Arial"]'}} : {};
  }};
  return {root, tabs, calls, cdp, args: {enabled: true, profileRoot: root, profileId: 'owner-profile', port: 19341, cdp}};
}

test('native layout requires a supported kernel and a valid complete font inventory', async t => {
  const f = await fixture(t);
  await assert.rejects(prepareNativeIdentity({...f.args, enabled: false, requireNativeFontLayout: true}), /需要支持原生字体隔离/);
  assert.equal(f.calls.length, 0);
  const identity = await prepareNativeIdentity({...f.args, requireNativeFontLayout: true});
  assert.equal(identity.hasNativeFontInventory, true);
  const file = path.join(f.root, 'lyco-native-identity-owner-profile.json');
  const bytes = await fs.readFile(file);
  await prepareNativeIdentity({...f.args, requireNativeFontLayout: true});
  assert.deepEqual(await fs.readFile(file), bytes, 'Selecting native layout must not regenerate an existing device');
  for (const fonts of [undefined, '', '[]', '[invalid', [], [''], ['Arial\n'], [42], Array(2049).fill('Arial')]) {
    assert.equal(hasNativeFontInventory(fonts), false);
  }
  assert.equal(hasNativeFontInventory('["Arial","SimSun"]'), true);
  assert.equal(hasNativeFontInventory(['Arial']), true);
  const broken = JSON.parse(bytes); delete broken.fingerprint.fonts;
  await fs.writeFile(file, JSON.stringify(broken));
  f.calls.length = 0;
  await assert.rejects(prepareNativeIdentity({...f.args, requireNativeFontLayout: true}), /未提供有效的字体隔离/);
  assert.equal(f.calls.length, 0, 'Invalid saved font configuration cannot be sent to a page');
  assert.deepEqual(JSON.parse(await fs.readFile(file)), broken, 'Failure cannot reset the saved device');
});

test('native layout preserves unrelated noise while legacy geometry policies remain explicit', () => {
  const fp = {clientRects: {mode: 'native', mark: 17}, canvas: {mode: 'noise', mark: 9},
    audio: {mode: 'noise', mark: 5}, seed: 'existing', worker: {keep: true}};
  assert.throws(() => nativeRuntimeFingerprint(fp, null), /缺少原生字体/);
  const runtime = nativeRuntimeFingerprint(fp, {hasNativeFontInventory: true, ownsHtmlCanvasNoise: true});
  assert.deepEqual(runtime.clientRects, {mode: 'native', mark: 17, nativeFontLayout: true});
  assert.deepEqual(runtime.canvas, {mode: 'noise', mark: 9, nativeHtmlPixels: true});
  assert.equal(runtime.audio, fp.audio); assert.equal(runtime.worker, fp.worker); assert.equal(runtime.seed, fp.seed);
  assert.deepEqual(fp.clientRects, {mode: 'native', mark: 17});
  for (const mode of ['noise', 'real']) {
    const previous = {...fp, clientRects: {mode, mark: 17}};
    assert.equal(nativeRuntimeFingerprint(previous, null), previous, 'Never silently migrate an existing geometry policy');
  }
});

test('restores the complete native identity across process sessions without minting another device', async t => {
  const f = await fixture(t);
  const first = await prepareNativeIdentity(f.args);
  const original = f.calls.find(call => call.method === 'Wayfern.setFingerprint').params;
  f.calls.length = 0;
  const second = await prepareNativeIdentity(f.args);
  assert.equal(first.digest, second.digest);
  assert.equal(f.calls.some(call => call.method === 'Wayfern.getFingerprint'), false);
  assert.deepEqual(f.calls[0].params, original);
  await second.apply(f.tabs);
  assert.equal(f.calls.length, 1, 'watch passes must not keep resetting a live target');
  f.tabs.push({type: 'page', webSocketDebuggerUrl: 'ws://127.0.0.1:19341/devtools/page/new'});
  await second.apply(f.tabs);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.calls[1].params, original);
});

test('a damaged or wrong-owner cache fails without silently replacing the identity', async t => {
  const f = await fixture(t);
  const file = path.join(f.root, 'lyco-native-identity-owner-profile.json');
  await fs.writeFile(file, '{broken');
  await assert.rejects(prepareNativeIdentity(f.args), /文件损坏/);
  assert.equal(f.calls.length, 0);
  await fs.writeFile(file, JSON.stringify({schema: 1, profileId: 'someone-else', fingerprint: {canvasSeed: 1}}));
  await assert.rejects(prepareNativeIdentity(f.args), /不匹配/);
  assert.equal(f.calls.length, 0);
});

test('deferred session restore prepares only an existing saved identity before any page is opened', async t => {
  const f = await fixture(t);
  await prepareNativeIdentity(f.args);
  const original = f.calls.find(row => row.method === 'Wayfern.setFingerprint').params;
  const file = path.join(f.root, 'lyco-native-identity-owner-profile.json');
  const bytes = await fs.readFile(file);
  f.tabs.length = 0; f.calls.length = 0;
  await assert.rejects(prepareNativeIdentity(f.args), /尚未提供页面目标/);
  await assert.rejects(prepareNativeIdentity({...f.args, deferredRestore: true, refresh: true}), /首次启动或刷新/);
  const identity = await prepareNativeIdentity({...f.args, deferredRestore: true});
  assert.equal(f.calls.length, 0);
  assert.deepEqual(await fs.readFile(file), bytes);
  const sent = [];
  await identity.applySession({command: async (...args) => {sent.push(args);}}, 'session-restored', {type: 'page', targetId: 'restored'});
  assert.deepEqual(sent[0], ['Wayfern.setFingerprint', original, {sessionId: 'session-restored', timeout: 5000}]);
  await fs.unlink(file);
  await assert.rejects(prepareNativeIdentity({...f.args, deferredRestore: true}), /尚未提供页面目标/);
  assert.equal(f.calls.length, 0, 'Do not create a replacement device without a paused page');
});

test('a paused new page gets the complete saved native device on its original session', async t => {
  const f = await fixture(t), identity = await prepareNativeIdentity(f.args);
  const original = f.calls.find(call => call.method === 'Wayfern.setFingerprint').params;
  const sent = [], connection = {command: async (...args) => {sent.push(args); return {};}};
  await identity.applySession(connection, 'session-new', {type: 'page', targetId: 'page-new'});
  assert.deepEqual(sent, [['Wayfern.setFingerprint', original, {sessionId: 'session-new', timeout: 5000}]]);
  await identity.applySession(connection, 'worker-session', {type: 'worker', targetId: 'worker'});
  assert.equal(sent.length, 1, 'Do not send page-only native commands to worker targets');
});

test('a refused new page is closed and marked not to resume even when closing fails', async t => {
  const f = await fixture(t), identity = await prepareNativeIdentity(f.args);
  const sent = [], connection = {command: async (...args) => {sent.push(args); throw Error('CI refusal');}};
  await assert.rejects(identity.applySession(connection, 'session-new', {type: 'page', targetId: 'page-new'}),
    error => error.code === 'LYCO_NATIVE_IDENTITY_REFUSED');
  assert.equal(connection.lycoIdentityRefusedSessions.has('session-new'), true);
  assert.deepEqual(sent[1], ['Target.closeTarget', {targetId: 'page-new'}]);
  assert.equal(sent.some(([method]) => method === 'Runtime.runIfWaitingForDebugger'), false);
  assert.equal(f.calls.filter(call => call.method === 'Wayfern.getFingerprint').length, 1, 'Failure must not mint a different device');
});

test('explicit refresh can capture another identity while separate profile IDs stay independent', async t => {
  const f = await fixture(t);
  const first = await prepareNativeIdentity(f.args);
  const refreshed = await prepareNativeIdentity({...f.args, refresh: true});
  assert.notEqual(first.digest, refreshed.digest);
  const other = await prepareNativeIdentity({...f.args, profileId: 'other-profile'});
  assert.notEqual(refreshed.digest, other.digest);
  const restored = await prepareNativeIdentity(f.args);
  assert.equal(restored.digest, refreshed.digest);
});

test('foreign CDP addresses, invalid payloads and rejected restores cannot become success', async t => {
  const f = await fixture(t);
  f.tabs[0].webSocketDebuggerUrl = 'ws://example.com:19341/devtools/page/foreign';
  await assert.rejects(prepareNativeIdentity(f.args), /非本环境/);
  assert.equal(f.calls.length, 0);
  f.tabs[0].webSocketDebuggerUrl = 'ws://127.0.0.1:19341/devtools/page/first';
  f.cdp.call = async () => ({fingerprint: {}});
  await assert.rejects(prepareNativeIdentity(f.args), /有效原生身份/);
  f.cdp.call = async (_target, method) => {
    if (method === 'Wayfern.getFingerprint') return {fingerprint: {canvasSeed: 17}};
    throw Error('provider rejected apply');
  };
  await assert.rejects(prepareNativeIdentity(f.args), /恢复失败/);
  assert.ok((await fs.readFile(path.join(f.root, 'lyco-native-identity-owner-profile.json'), 'utf8')).includes('17'));
});

test('non-Wayfern kernels are not given foreign native APIs', async () => {
  assert.equal(await prepareNativeIdentity({enabled: false}), null);
});

test('a session acknowledgement cannot suppress the independent live-page native preparation', async t => {
  const f = await fixture(t);
  const identity = await prepareNativeIdentity({...f.args, settings: {hardwareConcurrency: 6}});
  const file = path.join(f.root, 'lyco-native-identity-owner-profile.json');
  const before = await fs.readFile(file);
  const page = {type: 'page', webSocketDebuggerUrl: 'ws://localhost:19341/devtools/page/new-owned'};
  f.tabs.push(page);
  const sent = [];
  await identity.applySession({command: async (...args) => sent.push(args)}, 'session-owned',
    {type: 'page', targetId: 'new-owned'});
  assert.deepEqual(sent.map(([method]) => method), ['Wayfern.setFingerprint', 'Emulation.setHardwareConcurrencyOverride']);
  f.calls.length = 0;
  await identity.apply(f.tabs);
  assert.deepEqual(f.calls.map(row => row.method), ['Wayfern.setFingerprint', 'Emulation.setHardwareConcurrencyOverride'],
    'A paused session acknowledgement does not certify the later live-page native state');
  assert.deepEqual(f.calls[0].params, sent[0][1], 'Both paths restore the same saved identity and declared settings');
  assert.deepEqual(await fs.readFile(file), before);
  f.calls.length = 0;
  await identity.apply(f.tabs);
  assert.equal(f.calls.length, 0, 'A completed direct-page pass remains idempotent');
  // Once the target is gone, a genuinely new target must still be prepared.
  f.tabs.pop(); await identity.apply(f.tabs);
  f.tabs.push(page); await identity.apply(f.tabs);
  assert.deepEqual(f.calls.map(row => row.method), ['Wayfern.setFingerprint', 'Emulation.setHardwareConcurrencyOverride']);
});

test('completed document preparation prevents the polling fallback from rewriting native navigator state', async t => {
  const f=await fixture(t);
  const identity=await prepareNativeIdentity({...f.args,settings:{hardwareConcurrency:6,deviceMemory:4}});
  const page={id:'document-ready',type:'page',webSocketDebuggerUrl:'ws://127.0.0.1:19341/devtools/page/document-ready'};
  f.tabs.push(page);f.calls.length=0;
  await identity.apply(f.tabs,new Set([page.id]));
  assert.equal(f.calls.length,0,'A completed owning-session pipeline must not be overwritten by the live-page fallback');
  await identity.apply(f.tabs,new Set());
  assert.deepEqual(f.calls.map(row=>row.method),['Wayfern.setFingerprint','Emulation.setHardwareConcurrencyOverride'],
    'Unprepared pages still receive the independent native fallback');
  const sent=[];
  await identity.finalizeSession({command:async(...args)=>sent.push(args)},'cpu-finalization',{type:'page',targetId:page.id});
  assert.deepEqual(sent,[['Emulation.setHardwareConcurrencyOverride',{hardwareConcurrency:6},{sessionId:'cpu-finalization',timeout:5000}]],
    'Finalization must not reset the device after document scripts have installed navigator settings');
});

test('declared settings reach native pages without changing saved device/noise or accepting unrelated overrides', async t => {
  const f = await fixture(t);
  await prepareNativeIdentity(f.args);
  const file = path.join(f.root, 'lyco-native-identity-owner-profile.json');
  const before = await fs.readFile(file, 'utf8');
  f.calls.length = 0;
  const identity = await prepareNativeIdentity({...f.args, settings: {
    languages: ['en-GB', 'en'], timezone: 'Asia/Tokyo', hardwareConcurrency: 6, deviceMemory: 4,
    canvasSeed: 999, fonts: 'untrusted',
  }});
  const expected = {...JSON.parse(before).fingerprint, language: 'en-GB', languages: ['en-GB', 'en'],
    timezone: 'Asia/Tokyo', hardwareConcurrency: 6, deviceMemory: 4};
  assert.deepEqual(f.calls[0].params, expected);
  assert.deepEqual(f.calls[1], {target: f.tabs[0].webSocketDebuggerUrl,
    method: 'Emulation.setHardwareConcurrencyOverride', params: {hardwareConcurrency: 6}});
  assert.equal(f.calls.some(call => call.method === 'Wayfern.getFingerprint'), false);
  const sent = [];
  await identity.applySession({command: async (...args) => sent.push(args)}, 'new-session', {type: 'page', targetId: 'new-page'});
  assert.deepEqual(sent[0][1], expected);
  assert.deepEqual(sent[1], ['Emulation.setHardwareConcurrencyOverride', {hardwareConcurrency: 6},
    {sessionId: 'new-session', timeout: 5000}]);
  assert.equal(await fs.readFile(file, 'utf8'), before);
  f.calls.length = 0;
  await prepareNativeIdentity({...f.args, settings: {languages: ['fr-FR', 'fr'], hardwareConcurrency: 8}});
  assert.equal(f.calls[0].params.canvasSeed, expected.canvasSeed);
  assert.equal(await fs.readFile(file, 'utf8'), before);
});

test('a rejected native CPU override cannot ready a target or reset its saved identity', async t => {
  const f = await fixture(t);
  await prepareNativeIdentity(f.args);
  const file = path.join(f.root, 'lyco-native-identity-owner-profile.json');
  const bytes = await fs.readFile(file);
  const originalCall = f.cdp.call;
  f.cdp.call = async (...args) => {
    if (args[1] === 'Emulation.setHardwareConcurrencyOverride') throw Error('unsupported or refused');
    return originalCall(...args);
  };
  await assert.rejects(prepareNativeIdentity({...f.args, settings: {hardwareConcurrency: 6}}), /恢复失败/);
  assert.deepEqual(await fs.readFile(file), bytes);
  f.cdp.call = originalCall;
  const identity = await prepareNativeIdentity({...f.args, settings: {hardwareConcurrency: 6}});
  const sent = [], connection = {command: async (...args) => {
    sent.push(args);
    if (args[0] === 'Emulation.setHardwareConcurrencyOverride') throw Error('unsupported or refused');
    return {};
  }};
  await assert.rejects(identity.applySession(connection, 'cpu-refused', {type: 'page', targetId: 'page-refused'}),
    error => error.code === 'LYCO_NATIVE_IDENTITY_REFUSED');
  assert.deepEqual(sent.map(([method]) => method),
    ['Wayfern.setFingerprint', 'Emulation.setHardwareConcurrencyOverride', 'Target.closeTarget']);
  assert.equal(connection.lycoIdentityRefusedSessions.has('cpu-refused'), true);
  assert.equal(sent.some(([method]) => method === 'Runtime.runIfWaitingForDebugger'), false);
  assert.deepEqual(await fs.readFile(file), bytes);
  assert.equal(f.calls.filter(call => call.method === 'Wayfern.getFingerprint').length, 1);
});

test('configured GPU metadata reaches every native page without replacing the saved device or its GPU parameters', async t => {
  const f = await fixture(t);
  const saved = {canvasNoiseSeed: 'existing-noise', webglVendor: 'Saved GPU vendor', webglRenderer: 'Saved GPU renderer',
    webglParameters: '{"nativeParameter":123}', webgl2Parameters: '{"nativeParameter":456}', fonts: '["Arial"]'};
  f.cdp.call = async (target, method, params) => {
    f.calls.push({target, method, params});
    return method === 'Wayfern.getFingerprint' ? {fingerprint: saved} : {};
  };
  await prepareNativeIdentity(f.args);
  const file = path.join(f.root, 'lyco-native-identity-owner-profile.json');
  const bytes = await fs.readFile(file);
  f.calls.length = 0;
  const selected = {webglVendor: 'Configured vendor', webglRenderer: 'Configured renderer'};
  const identity = await prepareNativeIdentity({...f.args, settings: selected});
  assert.deepEqual(f.calls[0].params, {...saved, ...selected});
  assert.equal(f.calls.some(row => row.method === 'Wayfern.getFingerprint'), false);
  const sent = [];
  await identity.applySession({command: async (...args) => sent.push(args)}, 'gpu-page-session', {type: 'page', targetId: 'gpu-page'});
  assert.deepEqual(sent[0], ['Wayfern.setFingerprint', {...saved, ...selected}, {sessionId: 'gpu-page-session', timeout: 5000}]);
  assert.deepEqual(await fs.readFile(file), bytes, 'An explicit UI GPU override must not rewrite the saved device/noise');
});

test('invalid native UI settings fail before reading or changing the saved identity', async t => {
  const f = await fixture(t);
  for (const settings of [{languages: []}, {languages: ['en-GB\n']}, {hardwareConcurrency: 0},
    {hardwareConcurrency: 1.5}, {deviceMemory: Infinity}, {timezone: 'not/a/timezone'},
    {webglVendor: 'vendor'}, {webglRenderer: 'renderer'}, {webglVendor: '', webglRenderer: 'renderer'},
    {webglVendor: 'vendor', webglRenderer: 'renderer\n'}, {webglVendor: 'vendor', webglRenderer: 'x'.repeat(513)}]) {
    await assert.rejects(prepareNativeIdentity({...f.args, settings}));
  }
  assert.equal(f.calls.length, 0);
});

test('native HTML ownership never bypasses all canvas APIs or replaces saved seeds', async t => {
  const f = await fixture(t);
  f.cdp.call = async (_target, method, params) => {
    f.calls.push({method, params});
    return method === 'Wayfern.getFingerprint' ? {fingerprint: {canvasNoiseSeed: 1234567, unknownNoise: {keep: true}}} : {};
  };
  const identity = await prepareNativeIdentity(f.args);
  assert.equal(identity.ownsHtmlCanvasNoise, true);
  assert.equal(f.calls.find(row => row.method === 'Wayfern.setFingerprint').params.canvasNoiseSeed, 1234567);
  const fp = {canvas: {mode: 'noise', mark: 7}, webgl: {mode: 'noise'}, audio: {mode: 'noise'}, seed: 'unchanged'};
  const runtime = nativeCanvasFingerprint(fp, identity);
  assert.deepEqual(runtime.canvas, {mode: 'noise', mark: 7, nativeHtmlPixels: true});
  assert.equal(Object.hasOwn(runtime.canvas, 'nativePixels'), false, 'Do not bypass every canvas API');
  assert.deepEqual(fp.canvas, {mode: 'noise', mark: 7});
  assert.equal(runtime.webgl, fp.webgl); assert.equal(runtime.audio, fp.audio); assert.equal(runtime.seed, fp.seed);
  assert.equal(nativeCanvasFingerprint(fp, null), fp, 'Other kernels keep their complete JS noise');
  assert.equal(nativeCanvasFingerprint(fp, {ownsHtmlCanvasNoise: false}), fp);
  for (const mode of ['blocked', 'real']) {
    const other = {...fp, canvas: {mode}};
    assert.equal(nativeCanvasFingerprint(other, identity), other, 'Do not change other user canvas policies');
  }
});
