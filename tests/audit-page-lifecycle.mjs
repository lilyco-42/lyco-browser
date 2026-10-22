import assert from 'node:assert/strict';

// Observe the same page a person would see after selecting its tab. Do not
// override visibility, thaw frozen pages, reload detectors or write results.
const stateExpression = `({visibility: document.visibilityState, focused: document.hasFocus(),
  ready: document.readyState, fingerprintPresent: !!window.Fingerprint,
  creepPresent: !!window.Creep, sdkPresent: !!window.independentSdkResults,
  scanButtonPresent: !!document.getElementById('scan-btn'),
  scanButtonDisabled: document.getElementById('scan-btn')?.disabled ?? null})`;

export async function readAuditPageState(connection) {
  const response = await connection.command('Runtime.evaluate', {
    expression: stateExpression, returnByValue: true,
  }, {timeout: 3000});
  assert.equal(response.exceptionDetails, undefined, 'Audit lifecycle observation threw');
  const state = response.result?.value;
  assert.ok(state && typeof state === 'object', 'Audit lifecycle state missing');
  return state;
}

export async function prepareAuditForeground(cdp, socket) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw Error('Audit lifecycle runs only in Actions');
  // A bare observer must not install another engine auto-attach owner.
  const connection = await new cdp.PersistentConnection(socket).open(3000);
  try {
    const before = await readAuditPageState(connection);
    await connection.command('Page.bringToFront', {}, {timeout: 3000});
    const after = await readAuditPageState(connection);
    assert.equal(after.visibility, 'visible', 'Selected detector page is not visible');
    assert.equal(after.focused, true, 'Selected detector page is not focused');
    return {before, after};
  } finally {connection.close();}
}
