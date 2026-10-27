import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

if(process.env.GITHUB_ACTIONS!=='true')throw Error('Website verification only runs in GitHub Actions');
const root=fileURLToPath(new URL('../',import.meta.url));
const evidence=path.join(process.env.RUNNER_TEMP,'lyco-proxy-site-evidence');
const origin='https://proxy-plans.fixture.invalid';
const products=[
 {code:'proxy_1m',name:'不限量不限速代理 · 月卡',points_price:299,duration_days:30},
 {code:'proxy_3m',name:'不限量不限速代理 · 季卡',points_price:852,duration_days:90},
 {code:'proxy_1y',name:'不限量不限速代理 · 年卡',points_price:3050,duration_days:365},
];
let browser;
before(async()=>{await fs.mkdir(evidence,{recursive:true});browser=await chromium.launch();});
after(async()=>{await browser?.close();});

async function fixture({width=1280,loggedIn=false,missingYear=false,unavailable=false,entitlements=[]}={}){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
 if(loggedIn)await context.addInitScript(()=>localStorage.setItem('wb-token','ci-fixture-only'));
 const state={posts:[],unexpected:[],balance:10000,entitlements:[...entitlements]};
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin){await route.abort();return;}
  const api=url.pathname.replace('/studio/api','');
  if(url.pathname.startsWith('/studio/api/')){
   let data={ok:true};
   if(api==='/products'){
    if(unavailable){await route.fulfill({status:503,json:{detail:'fixture unavailable'}});return;}
    data={ok:true,wallet:'fixture-wallet',points_exchange:{points_per_usdt:10},products:products.filter(p=>!missingYear||p.code!=='proxy_1y')};
   }else if(api==='/me')data={ok:true,username:'CI plan customer',account_id:1,founder:false,points:{balance:state.balance,entries:[]},entitlements:state.entitlements};
   else if(api.startsWith('/payments/'))data={ok:true,configured:false,products:[],packs:[],topup_tiers:[],topup_tiers_cny:[]};
   else if(api==='/account/orders')data={ok:true,items:[],next_before:null};
   else if(api==='/points/purchase'&&request.method()==='POST'){
    const body=request.postDataJSON();state.posts.push(body);
    const selected=products.find(p=>p.code===body.product);
    assert.ok(selected);assert.equal(typeof body.reference,'string');assert.ok(body.reference.length>0);
    state.balance-=selected.points_price;
    state.entitlements.push({product:'proxy_1m',purchase_product:selected.code,status:'active',
      license_key:'fixture-license',expires_at:new Date(Date.now()+selected.duration_days*86400000).toISOString(),meta:{purchase_product:selected.code}});
    data={ok:true,order:{order_no:'CI-FIXTURE',product:selected.code},points:{balance:state.balance}};
   }else{state.unexpected.push({path:api,method:request.method()});await route.fulfill({status:404,json:{detail:'not in fixture'}});return;}
   await route.fulfill({json:data});return;
  }
  let relative=url.pathname.replace(/^\//,'');
  if(relative.endsWith('/'))relative+='index.html';
  if(!relative)relative='index.html';
  const candidates=[path.join(root,'site',relative),path.join(root,'fixtures',relative)];
  for(const candidate of candidates){
   if(!candidate.startsWith(root))break;
   try{
    const body=await fs.readFile(candidate);
    const contentType=candidate.endsWith('.html')?'text/html; charset=utf-8':candidate.endsWith('.js')?'text/javascript; charset=utf-8':candidate.endsWith('.css')?'text/css; charset=utf-8':'application/octet-stream';
    await route.fulfill({body,contentType});return;
   }catch(error){if(error.code!=='ENOENT')throw error;}
  }
  await route.fulfill({status:404,body:'Not in reviewed fixture'});
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);
 return {page,context,state};
}

for(const width of [390,1280])test(`three current proxy offers and links fit ${width}px`,async()=>{
 const f=await fixture({width});
 try{
  await f.page.goto(origin+'/vpn/');
  await f.page.waitForFunction(()=>document.getElementById('planPrice-proxy_1y')?.textContent==='3050');
  for(const product of products){
   assert.equal(await f.page.locator('#planPrice-'+product.code).textContent(),String(product.points_price));
   assert.equal(await f.page.locator('#planBuy-'+product.code).getAttribute('href'),'/shop/#'+product.code);
   assert.match(await f.page.locator('#planDesc-'+product.code).textContent(),new RegExp(product.duration_days+' 天'));
  }
  assert.match(await f.page.locator('#planBadge-proxy_3m').textContent(),/95 折/);
  assert.match(await f.page.locator('#planBadge-proxy_1y').textContent(),/85 折/);
  assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await f.page.locator('#plans').screenshot({path:path.join(evidence,'vpn-plans-'+width+'.png')});
  assert.deepEqual(f.state.posts,[]);
 }finally{await f.context.close();}
});

test('missing or unavailable catalogue does not invent a purchasable annual plan',async()=>{
 for(const unavailable of [false,true]){
  const f=await fixture({missingYear:true,unavailable});
  try{
   await f.page.goto(origin+'/vpn/');
   await f.page.waitForFunction(()=>['未上架','详见商城'].includes(document.getElementById('planPrice-proxy_1y')?.textContent));
   assert.equal(await f.page.locator('#planBuy-proxy_1y').getAttribute('href'),'/shop/');
   assert.deepEqual(f.state.posts,[]);
  }finally{await f.context.close();}
 }
});

for(const [code,price] of [['proxy_3m',852],['proxy_1y',3050]])test(`${code} checkout quotes and submits the selected term`,async()=>{
 const f=await fixture({loggedIn:true,width:390});
 try{
  await f.page.goto(origin+'/shop/#'+code);
  await f.page.waitForFunction(()=>document.getElementById('identity')?.textContent.includes('CI plan customer'));
  await f.page.locator('[data-product="'+code+'"]').click();
  assert.match(await f.page.locator('#quote').textContent(),new RegExp(price+' 积分'));
  await f.page.locator('#pay').click();
  await f.page.waitForFunction(()=>document.getElementById('feedback')?.textContent.includes('购买已确认'));
  assert.equal(f.state.posts.length,1);assert.equal(f.state.posts[0].product,code);
  assert.equal(f.state.balance,10000-price);
  assert.deepEqual(f.state.unexpected,[]);
  await f.page.locator('#subscriptionProducts').screenshot({path:path.join(evidence,'shop-'+code+'.png')});
 }finally{await f.context.close();}
});

test('account and service status show the purchased term behind the compatible service code',async()=>{
 const entitlement={product:'proxy_1m',purchase_product:'proxy_1y',status:'active',license_key:'fixture-only',
  expires_at:new Date(Date.now()+365*86400000).toISOString(),meta:{purchase_product:'proxy_1y'}};
 const f=await fixture({loggedIn:true,entitlements:[entitlement]});
 try{
  await f.page.goto(origin+'/account/');
  await f.page.waitForFunction(()=>document.getElementById('entitlements')?.textContent.includes('年卡'));
  assert.match(await f.page.locator('#entitlements').textContent(),/代理 · 年卡/);
  await f.page.goto(origin+'/vpn/');
  await f.page.waitForFunction(()=>document.getElementById('accountTitle')?.textContent==='年卡已生效');
  assert.deepEqual(f.state.posts,[]);
 }finally{await f.context.close();}
});
