import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeCpuProfile, beginCpuDiagnostic} from './audit-cpu-diagnostic.mjs';

const fixture = () => ({nodes: [{id: 1, callFrame: {functionName: 'checkNode',
  url: 'http://user:PRIVATE_TOKEN@127.0.0.1/independent/creepjs/creep.js?secret=PRIVATE_TOKEN',
  scriptId: 'PRIVATE_TOKEN', lineNumber: 42, columnNumber: 3}, hitCount: 8,
  children: [2], privateVariables: 'PRIVATE_TOKEN'}, {id: 2, callFrame: {functionName: '(idle)'}, hitCount: 2}],
samples: [1, 1, 2], timeDeltas: [10000, 10000, 10000], privatePayload: 'PRIVATE_TOKEN'});

test('CPU evidence retains call paths and source categories without URLs or variables', () => {
  const result = sanitizeCpuProfile(fixture());
  assert.deepEqual(result.nodes[0], {id: 1, callFrame: {functionName: 'checkNode', sourceKind: 'creepjs',
    lineNumber: 42, columnNumber: 3}, hitCount: 8, children: [2]});
  assert.deepEqual(result.samples, [1, 1, 2]);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_TOKEN|privateVariables|privatePayload|scriptId|url/);
  assert.equal(result.truncated, false);
  assert.throws(() => sanitizeCpuProfile({nodes: []}), /Invalid/);
});

test('profiling never sends evaluation, debugger or target-resume commands', async () => {
  const sent = [], response = fixture(); let closed = false;
  class Connection {
    async open() {return this;}
    async command(method, params) {sent.push({method, params}); return method === 'Profiler.stop' ? {profile: response} : {};}
    close() {closed = true;}
  }
  const diagnostic = await beginCpuDiagnostic({PersistentConnection: Connection}, 'private-page-socket');
  const result = await diagnostic.finish();
  assert.equal(result.available, true); assert.equal(result.top[0].functionName, 'checkNode');
  assert.deepEqual(sent.map(row => row.method), ['Profiler.enable', 'Profiler.setSamplingInterval', 'Profiler.start', 'Profiler.stop']);
  assert.deepEqual(sent[1].params, {interval: 10000}); assert.equal(closed, true);
  await diagnostic.finish(); assert.equal(sent.filter(row => row.method === 'Profiler.stop').length, 1);
});

test('an unavailable profiler is recorded without leaking errors or manufacturing a detector result', async () => {
  class Connection {
    async open() {return this;}
    async command() {throw Error('CDP timeout PRIVATE_TOKEN');}
    close() {}
  }
  const diagnostic = await beginCpuDiagnostic({PersistentConnection: Connection}, 'private-page-socket');
  const result = await diagnostic.finish();
  assert.deepEqual(result, {available: false, samplingIntervalUs: 10000, error: 'profiler-start-timeout'});
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_TOKEN|passed|score|bot/);
});
