// Build-time inventory of installed packages. No network requests or package scripts.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const inside=(root,file)=>file===root||file.startsWith(root+path.sep);
const noticeName=/^(licen[cs]e|notice|copying|copyright|authors)([._-].*)?$/i;

export async function collectNotices(appRoot){
 const root=await fs.realpath(appRoot),modules=await fs.realpath(path.join(root,'node_modules'));
 if(!inside(root,modules))throw Error('Dependency root leaves the application directory');
 const bytes=await fs.readFile(path.join(root,'package-lock.json'));
 const lock=JSON.parse(bytes);
 if(lock.lockfileVersion!==3||!lock.packages)throw Error('A version 3 npm lock is required');
 const packages=[],notInstalled=[],review=[];
 for(const [relative,entry] of Object.entries(lock.packages).sort(([a],[b])=>a.localeCompare(b))){
  if(!relative||entry.link)continue; // Local project modules are part of application source.
  if(!relative.startsWith('node_modules/')||relative.split('/').some(x=>!x||x==='..'||x==='.')||relative.includes('\\'))throw Error('Unsafe locked package path');
  const location=path.join(root,relative);
  let actual;
  try{actual=await fs.realpath(location)}catch(error){
   if(error.code==='ENOENT'&&entry.optional){notInstalled.push(relative);continue}
   throw error;
  }
  if(!inside(modules,actual))throw Error('Installed package leaves node_modules');
  const metadataPath=await fs.realpath(path.join(actual,'package.json'));
  if(!inside(actual,metadataPath))throw Error('Package metadata leaves its package');
  const metadata=JSON.parse(await fs.readFile(metadataPath,'utf8'));
  if(typeof metadata.name!=='string'||!metadata.name||metadata.version!==entry.version)throw Error('Installed dependency differs from lock: '+relative);
  const files=[];
  async function addFile(name){
   const target=path.join(actual,name),resolved=await fs.realpath(target);
   if(!inside(actual,resolved))throw Error('Notice file leaves its package');
   const info=await fs.stat(resolved);
   if(!info.isFile()||info.size>2*1024*1024)throw Error('Notice file is not bounded text');
   const content=await fs.readFile(resolved);
   if(content.includes(0))throw Error('Notice file is not text');
   files.push({name,sha256:digest(content),text:content.toString('utf8')});
  }
  async function directory(relativeDir,depth){
   const location=path.join(actual,relativeDir);
   if(!inside(actual,await fs.realpath(location)))throw Error('Notice directory leaves its package');
   for(const child of (await fs.readdir(location,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    const name=path.join(relativeDir,child.name);
    if(child.isDirectory()&&depth<3)await directory(name,depth+1);
    else if(child.isFile()||child.isSymbolicLink())await addFile(name);
    if(files.length>128)throw Error('Too many notice files');
   }
  }
  for(const item of (await fs.readdir(actual,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   if(item.isDirectory()&&/^licenses?$/i.test(item.name))await directory(item.name,0);
   else if((item.isFile()||item.isSymbolicLink())&&noticeName.test(item.name))await addFile(item.name);
  }
  const value=metadata.license??entry.license;
  const license=typeof value==='string'?value:typeof value?.type==='string'?value.type:'UNSPECIFIED';
  const row={id:relative,name:metadata.name,version:metadata.version,license,files};
  if(!files.length||license==='UNSPECIFIED')review.push({id:relative,reason:!files.length?'No original notice file found':'No declared license'});
  packages.push(row);
 }
 for(const name of ['react','react-native','expo'])if(!packages.some(row=>row.name===name))throw Error('Required installed dependency missing: '+name);
 return {schema:1,generated:true,lockSha256:digest(bytes),packages,notInstalled,review};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.env.GITHUB_ACTIONS!=='true')throw Error('Dependency inventory is generated in GitHub Actions only');
 const root=fileURLToPath(new URL('../',import.meta.url));
 const result=await collectNotices(root);
 await fs.writeFile(path.join(root,'src/npm-notices.json'),JSON.stringify(result)+'\n');
 console.log(`Collected original notices for ${result.packages.length} installed npm packages; ${result.review.length} require review. Native/Go dependencies are separate.`);
}
