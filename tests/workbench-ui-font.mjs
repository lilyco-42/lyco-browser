// Observe only the actual application workbench, not any user webpage/detector.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {manifest,verifyAsset,assertCjkCoverage} from '../scripts/ui-font.mjs';
export async function verifyWorkbenchUiFont({page,appRoot,report,evidence}){
 const directory=path.join(appRoot,'lyco/ui-font');
 const bytes=await fs.readFile(path.join(directory,'NotoSansSC-VF.ttf'));
 verifyAsset(bytes,manifest.font);assertCjkCoverage(bytes);
 verifyAsset(await fs.readFile(path.join(directory,'OFL.txt')),manifest.license);
 const observation=await page.evaluate(async({family,probe})=>{
  const loaded=await document.fonts.load('32px "'+family+'"',probe);await document.fonts.ready;
  const node=document.getElementById('lyco-panel-title');
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Workbench canvas unavailable');
  const glyphs=[];
  for(const char of probe){
   ctx.clearRect(0,0,64,64);ctx.font='32px "'+family+'"';ctx.textBaseline='top';ctx.fillStyle='#fff';ctx.fillText(char,8,8);
   const pixels=ctx.getImageData(0,0,64,64).data;let hash=2166136261,ink=0;
   for(let i=0;i<pixels.length;i++){hash=Math.imul(hash^pixels[i],16777619)>>>0;if(i%4===3&&pixels[i])ink++}
   glyphs.push({char,hash,ink});
  }
  return {loaded:loaded.map(face=>({family:face.family,status:face.status})),computed:node?getComputedStyle(node).fontFamily:null,glyphs};
 },{family:manifest.family,probe:manifest.probe});
 report.uiCjk=observation;
 assert.ok(observation.loaded.some(face=>face.family.replaceAll('"','')===manifest.family&&face.status==='loaded'),'The bundled CJK face must load in the actual workbench');
 assert.ok(observation.computed?.includes(manifest.family),'The actual Chinese heading must use the bundled face');
 assert.ok(observation.glyphs.every(row=>row.ink>0),'Every Chinese glyph must draw actual ink');
 assert.equal(new Set(observation.glyphs.map(row=>row.hash)).size,[...manifest.probe].length,'Chinese glyphs must not collapse to identical missing-glyph boxes');
 await page.screenshot({path:path.join(evidence,'ui-cjk-workbench.png')});
 report.checks.push('packaged-ofl-ui-font-loaded-and-distinct-chinese-glyphs');
}
