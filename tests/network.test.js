'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {LycoNetwork,extractEntitlement,makeConfig,SHOP,ACCOUNT}=require('../src/network');

const goodToken='abcdef098765';
const active={product:'proxy_1m',status:'active',expires_at:'2099-12-31T00:00:00Z',
  meta:{sub_url:'https://lain42.top/panel/api/sub/'+goodToken}};
test('entitlement strictly requires valid paid-product status, domain and expiry',()=>{
  assert.equal(extractEntitlement({entitlements:[active]}).token,goodToken);
  assert.equal(extractEntitlement({entitlements:[{...active,status:'expired'}]}),null);
  assert.equal(extractEntitlement({entitlements:[{...active,product:'rembg_creator'}]}),null);
  assert.equal(extractEntitlement({entitlements:[{...active,expires_at:'2020-01-01T00:00:00Z'}]}),null);
  assert.equal(extractEntitlement({entitlements:[{...active,meta:{sub_url:'https://fake.example/sub/abc'}}]}),null);
  assert.match(SHOP,/^https:\/\/lain42\.top\/shop\//);
  assert.match(ACCOUNT,/^https:\/\/lain42\.top\/account\//);
});
test('safe Mihomo config never exposes external controller nor LAN listener',()=>{
  const source={proxies:[{name:'node',type:'http',server:'127.0.0.1',port:9001}],
    'proxy-groups':[{name:'PROXY',type:'select',proxies:['node']}],
    'mixed-port':7777,'external-controller':'0.0.0.0:9090','allow-lan':true,'secret':'evil'};
  const config=makeConfig(source,19876);
  assert.equal(config['mixed-port'],19876);
  assert.equal(config['allow-lan'],false);
  assert.equal(config['bind-address'],'127.0.0.1');
  assert.equal(config['external-controller'],undefined);
  assert.equal(config.secret,undefined);
  assert.equal(config.rules.at(-1),'MATCH,PROXY');
  assert.throws(()=>makeConfig({proxies:[], 'proxy-groups':[]},12345));
  assert.throws(()=>makeConfig(source,22));
});
test('login fetches site entitlement and holds JWT privately in main only',async()=>{
  const calls=[];
  const mockFetch=async(url,req)=>{
    calls.push({url,method:req.method,auth:req.headers.Authorization});
    if(url.endsWith('/login'))return {ok:true,json:async()=>({token:'opaque-jwt-test-only'})};
    if(url.endsWith('/me'))return {ok:true,json:async()=>({username:'sample',entitlements:[active]})};
    return {ok:false,status:404};
  };
  const app=new LycoNetwork({dataDir:path.join(__dirname,'fixtures'),fetchFn:mockFetch});
  const state=await app.login({username:'sample',password:'long-test-password'});
  assert.equal(state.username,'sample');
  assert.equal(state.entitled,true);
  assert.equal(state.connected,false);
  assert.equal(state.has_core,false);
  assert.equal(Object.prototype.hasOwnProperty.call(state,'token'),false);
  assert.equal(calls[0].auth,undefined);
  assert.equal(calls[1].auth,'Bearer opaque-jwt-test-only');
  await assert.rejects(()=>app.connect(),/mihomo/i);
  assert.equal(await app.logout().then(s=>s.logged_in),false);
  assert.equal(calls.length,2);
});
test('rejects anonymous connection, invalid login and bad core path',async()=>{
 const app=new LycoNetwork({dataDir:__dirname,fetchFn:async()=>{throw Error('must not fetch');}});
 await assert.rejects(()=>app.connect(),/proxy_1m/);
 await assert.rejects(()=>app.login({username:'hi',password:'a'}));
 assert.throws(()=>app.selectCore('C:\\fake\\other.exe'));
});
test('integration overlay includes required elements without leaking auth tokens',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','src','view.html'),'utf8');
 const script=fs.readFileSync(path.join(__dirname,'..','src','ui.js'),'utf8');
 for(const name of ['lyco-login','lyco-buy','lyco-import','lyco-connect','lyco-disconnect']){
  assert.match(html,new RegExp('id="'+name+'"'));
 }
 assert.match(script,/window\.ops\.lycoLogin/);
 assert.match(script,/window\.ops\.proxyCreate/);
 assert.match(script,/window\.ops\.lycoOpenShop/);
 assert.doesNotMatch(html,/BILLING_ADMIN_TOKEN|BILLING_SECRET|MIHOMO_SUB_TOKEN/);
});

test('a known entitlement expiry stops the core and removes its temporary config',async()=>{
 const tmp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'lyco-expiry-'));
 try {
  const app=new LycoNetwork({dataDir:tmp});
  const config=path.join(tmp,'config.json');fs.writeFileSync(config,'{}');
  let killed=false;app.child={exitCode:null,killed:false,kill(){killed=true;}};app.port=18001;app.configPath=config;
  app.entitlement={expires_at:new Date(Date.now()-1000).toISOString()};
  app.armExpiry();await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(killed,true);assert.equal(app.status().connected,false);assert.equal(fs.existsSync(config),false);
 } finally {fs.rmSync(tmp,{recursive:true,force:true});}
});

