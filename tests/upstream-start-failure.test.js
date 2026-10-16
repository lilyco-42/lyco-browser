'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Upstream product regression runs only in Actions');
const {BrowserEngine}=require(path.resolve(__dirname,'../../upstream/Browserapp/engine.js'));
test('real upstream startup catch preserves early proxy failure and releases resources',async()=>{
 const emitted=[],expected=Error('CI expected proxy setup failure');let released=false;
 const engine=Object.assign(Object.create(BrowserEngine.prototype),{
  profiles:new Map(),running:new Map(),_platformPreflightDone:true,
  sanitizeProfile:p=>p,resolveStoredProxyProfile:p=>p,
  assertStartGenerationActive:()=>{},assertProxyConcurrencyAvailable:()=>{},
  emitStartProgress:()=>{},emit:e=>emitted.push(e),
  prepareProfileProxyForStart:async()=>{throw expected},
  cleanupStartupResources:async()=>{released=true;return {}},
 });
 await assert.rejects(()=>engine._start({id:'ci-start-failure'}),error=>error===expected);
 assert.equal(released,true);assert.equal(expected.stage,'prepare');
 assert.equal(expected.kernelVersion,'system');
 assert.equal(emitted.at(-1).message,'CI expected proxy setup failure');
});
