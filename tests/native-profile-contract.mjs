import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

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
  const results = {};
  const requireApp = createRequire(path.join(appRoot, 'package.json'));
  const {loadInitObject} = requireApp('./automation/kernel-init-sync');
  const cdp = requireApp('./cdp');
  report.profileRuntime = {};
  for (const [phase, owner] of [['a-first', 'A'], ['b-first', 'B'], ['a-reopen', 'A'], ['b-reopen', 'B']]) {
    const expected = settings[owner];
    const target = `http://127.0.0.1:${originPort}/profile-probe?phase=${phase}`;
    await checkpoint(phase + ':configure');
    await page.evaluate(({source, expected, target, ua}) => window.adoptLycoProfile({
      ...source, os: 'Windows', language: expected.language, userAgent: ua,
      startUrl: target, platform: {type: 'other', startUrl: target},
      advanced: {...source.advanced, startUrls: target, saveCookies: true},
      fingerprint: {...source.fingerprint, cores: expected.cores, memory: expected.memory},
      privacy: {...source.privacy, deviceProfile: 'default', cores: expected.cores, memory: expected.memory,
        languageMode: 'profile', uiLanguage: 'profile', langFromIp: false, timezoneFromIp: false, geoFromIp: false,
        timezoneMode: 'custom', timezone: expected.timezone, canvas: 'noise', refreshFingerprintOnStart: false},
    }), {source: profiles[owner], expected, target, ua});
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
          digest: digest(native), canvasDigest: digest(native?.canvas ?? native?.noise?.canvas)};
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
  report.checks.push('native-configured-user-agent-language-timezone-cpu-memory',
    'native-cookie-localstorage-isolated-and-persistent', 'native-canvas-stable-per-profile-and-distinct-across-profiles');
  // Restore the original environment as the existing ownership/expiry target.
  await checkpoint('profile:restore-original');
  await page.evaluate(source => window.adoptLycoProfile(source), profile);
}
