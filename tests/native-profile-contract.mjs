import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readOnlyProfileProbeSource} from './browser-profile-fixture.mjs';
import {verifyNativeSessionRestore} from './native-session-restore-contract.mjs';

// Drive existing workbench actions and the unchanged engine. These expectations
// come from explicit saved settings, not from production buildFingerprint().
export async function verifyNativeProfileIsolation({page, profile, originPort, fixture, report, checkpoint, appRoot}) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw Error('CI only');
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';
  const settings = {
    A: {language: 'en-GB', timezone: 'Asia/Tokyo', cores: 6, memory: 4},
    B: {language: 'fr-FR', timezone: 'Europe/Paris', cores: 8, memory: 8},
  };
  await checkpoint('profile:create-second');
  await page.locator('[data-view="lyco"]').click();
  await page.locator('#lyco-create-profile').click();
  await page.waitForFunction(id => window.__lycoCreated?.id && window.__lycoCreated.id !== id, profile.id);
  const second = await page.evaluate(() => window.__lycoCreated);
  assert.notEqual(second.id, profile.id, 'Storage test requires two actual environments');
  assert.ok(second.proxyId, 'Second environment must retain its managed proxy binding');
  const profiles = {A: profile, B: second};
  const profileRoots = {};
  const results = {};
  const nativeSettings = (device, expected) => Object.fromEntries([
    ['language', expected.language], ['timezone', expected.timezone],
    ['hardwareConcurrency', expected.cores], ['deviceMemory', expected.memory],
  ].map(([key, expectedValue]) => [key, {present: Object.hasOwn(device || {}, key), matches: device?.[key] === expectedValue}]));
  const requireApp = createRequire(path.join(appRoot, 'package.json'));
  const {loadInitObject} = requireApp('./automation/kernel-init-sync');
  const cdp = requireApp('./cdp');
  report.profileRuntime = {};
  report.startupPages = {};
  report.newTabs = {};
  for (const [phase, owner] of [['a-first', 'A'], ['b-first', 'B'], ['a-reopen', 'A'], ['b-reopen', 'B']]) {
    const expected = settings[owner];
    const target = `http://127.0.0.1:${originPort}/profile-probe?phase=${phase}`;
    const extraPhase = owner === 'A' ? phase + '-extra' : null;
    const extraTarget = extraPhase ? `http://127.0.0.1:${originPort}/profile-probe?phase=${extraPhase}` : null;
    await checkpoint(phase + ':configure');
    await page.evaluate(({source, expected, target, extraTarget, ua}) => window.adoptLycoProfile({
      ...source, os: 'Windows', language: expected.language, userAgent: ua,
      startUrl: target, platform: {type: 'other', startUrl: target},
      advanced: {...source.advanced, startUrls: extraTarget ? target + '\n' + extraTarget : target, saveCookies: true},
      fingerprint: {...source.fingerprint, cores: expected.cores, memory: expected.memory},
      privacy: {...source.privacy, deviceProfile: 'default', cores: expected.cores, memory: expected.memory,
        languageMode: 'profile', uiLanguage: 'profile', langFromIp: false, timezoneFromIp: false, geoFromIp: false,
        timezoneMode: 'custom', timezone: expected.timezone, canvas: 'noise', refreshFingerprintOnStart: false},
    }), {source: profiles[owner], expected, target, extraTarget, ua});
    await page.locator('[data-view="profiles"]').click();
    await checkpoint(phase + ':launch');
    await page.locator(`#profile-table tr[data-profile-id="${profiles[owner].id}"] .col-name`).dblclick();
    try {
      await checkpoint(phase + ':observe');
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline && !fixture.result(phase)?.value) await new Promise(resolve => setTimeout(resolve, 150));
      const observed = fixture.result(phase);
      await checkpoint(phase + ':reported');
      assert.ok(observed?.value, `${phase}: real browser did not send its profile observation`);
      assert.equal(observed.pageProxied, true, `${phase}: page bypassed the managed proxy`);
      assert.equal(observed.reportProxied, true, `${phase}: report bypassed the managed proxy`);
      const value = observed.value;
      const state = await page.evaluate(async id => (await window.ops.profileStatus()).find(item => item.id === id), profiles[owner].id);
      assert.ok(state?.profileDirectory, `${phase}: missing actual engine profile directory`);
      profileRoots[owner] = state.profileDirectory;
      // Legacy OpenBrowser writes init.json; Wayfern uses a different startup
      // path. Missing legacy config is an observation, not a failed contract.
      const initBytes = await fs.readFile(path.join(state.profileDirectory, 'init.json')).catch(error => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      const init = initBytes ? loadInitObject(initBytes) : null;
      if (initBytes) assert.ok(init && typeof init === 'object', 'Existing native init is not decodable');
      const digest = input => input == null ? null : createHash('sha256').update(JSON.stringify(input)).digest('hex');
      report.profileRuntime[phase] = {fingerprint: state.fingerprint, browser: state.browser,
        legacyInitPresent: Boolean(initBytes), canvasEnabled: init?.is_canvas_finger_printing_enable,
        canvasPayloadDigest: digest(init?.canvas_fingerprint_info),
        canvasConsistency: init?.canvas_fingerprint_keep_consistent_setting};
      // Read-only documented RPC; never refresh/set a fingerprint or supply,
      // change, log or bypass a licence token. Only hashes leave this CI host.
      try {
        assert.ok(Number.isInteger(state.port) && state.port > 1023 && state.port < 65536);
        const targets = await cdp.tabs(state.port);
        const socket = targets.find(tab => tab.url === target)?.webSocketDebuggerUrl;
        if (!socket) throw Error('CI profile page target missing');
        const result = await cdp.call(socket, 'Wayfern.getFingerprint', {}, 2000);
        const raw = result?.fingerprint ?? result;
        const native = typeof raw === 'string' ? JSON.parse(raw) : raw;
        report.profileRuntime[phase].nativeFingerprint = {available: true,
          digest: digest(native), canvasDigest: digest(native?.canvas ?? native?.noise?.canvas),
          declared: nativeSettings(native, expected)};
      } catch {
        report.profileRuntime[phase].nativeFingerprint = {available: false};
      }
      await checkpoint(phase + ':runtime-recorded');
      assert.equal(value.error, undefined, `${phase}: ${value.error}`);
      assert.equal(value.userAgent, ua, `${phase}: saved User-Agent not applied`);
      assert.equal(value.platform, 'Win32', `${phase}: Windows platform not applied`);
      assert.equal(value.language, expected.language, `${phase}: saved language not applied`);
      assert.deepEqual(value.languages, [expected.language, expected.language.split('-')[0]], `${phase}: languages mismatch`);
      assert.equal(value.timezone, expected.timezone, `${phase}: saved timezone not applied`);
      assert.equal(value.cores, expected.cores, `${phase}: saved CPU count not applied`);
      assert.equal(value.memory, expected.memory, `${phase}: saved memory not applied`);
      const prior = phase.endsWith('first') ? null : owner;
      assert.deepEqual(value.before, {cookie: prior, local: prior}, `${phase}: storage crossed environments or failed to persist`);
      assert.deepEqual(value.after, {cookie: owner, local: owner}, `${phase}: real storage writes failed`);
      assert.equal(value.canvas.length, 2);
      assert.match(value.canvas[0], /^[0-9a-f]{8}$/);
      assert.equal(value.canvas[0], value.canvas[1], `${phase}: same drawing changed within one page`);
      assert.equal(value.canvasControl[0], value.canvasControl[1], `${phase}: shape-only canvas changed within one page`);
      if (prior !== null) {
        assert.equal(value.canvasControl[0], results[owner.toLowerCase() + '-first'].canvasControl[0], `${phase}: shape-only canvas changed across restart`);
        assert.equal(value.canvas[0], results[owner.toLowerCase() + '-first'].canvas[0], `${phase}: same-profile canvas changed across restart`);
      }
      if (extraPhase) {
        const extraDeadline = Date.now() + 30000;
        while (Date.now() < extraDeadline && !fixture.result(extraPhase)?.value) await new Promise(resolve => setTimeout(resolve, 100));
        const extra = fixture.result(extraPhase);
        const startup = await page.evaluate(async id => (await window.ops.profileStatus()).find(item => item.id === id), profiles[owner].id);
        report.startupPages[phase] = {extra: extra || null, running: startup?.running,
          cdpError: startup?.cdpError, blocked: startup?.verificationBlocked};
        assert.ok(extra?.value && extra.pageProxied && extra.reportProxied, `${phase}: extra startup page did not reach the proxy fixture`);
        assert.equal(extra.value.error, undefined, `${phase}: ${extra.value.error}`);
        for (const field of ['userAgent', 'platform', 'language', 'languages', 'cores', 'memory', 'timezone']) {
          assert.deepEqual(extra.value[field], value[field], `${phase}: extra page first script saw a different ${field}`);
        }
        assert.deepEqual(extra.value.canvasControl, value.canvasControl, `${phase}: extra page first-script native canvas differs`);
        assert.deepEqual(extra.value.canvas, value.canvas, `${phase}: extra page canvas differs`);
        const targets = await cdp.tabs(state.port);
        assert.ok(targets.some(tab => tab.url === target) && targets.some(tab => tab.url === extraTarget),
          `${phase}: multiple configured startup pages were closed or replaced`);
        report.startupPages[phase] = {mainPresent: true, extraPresent: true, extra};
        // Open an actual new target at the user URL, without a harness-created
        // blank page, pause, manual injection or delayed navigation. The real
        // engine must prepare a page opened after startup before its first JS.
        const newPhase = phase + '-new-tab';
        const newTarget = `http://127.0.0.1:${originPort}/profile-probe?phase=${newPhase}`;
        await checkpoint(newPhase + ':open');
        const opener = targets.find(tab => tab.url === target);
        const opened = await cdp.call(opener.webSocketDebuggerUrl, 'Target.createTarget', {url: newTarget});
        assert.ok(opened?.targetId, `${newPhase}: Chromium did not create a real target`);
        const newDeadline = Date.now() + 30000;
        while (Date.now() < newDeadline && !fixture.result(newPhase)?.value) await new Promise(resolve => setTimeout(resolve, 100));
        const newTab = fixture.result(newPhase);
        report.newTabs[phase] = newTab || null;
        // Read-only diagnosis, never inject/repair/reload the page. Keep the
        // original first-script observation and all assertions unchanged.
        try {
          const socket = (await cdp.tabs(state.port)).find(tab => tab.id === opened.targetId)?.webSocketDebuggerUrl;
          if (!socket) throw Error('New target unavailable for read-only observation');
          const nativeResult = await cdp.call(socket, 'Wayfern.getFingerprint', {}, 2000);
          const raw = nativeResult?.fingerprint ?? nativeResult;
          const native = typeof raw === 'string' ? JSON.parse(raw) : raw;
          report.newTabNative ||= {};
          report.newTabNative[phase] = {available: true, digest: digest(native), declared: nativeSettings(native, expected)};
          report.newTabNative[phase].noiseFields = Object.keys(native || {}).filter(key => /^(?:canvas|noise|seed)[A-Za-z0-9_]{0,60}$/i.test(key)).sort();
          const current = await cdp.call(socket, 'Runtime.evaluate', {returnByValue: true, awaitPromise: true,
            expression: readOnlyProfileProbeSource()}, 3000);
          const later = current?.result?.value;
          report.newTabNative[phase].currentPage = nativeSettings({...later, hardwareConcurrency: later?.cores, deviceMemory: later?.memory}, expected);
          report.newTabNative[phase].laterCanvas = later?.canvas;
          report.newTabNative[phase].laterShape = later?.canvasControl;
        } catch {
          report.newTabNative ||= {};
          report.newTabNative[phase] = {available: false};
        }
        await checkpoint(newPhase + ':observed');
        assert.ok(newTab?.value && newTab.pageProxied && newTab.reportProxied, `${newPhase}: new tab did not report through Mihomo`);
        assert.equal(newTab.value.error, undefined, `${newPhase}: ${newTab.value.error}`);
        for (const field of ['userAgent', 'platform', 'language', 'languages', 'cores', 'memory', 'timezone']) {
          assert.deepEqual(newTab.value[field], value[field], `${newPhase}: first script saw a different ${field}`);
        }
        assert.deepEqual(newTab.value.before, {cookie: owner, local: owner}, `${newPhase}: new tab lost its environment storage`);
        assert.deepEqual(newTab.value.canvasControl, value.canvasControl, `${newPhase}: first-script native canvas differs`);
        assert.deepEqual(newTab.value.canvas, value.canvas, `${newPhase}: native text canvas differs`);
      }
      results[phase] = value;
    } catch (error) {
      report.failure = String(error.stack || error);
      await checkpoint(phase + ':failed');
      throw error;
    } finally {
      await checkpoint(phase + ':stop');
      await page.evaluate(id => window.ops.stopProfile(id), profiles[owner].id);
      report.profileAudit = fixture.snapshot();
      await checkpoint(phase + ':stopped');
    }
  }
  assert.notEqual(results['a-first'].canvas[0], results['b-first'].canvas[0], 'Different environment seeds produced the same canvas');
  assert.notEqual(results['a-first'].canvasControl[0], results['b-first'].canvasControl[0],
    'Identical shape-only drawings must retain distinct pixel noise across environments, independently of fonts');
  report.checks.push('native-configured-user-agent-language-timezone-cpu-memory',
    'native-cookie-localstorage-isolated-and-persistent', 'native-canvas-stable-per-profile-and-distinct-across-profiles',
    'native-multiple-startup-pages-retained-with-first-script-profile',
    'native-new-target-first-script-identity-and-proxy-after-start-and-reopen');
  await verifyNativeSessionRestore({page, profile, expected: settings.A, ua, originPort,
    profileRoot: profileRoots.A, fixture, report, checkpoint, cdp});
  // Exercise the REAL engine's nested startup catch, not only the cache helper:
  // no last-chance navigation, ready state or stranded lock on a rejected file.
  const identityPath = path.join(profileRoots.A, `lyco-native-identity-${profile.id}.json`);
  const identityBackup = await fs.readFile(identityPath);
  const damagedBytes = Buffer.from('{ CI deliberately damaged native identity');
  let recoveryProfile;
  try {
    await checkpoint('profile:damaged-identity');
    await fs.writeFile(identityPath, damagedBytes);
    const target = `http://127.0.0.1:${originPort}/profile-probe?phase=a-corrupt`;
    const corruptProfile = await page.evaluate(({source, target}) => window.adoptLycoProfile({
      ...source, startUrl: target, platform: {type: 'other', startUrl: target},
      advanced: {...source.advanced, startUrls: target},
      privacy: {...source.privacy, refreshFingerprintOnStart: false},
    }), {source: profile, target});
    await assert.rejects(() => page.evaluate(source => window.ops.startProfile(source), corruptProfile), /原生身份文件损坏/);
    const stopped = await page.evaluate(async id => (await window.ops.profileStatus()).find(item => item.id === id), profile.id);
    assert.equal(stopped.running, false, 'Rejected identity must not leave an apparently ready browser');
    assert.equal(Boolean(stopped.starting), false, 'Rejected identity must release startup state');
    assert.deepEqual(await fs.readFile(identityPath), damagedBytes, 'Rejected cache was silently replaced');
    assert.equal(fixture.result('a-corrupt'), undefined, 'Rejected identity navigated to a user page');
    assert.equal(report.proxyRequests.some(row => row.path.includes('phase=a-corrupt')), false,
      'A real target request escaped the failed identity startup');
    report.checks.push('native-damaged-identity-blocks-navigation-and-cleans-startup');
    await fs.writeFile(identityPath, identityBackup);
    const recoveryTarget = `http://127.0.0.1:${originPort}/profile-probe?phase=a-recover`;
    recoveryProfile = await page.evaluate(({source, target}) => window.adoptLycoProfile({
      ...source, startUrl: target, platform: {type: 'other', startUrl: target},
      advanced: {...source.advanced, startUrls: target},
      privacy: {...source.privacy, refreshFingerprintOnStart: false},
    }), {source: profile, target: recoveryTarget});
    await checkpoint('profile:identity-backup-recovery');
    const recovered = await page.evaluate(source => window.ops.startProfile(source), recoveryProfile);
    assert.equal(recovered.running, true, 'Original identity backup did not release/recover the real profile');
    assert.equal(recovered.verificationBlocked, false);
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline && !fixture.result('a-recover')?.value) await new Promise(resolve => setTimeout(resolve, 150));
    const observed = fixture.result('a-recover');
    assert.ok(observed?.value && observed.pageProxied && observed.reportProxied,
      'Recovered browser must actually reach the fixture through Mihomo');
    assert.deepEqual(await fs.readFile(identityPath), identityBackup, 'Recovery changed the saved identity');
    report.checks.push('native-identity-backup-restores-profile-launch');
  } catch (error) {
    report.failure = String(error.stack || error);
    await checkpoint('profile:identity-failure-contract-failed');
    throw error;
  } finally {
    await page.evaluate(id => window.ops.stopProfile(id), profile.id).catch(() => {});
    await fs.writeFile(identityPath, identityBackup);
    report.profileAudit = fixture.snapshot();
  }
  // Restore the original environment as the existing ownership/expiry target.
  await checkpoint('profile:restore-original');
  await page.evaluate(source => window.adoptLycoProfile(source), profile);
}
