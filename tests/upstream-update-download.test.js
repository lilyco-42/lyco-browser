'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const {createHash,randomUUID}=require('node:crypto');
const {copyVerifiedUpdate}=require('../src/update-download');
const {updateAssetUrlIsAllowed}=require('../src/update-policy');
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Patched upstream acceptance runs on Actions only');
const payload=Buffer.from('actual updater byte-stream fixture');
const digest=createHash('sha256').update(payload).digest('hex');

async function runDownload(t,{bytes=payload,sha256=digest}={}){
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'lyco-upstream-update-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));
 const source=(await fs.readFile(path.resolve(__dirname,'../../upstream/Browserapp/main.js'),'utf8')).replace(/\r\n/g,'\n');
 const matches=source.match(/async function downloadAppUpdate\(\) \{[\s\S]*?\n\}\n/g);
 assert.equal(matches?.length,1,'Exercise the actual patched download function');
 const name='LYCO-Browser-Windows-x64-MVP.exe',opened=[];
 const download=vm.runInNewContext('('+matches[0]+')',{
  checkAppUpdate:async()=>({canDownload:true,upToDate:false,remoteVersion:'1.2.3',
   asset:{name,size:payload.length,sha256,browser_download_url:'https://github.com/lilyco-42/lyco-browser/releases/download/v1.2.3/'+name}}),
  updateUrlIsAllowed:updateAssetUrlIsAllowed,copyVerifiedUpdate,AbortController,setTimeout,clearTimeout,
  app:{getPath:()=>folder,getVersion:()=> '1.0.0'},path,randomUUID,fsp:fs,
  fetch:async()=>new Response(bytes),UPDATE_MAX_BYTES:1024,emit:()=>{},
  shell:{openPath:async file=>{opened.push(file);assert.deepEqual(await fs.readFile(file),payload);return ''},showItemInFolder:()=>{}},
 });
 return {download,folder,opened};
}

test('the actual application opens the installer only after its bytes verify',async t=>{
 const {download,opened}=await runDownload(t);
 const result=await download();
 assert.equal(result.success,true);assert.equal(opened.length,1);assert.equal(opened[0],result.path);
});

test('the actual application removes corrupt or truncated files and never opens them',async t=>{
 for(const options of [{sha256:'0'.repeat(64)},{sha256:null},{bytes:payload.subarray(0,5)}]){
  const {download,folder,opened}=await runDownload(t,options);
  await assert.rejects(download(),/SHA-256|长度/);
  assert.equal(opened.length,0,'Shell must never receive an unverified installer');
  assert.deepEqual(await fs.readdir(folder),[],'Failed downloads must not remain in Downloads');
 }
});
