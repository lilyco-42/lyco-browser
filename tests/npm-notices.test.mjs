import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {collectNotices} from '../apps/universal/scripts/collect-npm-notices.mjs';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Actions only');
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'lyco-notice-test-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const packages={};
 for(const name of ['react','react-native','expo']){
  const id='node_modules/'+name,dir=path.join(root,id);await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'package.json'),JSON.stringify({name,version:'1.0.0',license:'MIT'}));
  await fs.writeFile(path.join(dir,'LICENSE'),'Copyright CI fixture '+name+'\nOriginal permission text.\n');
  packages[id]={version:'1.0.0',license:'MIT'};
 }
 const save=()=>fs.writeFile(path.join(root,'package-lock.json'),JSON.stringify({lockfileVersion:3,packages}));
 await save();return{root,packages,save};
}
test('original notice bytes, nested licenses, locked versions and missing optional packages are retained',async t=>{
 const f=await fixture(t);
 const dir=path.join(f.root,'node_modules/react/LICENSES');await fs.mkdir(dir);
 await fs.writeFile(path.join(dir,'NOTICE.txt'),'Exact additional copyright\n');
 f.packages['node_modules/optional-platform-tool']={version:'1.2.3',optional:true};await f.save();
 const result=await collectNotices(f.root);
 assert.equal(result.generated,true);assert.equal(result.packages.length,3);assert.deepEqual(result.review,[]);
 const react=result.packages.find(row=>row.name==='react');assert.equal(react.files.length,2);
 for(const file of react.files)assert.equal(file.sha256,createHash('sha256').update(file.text).digest('hex'));
 assert.equal(react.files.find(file=>file.name==='LICENSE').text,'Copyright CI fixture react\nOriginal permission text.\n');
 assert.deepEqual(result.notInstalled,['node_modules/optional-platform-tool']);
});
test('missing originals remain an explicit review item',async t=>{
 const f=await fixture(t);await fs.unlink(path.join(f.root,'node_modules/react/LICENSE'));
 const result=await collectNotices(f.root);
 assert.deepEqual(result.review,[{id:'node_modules/react',reason:'No original notice file found'}]);
});
test('installed version drift is rejected',async t=>{
 const f=await fixture(t);f.packages['node_modules/react'].version='2.0.0';await f.save();
 await assert.rejects(collectNotices(f.root),/differs from lock/);
});
test('locked traversal paths and external notice symlinks cannot enter a public bundle',async t=>{
 const f=await fixture(t);f.packages['node_modules/../../outside']={version:'1.0.0'};await f.save();
 await assert.rejects(collectNotices(f.root),/Unsafe locked package path/);
 delete f.packages['node_modules/../../outside'];await f.save();
 await fs.writeFile(path.join(f.root,'outside.txt'),'PRIVATE FIXTURE SENTINEL');
 const license=path.join(f.root,'node_modules/react/LICENSE');await fs.unlink(license);
 await fs.symlink(path.join(f.root,'outside.txt'),license);
 await assert.rejects(collectNotices(f.root),/Notice file leaves its package/);
});
