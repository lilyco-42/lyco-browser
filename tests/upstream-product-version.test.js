'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Patched application checks run on Actions only');
const product=require('../apps/universal/src/product.json');
const appRoot=path.resolve(__dirname,'../../upstream/Browserapp');

test('the actual desktop application and its bundled provenance use the shared product version',()=>{
 const pkg=require(path.join(appRoot,'package.json'));
 const bundled=require(path.join(appRoot,'lyco/product.json'));
 assert.equal(pkg.version,product.version);
 assert.deepEqual(bundled,product);
});
