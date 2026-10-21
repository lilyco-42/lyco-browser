'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
if (process.env.GITHUB_ACTIONS !== 'true') throw Error('Patched upstream acceptance runs only in Actions');
const {sanitizeProfile} = require(path.resolve(__dirname, '../../upstream/Browserapp/engine/profile-sanitizer.js'));
const {buildFingerprint} = require(path.resolve(__dirname, '../../upstream/Browserapp/automation/fingerprint.js'));

test('native and legacy layout choices survive the real sanitizer and fingerprint builder', () => {
  for (const mode of ['native', 'noise', 'real']) {
    const profile = sanitizeProfile({id: 'layout-policy-contract', name: 'Layout policy', privacy: {clientRects: mode}});
    assert.equal(profile.privacy.clientRects, mode);
    assert.equal(buildFingerprint(profile).clientRects.mode, mode);
  }
  assert.equal(sanitizeProfile({id: 'unmigrated-policy', name: 'Existing'}).privacy.clientRects, 'noise',
    'The shared sanitizer must not silently change the default of existing profiles');
});
