'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {LycoProfiles}=require('../src/profiles');
function setup(t) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lyco-profiles-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const state={username:'owner-a',logged_in:true,entitled:true,connected:true,port:18001};
 const calls={starts:[],stops:[],proxies:new Map()};
 const network={connectionEpoch:0,status:()=>({...state}),refresh:async()=>({...state}),connect:async()=>({...state}),disconnect:async()=>{network.connectionEpoch++;state.connected=false;return state},logout:async()=>{network.connectionEpoch++;state.logged_in=false;return state}};
 const engine={profiles:new Map(),start:async p=>{calls.starts.push(p);return p},stop:async id=>calls.stops.push(id),syncProfiles:async profiles=>{for(const p of profiles)engine.profiles.set(p.id,p)}};
 const proxyStore={create:async p=>{const record={...p,id:'proxy-'+calls.proxies.size};calls.proxies.set(record.id,record);return record},update:async(id,p)=>{const r={...p,id};calls.proxies.set(id,r);return r}};
 const args={network,engine,proxyStore,dataDir:dir};
 return {state,calls,engine,args,service:new LycoProfiles(args),dir};
}
test('creates a paid-account environment with proxy already selected and no automatic browsing',async t=>{
 const {service,engine,calls}=setup(t);const {profile}=await service.create();
 assert.equal(profile.proxy,'http://127.0.0.1:18001');assert.equal(profile.networkMode,'proxy');
 assert.equal(profile.proxyMeta.lycoManaged,true);assert.equal(profile.proxyMeta.directBypass,false);
 assert.equal(calls.starts.length,0);assert.equal(engine.profiles.size,1);
 assert.equal(profile.privacy.clientRects,'native');
 assert.doesNotMatch(JSON.stringify(profile),/Bearer|sub_url|password/);
});

test('managed routing survives sanitized metadata and cannot be forged by an unbound profile',async t=>{
 const {service,engine}=setup(t);const {profile}=await service.create();
 const sanitized={...profile,proxyMeta:{proxyId:profile.proxyId,directBypass:false}};
 assert.equal(engine.lycoIsManagedProfile(sanitized),true);
 assert.equal(engine.lycoIsManagedProfile({...sanitized,id:'clone'}),true);
 assert.equal(engine.lycoIsManagedProfile({id:'independent',proxyId:null,proxyMeta:{lycoManaged:true}}),false);
});
test('before every launch verifies account and overrides a stale or manually removed proxy',async t=>{
 const {service,state,engine,calls}=setup(t);const {profile}=await service.create();
 state.port=18002;const started=await engine.start({...profile,proxy:'DIRECT',proxyId:null});
 assert.equal(started.proxy,'http://127.0.0.1:18002');assert.equal(started.proxyId,profile.proxyId);
 assert.equal(started.proxyMeta.lycoManaged,true);assert.equal(started.proxyMeta.directBypass,false);
 state.username='owner-b';await assert.rejects(()=>engine.start(profile),/另一网站账号/);
 state.username='owner-a';state.entitled=false;await assert.rejects(()=>engine.start(profile),/有效代理月卡/);
 assert.equal(calls.starts.length,1);
});
test('ownership survives application restart and other user environments are preserved',async t=>{
 const {service,state,engine,args}=setup(t);engine.profiles.set('existing',{id:'existing',name:'user profile'});
 const {profile}=await service.create();assert.equal(engine.profiles.size,2);
 // Restore using a new engine rather than stacking guards on the old instance.
 const restarted={...engine,start:async p=>p};new LycoProfiles({...args,engine:restarted});
 state.username='owner-b';await assert.rejects(()=>restarted.start(profile),/另一网站账号/);
 assert.equal((await restarted.start({id:'existing'})).id,'existing');
});

test('launching an existing managed profile preserves its chosen geometry policy',async t=>{
 const {service,engine}=setup(t);const {profile}=await service.create();
 for(const mode of ['noise','real']) {
  const started=await engine.start({...profile,privacy:{...profile.privacy,clientRects:mode}});
  assert.equal(started.privacy.clientRects,mode);
 }
});
test('logout closes managed browser windows and disconnects their proxy',async t=>{
 const {service,state,calls}=setup(t);const {profile}=await service.create();
 await service.disconnect({logout:true});assert.deepEqual(calls.stops,[profile.id]);assert.equal(state.logged_in,false);
});
test('missing proxy, invalid entitlement and corrupt bindings fail without launching',async t=>{
 const {service,state,engine,args,dir}=setup(t);state.connected=false;
 await assert.rejects(()=>service.create(),/尚未就绪/);assert.equal(engine.profiles.size,0);
 fs.writeFileSync(path.join(dir,'lyco-workspaces.json'),'{broken');assert.throws(()=>new LycoProfiles(args));
});

test('a cloned managed proxy keeps its ownership guard',async t=>{
 const {service,state,engine}=setup(t);const {profile}=await service.create();
 const clone={...profile,id:'cloned-owned-profile'};engine.profiles.set(clone.id,clone);
 state.username='owner-b';await assert.rejects(()=>engine.start(clone),/另一网站账号/);
 state.username='owner-a';await engine.start(clone);
 assert.equal(service.bindings[clone.id].owner,'owner-a');
});

test('account switching during proxy connection cannot create an environment for the new owner',async t=>{
 const {service,state,args,engine}=setup(t);
 args.network.connect=async()=>{state.username='owner-b';return {...state}};
 await assert.rejects(()=>service.create(),/账号.*变化/);
 assert.equal(engine.profiles.size,0);assert.equal(Object.keys(service.bindings).length,0);
});

test('account switching while the proxy store saves prevents browser launch',async t=>{
 const {service,state,args,engine,calls}=setup(t);const {profile}=await service.create();
 const update=args.proxyStore.update;
 args.proxyStore.update=async(...params)=>{const result=await update(...params);state.username='owner-b';return result};
 await assert.rejects(()=>engine.start(profile),/账号.*变化/);
 assert.equal(calls.starts.length,0);
});

test('a recycled port in a new connection cannot authorize an old pending launch',async t=>{
 const {service,state,args,engine,calls}=setup(t);const {profile}=await service.create();
 const update=args.proxyStore.update;
 args.proxyStore.update=async(...params)=>{
  const result=await update(...params);await args.network.disconnect();state.connected=true;return result;
 };
 await assert.rejects(()=>engine.start(profile),/账号.*变化/);
 assert.equal(calls.starts.length,0);
});

test('unexpected proxy loss shuts down only bound managed environments',async t=>{
 const {service,engine,calls,args}=setup(t);
 engine.profiles.set('independent',{id:'independent'});
 const {profile}=await service.create();
 assert.equal(typeof args.network.onCoreExit,'function');
 await args.network.onCoreExit();
 assert.deepEqual(calls.stops,[profile.id]);
 assert.equal(calls.stops.includes('independent'),false);
});

test('a Billing authorization-loss event closes only persisted managed environments',async t=>{
 const {service,engine,args,calls}=setup(t);
 const {profile}=await service.create();engine.profiles.set('manual',{id:'manual'});
 await args.network.onAuthorizationLost();
 assert.deepEqual(calls.stops,[profile.id]);
});
