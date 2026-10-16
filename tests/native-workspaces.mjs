import {_electron as electron} from 'playwright';
import http from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Only Actions runs native product acceptance');
const binary=path.resolve(process.argv[2]);
const appRoot=path.resolve(process.argv[3]);
const evidence=path.resolve('lyco-native-evidence');await fs.mkdir(evidence,{recursive:true});
const report={commit:process.env.GITHUB_SHA,binary,fixtureBilling:true,realPayments:0,proxyRequests:[],checks:[]};
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const origin=http.createServer((req,res)=>{report.proxyRequests.push({path:req.url,proxied:req.headers['x-ci-proxy']==='yes'});res.end('LYCO browser fixture reached through proxy');});
const originPort=await listen(origin);
const proxy=http.createServer((req,res)=>{
 const url=new URL(req.url);
 if(!['127.0.0.1','lyco-fixture.invalid'].includes(url.hostname)||url.port!==String(originPort)) {res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({status:'success',query:'203.0.113.7',ip:'203.0.113.7',countryCode:'US',country:'CI',timezone:'Etc/UTC',lat:0,lon:0}));return;}
 url.hostname='127.0.0.1';
 const upstream=http.request(url,{headers:{...req.headers,'x-ci-proxy':'yes'}},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res)});
 upstream.on('error',()=>{res.writeHead(502);res.end()});req.pipe(upstream);
});
// No unrestricted CONNECT tunnel and no public listener.
proxy.on('connect',(_req,socket)=>socket.end('HTTP/1.1 502 CI fixture only\r\n\r\n'));
const proxyPort=await listen(proxy);
let application;
try {
 application=await electron.launch({executablePath:binary,args:[appRoot],timeout:60000,
  env:{...process.env,OPENBROWSER_API_PORT:String(51000+Math.floor(Math.random()*1000))}});
 const page=await application.firstWindow();await page.waitForLoadState('domcontentloaded');
 await application.evaluate(async({shell},port)=>{
  globalThis.__lycoFixtureOwner='ci-owner-a';globalThis.__lycoFixtureExpired=false;globalThis.__lycoOpened=[];
  shell.openExternal=async url=>{globalThis.__lycoOpened.push(url)};
  globalThis.fetch=async(url,options={})=>{
   const root='https://lain42.top/studio/api';
   if(!String(url).startsWith(root+'/'))throw Error('Unexpected fixture host');
   if(url===root+'/login')return new Response(JSON.stringify({token:'CI_FIXTURE_TOKEN'}),{status:200});
   if(options.headers?.Authorization!=='Bearer CI_FIXTURE_TOKEN')return new Response('{}',{status:401});
   if(url===root+'/me')return new Response(JSON.stringify({username:globalThis.__lycoFixtureOwner,entitlements:[{product:'proxy_1m',status:'active',expires_at:globalThis.__lycoFixtureExpired?'2020-01-01T00:00:00Z':'2099-01-01T00:00:00Z',meta:{sub_url:'https://lain42.top/panel/api/sub/CIfixture123456'}}]}),{status:200});
   if(url===root+'/sub/CIfixture123456/clash')return new Response(JSON.stringify({proxies:[{name:'ci-node',type:'http',server:'127.0.0.1',port}], 'proxy-groups':[{name:'PROXY',type:'select',proxies:['ci-node']}]}),{status:200});
   throw Error('Unexpected fixture endpoint');
  };
 },proxyPort);
 await page.locator('[data-view="lyco"]').click();
 await page.locator('#view-lyco').waitFor({state:'visible'});
 assert.equal(await page.locator('#lyco-create-profile').isDisabled(),true);
 await page.locator('#lyco-username').fill('ci-owner-a');await page.locator('#lyco-password').fill('CI-owned-password');
 await page.locator('#lyco-login button[type="submit"]').click();
 await page.waitForFunction(()=>!document.getElementById('lyco-create-profile').disabled);
 await page.evaluate(()=>{const adopt=window.adoptLycoProfile;window.adoptLycoProfile=p=>{window.__lycoCreated=p;return adopt(p)}});
 await page.locator('#lyco-create-profile').click();
 await page.waitForFunction(()=>Boolean(window.__lycoCreated));
 const profile=await page.evaluate(()=>window.__lycoCreated);
 assert.ok(profile.proxyId);assert.match(profile.proxy,/^http:\/\/127\.0\.0\.1:\d+$/);
 assert.equal(await page.locator(`#profile-table tr[data-profile-id="${profile.id}"]`).count(),1);
 const state=await page.evaluate(()=>window.ops.lycoStatus());assert.equal(state.connected,true);
 await new Promise((resolve,reject)=>{
  http.get({host:'127.0.0.1',port:state.port,path:`http://127.0.0.1:${originPort}/mihomo-probe`,headers:{Host:`127.0.0.1:${originPort}`}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>{try{assert.match(text,/reached through proxy/);resolve()}catch(e){reject(e)}})}).on('error',reject);
 });
 assert.ok(report.proxyRequests.some(row=>row.path==='/mihomo-probe'&&row.proxied));
 report.checks.push('packaged-native-login-create-profile','actual-bundled-mihomo-http-routing');
 await page.screenshot({path:path.join(evidence,'windows-workspace.png')});
 // Exercise the actual existing engine with the bound profile and bundled browser.
 const target=`http://lyco-fixture.invalid:${originPort}/browser-probe`;
 await page.evaluate(async({profile,target})=>window.ops.startProfile({...profile,startUrl:target,platform:{type:'other',startUrl:target},advanced:{startUrls:target},privacy:{...profile.privacy,langFromIp:false,timezoneFromIp:false,geoFromIp:false}}),{profile,target});
 const deadline=Date.now()+30000;
 while(Date.now()<deadline&&!report.proxyRequests.some(r=>r.path==='/browser-probe'))await new Promise(r=>setTimeout(r,250));
 assert.ok(report.proxyRequests.some(r=>r.path==='/browser-probe'&&r.proxied),'Real bundled Chromium traffic must pass through the managed proxy');
 assert.equal(report.proxyRequests.some(r=>r.path==='/browser-probe'&&!r.proxied),false);
 report.checks.push('real-bundled-chromium-via-managed-proxy');
 await page.evaluate(()=>window.ops.stopProfile(window.__lycoCreated.id));
 await page.locator('[data-view="lyco"]').click();
 await page.locator('#lyco-buy').click();
 await page.waitForFunction(()=>document.getElementById('lyco-feedback').textContent.includes('已在系统浏览器打开'));
 assert.deepEqual(await application.evaluate(()=>globalThis.__lycoOpened),['https://lain42.top/shop/#proxy_1m']);
 await application.evaluate(()=>{globalThis.__lycoFixtureOwner='ci-owner-b'});
 await assert.rejects(()=>page.evaluate(()=>window.ops.startProfile(window.__lycoCreated)),/另一网站账号/);
 await application.evaluate(()=>{globalThis.__lycoFixtureOwner='ci-owner-a';globalThis.__lycoFixtureExpired=true});
 await page.locator('#lyco-refresh').click();await page.waitForFunction(async()=>!(await window.ops.lycoStatus()).connected);
 assert.equal(await page.locator('#lyco-create-profile').isDisabled(),true);
 assert.equal((await page.evaluate(()=>window.ops.lycoStatus())).connected,false);
 report.checks.push('official-purchase-link-no-payment','cross-account-start-rejected','expired-entitlement-disconnects');
 await page.screenshot({path:path.join(evidence,'windows-expired-membership.png')});
} finally {
 if(application){try{const p=await application.firstWindow();await p.evaluate(()=>window.ops.lycoLogout())}catch{}await application.close();}
 origin.closeAllConnections();proxy.closeAllConnections();await new Promise(r=>origin.close(r));await new Promise(r=>proxy.close(r));
 await fs.writeFile(path.join(evidence,'native-workspaces.json'),JSON.stringify(report,null,2));
}
