import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Icon payload acceptance runs only in Actions');
const [iconFile,...executables]=process.argv.slice(2);
assert.ok(iconFile&&executables.length,'ICO and executable paths required');
const ico=await fs.readFile(iconFile);
assert.equal(ico.readUInt16LE(0),0);assert.equal(ico.readUInt16LE(2),1);
const count=ico.readUInt16LE(4);assert.ok(count>=7,'Expected all generated icon sizes');
for(const executable of executables) {
 const binary=await fs.readFile(executable);
 assert.equal(binary.subarray(0,2).toString(),'MZ');
 for(let index=0;index<count;index++) {
  const entry=6+index*16,length=ico.readUInt32LE(entry+8),offset=ico.readUInt32LE(entry+12);
  assert.ok(length>0&&offset+length<=ico.length,'Valid ICO entry');
  assert.ok(binary.includes(ico.subarray(offset,offset+length)),`${executable}: original LYCO icon payload ${index} missing`);
 }
 console.log(JSON.stringify({executable,originalIconPayloads:count}));
}
