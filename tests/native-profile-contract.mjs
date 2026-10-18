import assert from 'node:assert/strict';

// Drive existing workbench actions and the unchanged engine. These expectations
// come from explicit saved settings, not from production buildFingerprint().
export async function verifyNativeProfileIsolation({page, profile, originPort, fixture, report}) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw Error('CI only');
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';
  const settings = {
    A: {language: 'en-GB', timezone: 'Asia/Tokyo', cores: 6, memory: 4},
    B: {language: 'fr-FR', timezone: 'Europe/Paris', cores: 8, memory: 8},
  };
  await page.locator('[data-view="lyco"]').click();
  await page.locator('#lyco-create-profile').click();
  await page.waitForFunction(id => window.__lycoCreated?.id && window.__lycoCreated.id !== id, profile.id);
  const second = await page.evaluate(() => window.__lycoCreated);
  assert.notEqual(second.id, profile.id, 'Storage test requires two actual environments');
  assert.ok(second.proxyId, 'Second environment must retain its managed proxy binding');
  const profiles = {A: profile, B: second};
  const results = {};
  for (const [phase, owner] of [['a-first', 'A'], ['b-first', 'B'], ['a-reopen', 'A'], ['b-reopen', 'B']]) {
    const expected = settings[owner];
    const target = `http://127.0.0.1:${originPort}/profile-probe?phase=${phase}`;
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
    await page.locator(`#profile-table tr[data-profile-id="${profiles[owner].id}"] .col-name`).dblclick();
    try {
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline && !fixture.result(phase)?.value) await new Promise(resolve => setTimeout(resolve, 150));
      const observed = fixture.result(phase);
      assert.ok(observed?.value, `${phase}: real browser did not send its profile observation`);
      assert.equal(observed.pageProxied, true, `${phase}: page bypassed the managed proxy`);
      assert.equal(observed.reportProxied, true, `${phase}: report bypassed the managed proxy`);
      const value = observed.value;
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
      results[phase] = value;
    } finally {
      await page.evaluate(id => window.ops.stopProfile(id), profiles[owner].id);
      report.profileAudit = fixture.snapshot();
    }
  }
  assert.equal(results['a-first'].canvas[0], results['a-reopen'].canvas[0], 'A canvas changed across restart');
  assert.equal(results['b-first'].canvas[0], results['b-reopen'].canvas[0], 'B canvas changed across restart');
  assert.notEqual(results['a-first'].canvas[0], results['b-first'].canvas[0], 'Different environment seeds produced the same canvas');
  report.checks.push('native-configured-user-agent-language-timezone-cpu-memory',
    'native-cookie-localstorage-isolated-and-persistent', 'native-canvas-stable-per-profile-and-distinct-across-profiles');
  // Restore the original environment as the existing ownership/expiry target.
  await page.evaluate(source => window.adoptLycoProfile(source), profile);
}
