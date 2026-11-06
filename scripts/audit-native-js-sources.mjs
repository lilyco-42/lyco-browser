// Source observation only; does not execute the application or clear licenses.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {sourceFiles,classifySources} from '../apps/universal/scripts/inventory-exported-js.mjs';

if(process.env.GITHUB_ACTIONS!=='true')throw Error('Native source analysis runs in GitHub Actions only');
const root=process.env.LYCO_NATIVE_JS_AUDIT;
if(!root)throw Error('Verified native evidence directory is required');
const read=file=>fs.readFile(path.join(root,file));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const binding=JSON.parse(await read('verified-artifacts.json'));
const mapBytes=await read('source-map/files/ANDROID-PACKAGER-SOURCE.map');
const noticeBytes=await read('notices/files/src/npm-notices.json');
const lock=await read('notices/files/package-lock.json');
if(sha(mapBytes)!==binding.packagerMapSha256||sha(noticeBytes)!==binding.noticeSha256||sha(lock)!==binding.lockSha256)throw Error('Verified source evidence changed');
const notices=JSON.parse(noticeBytes);
const sources=sourceFiles(JSON.parse(mapBytes));
const classification=classifySources(sources,notices);
for(const name of ['react','react-native','expo'])if(!classification.packages.some(row=>row.name===name))throw Error('Required native application source missing: '+name);
const report={schema:1,platform:'android',sourceRun:binding.sourceRun,sourceCommit:binding.sourceCommit,analyzerCommit:process.env.GITHUB_SHA,
 scope:'Original packager source map from the actual signed native APK build, with independently rechecked original archives, APK bundle and signing identity; not a final bytecode line map, all native dependencies or license clearance',
 binding,sourceCount:sources.length,projectOrSynthetic:classification.projectOrSynthetic,syntheticSources:classification.syntheticSources,
 packages:classification.packages,unmappedPackages:classification.unmappedPackages,
 reviewTargets:classification.reviewTargets.map(({observedInExport,...row})=>({...row,observedInPackagerSources:observedInExport})),
 originalInstalledTreeReview:notices.review,licenseClearanceProven:false};
await fs.writeFile(path.join(root,'NATIVE-JS-INVENTORY.json'),JSON.stringify(report,null,2)+'\n');
if(report.unmappedPackages.length)throw Error('Native source packages missing from the original build notices');
console.log(JSON.stringify({sourceRun:report.sourceRun,sourceCount:report.sourceCount,packages:report.packages.length,reviewTargets:report.reviewTargets,unmappedPackages:report.unmappedPackages}));
