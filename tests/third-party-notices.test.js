'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');

test('bundled Mihomo license is the exact GPL text from the pinned official release',()=>{
 const root=path.join(__dirname,'..','src');
 const license=fs.readFileSync(path.join(root,'LICENSE-MIHOMO.txt'));
 const provenance=JSON.parse(fs.readFileSync(path.join(root,'LICENSE-MIHOMO.source.json'),'utf8'));
 const blob=createHash('sha1').update(Buffer.from('blob '+license.length+'\0')).update(license).digest('hex');
 assert.equal(provenance.repository,'MetaCubeX/mihomo');
 assert.equal(provenance.ref,'v1.19.32');
 assert.equal(provenance.git_blob_sha,'f288702d2fa16d3cdf0035b15a9fcbc552cd88e7');
 assert.equal(blob,provenance.git_blob_sha);
 assert.match(license.toString(),/GNU GENERAL PUBLIC LICENSE/);
 assert.match(license.toString(),/Version 3, 29 June 2007/);
});
