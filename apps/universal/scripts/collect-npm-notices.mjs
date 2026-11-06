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
 let supplements={schema:1,entries:[]};
 try{supplements=JSON.parse(await fs.readFile(path.join(root,'third-party/npm-notice-supplements.json'),'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
 if(supplements.schema!==1||!Array.isArray(supplements.entries))throw Error('Invalid upstream notice manifest');
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
  // Some published packages keep their only notice under dist/third-party.
  // Search missing packages without traversing another nested npm package.
  let visited=0;
  async function findNested(relativeDir,depth){
   for(const child of await fs.readdir(path.join(actual,relativeDir),{withFileTypes:true})){
    if(++visited>100000)throw Error('Package notice search is too large');
    const name=path.join(relativeDir,child.name);
    if(child.isDirectory()&&child.name!=='node_modules'&&depth<12)await findNested(name,depth+1);
    else if((child.isFile()||child.isSymbolicLink())&&noticeName.test(child.name))await addFile(name);
    if(files.length>128)throw Error('Too many notice files');
   }
  }
  if(!files.length)await findNested('',0);
  const value=metadata.license??entry.license;
  const license=typeof value==='string'?value:typeof value?.type==='string'?value.type:'UNSPECIFIED';
  if(!files.length&&license==='MIT'){
   for(const name of ['README.md','README','Readme.md','readme.md']){
    try{
     const target=await fs.realpath(path.join(actual,name));
     if(!inside(actual,target))throw Error('Readme notice leaves its package');
     if((await fs.stat(target)).size>65536)continue;
     const text=await fs.readFile(target,'utf8');
     if(/Copyright/i.test(text)&&/Permission is hereby granted/.test(text)&&/THE SOFTWARE IS PROVIDED/.test(text)){await addFile(name);break}
    }catch(error){if(error.code!=='ENOENT')throw error}
   }
  }
  if(!files.length){
   const supplement=supplements.entries.find(row=>row.name===metadata.name&&row.version===metadata.version);
   if(supplement){
    if(supplement.license!==license||!entry.integrity||supplement.integrity!==entry.integrity||!Array.isArray(supplement.files)||!supplement.files.length)throw Error('Upstream notice does not match the locked package');
    if(!/^[0-9a-f]{40}$/.test(supplement.gitHead))throw Error('Upstream notice lacks an immutable source revision');
    for(const file of supplement.files){
     const url=new URL(file.source);
     if(url.protocol!=='https:'||url.hostname!=='raw.githubusercontent.com'||url.username||url.password||url.search||!url.pathname.includes('/'+supplement.gitHead+'/')||typeof file.text!=='string'||file.text.includes('\0')||Buffer.byteLength(file.text)>2*1024*1024||digest(Buffer.from(file.text))!==file.sha256)throw Error('Invalid original upstream notice');
     files.push({...file,name:'upstream/'+file.name});
    }
   }
  }
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
