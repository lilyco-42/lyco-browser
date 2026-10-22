'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
if (process.env.GITHUB_ACTIONS !== 'true') throw Error('Patched upstream acceptance runs only in Actions');
const {sanitizeProfile} = require(path.resolve(__dirname, '../../upstream/Browserapp/engine/profile-sanitizer.js'));
const {buildFingerprint} = require(path.resolve(__dirname, '../../upstream/Browserapp/automation/fingerprint.js'));
const {resolveProfileTimezone, resolveProfileLanguage} = require(path.resolve(__dirname, '../../upstream/Browserapp/automation/locale-from-country.js'));

test('native and legacy layout choices survive the real sanitizer and fingerprint builder', () => {
  for (const mode of ['native', 'noise', 'real']) {
    const profile = sanitizeProfile({id: 'layout-policy-contract', name: 'Layout policy', privacy: {clientRects: mode}});
    assert.equal(profile.privacy.clientRects, mode);
    assert.equal(buildFingerprint(profile).clientRects.mode, mode);
  }
  assert.equal(sanitizeProfile({id: 'unmigrated-policy', name: 'Existing'}).privacy.clientRects, 'noise',
    'The shared sanitizer must not silently change the default of existing profiles');
});

test('an IP-derived country without timezone cannot inherit an unconfirmed UTC default', () => {
  const profile = {exitTimezone: 'Etc/UTC', language: 'zh-CN', privacy: {timezoneMode: 'ip', languageMode: 'ip'}};
  assert.equal(resolveProfileTimezone(profile, {countryCode: 'KR'}), 'Asia/Seoul');
  assert.equal(resolveProfileLanguage(profile, {countryCode: 'KR'}), 'ko-KR');
  assert.equal(resolveProfileTimezone(profile, {countryCode: 'JP'}), 'Asia/Tokyo');
  assert.equal(resolveProfileTimezone({...profile, exitCountryCode: 'US', exitTimezone: 'America/New_York'},
    {countryCode: 'US'}), 'America/New_York', 'Same known country keeps its regional timezone');
  assert.equal(resolveProfileTimezone({...profile, exitCountryCode: 'US', exitTimezone: 'America/New_York'},
    {countryCode: 'KR'}), 'Asia/Seoul', 'Country switch cannot retain the previous exit timezone');
  assert.equal(resolveProfileTimezone(profile, {}), 'Etc/UTC', 'Unavailable geo data does not erase saved settings');
  assert.equal(resolveProfileTimezone({...profile, privacy: {timezoneMode: 'custom', timezone: 'Asia/Tokyo'}},
    {countryCode: 'KR'}), 'Asia/Tokyo', 'Explicit user choice remains authoritative');
  assert.equal(resolveProfileTimezone(profile, {countryCode: 'US', timezone: 'America/Chicago'}), 'America/Chicago',
    'Valid exact network timezone remains authoritative');
});
