'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');

function run(t, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyco-review-release-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const calls = path.join(dir, 'calls.txt');
  fs.writeFileSync(path.join(dir, 'gh'), `#!/bin/bash
printf '%s\\n' "$*" >> "$LYCO_TEST_CALLS"
if [[ "$1 $2" == 'release view' ]]; then
 [[ "$LYCO_TEST_EXISTING" == yes ]] || exit 1
 echo "$LYCO_TEST_DRAFT"
elif [[ "$1" == api ]]; then
 echo "$LYCO_TEST_TARGET"
fi
exit 0
`, {mode: 0o755});
  const zip = path.join(dir, 'LYCO-Browser-Windows-x64-MVP.zip');
  const exe = path.join(dir, 'LYCO-Browser-Windows-x64-MVP.exe');
  fs.writeFileSync(zip, 'CI fixture only'); fs.writeFileSync(exe, 'CI fixture only');
  const env = {...process.env, PATH: dir + path.delimiter + process.env.PATH,
    GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'pull_request', GITHUB_REPOSITORY: 'lilyco-42/lyco-browser',
    PR_HEAD_REPOSITORY: 'lilyco-42/lyco-browser', GITHUB_REPOSITORY_OWNER: 'lilyco-42', GITHUB_ACTOR: 'lilyco-42',
    GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '123456', GITHUB_RUN_ATTEMPT: '1', LYCO_NATIVE_GATES_PASSED: 'true',
    LYCO_TEST_CALLS: calls, LYCO_TEST_EXISTING: 'no', LYCO_TEST_DRAFT: 'true', LYCO_TEST_TARGET: 'a'.repeat(40), ...overrides};
  const result = spawnSync('bash', [path.join(__dirname, '../scripts/ci-retain-windows-preview.sh'), zip, exe], {env, encoding: 'utf8'});
  return {result, calls: fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n') : []};
}

test('retains only a draft and checksum manifest, with no asset replacement or publish operation', t => {
  const {result, calls} = run(t);
  assert.equal(result.status, 0, result.stderr);
  assert.match(calls.find(line => line.startsWith('release create ')), /--draft/);
  const upload = calls.find(line => line.startsWith('release upload '));
  assert.match(upload, /SHA256SUMS\.txt/);
  assert.doesNotMatch(upload, /--clobber/);
  assert.equal(calls.some(line => line.startsWith('release edit ')), false);
});

test('refuses forks, other actors, failed gates, non-PR execution and local execution before calling GitHub', t => {
  for(const overrides of [{PR_HEAD_REPOSITORY: 'other/fork'}, {GITHUB_ACTOR: 'other'},
    {GITHUB_ACTOR: '', GITHUB_REPOSITORY_OWNER: ''}, {LYCO_NATIVE_GATES_PASSED: 'false'},
    {GITHUB_EVENT_NAME: 'push'}, {GITHUB_ACTIONS: 'false'}]) {
    const {result, calls} = run(t, overrides);
    assert.equal(result.status, 2); assert.deepEqual(calls, []);
  }
});

test('does not mutate existing public releases or tags for a different source', t => {
  for(const overrides of [{LYCO_TEST_EXISTING: 'yes', LYCO_TEST_DRAFT: 'false'},
    {LYCO_TEST_EXISTING: 'yes', LYCO_TEST_TARGET: 'b'.repeat(40)}]) {
    const {result, calls} = run(t, overrides);
    assert.equal(result.status, 3, result.stderr);
    assert.equal(calls.some(line => /^release (create|upload|edit) /.test(line)), false);
  }
});
