import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareAuditForeground, readAuditPageState} from './audit-page-lifecycle.mjs';

test('select the existing detector tab without changing its lifecycle or results', async () => {
  const methods = []; let closed = false, selected = false;
  class Connection {
    async open() {return this;}
    async command(method, params) {
      methods.push(method);
      if (method === 'Page.bringToFront') {selected = true; return {};}
      assert.equal(method, 'Runtime.evaluate');
      assert.doesNotMatch(params.expression, /\.resume\(|\.run\(|\.reload\(|\.click\(|\b(?:score|band)\s*=/);
      return {result: {value: {visibility: selected ? 'visible' : 'hidden', focused: selected}}};
    }
    close() {closed = true;}
  }
  const result = await prepareAuditForeground({PersistentConnection: Connection}, 'owned-existing-page');
  assert.equal(result.before.visibility, 'hidden');
  assert.equal(result.after.visibility, 'visible');
  assert.deepEqual(methods, ['Runtime.evaluate', 'Page.bringToFront', 'Runtime.evaluate']);
  assert.equal(closed, true);
});

test('failed selection remains fatal and always releases the diagnostic connection', async () => {
  let closed = false;
  class Connection {
    async open() {return this;}
    async command() {return {result: {value: {visibility: 'hidden', focused: false}}};}
    close() {closed = true;}
  }
  await assert.rejects(prepareAuditForeground({PersistentConnection: Connection}, 'owned-existing-page'), /not visible/);
  assert.equal(closed, true);
});

test('failure-state observation does not require a screenshot and cannot accept a script error', async () => {
  await assert.rejects(readAuditPageState({command: async () => ({exceptionDetails: {text: 'failed'}})}), /observation threw/);
  await assert.rejects(readAuditPageState({command: async () => ({result: {}})}), /state missing/);
});
