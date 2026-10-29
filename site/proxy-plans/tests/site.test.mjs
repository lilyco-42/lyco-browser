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
 {code:'proxy_4m',name:'不限量不限速代理 · 120天套餐',points_price:1136,duration_days:120},
 {code:'proxy_1y',name:'不限量不限速代理 · 年卡',points_price:3050,duration_days:365},
].map(product=>({...product,purchase_method:'points',price_usdt:product.points_price/10,desc:product.duration_days+' 天代理订阅'}));
let browser;
before(async()=>{await fs.mkdir(evidence,{recursive:true});browser=await chromium.launch();});
after(async()=>{await browser?.close();});

async function fixture({width=1280,loggedIn=false,missingYear=false,unavailable=false,entitlements=[],ordinaryQualified=0}={}){
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
   else if(api==='/proxy/quality')data={ok:true,nodes:[],summary:{tested:0}};
   else if(api==='/proxy/site-quality')data={ok:true,available:true,rows:[],summary:{tested:0}};
   else if(api==='/proxy/community/summary')data={ok:true,node_category:'ordinary',eligible:300,tested:300,verified:17,
    available:ordinaryQualified,quality_qualified:ordinaryQualified,stale:false,updated_at:'2026-10-29T14:14:33Z',
    catalog_total:639,catalog_protocols:{vless:289,ss:136,trojan:122,hysteria2:53,vmess:36,anytls:2,tuic:1}};
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

for(const width of [390,1280])test(`four current proxy offers and links fit ${width}px`,async()=>{
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
  assert.match(await f.page.locator('#planBadge-proxy_4m').textContent(),/95 折/);
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

for(const [code,price] of [['proxy_3m',852],['proxy_4m',1136],['proxy_1y',3050]])test(`${code} checkout quotes and submits the selected term`,async()=>{
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
 for(const [code,label,days] of [['proxy_4m','120天套餐',120],['proxy_1y','年卡',365]]){
 const entitlement={product:'proxy_1m',purchase_product:code,status:'active',license_key:'fixture-only',
  expires_at:new Date(Date.now()+days*86400000).toISOString(),meta:{purchase_product:code}};
 const f=await fixture({loggedIn:true,entitlements:[entitlement]});
 try{
  await f.page.goto(origin+'/account/');
  await f.page.waitForFunction(label=>document.getElementById('entitlements')?.textContent.includes(label),label);
  assert.ok((await f.page.locator('#entitlements').textContent()).includes('代理 · '+label));
  await f.page.goto(origin+'/vpn/');
  await f.page.waitForFunction(label=>document.getElementById('accountTitle')?.textContent===label+'已生效',label);
  assert.deepEqual(f.state.posts,[]);
 }finally{await f.context.close();}
 }
});

test('legacy purchase page also explains the 120-day term and its account entitlement',async()=>{
 const f=await fixture({loggedIn:true,entitlements:[{product:'proxy_1m',purchase_product:'proxy_4m',
  status:'active',expires_at:new Date(Date.now()+120*86400000).toISOString(),license_key:'fixture-only',meta:{purchase_product:'proxy_4m'}}]});
 try{
  await f.page.goto(origin+'/sub/buy.html');
  await f.page.waitForFunction(()=>document.getElementById('plans')?.textContent.includes('120 天有效期'));
  await f.page.waitForFunction(()=>document.getElementById('myEnts')?.textContent.includes('120天套餐'));
  assert.deepEqual(f.state.posts,[]);
 }finally{await f.context.close();}
});

for(const width of [390,1280])test(`ordinary catalogue and protocol types remain visible when no nodes meet deep checks at ${width}px`,async()=>{
 const f=await fixture({width,ordinaryQualified:0});
 try{
  await f.page.goto(origin+'/vpn/quality.html');
  await f.page.waitForFunction(()=>document.getElementById('ordinaryTotal')?.textContent==='639');
  assert.equal(await f.page.locator('#communityAvailable').textContent(),'0');
  assert.equal(await f.page.locator('#communityVerified').textContent(),'17');
  const section=f.page.locator('#ordinaryNodes');
  assert.equal(await section.getByRole('heading',{name:'普通节点',exact:true}).count(),1);
  assert.equal(await section.locator('[data-ordinary-protocol]').count(),7);
  for(const [type,label] of [['vless','VLESS 289'],['ss','Shadowsocks 136'],['hysteria2','Hysteria2 53'],['tuic','TUIC 1']])
   assert.equal(await section.locator(`[data-ordinary-protocol="${type}"]`).textContent(),label);
  assert.equal(await section.getByRole('link',{name:'打开普通节点订阅 →'}).getAttribute('href'),'/sub/#ordinary');
  assert.equal(await f.page.locator('#runAll').count(),1);
  assert.equal(await f.page.locator('#runLocal').count(),1);
  assert.equal(await f.page.locator('#refreshNodes').count(),1);
  assert.equal(await f.page.locator('#refreshSites').count(),1);
  await f.page.locator('#refreshCommunity').click();
  await f.page.waitForFunction(()=>!document.getElementById('refreshCommunity').disabled);
  assert.equal(await f.page.locator('#ordinaryTotal').textContent(),'639');
  const geometry=await section.evaluate(node=>({width:node.clientWidth,scroll:node.scrollWidth}));
  assert.ok(geometry.scroll<=geometry.width+1);
  assert.doesNotMatch(await section.textContent(),/免费节点|暂不推荐|仅作备用/);
  await section.screenshot({path:path.join(evidence,`ordinary-catalogue-${width}.png`)});
  await f.page.evaluate(()=>window.scrollBy(0,-72));
  await f.page.screenshot({path:path.join(evidence,`ordinary-catalogue-${width}-viewport.png`)});
  assert.deepEqual(f.state.posts,[]);assert.deepEqual(f.state.unexpected,[]);
 }finally{await f.context.close();}
});

for(const width of [390,1280])test(`ordinary formats retain original options and fit the styled subscription page at ${width}px`,async()=>{
 const entitlement={product:'proxy_1m',status:'active',expires_at:'2099-01-01T00:00:00Z',
  meta:{sub_url:'https://lain42.top/panel/api/sub/CIordinaryowned'}};
 const f=await fixture({width,loggedIn:true,entitlements:[entitlement]});
 try{
  await f.page.goto(origin+'/sub/');
  await f.page.locator('#subs .sub-item').last().waitFor();
  assert.equal(await f.page.locator('#subs .sub-item').count(),4);
  const rows=await f.page.locator('#subs .sub-item').allTextContents();
  assert.ok(rows[0].includes('Clash Meta / Verge / Mihomo'));
  assert.ok(rows[1].includes('通用 base64 订阅'));
  assert.ok(rows[2].includes('类型：普通节点；格式：Clash'));
  assert.ok(rows[3].includes('普通节点 · 完整目录'));
  assert.ok(rows[3].includes('/clashall'));
  assert.equal(await f.page.locator('#subs .cp').count(),4);
  assert.notEqual(await f.page.locator('#subCard').evaluate(node=>getComputedStyle(node).borderRadius),'0px',
   'Subscription visual acceptance must load its actual stylesheet');
  for(const row of await f.page.locator('#subs .sub-item').all()){
   const size=await row.evaluate(node=>({client:node.clientWidth,scroll:node.scrollWidth}));
   assert.ok(size.scroll<=size.client+1,'Each format and its controls must fit without hidden horizontal content');
  }
  await f.page.locator('#subCard').screenshot({path:path.join(evidence,`ordinary-subscription-formats-${width}.png`)});
  await f.page.goto(origin+'/account/');
  const select=f.page.locator('#entitlements select');await select.waitFor();
  assert.deepEqual(await select.locator('option').evaluateAll(options=>options.map(x=>x.value)),
   ['clash','base64','clashjp','base64jp','clashcommunity','clashall']);
  for(const format of ['clashcommunity','clashall']){
   await select.selectOption(format);
   assert.equal(await f.page.locator('#entitlements textarea').inputValue(),
    'https://lain42.top/studio/api/sub/CIordinaryowned/'+format);
   assert.equal(await f.page.getByRole('button',{name:'复制 Clash 订阅',exact:true}).count(),1);
   assert.ok((await f.page.locator('#entitlements').textContent()).includes('类型：普通节点；格式：Clash'));
  }
  assert.deepEqual(f.state.posts,[]);assert.deepEqual(f.state.unexpected,[]);
 }finally{await f.context.close();}
});
