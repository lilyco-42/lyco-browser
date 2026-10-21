import test from 'node:test';
import assert from 'node:assert/strict';
import {fontCandidates, hostFontControlFamily, summarizeFontDeclaration, observeNativeFonts,
  compareHostFontControl, observeHostFontControl} from './native-font-observation.mjs';

test('a missing or unreadable host control cannot certify a negative font observation', async () => {
  assert.deepEqual(compareHostFontControl({}, [], [], null), {status: 'host-positive-control-missing'});
  const page = {evaluate: async () => [{family: hostFontControlFamily, local: 'rejected'}]};
  await assert.rejects(observeHostFontControl(page, hostFontControlFamily), /could not load/);
});

test('denied FontFace alone cannot conceal leaked host font metrics, and timeouts remain unknown', () => {
  const declaration = summarizeFontDeclaration(['Arial']);
  const host = {positive: true, family: hostFontControlFamily};
  const blocked = [{family: hostFontControlFamily, local: 'rejected', fallback: [1, 2, 3], requested: [1, 2, 3]}];
  const leaked = [{...blocked[0], requested: [10, 2, 3]}];
  assert.deepEqual(compareHostFontControl(declaration, blocked, leaked, host),
    {status: 'observed', declared: false, nativeExtraBlocked: true, productExtraBlocked: false});
  assert.equal(compareHostFontControl(declaration, [{...blocked[0], local: 'timeout'}], blocked, host).nativeExtraBlocked, null);
  assert.equal(compareHostFontControl(summarizeFontDeclaration([hostFontControlFamily]), blocked, blocked, host).status,
    'control-declared-or-unknown');
});

test('font declaration evidence includes only fixed public candidate membership', () => {
  const result = summarizeFontDeclaration('["Arial","PRIVATE_USER_FONT","SimSun"]');
  assert.equal(result.recognized, true);
  assert.equal(result.count, 3);
  assert.equal(result.candidates.Arial, true);
  assert.equal(result.candidates.Calibri, false);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_USER_FONT/);
  for (const value of [undefined, {}, '[invalid', [{family: 'Arial'}]]) {
    assert.equal(summarizeFontDeclaration(value).recognized, false);
  }
});

test('font observation reads existing worlds and never applies a new identity', async () => {
  const calls = [];
  const cdp = {call: async (socket, method, params) => {
    calls.push({method, params});
    if (method === 'Wayfern.getFingerprint') return {fonts: '["Arial"]', privatePayload: 'PRIVATE_TOKEN'};
    assert.equal(method, 'Runtime.evaluate');
    assert.doesNotMatch(params.expression, /document\.fonts\.add|appendChild|setProperty|setFingerprint/);
    return {result: {value: fontCandidates.map(family => ({family, local: 'loaded', fallback: [1, 2, 3], requested: [2, 3, 4]}))}};
  }};
  const result = await observeNativeFonts({cdp, socket: 'owned-existing-page', contextId: 42});
  assert.deepEqual(calls.map(call => call.method), ['Wayfern.getFingerprint', 'Runtime.evaluate', 'Runtime.evaluate']);
  assert.equal(calls[1].params.contextId, 42);
  assert.equal(calls[2].params.contextId, undefined);
  assert.equal(result.privacyCertified, false, 'A loaded font without a host control is not privacy proof');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_TOKEN/);
});
