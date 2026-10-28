import test from 'node:test';
import assert from 'node:assert/strict';
import {API,SHOP,mobileSubscription,proxyEntitlement,proxyPlanName} from '../apps/universal/src/billing.ts';
const entitlement={product:'proxy_1m',status:'active',expires_at:'2099-01-01T00:00:00Z',meta:{sub_url:'https://lain42.top/panel/api/sub/CIonly123'}};
const originals=new WeakMap();
function fixture(t,me){
 if(!originals.has(t)){
  const prior=globalThis.fetch;originals.set(t,prior);t.after(()=>{globalThis.fetch=prior});
 }
 const calls=[];
 globalThis.fetch=async(url,options)=>{
  calls.push({url,options});
  if(url===API+'/me')return new Response(JSON.stringify(me));
  if(url===API+'/sub/CIonly123/clash')return new Response(JSON.stringify({proxies:[{name:'CI node',type:'http',server:'127.0.0.1',port:18081}],'proxy-groups':[{name:'PROXY',proxies:['CI node']}]}));
  throw Error('Unexpected subscription endpoint');
 };
 return calls;
}
test('mobile paid routing revalidates owner and entitlement before reading an authenticated subscription',async t=>{
 const calls=fixture(t,{username:'CI-owner',entitlements:[entitlement]});
 const result=await mobileSubscription('CI_PRIVATE_SESSION','CI-owner');
 assert.equal(result.owner,'CI-owner');assert.equal(result.nodes.length,1);assert.ok(result.expiresAt>Date.now());
 assert.deepEqual(calls.map(c=>c.url),[API+'/me',API+'/sub/CIonly123/clash']);
 assert.ok(calls.every(c=>c.options.headers.Authorization==='Bearer CI_PRIVATE_SESSION'));
 assert.doesNotMatch(JSON.stringify(result),/CI_PRIVATE_SESSION|CIonly123|sub_url/);
});
test('expired, different-owner and foreign-host subscriptions do not request a node feed',async t=>{
 for(const [owner,item] of [['other',entitlement],['CI-owner',{...entitlement,status:'expired'}],['CI-owner',{...entitlement,meta:{sub_url:'https://foreign.example/token'}}]]){
  const calls=fixture(t,{username:owner,entitlements:[item]});
  await assert.rejects(()=>mobileSubscription('CI_PRIVATE_SESSION','CI-owner'));
  assert.equal(calls.length,1);
 }
});
test('all purchased terms retain the canonical service and their actual account label',async t=>{
 for(const [code,label] of [['proxy_1m','代理月卡'],['proxy_3m','代理季卡'],['proxy_4m','代理120天套餐'],['proxy_1y','代理年卡']]){
  const item={...entitlement,purchase_product:code};
  assert.equal(proxyPlanName(item),label);
  assert.equal(proxyPlanName({...entitlement,meta:{...entitlement.meta,purchase_product:code}}),label);
  const calls=fixture(t,{username:'CI-owner',entitlements:[item]});
  const result=await mobileSubscription('CI_PRIVATE_SESSION','CI-owner');
  assert.equal(result.expiresAt,Date.parse(item.expires_at));assert.equal(result.nodes.length,1);
  assert.equal(calls.length,2);
 }
 assert.equal(SHOP,'https://lain42.top/vpn/#plans');
});
test('unknown names are generic and purchase SKUs alone do not authorize routing',()=>{
 assert.equal(proxyPlanName({...entitlement,purchase_product:'constructor'}),'代理订阅');
 assert.equal(proxyPlanName(null),'代理订阅');
 assert.equal(proxyEntitlement({entitlements:[{...entitlement,product:'proxy_3m',purchase_product:'proxy_3m'}]}),null);
 assert.equal(proxyPlanName(entitlement),'代理月卡');
});
