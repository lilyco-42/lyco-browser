import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Actions only');
const require=createRequire(path.join(process.env.RUNNER_TEMP,'lyco-notice-browser/package.json'));
const {chromium}=require('playwright');
const output=path.join(process.env.RUNNER_TEMP,'lyco-npm-notice-evidence');await fs.mkdir(output,{recursive:true});
const root=path.resolve('apps/universal');
const bundle=JSON.parse(await fs.readFile(path.join(root,'src/npm-notices.json'),'utf8'));
assert.equal(bundle.generated,true);assert.ok(bundle.packages.length>100);
const react=bundle.packages.find(row=>row.name==='react');assert.ok(react.files.length);
const server=spawn('python3',['-m','http.server','18765','--bind','127.0.0.1','--directory',path.join(root,'dist-web')],{stdio:'ignore'});
const browser=await chromium.launch();
try{
 let ready=false;
 for(let attempt=0;attempt<100;attempt++){
  try{ready=(await fetch('http://127.0.0.1:18765')).ok;if(ready)break}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.equal(ready,true);
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  if(new URL(route.request().url()).origin!=='http://127.0.0.1:18765'){await route.abort();return}
  await route.continue();
 });
 const page=await context.newPage();
 await page.goto('http://127.0.0.1:18765');
 await page.getByText('平台能力',{exact:true}).click();
 // All notice browsing below must continue without any network connection.
 await context.setOffline(true);
 await page.getByRole('button',{name:'JavaScript 依赖开源许可',exact:true}).click();
 await page.getByLabel('搜索依赖名称').fill('react');
 await page.getByText('react · '+react.version,{exact:true}).click();
 await page.getByText(react.files[0].text,{exact:true}).waitFor({state:'visible'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:path.join(output,'offline-react-license.png')});
 await page.getByLabel('搜索依赖名称').fill('not-a-real-lyco-dependency');
 await page.getByText('没有匹配的依赖。',{exact:true}).waitFor({state:'visible'});
 await page.getByRole('button',{name:'关闭许可页',exact:true}).click();
 assert.equal(await page.getByText('LYCO Browser',{exact:true}).isVisible(),true);
 await context.close();
 const planLabels=[];
 for(const [code,label] of [['proxy_3m','代理季卡'],['proxy_4m','代理120天套餐'],['proxy_1y','代理年卡']]){
  const customer=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await customer.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin==='http://127.0.0.1:18765'){await route.continue();return}
   const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:18765','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
   if(url.origin==='https://lain42.top'&&req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return}
   if(url.href==='https://lain42.top/studio/api/login'&&req.method()==='POST'){
    await route.fulfill({headers,json:{token:'CI-plan-fixture-only'}});return;
   }
   if(url.href==='https://lain42.top/studio/api/me'){
    await route.fulfill({headers,json:{username:'CI-plan-user',points:{balance:10000},entitlements:[{
     product:'proxy_1m',purchase_product:code,status:'active',expires_at:'2099-01-01T00:00:00Z',
     meta:{purchase_product:code,sub_url:'https://lain42.top/panel/api/sub/CIonly123'},
    }]}});return;
   }
   await route.abort();
  });
  const account=await customer.newPage();await account.goto('http://127.0.0.1:18765');
  await account.getByLabel('网站用户名',{exact:true}).fill('CI-plan-user');
  await account.getByLabel('网站密码',{exact:true}).fill('CI-password-only');
  await account.getByRole('button',{name:'登录并验证权益',exact:true}).click();
  await account.getByText(label+'有效',{exact:true}).waitFor({state:'visible'});
  assert.equal(await account.getByText('代理月卡有效',{exact:true}).count(),0);
  await account.screenshot({path:path.join(output,'account-'+code+'.png')});
  planLabels.push(code);await customer.close();
 }
 await fs.writeFile(path.join(output,'result.json'),JSON.stringify({scope:'Shared React Native Web UI with isolated Billing fixtures, not native mobile runtime or real payments',offlineNoticeBrowsing:true,searchAndClose:true,originalReactTextMatched:true,accountPlanLabels:planLabels,packageCount:bundle.packages.length,reviewCount:bundle.review.length},null,2)+'\n');
}finally{await browser.close();server.kill();}
