import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {assertFontControlIsolation} from './browser-font-control.mjs';

// Synthetic exit metadata from the CI proxy, not a Net.Coffee result. Exercise
// the normal proxy check and launch APIs, without changing the OS or page APIs.
export async function verifyNativeEgressLocale({page, profile, profileRoot, originPort, fixture, report, checkpoint}) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw Error('Egress locale acceptance only runs in Actions');
  const phase = 'a-korean-egress-extra';
  const target = `http://127.0.0.1:${originPort}/profile-probe?phase=${phase}`;
  assert.ok(typeof profileRoot === 'string' && path.isAbsolute(profileRoot), 'Previously observed native environment is required');
  const cache = path.join(profileRoot, `lyco-native-identity-${profile.id}.json`);
  const before = await fs.readFile(cache);
  try {
    await checkpoint('egress-locale:check-korean-country-without-timezone');
    const configured = await page.evaluate(async ({source, target}) => {
      const pending = window.adoptLycoProfile({...source, language: 'zh-CN',
        exitCountryCode: '', exitTimezone: 'Etc/UTC', startUrl: target,
        platform: {type: 'other', startUrl: target},
        advanced: {...source.advanced, startUrls: target, tabMode: 'custom', restoreSession: false, saveCookies: true},
        privacy: {...source.privacy, deviceProfile: 'default', languageMode: 'ip', langFromIp: true,
          uiLanguage: 'profile', timezoneMode: 'ip', timezone: 'Etc/UTC', refreshFingerprintOnStart: false},
      });
      const checked = await window.ops.checkProfileProxy(pending);
      return {network: {countryCode: checked.countryCode, timezone: checked.timezone},
        profile: window.adoptLycoProfile(checked.profile)};
    }, {source: profile, target});
    report.egressLocale = {fixture: true, fixtureProvidesExactTimezone: false, realPublicEgressTested: false, network: configured.network,
      configured: {language: configured.profile.language, timezone: configured.profile.privacy.timezone}};
    await checkpoint('egress-locale:configured');
    assert.equal(configured.network.countryCode, 'KR');
    assert.equal(configured.profile.language, 'ko-KR');
    assert.equal(configured.profile.privacy.timezone, 'Asia/Seoul');
    await page.evaluate(source => window.ops.startProfile(source), configured.profile);
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline && !fixture.result(phase)?.value) await new Promise(resolve => setTimeout(resolve, 100));
    const entry = fixture.result(phase);
    report.egressLocale.observation = entry || null;
    await checkpoint('egress-locale:observed');
    assert.ok(entry?.pageProxied && entry.reportProxied && entry.value, 'Locale page/report must use the managed proxy');
    assert.equal(entry.value.error, undefined);
    assert.equal(entry.value.language, 'ko-KR', 'First script retained the previous browser language');
    assert.deepEqual(entry.value.languages, ['ko-KR', 'ko']);
    assert.equal(entry.requestLanguage.split(',')[0], 'ko-KR', 'Request header must agree with navigator');
    assert.equal(entry.value.timezone, 'Asia/Seoul', 'First script retained the unconfirmed UTC timezone');
    assertFontControlIsolation(entry.value.fontControl, report.hostFontControl, phase);
    assert.deepEqual(await fs.readFile(cache), before, 'Locale update must not mint a new native device');
    report.checks.push('native-korean-ip-locale-missing-timezone-first-script-and-request-header');
  } finally {
    await page.evaluate(id => window.ops.stopProfile(id), profile.id);
    await page.evaluate(source => window.adoptLycoProfile(source), profile);
    await checkpoint('egress-locale:stopped');
  }
}