async function lifecycleFixture(t) {
 const os=require('node:os'), net=require('node:net'), {EventEmitter}=require('node:events');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lyco-core-lifecycle-'));
 const core=path.join(tmp,process.platform==='win32'?'mihomo.exe':'mihomo');fs.writeFileSync(core,'test core path');
 const children=[];
 const fetchFn=async url=>{
  if(url.endsWith('/login'))return new Response(JSON.stringify({token:'CI_ONLY'}));
  if(url.endsWith('/me'))return new Response(JSON.stringify({username:'sample',entitlements:[active]}));
  return new Response(JSON.stringify({proxies:[{name:'node',type:'http',server:'127.0.0.1',port:9001}], 'proxy-groups':[{name:'PROXY',type:'select',proxies:['node']}]}));
 };
 const app=new LycoNetwork({dataDir:tmp,bundledCore:core,fetchFn,spawnFn:(_bin,args)=>{
  const config=JSON.parse(fs.readFileSync(args[1],'utf8'));
  const child=new EventEmitter();child.exitCode=null;child.killed=false;
  child.server=net.createServer(socket=>socket.end());child.server.listen(config['mixed-port'],'127.0.0.1');
  child.kill=()=>{child.killed=true;child.server.close();return true};children.push(child);return child;
 }});
 t.after(async()=>{await app.disconnect();for(const child of children)if(child.server.listening)await new Promise(r=>child.server.close(r));fs.rmSync(tmp,{recursive:true,force:true});});
 await app.login({username:'sample',password:'CI-owned-password'});
 return {app,children};
}
test('concurrent environment connections start one tracked core',async t=>{
 const {app,children}=await lifecycleFixture(t);
 const [a,b]=await Promise.all([app.connect(),app.connect()]);
 assert.equal(children.length,1);assert.equal(a.port,b.port);assert.equal(a.connected,true);
});

test('extension handoff contains only a bounded loopback connection, never account or node secrets',async t=>{
 const {app}=await lifecycleFixture(t);await app.connect();
 const connection=await app.extensionConnection();
 const {parseConnection}=await import('../extensions/lain42/connection.mjs');
 assert.deepEqual(parseConnection(JSON.stringify(connection)),connection);
 assert.equal(connection.port,app.port);assert.equal(connection.scheme,'http');
 assert.ok(connection.expiresAt<=connection.issuedAt+8*60*60*1000);
 assert.doesNotMatch(JSON.stringify(connection),/password|Bearer|token|sample/);
 await app.disconnect();await assert.rejects(()=>app.extensionConnection(),/连接本地代理/);
});
test('a late exit from the previous core cannot clear the new core or its configuration',async t=>{
 const {app,children}=await lifecycleFixture(t);await app.connect();await app.disconnect();await app.connect();
 const current=app.child;const config=app.configPath;children[0].emit('exit',0);
 await new Promise(r=>setTimeout(r,20));assert.equal(app.child,current);
 assert.equal(app.status().connected,true);assert.equal(fs.existsSync(config),true);
});
test('disconnect cancels an in-flight subscription fetch before spawning a new core',async t=>{
 const {app,children}=await lifecycleFixture(t);const original=app.fetchFn;
 let release;let requested=false;
 app.fetchFn=async(url,opts)=>url.endsWith('/clash')?new Promise(resolve=>{requested=true;release=()=>resolve(new Response(JSON.stringify({proxies:[{name:'node'}],'proxy-groups':[{name:'PROXY'}]})))}):original(url,opts);
 const pending=app.connect();const rejected=assert.rejects(pending,/取消/);
 while(!requested)await new Promise(r=>setTimeout(r,5));await app.disconnect();release();await rejected;
 assert.equal(children.length,0);assert.equal(app.status().connected,false);
});
