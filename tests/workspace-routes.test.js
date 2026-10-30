'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {EventEmitter}=require('node:events');
const {LycoWorkspaceRoutes,routesFromSubscription,fixedConfig}=require('../src/workspace-routes');
const {LycoProfiles}=require('../src/profiles');
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Product tests run in GitHub Actions only');
const subscription=()=>({proxies:[
 {name:'CI route A',type:'http',server:'127.0.0.1',port:19001,username:'PRIVATE_NODE_LOGIN',password:'PRIVATE_NODE_PASSWORD'},
 {name:'CI route B',type:'http',server:'127.0.0.1',port:19002},
],'proxy-groups':[{name:'PROXY',type:'fallback',proxies:['DIRECT','CI route A','CI route B'],'empty-fallback':'DIRECT'}]});
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lyco-fixed-routes-'));
 const state={username:'owner-a',logged_in:true,entitled:true,connected:true,port:18000};
 let source=subscription();const children=[],lost=[];
 const network={connectionEpoch:0,status:()=>({...state}),refresh:async()=>({...state}),connect:async()=>({...state}),
  workspaceSubscription:async()=>JSON.stringify(source),findCore:()=>'/unused/test/mihomo',
  disconnect:async()=>{network.connectionEpoch++;state.connected=false;await network.onDisconnect?.();return state},
  logout:async()=>{state.logged_in=false;return network.disconnect()},
  spawnFn:(_binary,args)=>{
   const config=JSON.parse(fs.readFileSync(args[1],'utf8'));
   const child=new EventEmitter();child.exitCode=null;child.killed=false;child.config=config;
   child.server=net.createServer(socket=>socket.end());child.server.listen(config['mixed-port'],'127.0.0.1');
   child.kill=()=>{if(child.killed)return true;child.killed=true;child.server.close(()=>{child.exitCode=0;child.emit('exit',0)});return true};
   children.push(child);return child;
  }};
 const pool=new LycoWorkspaceRoutes({network,dataDir:dir,onRouteLost:id=>lost.push(id)});
 const pools=new Set([pool]);
 const authorization=()=>({...state,connectionEpoch:network.connectionEpoch});
 t.after(async()=>{for(const current of pools)await current.stopAll();for(const child of children)if(child.server.listening)await new Promise(resolve=>child.server.close(resolve));fs.rmSync(dir,{recursive:true,force:true})});
 return {dir,state,network,pool,pools,children,lost,authorization,setSource:next=>{source=next}};
}
test('catalog exposes only opaque identities and labels; duplicate names cannot silently select a different node',async t=>{
 const {pool,authorization}=fixture(t);
 const catalog=await pool.catalog(authorization());
 assert.equal(catalog.owner,'owner-a');assert.equal(catalog.nodes.length,2);
 assert.ok(catalog.nodes.every(node=>/^[a-f0-9]{64}$/.test(node.id)&&Object.keys(node).sort().join() === 'id,label'));
 assert.doesNotMatch(JSON.stringify(catalog),/PRIVATE_NODE|127\.0\.0\.1|19001|Bearer|password/);
 const bad=subscription();bad.proxies[1].name=bad.proxies[0].name;bad['proxy-groups'][0].proxies=['CI route A'];
 assert.throws(()=>routesFromSubscription(bad),/重复/);
});
test('fixed selection contains one named outbound and preserves the no-direct policy',()=>{
 const source=subscription(),{config,nodes}=routesFromSubscription(source);
 const selected=fixedConfig(config,nodes[1],18002),group=selected['proxy-groups'].at(-1);
 assert.equal(group.type,'select');assert.deepEqual(group.proxies,['CI route B']);assert.equal(group['empty-fallback'],'REJECT');
 assert.deepEqual(selected.rules,['MATCH,'+group.name]);assert.equal(selected['allow-lan'],false);
 assert.deepEqual(selected.proxies.map(row=>row.name),['CI route B']);
 assert.equal(selected['proxy-groups'].length,1);
 assert.equal(selected['external-controller'],undefined);assert.ok(source['proxy-groups'][0].proxies.includes('DIRECT'));
});
test('fixed routes preserve PROXY dialer policies and prune unrelated nodes, credentials and health checks',()=>{
 const source=subscription();source.proxies.push({name:'ENTRY',type:'http',server:'127.0.0.1',port:19003,password:'ENTRY_PRIVATE'});
 source.proxies[0]['dialer-proxy']='PROXY';
 source['proxy-groups']=[{name:'PROXY',type:'fallback',proxies:['ENTRY','REJECT'],url:'https://ci.invalid/health',interval:60},
  {name:'UNUSED',type:'url-test',proxies:['CI route B'],url:'https://unused.invalid/health',interval:30}];
 const original=JSON.stringify(source),selected=fixedConfig(source,{name:'CI route A'},18002);
 assert.deepEqual(selected.proxies.map(row=>row.name),['CI route A','ENTRY']);
 assert.equal(selected.proxies[0]['dialer-proxy'],'PROXY');
 const group=selected['proxy-groups'].find(row=>row.name==='PROXY');
 assert.equal(group.type,'fallback');assert.deepEqual(group.proxies,['ENTRY','REJECT']);assert.equal(group.interval,60);
 assert.doesNotMatch(JSON.stringify(selected),/CI route B|UNUSED|unused\.invalid/);
 assert.deepEqual(selected['proxy-groups'].at(-1).proxies,['CI route A']);
 assert.equal(JSON.stringify(source),original);
});
test('private root avoids reachable name collisions and never embeds provider names into rule syntax',()=>{
 const source={proxies:[{name:'LYCO_WORKSPACE_ROUTE',type:'http',server:'127.0.0.1',port:19001,'dialer-proxy':'LYCO_WORKSPACE_ROUTE_1'},
  {name:'ENTRY,NAME\nMATCH,DIRECT',type:'http',server:'127.0.0.1',port:19002}],
  'proxy-groups':[{name:'LYCO_WORKSPACE_ROUTE_1',type:'select',proxies:['ENTRY,NAME\nMATCH,DIRECT']},{name:'PROXY',type:'select',proxies:['LYCO_WORKSPACE_ROUTE']}]};
 const selected=fixedConfig(source,{name:'LYCO_WORKSPACE_ROUTE'},18002);
 assert.deepEqual(selected.rules,['MATCH,LYCO_WORKSPACE_ROUTE_2']);
 assert.deepEqual(selected['proxy-groups'].at(-1).proxies,['LYCO_WORKSPACE_ROUTE']);
 assert.ok(selected.proxies.some(row=>row.name==='ENTRY,NAME\nMATCH,DIRECT'));
 assert.throws(()=>fixedConfig(source,{name:'PROXY'},18002),/节点无效/);
});
test('node, group and mixed dependency cycles fail before spawning a core',()=>{
 for(const kind of ['node','group','mixed']){
  const source=subscription();
  if(kind==='node'){source.proxies[0]['dialer-proxy']='CI route B';source.proxies[1]['dialer-proxy']='CI route A'}
  if(kind==='group'){source.proxies[0]['dialer-proxy']='PROXY';source['proxy-groups']=[{name:'PROXY',type:'select',proxies:['LOOP']},{name:'LOOP',type:'select',proxies:['PROXY']}]}
  if(kind==='mixed'){source.proxies[0]['dialer-proxy']='PROXY';source['proxy-groups'][0].proxies=['CI route A']}
  assert.throws(()=>fixedConfig(source,{name:'CI route A'},18002),/循环代理依赖/);
 }
});
test('shared dependencies are retained once and long chains do not exhaust the JavaScript call stack',()=>{
 const proxies=Array.from({length:12000},(_,index)=>({name:'node-'+index,type:'http',server:'127.0.0.1',port:19001,...(index<11999?{'dialer-proxy':'node-'+(index+1)}:{})}));
 const selected=fixedConfig({proxies,'proxy-groups':[{name:'PROXY',type:'select',proxies:['node-0']}]},{name:'node-0'},18002);
 assert.equal(selected.proxies.length,12000);assert.equal(selected['proxy-groups'].length,1);
 const shared=subscription();shared.proxies[0]['dialer-proxy']='PROXY';shared['proxy-groups']=[{name:'PROXY',type:'select',proxies:['LEFT','RIGHT']},
  {name:'LEFT',type:'select',proxies:['CI route B']},{name:'RIGHT',type:'select',proxies:['CI route B']}];
 const result=fixedConfig(shared,{name:'CI route A'},18002);assert.equal(result.proxies.length,2);assert.equal(result['proxy-groups'].length,4);
});
test('unrelated subscription changes keep an active lease; reachable credential changes require explicit restart',async t=>{
 const {pool,authorization,setSource,children}=fixture(t),{nodes}=await pool.catalog(authorization());
 const a=await pool.acquire('profile-a',nodes[0].id,authorization());
 const changed=subscription();changed.proxies[1].password='UNRELATED_PRIVATE';
 changed['proxy-groups'].push({name:'LYCO_WORKSPACE_ROUTE',type:'url-test',proxies:['CI route B'],url:'https://unused.invalid',interval:1});
 setSource(changed);assert.equal(await pool.acquire('profile-a',nodes[0].id,authorization()),a);assert.equal(children.length,1);
 changed.proxies[0].password='CHANGED_REACHABLE_PRIVATE';setSource(changed);
 await assert.rejects(()=>pool.acquire('profile-a',nodes[0].id,authorization()),/配置已变化/);
 assert.equal(a.child.killed,false);await pool.stop('profile-a');
 const replacement=await pool.acquire('profile-a',nodes[0].id,authorization());assert.equal(replacement.child.config.proxies[0].password,'CHANGED_REACHABLE_PRIVATE');
});
test('two workspaces get separate tracked cores and stopping A leaves B alive',async t=>{
 const {pool,children,authorization}=fixture(t);const {nodes}=await pool.catalog(authorization());
 const [a,b]=await Promise.all([pool.acquire('profile-a',nodes[0].id,authorization()),pool.acquire('profile-b',nodes[1].id,authorization())]);
 assert.notEqual(a.port,b.port);assert.notEqual(a.directory,b.directory);assert.equal(children.length,2);
 assert.deepEqual(a.child.config['proxy-groups'][0].proxies,['CI route A']);assert.deepEqual(b.child.config['proxy-groups'][0].proxies,['CI route B']);
 await pool.stop('profile-a');assert.equal(a.child.killed,true);assert.equal(b.child.killed,false);pool.assertCurrent(b,authorization());
 assert.equal(fs.existsSync(a.directory),false);assert.equal(fs.existsSync(path.join(b.directory,'config.json')),true);
});
test('concurrent starts share only the same workspace core, and stale exit cannot close a replacement',async t=>{
 const {pool,children,lost,authorization}=fixture(t);const {nodes}=await pool.catalog(authorization());
 const [a,b]=await Promise.all([pool.acquire('profile-a',nodes[0].id,authorization()),pool.acquire('profile-a',nodes[0].id,authorization())]);
 assert.equal(a,b);assert.equal(children.length,1);await pool.stop('profile-a');
 const replacement=await pool.acquire('profile-a',nodes[0].id,authorization());
 a.child.emit('exit',0);assert.equal(pool.entries.get('profile-a'),replacement);assert.deepEqual(lost,[]);
});
test('stopping a pending workspace connection cannot spawn a late core or cancel a different workspace',async t=>{
 const {pool,network,authorization,children}=fixture(t);const {nodes}=await pool.catalog(authorization());
 const original=network.workspaceSubscription;let release,requested;
 const started=new Promise(resolve=>{requested=resolve});let first=true;
 network.workspaceSubscription=async auth=>{if(first){first=false;requested();return new Promise(resolve=>{release=()=>resolve(JSON.stringify(subscription()))})}return original(auth)};
 const pending=pool.acquire('profile-a',nodes[0].id,authorization());const rejected=assert.rejects(pending,/取消/);
 await started;const b=await pool.acquire('profile-b',nodes[1].id,authorization());await pool.stop('profile-a');release();await rejected;
 assert.equal(children.length,1);pool.assertCurrent(b,authorization());
});
test('missing selection and account changes fail before exposing a live workspace route',async t=>{
 const {pool,state,authorization,children}=fixture(t);const auth=authorization();
 await assert.rejects(()=>pool.acquire('profile-a','a'.repeat(64),auth),/已不存在/);assert.equal(children.length,0);
 state.username='owner-b';await assert.rejects(()=>pool.catalog(auth),/账号或连接/);
 await assert.rejects(()=>pool.acquire('../outside','a'.repeat(64),authorization()),/标识/);
});
test('unexpected exit reports only the affected workspace and deletes its credential config',async t=>{
 const {pool,authorization,lost}=fixture(t);const {nodes}=await pool.catalog(authorization());
 const a=await pool.acquire('profile-a',nodes[0].id,authorization()),b=await pool.acquire('profile-b',nodes[1].id,authorization());
 await new Promise(resolve=>a.child.server.close(resolve));a.child.exitCode=1;a.child.emit('exit',1);
 assert.deepEqual(lost,['profile-a']);assert.equal(pool.entries.has('profile-a'),false);pool.assertCurrent(b,authorization());
});
function profileFixture(t){
 const base=fixture(t),starts=[],stops=[],proxies=new Map();
 const engine={profiles:new Map(),start:async profile=>{starts.push(profile);return profile},stop:async id=>{stops.push(id)},
  syncProfiles:async profiles=>{engine.profiles=new Map(profiles.map(row=>[row.id,row]))}};
 const proxyStore={create:async source=>{const record={...source,id:'proxy-'+proxies.size};proxies.set(record.id,record);return record},
  update:async(id,source)=>{const record={...source,id};proxies.set(id,record);return record}};
 const args={network:base.network,dataDir:base.dir,engine,proxyStore};const service=new LycoProfiles(args);
 base.pools.add(service.routes);
 return {...base,engine,starts,stops,proxies,args,service};
}
test('chosen routes persist in version 2, rebind at launch and release when the actual environment stops',async t=>{
 const {service,engine,dir,starts}=profileFixture(t);const catalog=await service.routeCatalog();
 const {profile}=await service.create({routeId:catalog.nodes[1].id});
 const saved=JSON.parse(fs.readFileSync(path.join(dir,'lyco-workspaces.json'),'utf8'));
 assert.equal(saved.version,2);assert.equal(saved.bindings[profile.id].routeId,catalog.nodes[1].id);
 const started=await engine.start({...profile,proxy:'DIRECT',proxyId:null});
 assert.equal(started.proxy,profile.proxy);assert.equal(started.networkMode,'proxy');assert.equal(starts.length,1);
 const directory=service.routes.entries.get(profile.id).directory;
 await engine.stop(profile.id);assert.equal(service.routes.entries.size,0);assert.equal(fs.existsSync(directory),false);
 const reopened=await engine.start(profile);assert.match(reopened.proxy,/^http:\/\/127\.0\.0\.1:/);
 assert.equal(service.listRoutes().profiles[0].routeId,catalog.nodes[1].id);
});
test('changing one binding stops only that workspace; cross-account edits cannot stop or mutate it',async t=>{
 const {service,engine,state,stops}=profileFixture(t),catalog=await service.routeCatalog();
 const a=await service.create({routeId:catalog.nodes[0].id}),b=await service.create({routeId:catalog.nodes[1].id});
 await service.setRoute({id:a.profile.id,routeId:catalog.nodes[1].id});
 assert.deepEqual(stops,[a.profile.id]);assert.equal(service.routes.entries.has(b.profile.id),true);
 state.username='owner-b';await assert.rejects(()=>service.setRoute({id:b.profile.id,routeId:''}),/另一网站账号/);
 assert.deepEqual(service.listRoutes().profiles,[]);assert.equal(stops.length,1);
 state.username='owner-a';await engine.stop(b.profile.id);
});
test('lost authorization closes selected cores and never changes a missing node to a default route',async t=>{
 const {service,engine,state,starts,setSource}=profileFixture(t),catalog=await service.routeCatalog();
 const {profile}=await service.create({routeId:catalog.nodes[0].id});await engine.stop(profile.id);
 const changed=subscription();changed.proxies.shift();changed['proxy-groups'][0].proxies=['CI route B'];setSource(changed);
 await assert.rejects(()=>engine.start(profile),/已不存在/);assert.equal(starts.length,0);assert.equal(service.routes.entries.size,0);
 const b=await service.create({routeId:catalog.nodes[1].id});assert.equal(service.routes.entries.size,1);
 await service.disconnect({logout:true});assert.equal(service.routes.entries.size,0);assert.equal(state.logged_in,false);
 assert.ok(b.profile.id);
});
test('invalid route types and attempted old-format downgrade are rejected without resetting bindings',async t=>{
 const {service,args,dir}=profileFixture(t);
 for(const routeId of [false,null,12,'DIRECT'])await assert.rejects(()=>service.create({routeId}),/标识/);
 fs.writeFileSync(path.join(dir,'lyco-workspaces.json'),JSON.stringify({version:1,bindings:{sample:{owner:'owner-a',proxyId:'p',routeId:'a'.repeat(64)}}}));
 assert.throws(()=>new LycoProfiles({...args,engine:{...args.engine}}),/绑定记录无效/);
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'lyco-workspaces.json'))).bindings.sample.routeId,'a'.repeat(64));
});
test('concurrent cloned bindings cannot share a mutable proxy record or overwrite the other selected port',async t=>{
 const {service,engine,args,proxies}=profileFixture(t),catalog=await service.routeCatalog();
 const {profile}=await service.create({routeId:catalog.nodes[0].id});
 const clone={...profile,id:'cloned-workspace'};engine.profiles.set(clone.id,clone);
 service.bindings[clone.id]={...service.bindings[profile.id],routeId:catalog.nodes[1].id,routeName:'CI route B'};
 const [a,b]=await Promise.all([service.beforeStart(profile),service.beforeStart(clone)]);
 assert.notEqual(a.profile.proxyId,b.profile.proxyId);
 for(const value of [a,b])assert.equal(proxies.get(value.profile.proxyId).raw,'http://127.0.0.1:'+value.route.port);
 assert.equal(service.bindings[profile.id].routeId,catalog.nodes[0].id);assert.equal(service.bindings[clone.id].routeId,catalog.nodes[1].id);
 assert.equal(args.engine.profiles.size,2);
});
test('changing a default binding during a pending launch cannot start it on the old shared route',async t=>{
 const {service,engine,args,starts}=profileFixture(t),catalog=await service.routeCatalog();
 const {profile}=await service.create();const original=args.proxyStore.update;let release,requested;
 const saved=new Promise(resolve=>{requested=resolve});
 args.proxyStore.update=async(...values)=>{const result=await original(...values);requested();await new Promise(resolve=>{release=resolve});return result};
 const pending=engine.start(profile),rejected=assert.rejects(pending,/绑定已变化/);
 await saved;await service.setRoute({id:profile.id,routeId:catalog.nodes[1].id});release();await rejected;
 assert.equal(starts.length,0);assert.equal(service.bindings[profile.id].routeId,catalog.nodes[1].id);
});
test('a fresh controller restores a version 2 selected-node binding without trusting the stale stored port',async t=>{
 const {service,engine,args,pools}=profileFixture(t),catalog=await service.routeCatalog();
 const {profile}=await service.create({routeId:catalog.nodes[1].id});await service.routes.stopAll();
 const restartedEngine={profiles:new Map(engine.profiles),start:async row=>row,stop:async()=>{},syncProfiles:async()=>{}};
 const restored=new LycoProfiles({...args,engine:restartedEngine});pools.add(restored.routes);
 const started=await restartedEngine.start({...profile,proxy:'DIRECT',proxyId:null});
 assert.equal(restored.formatVersion,2);assert.equal(restored.bindings[profile.id].routeId,catalog.nodes[1].id);
 const current=restored.routes.entries.get(profile.id);assert.ok(current);assert.equal(started.proxy,'http://127.0.0.1:'+current.port);
 assert.deepEqual(current.child.config['proxy-groups'][0].proxies,['CI route B']);
});


test('region display labels preserve legacy saved route ids and selected endpoint',()=>{
 const original=subscription(),old=routesFromSubscription(original);
 const named=structuredClone(original);
 const rename=new Map();
 for(const node of named.proxies){const name=node.name;node['x-lyco-original-name']=name;node.name='🇯🇵 日本（来源标注） · '+name;rename.set(name,node.name)}
 for(const group of named['proxy-groups'])group.proxies=group.proxies.map(name=>rename.get(name)||name);
 const current=routesFromSubscription(named);assert.deepEqual(current.nodes.map(n=>n.id),old.nodes.map(n=>n.id));
 assert.match(current.nodes[0].label,/日本/);
 const selected=fixedConfig(current.config,current.nodes[1],18002);assert.equal(selected.proxies.length,1);
 assert.equal(selected.proxies[0].port,19002);assert.match(selected['proxy-groups'].at(-1).proxies[0],/日本/);
 named.proxies[0]['x-lyco-original-name']='bad\nidentity';assert.throws(()=>routesFromSubscription(named),/原始标识/);
});
