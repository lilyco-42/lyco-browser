import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {manifest,verifyAsset,assertCjkCoverage,prepareUiFont} from '../scripts/ui-font.mjs';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Actions only');
function cmapFixture(text){
 const codes=[...text].map(c=>c.codePointAt(0)),table=Buffer.alloc(12+16+codes.length*12);
 table.writeUInt16BE(1,2);table.writeUInt16BE(3,4);table.writeUInt16BE(10,6);table.writeUInt32BE(12,8);
 table.writeUInt16BE(12,12);table.writeUInt32BE(16+codes.length*12,16);table.writeUInt32BE(codes.length,24);
 codes.forEach((code,index)=>{const offset=28+index*12;table.writeUInt32BE(code,offset);table.writeUInt32BE(code,offset+4);table.writeUInt32BE(index+1,offset+8)});
 const font=Buffer.alloc(28+table.length);font.writeUInt32BE(0x00010000,0);font.writeUInt16BE(1,4);font.write('cmap',12);font.writeUInt32BE(28,20);font.writeUInt32BE(table.length,24);table.copy(font,28);return font;
}
test('required Chinese characters need real nonzero glyph mappings',()=>{
 assert.doesNotThrow(()=>assertCjkCoverage(cmapFixture(manifest.probe)));
 assert.throws(()=>assertCjkCoverage(cmapFixture('代理')),/missing a required Chinese glyph/);
 const corrupted=cmapFixture(manifest.probe);corrupted.writeUInt32BE(0,28+28+8);
 assert.throws(()=>assertCjkCoverage(corrupted),/missing a required Chinese glyph/);
});
test('truncated or out-of-bounds font tables are rejected',()=>{
 const font=cmapFixture(manifest.probe);font.writeUInt32BE(0xffffffff,20);
 assert.throws(()=>assertCjkCoverage(font),/cmap bounds/);
 assert.throws(()=>assertCjkCoverage(Buffer.alloc(6)),/table directory/);
 assert.throws(()=>assertCjkCoverage(Buffer.alloc(28)),/character map/);
});
test('changed bytes and length never satisfy the pinned asset digest',()=>{
 const bytes=Buffer.from('original asset'),asset={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 assert.doesNotThrow(()=>verifyAsset(bytes,asset));
 assert.throws(()=>verifyAsset(Buffer.from('modified asset'),asset),/checksum mismatch/);
 assert.throws(()=>verifyAsset(Buffer.concat([bytes,Buffer.from('extra')]),asset),/checksum mismatch/);
});
test('failed downloads do not leave a font for packaging',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lyco-ui-font-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 await assert.rejects(prepareUiFont({cacheDir:dir,fetchImpl:async(_url,options)=>{
  assert.equal(options.redirect,'error');return new Response('not a font');
 }}),/checksum mismatch/);
 assert.deepEqual(await fs.readdir(dir),[]);
 await assert.rejects(prepareUiFont({cacheDir:dir,fetchImpl:async()=>new Response('',{status:403})}),/HTTP 403/);
});
test('bundled original OFL bytes match the fixed official source',async()=>{
 const bytes=await fs.readFile(new URL('../resources/ui-font/OFL.txt',import.meta.url));
 verifyAsset(bytes,manifest.license);assert.match(bytes.toString(),/SIL OPEN FONT LICENSE/);
 assert.match(bytes.toString(),/Copyright 2014-2021 Adobe/);
});
