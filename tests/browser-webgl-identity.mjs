import assert from 'node:assert/strict';

// Serialize this read-only function into actual browser documents. It never
// patches prototypes, supplies a renderer or changes the saved native device.
export function readWebglIdentity() {
  const result = {};
  for (const api of ['webgl', 'webgl2']) {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext(api);
      if (!gl) {result[api] = {available: false}; continue;}
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      result[api] = {available: true, debugInfoAvailable: Boolean(extension),
        vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : null,
        renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null};
    } catch (error) {result[api] = {available: false, error: String(error)};}
  }
  return result;
}

export function assertWebglIdentity(value, prior, phase) {
  for (const api of ['webgl', 'webgl2']) {
    const current = value?.[api];
    assert.equal(current?.available, true, `${phase}: ${api} context unavailable`);
    assert.equal(current.debugInfoAvailable, true, `${phase}: ${api} GPU metadata unavailable`);
    for (const field of ['vendor', 'renderer']) {
      assert.ok(typeof current[field] === 'string' && current[field].trim(), `${phase}: ${api} missing ${field}`);
    }
    if (prior) assert.deepEqual(current, prior[api], `${phase}: ${api} identity changed within the same environment`);
  }
}
