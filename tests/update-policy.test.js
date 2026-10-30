'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {stableVersion, updateAssetUrlIsAllowed, resolveStableReleaseMeta} = require('../src/update-policy');
const base = 'https://github.com/lilyco-42/lyco-browser';

test('only canonical stable tags can enter the automatic update channel', () => {
 assert.equal(stableVersion('v1.2.3'), '1.2.3');
 for (const tag of ['ci-123456789abc','review-46d7fde745a1-39814682404-1','v1.2.3-rc.1','v1.2.3+test','v01.2.3','1.2.3',' v1.2.3','v1.2','v1.2.3/other']) assert.equal(stableVersion(tag), null, tag);
});

test('automatic installer URLs belong to this repository, a stable tag and the selected file', () => {
 const name = 'LYCO-Browser-Windows-x64-MVP.exe';
 const good = base + '/releases/download/v1.2.3/' + name;
 assert.equal(updateAssetUrlIsAllowed(good, name), true);
 for (const url of [good.replace('lilyco-42','other-owner'),good.replace('/lyco-browser/','/lyco-browser-extra/'),
  good.replace('v1.2.3','ci-123'),good.replace('v1.2.3','v1.2.3-rc.1'),good+'?redirect=other',good+'#other',
  good.replace('https:','http:'),good.replace('github.com','github.com.example.org'),good.replace('github.com','user@github.com'),
  good.replace(name,'prefix-'+name),good.replace('github.com','objects.githubusercontent.com')]) assert.equal(updateAssetUrlIsAllowed(url,name),false,url);
});

test('the latest API must explicitly identify a non-draft non-prerelease stable release', async () => {
 const release = {tag_name:'v1.2.3',name:'LYCO 1.2.3',draft:false,prerelease:false,assets:[]};
 const result = await resolveStableReleaseMeta({fetch:async()=>({ok:true,json:async()=>release})});
 assert.equal(result.remoteVersion,'1.2.3');assert.equal(result.source,'api');
 assert.equal(result.releaseUrl,base+'/releases/tag/v1.2.3');
 for (const overrides of [{draft:true},{prerelease:true},{tag_name:'ci-123'},{tag_name:'v1.2.3-rc.1'},{prerelease:undefined}]) {
  await assert.rejects(resolveStableReleaseMeta({fetch:async()=>({ok:true,json:async()=>({...release,...overrides})})}),/正式版本/);
 }
});

test('API unavailability may use only the official stable latest redirect', async () => {
 const requests=[];
 const fetch=async url=>{requests.push(url);return url.includes('api.github.com')?{ok:false}:{ok:true,url:base+'/releases/tag/v2.0.0'}};
 assert.equal((await resolveStableReleaseMeta({fetch})).remoteVersion,'2.0.0');
 assert.deepEqual(requests,['https://api.github.com/repos/lilyco-42/lyco-browser/releases/latest',base+'/releases/latest']);
 for (const url of [base+'/releases/latest',base+'/releases/tag/ci-123',base+'/releases/tag/v2.0.0-beta',
  'https://github.com/other/repo/releases/tag/v2.0.0']) {
  await assert.rejects(resolveStableReleaseMeta({fetch:async endpoint=>endpoint.includes('api.github.com')?{ok:false}:{ok:true,url,text:async()=>'<a href="'+base+'/releases/tag/v9.0.0">ignored</a>'}}),/正式版本/);
 }
});
