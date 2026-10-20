'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {openPreparedStartupPages} = require('../src/startup-pages');

function fixture() {
  const calls = [], tabs = [], port = 19341;
  const connection = {command: async (method, params) => {
    calls.push({method, params});
    if (method === 'Target.createTarget') {
      const id = 'page-' + (tabs.length + 1);
      tabs.push({id, type: 'page', url: params.url, webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/${id}`});
      return {targetId: id};
    }
    return {};
  }};
  const cdp = {tabs: async () => tabs, call: async (socket, method, params) => {
    calls.push({socket, method, params}); return {};
  }};
  return {calls, tabs, args: {urls: ['https://one.example/', 'https://two.example/'], port, connection, cdp,
    prepare: async () => { calls.push({method: 'prepare-original-runtime'}); }}};
}

test('all extra pages stay blank until the original runtime has prepared every target', async () => {
  const f = fixture();
  assert.deepEqual(await openPreparedStartupPages(f.args), ['page-1', 'page-2']);
  assert.deepEqual(f.calls.map(row => row.method), ['Target.createTarget', 'Target.createTarget',
    'prepare-original-runtime', 'Page.navigate', 'Page.navigate']);
  assert.ok(f.calls.slice(0, 2).every(row => row.params.url === 'about:blank'));
  assert.deepEqual(f.calls.slice(3).map(row => row.params.url), f.args.urls);
});

test('runtime rejection or a foreign target closes only new blanks without navigating', async () => {
  for (const foreign of [false, true]) {
    const f = fixture();
    if (foreign) {
      f.args.cdp.tabs = async () => f.tabs.map(tab => ({...tab, webSocketDebuggerUrl: 'ws://foreign.example:19341/page'}));
    } else {
      f.args.prepare = async () => { throw Error('native identity rejected'); };
    }
    await assert.rejects(openPreparedStartupPages(f.args), /本环境|identity rejected/);
    assert.equal(f.calls.some(row => row.method === 'Page.navigate'), false);
    assert.deepEqual(f.calls.filter(row => row.method === 'Target.closeTarget').map(row => row.params.targetId), ['page-1', 'page-2']);
  }
});

test('discovered paused pages wait for their owning session before direct runtime work', async () => {
  const f = fixture(), prepared = new Set(), resumed = new Set();
  let readinessChecks = 0;
  f.args.isPrepared = id => {
    readinessChecks++;
    return prepared.has(id) && resumed.has(id);
  };
  f.args.prepare = async () => {
    assert.ok(f.tabs.every(tab => prepared.has(tab.id) && resumed.has(tab.id)),
      'Do not send a competing direct-page command while the owner is paused');
    f.calls.push({method: 'prepare-original-runtime'});
  };
  const pending = openPreparedStartupPages(f.args);
  await new Promise(resolve => setTimeout(resolve, 35));
  f.tabs.forEach(tab => prepared.add(tab.id));
  assert.equal(f.calls.some(row => row.method === 'prepare-original-runtime'), false);
  assert.equal(f.calls.some(row => row.method === 'Page.navigate'), false);
  await new Promise(resolve => setTimeout(resolve, 35));
  assert.equal(f.calls.some(row => row.method === 'prepare-original-runtime'), false,
    'Preparation without the resume acknowledgement is still not ready');
  f.tabs.forEach(tab => resumed.add(tab.id));
  await pending;
  assert.ok(readinessChecks > 2);
  assert.equal(f.calls.filter(row => row.method === 'Page.navigate').length, 2);
});

test('cancelled owner preparation closes new targets without direct commands', async () => {
  const f = fixture();
  let waiting = false;
  f.args.isPrepared = () => {waiting = true; return false;};
  f.args.assertActive = () => {if (waiting) throw Error('owner preparation cancelled');};
  await assert.rejects(openPreparedStartupPages(f.args), /owner preparation cancelled/);
  assert.equal(f.calls.some(row => ['prepare-original-runtime', 'Page.navigate'].includes(row.method)), false);
  assert.deepEqual(f.calls.filter(row => row.method === 'Target.closeTarget').map(row => row.params.targetId), ['page-1', 'page-2']);
});

test('lifecycle cancellation and navigation errors retain the original failure and clean new targets', async () => {
  const f = fixture();
  f.args.cdp.call = async () => ({errorText: 'navigation failed'});
  await assert.rejects(openPreparedStartupPages(f.args), /导航失败/);
  assert.equal(f.calls.filter(row => row.method === 'Target.closeTarget').length, 2);
  const cancelled = fixture();
  cancelled.args.assertActive = () => { throw Error('profile start cancelled'); };
  await assert.rejects(openPreparedStartupPages(cancelled.args), /cancelled/);
  assert.equal(cancelled.calls.length, 0);
});
