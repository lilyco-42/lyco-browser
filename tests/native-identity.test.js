'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {prepareNativeIdentity} = require('../src/native-identity');

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
