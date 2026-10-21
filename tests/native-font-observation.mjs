import assert from 'node:assert/strict';
import {hostFontControlFamily, fontControlProbeSource, assertHostFontLayout} from './browser-font-control.mjs';

// Public, fixed controls only. Never enumerate or upload a user's font payload.
export {hostFontControlFamily};
export const fontCandidates = Object.freeze(['Arial', 'Calibri', 'Cambria', 'Consolas',
  'Segoe UI Emoji', 'Microsoft YaHei', 'SimSun', 'Noto Sans CJK SC', 'Papyrus', 'Helvetica Neue', hostFontControlFamily]);

export function summarizeFontDeclaration(fonts) {
  const encoding = typeof fonts === 'string' ? 'json-string' : Array.isArray(fonts) ? 'array' : typeof fonts;
  let value = fonts;
  if (typeof value === 'string') {
    try {value = JSON.parse(value);} catch {return {encoding, recognized: false, reason: 'invalid-json'};}
  }
  if (!Array.isArray(value) || !value.every(family => typeof family === 'string')) {
    return {encoding, recognized: false, reason: 'unsupported-shape'};
  }
  const declared = new Set(value.map(family => family.trim().toLowerCase()));
  return {encoding, recognized: true, count: value.length,
    candidates: Object.fromEntries(fontCandidates.map(family => [family, declared.has(family.toLowerCase())]))};
}

function fontObservation(candidates) {
  return Promise.all(candidates.map(async family => {
    let timer;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const texts = ['mmmmmmmmWWWWiiii', '创作工具中文预览', 'AΩЖあ한🙂'];
    const measure = font => {
      if (!context) return null;
      context.font = font;
      return texts.map(text => context.measureText(text).width);
    };
    const fallback = measure('16px monospace');
    const requested = measure('16px ' + JSON.stringify(family) + ', monospace');
    let local, localError;
    try {
      const face = new FontFace('lyco-font-control', 'local(' + JSON.stringify(family) + ')');
      local = await Promise.race([
        face.load().then(() => 'loaded', error => {
          localError = ['NetworkError', 'NotSupportedError', 'SecurityError', 'InvalidStateError'].includes(error?.name) ? error.name : 'other';
          return 'rejected';
        }),
        new Promise(resolve => {timer = setTimeout(() => resolve('timeout'), 1200);}),
      ]);
    } catch {local = 'unavailable';}
    finally {clearTimeout(timer);}
    return {family, local, ...(localError ? {localError} : {}), fallback, requested};
  }));
}

export async function observeFontControlCandidate(page, family) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw Error('Host font controls only run in Actions');
  assert.equal(family, hostFontControlFamily, 'The Actions host font control is not installed');
  const [value] = await page.evaluate(fontObservation, [family]);
  assert.equal(value?.family, family);
  for (const key of ['fallback', 'requested']) {
    assert.ok(Array.isArray(value[key]) && value[key].length === 3 && value[key].every(Number.isFinite));
  }
  return value;
}

export async function observeHostFontControl(page, family) {
  const value = await observeFontControlCandidate(page, family);
  try {
    assert.equal(value.local, 'loaded', 'The unconfigured host browser could not load the host font control');
    assert.notEqual(value.requested[0], value.fallback[0], 'The host font control did not change ASCII metrics');
    value.layout = await page.evaluate(fontControlProbeSource());
    assertHostFontLayout(value.layout);
  } catch (error) {
    // Preserve the exact failed positive control, never call it isolation.
    error.observation = {...value, positive: false};
    throw error;
  }
  return {...value, positive: true};
}

export function compareHostFontControl(declaration, native, product, hostControl) {
  if (hostControl?.positive !== true || hostControl.family !== hostFontControlFamily) return {status: 'host-positive-control-missing'};
  if (!declaration.recognized) return {status: 'declaration-unrecognized'};
  if (declaration.candidates[hostFontControlFamily] !== false) return {status: 'control-declared-or-unknown'};
  const nativeRow = native.find(row => row.family === hostFontControlFamily);
  const productRow = product.find(row => row.family === hostFontControlFamily);
  if (!nativeRow || !productRow) return {status: 'observations-incomplete'};
  const blocked = row => {
    if (!['loaded', 'rejected'].includes(row.local)) return null;
    return row.local === 'rejected' && row.requested.every((width, index) => width === row.fallback[index]);
  };
  return {status: 'observed', declared: false, nativeExtraBlocked: blocked(nativeRow), productExtraBlocked: blocked(productRow)};
}

export async function observeNativeFonts({cdp, socket, contextId, hostControl}) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw Error('Native font observation only runs in Actions');
  assert.ok(Number.isInteger(contextId) && contextId > 0);
  const response = await cdp.call(socket, 'Wayfern.getFingerprint', {}, 3000);
  let device = response?.fingerprint ?? response;
  if (typeof device === 'string') device = JSON.parse(device);
  const declaration = summarizeFontDeclaration(device?.fonts);
  const expression = '(' + fontObservation.toString() + ')(' + JSON.stringify(fontCandidates) + ')';
  const read = async isolated => {
    const result = await cdp.call(socket, 'Runtime.evaluate', {expression, awaitPromise: true,
      returnByValue: true, ...(isolated ? {contextId} : {})}, 5000);
    assert.equal(result.exceptionDetails, undefined, 'Font observation threw');
    const rows = result.result?.value;
    assert.ok(Array.isArray(rows) && rows.length === fontCandidates.length, 'Incomplete font observation');
    for (const [index, row] of rows.entries()) {
      assert.equal(row.family, fontCandidates[index]);
      assert.ok(['loaded', 'rejected', 'timeout', 'unavailable'].includes(row.local));
      for (const key of ['fallback', 'requested']) {
        assert.ok(Array.isArray(row[key]) && row[key].length === 3 && row[key].every(Number.isFinite), 'Invalid font metric');
      }
    }
    return rows;
  };
  // Isolated globals bypass document JS wrappers but retain native frame
  // settings. No setFingerprint, style mutation, installed font or mode change.
  const native = await read(true);
  const product = await read(false);
  return {declaration, native, product, hostExtra: compareHostFontControl(declaration, native, product, hostControl),
    privacyCertified: false, limitation: 'This finite font control does not certify all font APIs or frame/worker isolation'};
}
