'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
if (process.env.GITHUB_ACTIONS !== 'true') throw Error('Patched upstream acceptance runs only in Actions');
const {sanitizeProfile} = require(path.resolve(__dirname, '../../upstream/Browserapp/engine/profile-sanitizer.js'));
const {buildFingerprint, buildWorkerInjectionScript} = require(path.resolve(__dirname, '../../upstream/Browserapp/automation/fingerprint.js'));
const {resolveProfileTimezone, resolveProfileLanguage} = require(path.resolve(__dirname, '../../upstream/Browserapp/automation/locale-from-country.js'));

test('actual patched Worker source retains native UAData while legacy profiles still apply their metadata', async () => {
  for (const preserve of [true, false]) {
    const fp = buildFingerprint(sanitizeProfile({id: 'worker-native-ua', name: 'Worker UA', os: 'Windows',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/149.0.0.0 Safari/537.36'}));
    fp.uaProfile = {...fp.uaProfile, preserveNativeClientHints: preserve};
    const nativeHigh = {architecture: 'x86', bitness: '64', platformVersion: '12.0.0',
      fullVersionList: [{brand: 'Chromium', version: '149.0.7827.114'}]};
    class NavigatorUAData {
      get brands() {return [{brand: 'Chromium', version: '149'}];}
      get mobile() {return false;}
      get platform() {return 'Windows';}
      async getHighEntropyValues() {return nativeHigh;}
      toJSON() {return {brands: this.brands, mobile: this.mobile, platform: this.platform};}
    }
    const data = new NavigatorUAData();
    class WorkerNavigator {}
    const nativeGetter = function () {return data;};
    Object.defineProperty(WorkerNavigator.prototype, 'userAgentData', {configurable: true, enumerable: true, get: nativeGetter});
    Object.defineProperty(WorkerNavigator.prototype, 'userAgent', {configurable: true, enumerable: true, get() {return fp.userAgent;}});
    const navigator = new WorkerNavigator();
    const highMethod = NavigatorUAData.prototype.getHighEntropyValues;
    vm.runInNewContext(buildWorkerInjectionScript(fp), {navigator, WorkerNavigator, NavigatorUAData,
      self: {navigator}, setTimeout, clearTimeout});
    if (preserve) {
      assert.equal(navigator.userAgentData, data);
      assert.equal(Object.getOwnPropertyDescriptor(WorkerNavigator.prototype, 'userAgentData').get, nativeGetter);
      assert.equal(NavigatorUAData.prototype.getHighEntropyValues, highMethod);
      assert.equal(await data.getHighEntropyValues(), nativeHigh);
    } else {
      assert.notEqual(navigator.userAgentData, data, 'Legacy metadata policy must remain active');
      const high = await navigator.userAgentData.getHighEntropyValues(['platformVersion', 'fullVersionList']);
      assert.equal(high.platformVersion, fp.userAgentMetadata.platformVersion);
    }
  }
});

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
