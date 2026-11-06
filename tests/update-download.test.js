'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {parseChecksum,resolveAssetSha256,copyVerifiedUpdate}=require('../src/update-download');
const data=Buffer.from('verified LYCO installer fixture');
const sha=createHash('sha256').update(data).digest('hex');
const name='LYCO-Browser-Windows-x64-MVP.exe';
const asset={name,browser_download_url:'https://github.com/lilyco-42/lyco-browser/releases/download/v1.2.3/'+name};

test('checksum records must identify the exact selected file without ambiguous duplicates',()=>{
 assert.equal(parseChecksum(sha+'  '+name+'\r\n',name),sha);
 assert.equal(parseChecksum(sha+' *'+name+'\n',name),sha);
 for(const text of [sha+'  other.exe\n',sha+'  ../'+name+'\n',sha+'  '+name+'\n'+sha+'  '+name+'\n','bad  '+name])assert.equal(parseChecksum(text,name),null);
});

test('release API SHA-256 metadata avoids additional requests and must match the exact version',async()=>{
 const release={draft:false,prerelease:false,tag_name:'v1.2.3',assets:[{...asset,digest:'sha256:'+sha}]};
 const fetch=async()=>{throw Error('Should use verified API metadata')};
 assert.equal(await resolveAssetSha256({asset,remoteVersion:'1.2.3',release,fetch}),sha);
 assert.equal(await resolveAssetSha256({asset,remoteVersion:'1.2.4',release,fetch}),null);
 assert.equal(await resolveAssetSha256({asset,remoteVersion:'1.2.3',release:{...release,prerelease:true},fetch}),null);
});

test('fallback checksums come from the same canonical release and are bounded while streaming',async()=>{
 const fetch=async url=>{assert.equal(url,asset.browser_download_url+'.sha256');return new Response(sha+'  '+name+'\n')};
 assert.equal(await resolveAssetSha256({asset,remoteVersion:'1.2.3',fetch}),sha);
 await assert.rejects(resolveAssetSha256({asset,remoteVersion:'1.2.3',fetch:async()=>new Response('x'.repeat(65537))}),/too large/);
 assert.equal(await resolveAssetSha256({asset,remoteVersion:'1.2.3',fetch:async()=>new Response('',{status:404})}),null);
});

test('verified bytes are completely written even when file writes are partial',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lyco-verified-download-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const target=path.join(dir,'installer'),handle=await fs.open(target,'wx');
 const file={write:(bytes,offset,length,position)=>handle.write(bytes,offset,Math.min(length,3),position)};
 try{assert.equal(await copyVerifiedUpdate({reader:new Response(data).body.getReader(),file,expectedSha256:sha,expectedSize:data.length,maxBytes:1024}),data.length)}
 finally{await handle.close()}
 assert.deepEqual(await fs.readFile(target),data);
});

test('corrupt, truncated, oversized, empty or missing-digest downloads cannot verify',async()=>{
 const file={write:async bytes=>({bytesWritten:bytes.length})};
 const transfer=(bytes,options={})=>copyVerifiedUpdate({reader:new Response(bytes).body.getReader(),file,expectedSha256:sha,expectedSize:data.length,maxBytes:1024,...options});
 await assert.rejects(transfer(Buffer.from('wrong installer bytes')),/长度|SHA-256/);
 await assert.rejects(transfer(data.subarray(0,5)),/长度/);
 await assert.rejects(transfer(data,{expectedSha256:'0'.repeat(64)}),/SHA-256/);
 await assert.rejects(transfer(data,{maxBytes:2}),/大小限制/);
 await assert.rejects(transfer(Buffer.alloc(0)),/长度/);
 await assert.rejects(transfer(data,{expectedSha256:null}),/SHA-256/);
});
