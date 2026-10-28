// Unit model only: actual native ICE/TCP/UDP observations live in the emulator
// probe. This stub never enters the product or replaces a native observation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('RTC policy tests run on Actions only');
const source=fs.readFileSync(new URL('../apps/universal/modules/lyco-mobile-browser/android/src/main/assets/lyco-rtc-policy.js',import.meta.url),'utf8');
function model(){
 const records=[];
 function copy(c){return {iceTransportPolicy:c?.iceTransportPolicy??'all',iceServers:Array.from(c?.iceServers??[],s=>({urls:typeof s.urls==='string'?[s.urls]:Array.from(s.urls??[]),username:s.username,credential:s.credential}))}}
 class NativePeer{
  constructor(config){this.config=copy(config);records.push(this.config)}
  setConfiguration(config){this.config=copy(config);records.push(this.config)}
  getConfiguration(){return this.config}
 }
 const context=vm.createContext({RTCPeerConnection:NativePeer,webkitRTCPeerConnection:NativePeer});
 vm.runInContext(source,context,{timeout:1000});
 return {records,run:code=>vm.runInContext(code,context,{timeout:1000})};
}
test('real configuration requires relay and retains only explicit TURN TCP or TLS with unchanged credentials',()=>{
 const m=model();m.run(`new RTCPeerConnection({iceTransportPolicy:'all',iceServers:[{urls:['stun:stun.example:3478','turn:turn.example:3478?transport=udp','turn:turn.example:3478?transport=tcp','turns:secure.example:5349'],username:'CI_USER',credential:'CI_SECRET'}]})`);
 assert.deepEqual(m.records[0],{iceTransportPolicy:'relay',iceServers:[{urls:['turn:turn.example:3478?transport=tcp','turns:secure.example:5349?transport=tcp'],username:'CI_USER',credential:'CI_SECRET'}]});
});
test('aliases, prototype constructor and subsequent setConfiguration cannot restore non-relay or UDP',()=>{
 const m=model();m.run(`const p=new webkitRTCPeerConnection({iceTransportPolicy:'all'});p.setConfiguration({iceTransportPolicy:'all',iceServers:[{urls:'turn:bad.example?transport=udp'}]});new RTCPeerConnection.prototype.constructor({iceTransportPolicy:'all'});`);
 assert.equal(m.records.length,3);for(const r of m.records){assert.equal(r.iceTransportPolicy,'relay');assert.deepEqual(r.iceServers,[])}
 assert.throws(()=>m.run(`'use strict';RTCPeerConnection=function(){}`),{name:'TypeError'});
});
test('malformed authorities, UDP TLS, default UDP, bad ports and injection text never enter a native ICE server',()=>{
 const m=model();m.run(`new RTCPeerConnection({iceServers:[{urls:['turn:default.example','turns:tls.example?transport=udp','turn:user@host?transport=tcp','turn:host:0?transport=tcp','turn:host:65536?transport=tcp','turn:host?transport=tcp#fragment','turn:host/other?transport=tcp','turn:host?transport=tcp&other=udp','turn:[::1]:3478?transport=tcp']}]})`);
 assert.deepEqual(m.records[0].iceServers[0].urls,['turn:[::1]:3478?transport=tcp']);
});
test('page-edited primordials and iterable prototypes cannot smuggle UDP into a validated native sequence',()=>{
 const m=model();m.run(`
 Array.prototype[Symbol.iterator]=function*(){yield {urls:'turn:smuggled.example?transport=udp'}};
 String.prototype.trim=function(){return 'turn:smuggled.example?transport=tcp'};
 RegExp.prototype.exec=function(){return ['','turn','evil','','tcp']};
 Reflect.apply=function(){throw Error('page apply')};
 Object.prototype.iceTransportPolicy='all';
 new RTCPeerConnection({iceTransportPolicy:'all',iceServers:new Set([{urls:new Set(['turn:real.example:3478?transport=tcp','turn:bad.example?transport=udp'])}])});`);
 assert.equal(m.records[0].iceTransportPolicy,'relay');assert.deepEqual(m.records[0].iceServers[0].urls,['turn:real.example:3478?transport=tcp']);
});
