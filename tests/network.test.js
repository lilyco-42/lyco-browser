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
