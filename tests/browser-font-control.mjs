import assert from 'node:assert/strict';

// A renamed OFL font installed only on the disposable Actions host. These
// readers never enumerate fonts, add a font to a page or override browser APIs.
export const hostFontControlFamily = 'LYCO Audit Control 20261021';

export function readFontControlMetrics(family) {
  const texts = ['mmmmmmmmWWWWiiii', '创作工具中文预览', 'AΩЖあ한🙂'];
  const fallbackFont = '16px monospace', requestedFont = '16px ' + JSON.stringify(family) + ', monospace';
  const hasDocument = typeof document === 'object';
  const canvas = hasDocument ? document.createElement('canvas') : new OffscreenCanvas(8, 8);
  const context = canvas.getContext('2d');
  if (!context) throw Error('Font control requires an actual 2D canvas');
  const measure = font => {context.font = font; return texts.map(text => context.measureText(text).width);};
  const result = {family, canvas: {fallback: measure(fallbackFont), requested: measure(requestedFont)}, dom: null};
  if (hasDocument) {
    const holder = document.createElement('div');
    holder.style.cssText = 'all:initial;position:fixed;left:-20000px;top:0;visibility:hidden;pointer-events:none';
    try {
      document.documentElement.appendChild(holder);
      const layout = font => texts.map(text => {
        const span = document.createElement('span');
        span.style.cssText = 'all:initial;display:block;width:max-content;white-space:pre';
        span.style.font = font; span.textContent = text; holder.appendChild(span);
        return span.getBoundingClientRect().width;
      });
      result.dom = {fallback: layout(fallbackFont), requested: layout(requestedFont)};
    } finally {holder.remove();}
  }
  return result;
}

export async function readLocalFontControl(family) {
  if (typeof FontFace !== 'function') return {api: false, local: 'absent'};
  let timer;
  try {
    const face = new FontFace('lyco-private-font-control', 'local(' + JSON.stringify(family) + ')');
    return await Promise.race([
      face.load().then(() => ({api: true, local: 'loaded'}), () => ({api: true, local: 'rejected'})),
      new Promise(resolve => {timer = setTimeout(() => resolve({api: true, local: 'timeout'}), 1200);}),
    ]);
  } catch {return {api: true, local: 'error'};}
  finally {clearTimeout(timer);}
}

export function fontControlProbeSource() {
  return '(async()=>{const value=(' + readFontControlMetrics.toString() + ')(' + JSON.stringify(hostFontControlFamily)
    + ');value.face=await (' + readLocalFontControl.toString() + ')(' + JSON.stringify(hostFontControlFamily) + ');return value;})()';
}

function metrics(value, label) {
  for (const key of ['fallback', 'requested']) assert.ok(Array.isArray(value?.[key]) && value[key].length === 3
    && value[key].every(width => Number.isFinite(width) && width > 0), label + ': missing actual font metrics');
}

export function assertHostFontLayout(value) {
  assert.equal(value?.family, hostFontControlFamily);
  for (const key of ['canvas', 'dom']) {
    metrics(value[key], 'Host ' + key);
    assert.notEqual(value[key].requested[0], value[key].fallback[0], 'Host ' + key + ' did not see the installed control');
  }
  assert.deepEqual(value.face, {api: true, local: 'loaded'}, 'Host FontFace must load the installed control');
}

export function assertFontControlIsolation(value, host, label, {requireDom = true, requireFace = true} = {}) {
  assert.equal(host?.positive, true, label + ': host positive control missing');
  assertHostFontLayout(host.layout);
  assert.equal(value?.family, hostFontControlFamily, label + ': wrong font control');
  for (const key of requireDom ? ['canvas', 'dom'] : ['canvas']) {
    metrics(value[key], label + ' ' + key);
    assert.deepEqual(value[key].requested, value[key].fallback, label + ': installed host font leaked through ' + key);
  }
  if (requireFace) {
    assert.ok(value.face?.api === true || value.face?.api === false, label + ': FontFace observation missing');
    assert.equal(value.face.local, value.face.api ? 'rejected' : 'absent', label + ': host local font was exposed or unreadable');
  }
}
