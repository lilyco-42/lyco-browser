// Real packaged macOS/Linux workbench + kernel + Mihomo. Billing is a CI-only
// controlled fixture; browser storage and network traffic are observed, not mocked.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {_electron as electron} from 'playwright';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Actions only');
const [binary,appRoot]=process.argv.slice(2).map(p=>path.resolve(p));
const evidence=path.resolve(process.env.LYCO_UNIX_EVIDENCE||'lyco-unix-evidence');
await fs.mkdir(evidence,{recursive:true});
const report={platform:process.platform,source:process.env.GITHUB_SHA,checks:[],observations:[],proxyRequests:[]};
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const origin=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://fixture');
 if(url.pathname==='/report'){
  let body='';for await(const chunk of req)body+=chunk;
  report.observations.push({...JSON.parse(body),proxied:req.headers['x-lyco-ci-route']==='proxy'});
  res.end('ok');return;
 }
 if(url.pathname!=='/probe'){res.writeHead(404).end();return;}
 const phase=url.searchParams.get('phase'),owner=phase.startsWith('a')?'A':'B';
 res.setHeader('Content-Type','text/html');res.setHeader('Cache-Control','no-store');
 res.end(`<!doctype html><script>(async()=>{const phase=${JSON.stringify(phase)},owner=${JSON.stringify(owner)};
 const readCookie=()=>document.cookie.split('; ').find(x=>x.startsWith('owner='))?.slice(6)||null;
 const before={cookie:readCookie(),local:localStorage.getItem('owner')};
 document.cookie='owner='+owner+'; Path=/';localStorage.setItem('owner',owner);
 await fetch('/report',{method:'POST',body:JSON.stringify({phase,before,after:{cookie:readCookie(),local:localStorage.getItem('owner')}})});
 })();</script>`);
});
const originPort=await listen(origin);
const sockets=new Set();
const proxy=http.createServer((req,res)=>{
 const url=new URL(req.url);
 if(url.hostname!=='127.0.0.1'||Number(url.port)!==originPort){res.writeHead(502).end();return;}
 report.proxyRequests.push({method:req.method,path:url.pathname,phase:url.searchParams.get('phase')});
 const upstream=http.request({host:'127.0.0.1',port:originPort,path:url.pathname+url.search,method:req.method,
  headers:{...req.headers,'x-lyco-ci-route':'proxy'}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});
 upstream.on('error',()=>res.destroy());req.pipe(upstream);
});
for(const server of [origin,proxy])server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s))});
const proxyPort=await listen(proxy);
let app;
try{
 // Keep repository/Actions credentials out of the packaged application.
 const cleanEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|HOME|USER|LOGNAME|TMPDIR|TEMP|TMP|DISPLAY|XAUTHORITY|DBUS_SESSION_BUS_ADDRESS|XDG_RUNTIME_DIR|XDG_CONFIG_HOME|XDG_DATA_HOME|LANG|LC_ALL)$/.test(key)));
 app=await electron.launch({executablePath:binary,args:[appRoot],env:{...cleanEnv,OPENBROWSER_API_PORT:String(52000+Math.floor(Math.random()*1000))},timeout:60000});
 const page=await app.firstWindow();page.setDefaultTimeout(30000);await page.waitForLoadState('domcontentloaded');
 await app.evaluate((_electron,port)=>{
  globalThis.fetch=async(url,options={})=>{
   const root='https://lain42.top/studio/api';
   if(url===root+'/login')return new Response(JSON.stringify({token:'CI_UNIX_ONLY'}));
   if(options.headers?.Authorization!=='Bearer CI_UNIX_ONLY')return new Response('{}',{status:401});
   if(url===root+'/me')return new Response(JSON.stringify({username:'ci-unix-owner',entitlements:[{product:'proxy_1m',status:'active',expires_at:'2099-01-01T00:00:00Z',meta:{sub_url:'https://lain42.top/panel/api/sub/CIunixfixture'}}]}));
   if(url===root+'/sub/CIunixfixture/clash')return new Response(JSON.stringify({proxies:[{name:'ci-http',type:'http',server:'127.0.0.1',port}],'proxy-groups':[{name:'PROXY',type:'select',proxies:['ci-http']}]}));
   throw Error('Unexpected CI Billing endpoint');
  };
 },proxyPort);
 await page.locator('[data-view="lyco"]').click();
 await page.locator('#lyco-username').fill('ci-unix-owner');await page.locator('#lyco-password').fill('CI-owned-password');
 await page.locator('#lyco-login button[type="submit"]').click();
 await page.waitForFunction(()=>!document.getElementById('lyco-create-profile').disabled);
 report.checks.push('native-login');
 const profiles=[];
 for(let i=0;i<2;i++){
  const result=await page.evaluate(()=>window.ops.lycoCreateProfile());
  assert.ok(result.profile?.id&&result.profile?.proxyId);profiles.push(result.profile);
 }
 assert.notEqual(profiles[0].id,profiles[1].id);
 report.checks.push('two-real-managed-environments');
 for(const [phase,index,previous] of [['a-first',0,null],['b-first',1,null],['a-reopen',0,'A']]){
  const startUrl=`http://127.0.0.1:${originPort}/probe?phase=${phase}`;
  const configured=await page.evaluate(({profile,startUrl})=>window.adoptLycoProfile({...profile,
   startUrl,platform:{type:'other',startUrl},advanced:{...profile.advanced,startUrls:startUrl,saveCookies:true},
   privacy:{...profile.privacy,languageMode:'profile',langFromIp:false,uiLanguage:'profile',refreshFingerprintOnStart:false}}),{profile:profiles[index],startUrl});
  await page.evaluate(source=>window.ops.startProfile(source),configured);
  const deadline=Date.now()+45000;
  while(Date.now()<deadline&&!report.observations.some(r=>r.phase===phase))await new Promise(r=>setTimeout(r,150));
  const row=report.observations.find(r=>r.phase===phase);
  assert.ok(row,phase+': no real profile report');assert.equal(row.proxied,true,phase+': report bypassed Mihomo');
  assert.deepEqual(row.before,{cookie:previous,local:previous},phase+': storage isolation/persistence');
  const owner=index===0?'A':'B';assert.deepEqual(row.after,{cookie:owner,local:owner});
  assert.ok(report.proxyRequests.some(r=>r.path==='/probe'&&r.phase===phase),phase+': navigation bypassed proxy');
  await page.evaluate(id=>window.ops.stopProfile(id),profiles[index].id);
  report.checks.push(phase+'-proxied-storage');
 }
 await page.evaluate(()=>window.ops.lycoLogout());
 assert.equal((await page.evaluate(()=>window.ops.lycoStatus())).logged_in,false);
 report.checks.push('native-logout');
 await page.screenshot({path:path.join(evidence,'workbench.png')});
}catch(error){report.failure=String(error?.stack||error);throw error}
finally{
 await app?.close().catch(()=>{});
 for(const socket of sockets)socket.destroy();origin.close();proxy.close();
 await fs.writeFile(path.join(evidence,'report.json'),JSON.stringify(report,null,2));
 // The runner's app userData remains outside this report directory.
 // Only report.json and workbench.png are uploaded, never identity caches.
}
