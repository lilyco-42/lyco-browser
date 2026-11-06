'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const product=require('../apps/universal/src/product.json');
const {parseProductVersion}=require('../src/product-version');

test('the common version resolves identically into both native mobile package formats',()=>{
 const expected=parseProductVersion(product);
 const base=require('../apps/universal/app.json').expo;
 const original=structuredClone(base);
 const config=require('../apps/universal/app.config')({config:base});
 assert.equal(config.version,expected.version);
 assert.equal(config.android.versionCode,expected.build);
 assert.equal(config.ios.buildNumber,String(expected.build));
 assert.equal(config.android.package,base.android.package);
 assert.equal(config.ios.bundleIdentifier,base.ios.bundleIdentifier);
 assert.deepEqual(base,original,'Resolving build metadata must not mutate the base configuration');
 const pkg=require('../apps/universal/package.json'),lock=require('../apps/universal/package-lock.json');
 assert.equal(pkg.version,expected.version);
 assert.equal(lock.version,expected.version);
 assert.equal(lock.packages[''].version,expected.version);
});

test('invalid shared versions cannot silently produce incompatible platform packages',()=>{
 for(const version of ['v1.0.0','1.0.0-preview.1','01.0.0','1.0','1.0.0\n','65536.0.0']){
  assert.throws(()=>parseProductVersion({...product,version}),/version/);
 }
 for(const build of [0,-1,2.5,10000,'2'])assert.throws(()=>parseProductVersion({...product,build}),/build/);
 assert.throws(()=>parseProductVersion({...product,channel:'unknown'}),/channel/);
});
