import test from 'node:test';
import assert from 'node:assert/strict';
let counter=0;
async function setup(){
 const events={},session={},tabs=[],writes=[];
 let value={mode:'auto_detect'},level='controllable_by_this_extension';
 const on=name=>({addListener:fn=>{events[name]=fn}});
 globalThis.chrome={
  runtime:{id:'ci-extension',getURL:name=>'chrome-extension://ci-extension/'+name,onMessage:on('message'),onStartup:on('startup'),lastError:null},
  proxy:{settings:{get:(_args,done)=>queueMicrotask(()=>done({value:structuredClone(value),levelOfControl:level})),
   set:({value:next},done)=>{writes.push(structuredClone(next));value=next;level='controlled_by_this_extension';queueMicrotask(done)},
   clear:(_args,done)=>{value={mode:'auto_detect'};level='controllable_by_this_extension';queueMicrotask(done)}},onProxyError:on('proxy-error')},
  storage:{session:{get:async keys=>Object.fromEntries(keys.filter(key=>Object.hasOwn(session,key)).map(key=>[key,structuredClone(session[key])])),
   set:async values=>Object.assign(session,structuredClone(values)),clear:async()=>{for(const key of Object.keys(session))delete session[key]}}},
  action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
  alarms:{create:async()=>{},clear:async()=>{},onAlarm:on('alarm')},tabs:{create:async tab=>tabs.push(tab)},
 };
 await import('../background.js?case='+counter++);
 const sender={id:'ci-extension',url:'chrome-extension://ci-extension/popup.html'};
 const message=(action,extra={})=>new Promise(resolve=>events.message({action,...extra},sender,resolve));
 const code=()=>JSON.stringify({kind:'lyco-loopback-proxy',version:1,scheme:'http',host:'127.0.0.1',port:18080,issuedAt:Date.now(),expiresAt:Date.now()+60000});
 return {events,session,tabs,writes,message,code,get:()=>({value,level}),other:()=>{level='controlled_by_other_extensions';value={mode:'system'}}};
}
test('explicit connect and disconnect restore prior browser settings without issuing any payment',async()=>{
 const app=await setup();assert.equal((await app.message('connect',{code:app.code()})).active,true);
 assert.deepEqual(app.get().value.rules.singleProxy,{scheme:'http',host:'127.0.0.1',port:18080});
 assert.deepEqual(app.tabs,[]);
 const before=structuredClone(app.get());
 assert.equal((await app.message('connect',{code:app.code().replace('127.0.0.1','example.com')})).ok,false);
 assert.deepEqual(app.get(),before);
 await app.message('disconnect');assert.equal(app.get().value.mode,'auto_detect');
 await app.message('open-shop');assert.deepEqual(app.tabs,[{url:'https://lain42.top/shop/#proxy_1m'}]);
});
test('expiry and lost session block owned proxy settings; other extensions are left alone',async()=>{
 const app=await setup();await app.message('connect',{code:app.code()});
 app.session.connection.expiresAt=Date.now()-1;
 assert.equal((await app.message('status')).blocked,true);assert.equal(app.get().value.rules.singleProxy.port,9);
 delete app.session.connection;assert.equal((await app.message('status')).blocked,true);
 const count=app.writes.length;app.other();await app.message('status');await app.message('disconnect');
 assert.equal(app.writes.length,count);assert.equal(app.get().value.mode,'system');
 assert.ok(app.writes.every(value=>value.mode!=='direct'));
});
test('website and other extension messages cannot change proxy settings',async()=>{
 const app=await setup();
 assert.equal(app.events.message({action:'connect',code:app.code()},{id:'ci-extension',url:'https://lain42.top/'},()=>assert.fail()),false);
 assert.equal(app.events.message({action:'connect',code:app.code()},{id:'other-extension',url:'chrome-extension://ci-extension/popup.html'},()=>assert.fail()),false);
 assert.equal(app.writes.length,0);
});
