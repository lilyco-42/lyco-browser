// Research evidence only. Does not alter application code or approve licenses.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export const reviewTargets=['jimp-compact','structured-headers','tr46'];

export function sourceFiles(map){
 const files=new Set();let nodes=0,entries=0;
 function visit(value,depth){
  if(++nodes>10000||depth>32)throw Error('Source map exceeds analysis bounds');
  if(!value||value.version!==3)throw Error('Expected a version 3 source map');
  if(Array.isArray(value.sections)){
   if('sources' in value||!value.sections.length)throw Error('Ambiguous or empty indexed source map');
   for(const section of value.sections){
    const offset=section?.offset;
    if(!offset||![offset.line,offset.column].every(n=>Number.isSafeInteger(n)&&n>=0)||section.url||!section.map)throw Error('External or malformed indexed source map');
    visit(section.map,depth+1);
   }
  }else{
   if(!Array.isArray(value.sources)||!value.sources.length||typeof value.mappings!=='string')throw Error('Source map lacks original source records');
   if(value.sourcesContent!==undefined&&(!Array.isArray(value.sourcesContent)||value.sourcesContent.length!==value.sources.length))throw Error('Source content count differs');
   for(const source of value.sources){
    if(++entries>200000||typeof source!=='string'||source.length>8192||source.includes('\0'))throw Error('Invalid or excessive source records');
    files.add(source);
   }
  }
 }
 visit(map,0);return [...files].sort();
}

export function packageFromSource(source){
 const normalized=source.replaceAll('\\','/');
 const pieces=normalized.split(/(?:^|\/)node_modules\//);
 if(pieces.length<2)return null;
 const parts=pieces.at(-1).split('/');
 const name=parts[0].startsWith('@')?parts.slice(0,2).join('/'):parts[0];
 return /^(?:@[a-zA-Z0-9._-]+\/)?[a-zA-Z0-9._-]+$/.test(name)?name:null;
}

export function classifySources(sources,notices){
 const packages=new Map();let projectOrSynthetic=0;
 for(const source of sources){
  const name=packageFromSource(source);
  if(!name){projectOrSynthetic++;continue}
  if(!packages.has(name))packages.set(name,[]);
  packages.get(name).push(source);
 }
 const observed=[...packages].sort(([a],[b])=>a.localeCompare(b)).map(([name,files])=>({
  name,sourceCount:files.length,
  installed: [...new Set(notices.packages.filter(row=>row.name===name).map(row=>row.version))].sort(),
  noticeReview: notices.review.filter(row=>notices.packages.some(p=>p.name===name&&p.id===row.id)),
 }));
 return {projectOrSynthetic,packages:observed,
  reviewTargets:reviewTargets.map(name=>({name,observedInExport:packages.has(name),sources:packages.get(name)||[]})),
  unmappedPackages:observed.filter(row=>!row.installed.length).map(row=>row.name)};
}

export async function inspectExport({directory,platform,appRoot,source}){
 if(!['android','ios'].includes(platform))throw Error('A native export platform is required');
 const root=await fs.realpath(directory);let visited=0;const maps=[];
 async function walk(folder,depth=0){
  if(depth>32)throw Error('Export directory is too deep');
  for(const entry of await fs.readdir(folder,{withFileTypes:true})){
   if(++visited>100000)throw Error('Export directory exceeds analysis bounds');
   const file=path.join(folder,entry.name);
   if(entry.isSymbolicLink())throw Error('Export inventory refuses symbolic links');
   if(entry.isDirectory())await walk(file,depth+1);
   else if(entry.isFile()&&entry.name.endsWith('.map'))maps.push(file);
  }
 }
 await walk(root);
 if(!maps.length||maps.length>64)throw Error('Expected bounded external source maps');
 const lock=await fs.readFile(path.join(appRoot,'package-lock.json'));
 const noticeBytes=await fs.readFile(path.join(appRoot,'src/npm-notices.json'));
 const notices=JSON.parse(noticeBytes);
 if(notices.generated!==true||notices.lockSha256!==digest(lock)||!Array.isArray(notices.packages)||!Array.isArray(notices.review))throw Error('Notice inventory differs from the export dependency lock');
 const bundles=[],all=new Set();
 for(const mapFile of maps.sort()){
  if((await fs.stat(mapFile)).size>64*1024*1024)throw Error('Source map is too large');
  const bytes=await fs.readFile(mapFile),map=JSON.parse(bytes),sources=sourceFiles(map);
  const bundleFile=mapFile.slice(0,-4),info=await fs.lstat(bundleFile);
  if(!info.isFile()||info.size>64*1024*1024)throw Error('Missing or oversized associated JavaScript bundle');
  const bundle=await fs.readFile(bundleFile);
  for(const file of sources)all.add(file);
  bundles.push({bundle:path.relative(root,bundleFile),bytes:bundle.length,sha256:digest(bundle),map:path.relative(root,mapFile),mapBytes:bytes.length,mapSha256:digest(bytes),sourceCount:sources.length});
 }
 const classification=classifySources([...all],notices);
 for(const name of ['react','react-native','expo'])if(!classification.packages.some(row=>row.name===name))throw Error('Required native application source missing: '+name);
 return {schema:1,source,platform,scope:'Separate production-mode Expo JavaScript export with external source maps; not the retained signed APK/IPA or a native dependency inventory; no license clearance',
  lockSha256:digest(lock),noticeSha256:digest(noticeBytes),bundles,sourceCount:all.size,...classification};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.env.GITHUB_ACTIONS!=='true')throw Error('Exported application analysis runs in GitHub Actions only');
 const {values}=parseArgs({options:{platform:{type:'string'},directory:{type:'string'}}});
 if(!values.directory)throw Error('Export directory required');
 const appRoot=fileURLToPath(new URL('../',import.meta.url));
 const report=await inspectExport({directory:values.directory,platform:values.platform,appRoot,source:process.env.GITHUB_SHA});
 await fs.writeFile(path.join(values.directory,'js-dependency-inventory.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({platform:report.platform,bundles:report.bundles.length,sourceCount:report.sourceCount,reviewTargets:report.reviewTargets,unmappedPackages:report.unmappedPackages}));
}
