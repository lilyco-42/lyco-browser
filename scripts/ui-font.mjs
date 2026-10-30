// Workbench-only asset. Never installs fonts or changes browser-profile fonts.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
export const manifest=JSON.parse(await fs.readFile(path.join(root,'resources/ui-font/manifest.json'),'utf8'));
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

// The pinned complete Noto SC face has an OpenType format-12 Unicode cmap.
// Check the actual glyph mappings, rather than treating a loaded font as proof
// that Chinese characters exist (missing-glyph boxes also render successfully).
export function assertCjkCoverage(bytes,text=manifest.probe){
 const count=bytes.readUInt16BE(4);
 if(count>256||12+count*16>bytes.length)throw Error('Invalid UI font table directory');
 let cmap;
 for(let i=0;i<count;i++){
  const record=12+i*16;
  if(bytes.toString('ascii',record,record+4)==='cmap'){
   const start=bytes.readUInt32BE(record+8),length=bytes.readUInt32BE(record+12);
   if(start+length>bytes.length)throw Error('Invalid UI font cmap bounds');
   cmap=bytes.subarray(start,start+length);break;
  }
 }
 if(!cmap||cmap.length<4)throw Error('UI font lacks a Unicode character map');
 const tables=cmap.readUInt16BE(2);let groups;
 if(4+tables*8>cmap.length)throw Error('Invalid UI font cmap records');
 for(let i=0;i<tables;i++){
  const offset=cmap.readUInt32BE(4+i*8+4);
  if(offset+16>cmap.length||cmap.readUInt16BE(offset)!==12)continue;
  const length=cmap.readUInt32BE(offset+4),count=cmap.readUInt32BE(offset+12);
  if(offset+length>cmap.length||16+count*12>length)throw Error('Invalid UI font Unicode groups');
  groups=cmap.subarray(offset+16,offset+16+count*12);break;
 }
 if(!groups)throw Error('Pinned UI font lacks its full Unicode cmap');
 for(const char of text){
  const code=char.codePointAt(0);let present=false;
  for(let i=0;i<groups.length;i+=12){
   const start=groups.readUInt32BE(i),end=groups.readUInt32BE(i+4),glyph=groups.readUInt32BE(i+8);
   if(code>=start&&code<=end&&glyph+code-start!==0){present=true;break}
  }
  if(!present)throw Error('UI font is missing a required Chinese glyph');
 }
}

export function verifyAsset(bytes,asset){
 if(bytes.length!==asset.bytes||sha256(bytes)!==asset.sha256)throw Error('UI font asset checksum mismatch');
}

export async function prepareUiFont({cacheDir=path.join(root,'.cache/ui-font'),fetchImpl=fetch}={}){
 const asset=manifest.font,url=new URL(asset.source);
 if(url.origin!=='https://raw.githubusercontent.com'||url.username||url.password||!/^[0-9a-f]{40}$/.test(asset.source_commit)||!url.pathname.startsWith('/google/fonts/'+asset.source_commit+'/')||url.search||url.hash)throw Error('Untrusted UI font source');
 await fs.mkdir(cacheDir,{recursive:true});
 const target=path.join(cacheDir,'NotoSansSC-VF.ttf');
 try{
  if((await fs.lstat(target)).isSymbolicLink())throw Error('UI font cache may not be a symlink');
  const bytes=await fs.readFile(target);verifyAsset(bytes,asset);assertCjkCoverage(bytes);return target;
 }catch(error){if(!['ENOENT'].includes(error.code)&&!/checksum mismatch/.test(error.message))throw error}
 const response=await fetchImpl(asset.source,{redirect:'error',signal:AbortSignal.timeout(90000)});
 if(!response.ok||!response.body)throw Error('Cannot retrieve the pinned UI font: HTTP '+response.status);
 const chunks=[];let length=0;
 for await(const part of response.body){
  length+=part.length;if(length>asset.bytes)throw Error('UI font download exceeds its pinned length');chunks.push(part);
 }
 const bytes=Buffer.concat(chunks);verifyAsset(bytes,asset);assertCjkCoverage(bytes);
 const temporary=target+'.'+randomUUID()+'.tmp';
 try{await fs.writeFile(temporary,bytes,{flag:'wx'});await fs.rename(temporary,target)}
 finally{await fs.rm(temporary,{force:true})}
 return target;
}

export async function installUiFont(appRoot){
 const font=await prepareUiFont();
 const license=await fs.readFile(path.join(root,'resources/ui-font/OFL.txt'));verifyAsset(license,manifest.license);
 const application=await fs.realpath(appRoot),directory=path.join(application,'lyco/ui-font');
 await fs.mkdir(directory,{recursive:true});
 if(!((await fs.realpath(directory))+path.sep).startsWith(application+path.sep))throw Error('UI font destination leaves the application');
 for(const name of ['NotoSansSC-VF.ttf','OFL.txt','source.json']){
  try{if((await fs.lstat(path.join(directory,name))).isSymbolicLink())throw Error('UI font output may not be a symlink')}
  catch(error){if(error.code!=='ENOENT')throw error}
 }
 await fs.copyFile(font,path.join(directory,'NotoSansSC-VF.ttf'));
 await fs.writeFile(path.join(directory,'OFL.txt'),license);
 await fs.writeFile(path.join(directory,'source.json'),JSON.stringify(manifest,null,2)+'\n');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.env.GITHUB_ACTIONS!=='true')throw Error('UI font preparation runs in GitHub Actions only');
 if(!process.argv[2])throw Error('Pinned application directory required');
 await installUiFont(process.argv[2]);
 console.log('Installed checksum-verified, OFL-licensed workbench font with required Chinese glyphs');
}
