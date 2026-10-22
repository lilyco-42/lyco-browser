import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {assertFontControlIsolation} from './browser-font-control.mjs';
import {assertWebglIdentity} from './browser-webgl-identity.mjs';

// Exercise the engine's ordinary Stop/Start and Chromium's own saved session.
// The harness never reloads, creates, navigates or injects a restored target.
export async function verifyNativeSessionRestore({page, profile, expected, ua, originPort,
  profileRoot, fixture, report, checkpoint, cdp}) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw Error('CI only');
  const phases = ['a-session-restore', 'a-session-restore-extra'];
  const urls = phases.map(phase => `http://127.0.0.1:${originPort}/profile-probe?phase=${phase}`);
  const identityPath = path.join(profileRoot, `lyco-native-identity-${profile.id}.json`);
  const identityBefore = await fs.readFile(identityPath);
  const evidence = report.sessionRestore = {initial: {}, restored: {}, reopenedWithoutHarnessNavigation: true};
  const status = async () => (await page.evaluate(() => window.ops.profileStatus())).find(row => row.id === profile.id);
  const wait = async (read, label) => {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const value = await read();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error(label);
  };
  const inspect = (entry, label, baseline) => {
    assert.ok(entry?.value, label + ': actual page did not report');
    assert.equal(entry.pageProxied, true, label + ': navigation bypassed Mihomo');
    assert.equal(entry.reportProxied, true, label + ': report bypassed Mihomo');
    const value = entry.value;
    assert.equal(value.error, undefined, label + ': ' + value.error);
    assertFontControlIsolation(value.fontControl, report.hostFontControl, label);
    assertWebglIdentity(value.webgl, baseline?.value.webgl, label);
    const fields = {userAgent: ua, platform: 'Win32', language: expected.language,
      languages: [expected.language, expected.language.split('-')[0]],
      timezone: expected.timezone, cores: expected.cores, memory: expected.memory};
    for (const [key, wanted] of Object.entries(fields)) assert.deepEqual(value[key], wanted, label + ': first-script ' + key);
    assert.deepEqual(value.before, {cookie: 'A', local: 'A'}, label + ': saved storage');
    for (const key of ['canvasControl', 'canvas']) {
      assert.equal(value[key].length, 2);
      assert.equal(value[key][0], value[key][1], label + ': repeatable ' + key);
      if (baseline) assert.deepEqual(value[key], baseline.value[key], label + ': saved native ' + key);
    }
  };
  const readPages = async destination => {
    for (const phase of phases) {
      const entry = await wait(() => fixture.result(phase)?.value && fixture.result(phase), phase + ': actual session page missing');
      destination[phase] = structuredClone(entry);
    }
    await checkpoint('session-restore:observations-saved');
    // Only this job's synthetic observations, never native payloads, account
    // credentials or customer browser data. Keep first-script failure useful
    // in the ordinary job log as well as the complete raw evidence file.
    console.log(JSON.stringify({sessionRestoreStage: destination === evidence.initial ? 'initial' : 'restored',
      observations: Object.fromEntries(phases.map(phase => {
        const value = destination[phase].value;
        return [phase, Object.fromEntries(['userAgent', 'platform', 'language', 'languages',
          'cores', 'memory', 'timezone', 'before', 'canvasControl', 'canvas', 'error'].map(key => [key, value[key]]))];
      }))}));
  };
  try {
    // Seed a real saved two-tab session using the existing prepared-startup
    // path. The second launch has no configured user URLs at all.
    const seeded = await page.evaluate(({source, expected, ua, urls}) => window.adoptLycoProfile({
      ...source, os: 'Windows', language: expected.language, userAgent: ua,
      startUrl: urls[0], platform: {type: 'other', startUrl: urls[0]},
      advanced: {...source.advanced, startUrls: urls.join('\n'), tabMode: 'custom', restoreSession: false,
        showInfoPage: false, saveCookies: true},
      fingerprint: {...source.fingerprint, cores: expected.cores, memory: expected.memory},
      privacy: {...source.privacy, deviceProfile: 'default', cores: expected.cores, memory: expected.memory,
        languageMode: 'profile', uiLanguage: 'profile', langFromIp: false, timezoneFromIp: false, geoFromIp: false,
        timezoneMode: 'custom', timezone: expected.timezone, canvas: 'noise', refreshFingerprintOnStart: false},
    }), {source: profile, expected, ua, urls});
    await checkpoint('session-restore:seed');
    await page.evaluate(source => window.ops.startProfile(source), seeded);
    await readPages(evidence.initial);
    for (const phase of phases) inspect(evidence.initial[phase], 'initial ' + phase, evidence.initial[phases[0]]);
    await page.evaluate(id => window.ops.stopProfile(id), profile.id);
    await wait(async () => !(await status())?.running, 'Initial session did not stop');
    assert.deepEqual(await fs.readFile(identityPath), identityBefore, 'Seeding replaced the existing native identity');
    // Clear server observations only, never browser session files or storage.
    for (const phase of phases) fixture.clear(phase);
    const restoring = await page.evaluate(source => window.adoptLycoProfile({
      ...source, startUrl: '', platform: {type: 'other', startUrl: ''},
      advanced: {...source.advanced, startUrls: '', tabMode: 'restore', restoreSession: true, showInfoPage: false},
    }), seeded);
    assert.equal(restoring.advanced.restoreSession, true);
    assert.equal(restoring.advanced.tabMode, 'restore');
    assert.equal(restoring.advanced.startUrls, '');
    await checkpoint('session-restore:reopen');
    const reopened = await page.evaluate(source => window.ops.startProfile(source), restoring);
    evidence.startAcknowledgement = {ok: reopened?.ok, success: reopened?.success};
    await readPages(evidence.restored);
    const current = await status();
    assert.equal(current.profileDirectory, profileRoot, 'Restore used a different profile directory');
    const tabs = await cdp.tabs(current.port);
    for (let index = 0; index < phases.length; index++) {
      const phase = phases[index];
      assert.equal(tabs.filter(tab => tab.url === urls[index]).length, 1, phase + ': original tab must be restored exactly once');
      const path = new URL(urls[index]).pathname + new URL(urls[index]).search;
      assert.ok(report.proxyRequests.filter(row => row.path === path && row.proxied).length >= 2,
        phase + ': no actual second navigation through the proxy');
      inspect(evidence.restored[phase], 'restored ' + phase, evidence.initial[phase]);
    }
    // Restore mode retains a different owning attachment path. Passing the
    // restored documents does not prove a new page created afterwards is safe.
    // Exercise normal new-URL target creation without injecting, delaying,
    // reloading or repairing its document. Only observe the page's own report.
    evidence.newTargets = {};
    const opener = tabs.find(tab => tab.url === urls[0]);
    assert.ok(opener?.webSocketDebuggerUrl, 'Restored opener is missing');
    for (const attempt of [1, 2, 3]) {
      const phase = 'a-restored-new-tab' + (attempt === 1 ? '' : '-' + attempt);
      const url = `http://127.0.0.1:${originPort}/profile-probe?phase=${phase}`;
      await checkpoint(phase + ':open');
      const opened = await cdp.call(opener.webSocketDebuggerUrl, 'Target.createTarget', {url});
      assert.ok(opened?.targetId, phase + ': real target was not created');
      const entry = await wait(() => fixture.result(phase)?.value && fixture.result(phase), phase + ': page did not report');
      evidence.newTargets[phase] = structuredClone(entry);
      await checkpoint(phase + ':observed');
      inspect(entry, phase, evidence.initial[phases[0]]);
      const frames = {};
      for (const realm of ['same', 'cross']) {
        const frame = await wait(() => fixture.frameResult(phase, realm)?.value && fixture.frameResult(phase, realm),
          phase + ': ' + realm + ' frame did not report');
        frames[realm] = structuredClone(frame);
      }
      evidence.newTargets[phase].parserFrames = frames;
      await checkpoint(phase + ':parser-frames-observed');
      for (const realm of ['same', 'cross']) {
        const frame = frames[realm], secure = realm === 'same';
        assert.equal(frame.pageProxied, true, phase + ': ' + realm + ' frame navigation bypassed proxy');
        assert.equal(frame.reportProxied, true, phase + ': ' + realm + ' frame report bypassed proxy');
        assert.equal(frame.value.isTop, false);
        assert.equal(frame.value.host, secure ? '127.0.0.1' : 'lyco-fixture.invalid');
        for (const field of ['userAgent', 'platform', 'language', 'languages', 'cores', 'timezone']) {
          assert.deepEqual(frame.value[field], entry.value[field], phase + ': ' + realm + ' first-script ' + field);
        }
        assert.equal(frame.value.secureContext, secure);
        assert.equal(frame.value.memoryAvailable, secure);
        assert.equal(frame.value.memory, secure ? expected.memory : undefined);
      }
      report.checks.push(phase + ':first-script-identity-parser-frames-storage-canvas-and-proxy');
    }
    assert.deepEqual(await fs.readFile(identityPath), identityBefore, 'Restore replaced the saved identity');
    evidence.sameProfileDirectory = true; evidence.savedIdentityBytesUnchanged = true;
    report.checks.push('native-session-restore-two-tabs-first-script-identity-storage-and-proxy');
    await checkpoint('session-restore:passed');
  } catch (error) {
    // Capture the real failure BEFORE the ordinary Stop finally removes the
    // running status/targets. Export enums/booleans only, never URLs, page
    // content, native devices, startup stderr or authentication data.
    const current = await status().catch(() => null);
    evidence.failureState = {running: current?.running === true, starting: current?.starting === true,
      verificationBlocked: current?.verificationBlocked === true, cdpErrorPresent: Boolean(current?.cdpError)};
    const targets = current?.port ? await cdp.tabs(current.port).catch(() => []) : [];
    evidence.failureTargets = targets.map(tab => ({page: tab.type === 'page', blank: tab.url === 'about:blank',
      expectedFirst: tab.url === urls[0], expectedSecond: tab.url === urls[1],
      internal: /^(chrome|chrome-extension|devtools):/i.test(tab.url || ''),
      dataDocument: /^data:text\/html/i.test(tab.url || '')}));
    console.log(JSON.stringify({sessionRestoreFailure: {acknowledgement: evidence.startAcknowledgement,
      state: evidence.failureState, targets: evidence.failureTargets}}));
    await checkpoint('session-restore:failed-before-cleanup');
    throw error;
  } finally {
    await page.evaluate(id => window.ops.stopProfile(id), profile.id).catch(() => {});
    await page.evaluate(source => window.adoptLycoProfile(source), profile);
    await checkpoint('session-restore:stopped');
  }
}
