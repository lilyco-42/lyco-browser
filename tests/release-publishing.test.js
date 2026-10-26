'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

function publish(t,{held=true,existing=false,approved=false}={}) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lyco-publish-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const calls=path.join(dir,'calls.txt'),asset=path.join(dir,'preview.zip');
 fs.writeFileSync(asset,'CI-only fixture');
 fs.writeFileSync(path.join(dir,'gh'),`#!/bin/bash
printf '%s\\n' "$*" >> "$LYCO_TEST_GH_CALLS"
if [[ "$1 $2" == 'release view' ]]; then
  [[ "$LYCO_TEST_EXISTING" == 'yes' ]] && exit 0
  exit 1
fi
exit 0
`,{mode:0o755});
 const env={...process.env,PATH:dir+path.delimiter+process.env.PATH,
  GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'lilyco-42/lyco-browser',GITHUB_SHA:'a'.repeat(40),
  LYCO_TEST_GH_CALLS:calls,LYCO_TEST_EXISTING:existing?'yes':'no'};
 if(held)env.LYCO_DESKTOP_PUBLIC_RELEASE='false';else if(approved)env.LYCO_DESKTOP_PUBLIC_RELEASE='true';else delete env.LYCO_DESKTOP_PUBLIC_RELEASE;
 const result=spawnSync('bash',[path.join(__dirname,'../scripts/ci-publish-release.sh'),asset],{env,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 return {calls:fs.readFileSync(calls,'utf8').trim().split('\n'),stdout:result.stdout};
}

test('unapproved desktop builds are created and retained as drafts before asset upload',t=>{
 const result=publish(t);
 assert.match(result.calls.find(line=>line.startsWith('release create ')),/--draft/);
 const edit=result.calls.findIndex(line=>line.startsWith('release edit '));
 const upload=result.calls.findIndex(line=>line.startsWith('release upload '));
 assert.ok(edit>=0&&upload>edit);
 assert.match(result.calls[edit],/--draft/);assert.match(result.stdout,/not approved/);
});

test('an existing release is made draft before replacing desktop assets',t=>{
 const result=publish(t,{existing:true});
 assert.equal(result.calls.some(line=>line.startsWith('release create ')),false);
 assert.match(result.calls[1],/^release edit .*--draft/);
 assert.match(result.calls[2],/^release upload /);
});

test('other existing publishers keep their explicit prerelease behavior',t=>{
 const result=publish(t,{held:false});
 const create=result.calls.find(line=>line.startsWith('release create '));
 assert.match(create,/--prerelease/);assert.doesNotMatch(create,/--draft/);
 assert.match(create,/Android debug APK; iOS simulator only/);
 assert.equal(result.calls.some(line=>line.startsWith('release edit ')),false);
});

test('explicitly authorized desktop builds create a public prerelease',t=>{
 const result=publish(t,{held:false,approved:true});
 const create=result.calls.find(line=>line.startsWith('release create '));
 assert.match(create,/--prerelease/);assert.doesNotMatch(create,/--draft/);
 assert.match(create,/Windows x64 EXE\/ZIP, macOS arm64 DMG and Linux x64 archive/);
 assert.match(create,/availability alone does not prove complete workflow acceptance/);
 assert.match(create,/macOS\/Linux packaging is not native UI acceptance/);
 assert.doesNotMatch(create,/React Native|Android|iOS simulator|system-font redistribution rights are reviewed/);
 assert.equal(result.calls.some(line=>line.startsWith('release edit ')),false);
 assert.match(result.stdout,/CI release:/);
});
test('universal release steps expose a scoped GitHub token only at publication',()=>{
 const yaml=fs.readFileSync(path.join(__dirname,'../.github/workflows/build-universal.yml'),'utf8').replace(/\r\n/g,'\n');
 for(const name of [
  'Upload React Native Web to GitHub prerelease',
  'Upload Android APK to GitHub prerelease',
  'Upload iOS simulator build to GitHub prerelease',
 ]) {
  const block=yaml.split('      - name: '+name+'\n')[1]?.split(/\n      - (?:name:|uses:|run:)/)[0];
  assert.ok(block?.includes('GH_TOKEN: '+'$'+'{{ github.token }}'),'GH_TOKEN missing from '+name);
  assert.ok(block.includes("if: github.event_name != 'pull_request'"),'PR must not publish '+name);
 }
 assert.ok(!yaml.includes('\n  env:\n    GH_TOKEN:'),'Do not expose release token at workflow scope');
});
