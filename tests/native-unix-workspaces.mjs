// Real packaged macOS/Linux workbench + kernel + Mihomo. Billing is a CI-only
// controlled fixture; browser storage and network traffic are observed, not mocked.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {protectConnectHandler} from './connect-handler.mjs';
import {createBrowserPrivacyFixture} from './browser-privacy-fixture.mjs';
import {createProxyFailureProbe} from './proxy-failure-probe.mjs';
import {_electron as electron,chromium} from 'playwright';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Actions only');
const [binary,appRoot]=process.argv.slice(2).map(p=>path.resolve(p));
const evidence=path.resolve(process.env.LYCO_UNIX_EVIDENCE||'lyco-unix-evidence');
await fs.mkdir(evidence,{recursive:true});
const report={platform:process.platform,source:process.env.GITHUB_SHA,checks:[],observations:[],proxyRequests:[]};
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const privacyProbe=createBrowserPrivacyFixture();await privacyProbe.start();
const failureProbe=await createProxyFailureProbe();
const tunnelPorts=new Set();
const navigations=[];
const origin=http.createServer(async(req,res)=>{
 const proxied=req.headers['x-lyco-ci-route']==='proxy'||tunnelPorts.has(req.socket.remotePort);
 if(privacyProbe.route(req,res,proxied))return;
 const url=new URL(req.url,'http://fixture');
 if(url.pathname==='/network-control'){res.setHeader('x-lyco-fixture-proxy',proxied?'yes':'no');res.end('LYCO core control');return;}
 if(url.pathname==='/report'){
  let body='';for await(const chunk of req)body+=chunk;
  report.observations.push({...JSON.parse(body),proxied});
  res.end('ok');return;
 }
 if(url.pathname!=='/probe'){res.writeHead(404).end();return;}
 const phase=url.searchParams.get('phase'),owner=phase.startsWith('a')?'A':'B';
 navigations.push({phase,proxied});
 res.setHeader('Content-Type','text/html');res.setHeader('Cache-Control','no-store');
 res.end(`<!doctype html><script>(async()=>{const phase=${JSON.stringify(phase)},owner=${JSON.stringify(owner)};
 const readCookie=()=>document.cookie.split('; ').find(x=>x.startsWith('owner='))?.slice(6)||null;
 const before={cookie:readCookie(),local:localStorage.getItem('owner')};
 document.cookie='owner='+owner+'; Path=/; Max-Age=600; SameSite=Lax';localStorage.setItem('owner',owner);
 await fetch('/report',{method:'POST',body:JSON.stringify({phase,before,after:{cookie:readCookie(),local:localStorage.getItem('owner')}})});
 })();</script>`);
});
const originPort=await listen(origin);
const sockets=new Set();
const proxyUpstreams=new Set();
let proxyUnavailable=false;
const proxy=http.createServer((req,res)=>{
 if(proxyUnavailable){res.writeHead(503).end();return;}
 const url=new URL(req.url);
 // The packaged-startup test uses a controlled, test-owned HTTP proxy. The
 // upstream kernel's first exit lookup is ip-api.com over plain HTTP; answer
 // that single probe with fixture data so Actions does not depend on public
 // geolocation providers/rate limits. This is explicitly NOT real egress proof.
 if(url.hostname==='ip-api.com' && url.pathname==='/json/'){
  report.proxyRequests.push({method:req.method,host:url.hostname,path:url.pathname,phase:'egress-probe-fixture'});
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end(JSON.stringify({status:'success',query:'198.51.100.42',country:'CI Fixture',countryCode:'US',regionName:'CI',city:'CI',zip:'',timezone:'Etc/UTC',lat:0,lon:0,isp:'CI Fixture',org:'CI Fixture',as:'AS0 CI Fixture',asname:'CI Fixture',mobile:false,proxy:true,hosting:false}));
  return;
 }
 if(url.hostname!=='127.0.0.1'||![originPort,...failureProbe.ports].includes(Number(url.port))){res.writeHead(502).end();return;}
 report.proxyRequests.push({method:req.method,path:url.pathname,phase:url.searchParams.get('phase')});
 const upstream=http.request({host:'127.0.0.1',port:Number(url.port),path:url.pathname+url.search,method:req.method,
  headers:{...req.headers,'x-lyco-ci-route':'proxy'}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});
 upstream.on('socket',socket=>socket.once('connect',()=>failureProbe.markProxyPort(socket.localPort)));
 upstream.on('error',()=>res.destroy());req.pipe(upstream);
});
const geo=http.createServer((_req,res)=>{
 report.geoRequests=(report.geoRequests||0)+1;
 res.writeHead(200,{'Content-Type':'application/json','Connection':'close'});
 res.end(JSON.stringify({status:'success',query:'203.0.113.7',ip:'203.0.113.7',countryCode:'US',country:'CI',timezone:'Etc/UTC',lat:0,lon:0}));
});
const geoPort=await listen(geo);
// The real Mihomo HTTP adapter uses CONNECT for plain HTTP as well. Restrict
// tunnels to the CI origin and the controlled proxy exit-check response.
proxy.on('connect',protectConnectHandler((req,socket,head)=>{
 if(proxyUnavailable){socket.end('HTTP/1.1 502 CI upstream stopped\r\n\r\n');return;}
 (report.connectTargets||=[]).push(req.url);
 const port=req.url==='ip-api.com:80'?geoPort:[originPort,...failureProbe.ports].find(port=>req.url===`127.0.0.1:${port}`);
 if(!port){socket.end('HTTP/1.1 502 CI fixture only\r\n\r\n');return;}
 const upstream=net.connect({host:'127.0.0.1',port});sockets.add(upstream);proxyUpstreams.add(upstream);
 upstream.once('connect',()=>{
  const localPort=upstream.localPort;tunnelPorts.add(localPort);
  failureProbe.markProxyPort(localPort);
  upstream.once('close',()=>tunnelPorts.delete(localPort));
  socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
  if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);
 });
 socket.on('error',()=>upstream.destroy());upstream.on('error',()=>socket.destroy());
 socket.once('close',()=>upstream.destroy());upstream.once('close',()=>{sockets.delete(upstream);proxyUpstreams.delete(upstream);socket.destroy()});
},error=>{(report.tunnelErrors||=[]).push(error)}));
for(const server of [origin,proxy])server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s))});
const proxyPort=await listen(proxy);
report.fixturePorts={origin:originPort,proxy:proxyPort,geo:geoPort};
let app,kernelConnection;
try{
 // Keep repository/Actions credentials out of the packaged application.
 const cleanEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|HOME|USER|LOGNAME|TMPDIR|TEMP|TMP|DISPLAY|XAUTHORITY|DBUS_SESSION_BUS_ADDRESS|XDG_RUNTIME_DIR|XDG_CONFIG_HOME|XDG_DATA_HOME|LANG|LC_ALL)$/.test(key)));
 app=await electron.launch({executablePath:binary,args:[appRoot],env:{...cleanEnv,OPENBROWSER_API_PORT:String(52000+Math.floor(Math.random()*1000))},timeout:60000});
 const page=await app.firstWindow();page.setDefaultTimeout(30000);await page.waitForLoadState('domcontentloaded');
 await app.evaluate((_electron,{appRoot,observer})=>{
  const require=process.mainModule.require.bind(process.mainModule);
  globalThis.__lycoUnixCoreEvidence=require(observer).installCoreStartupObserver(require(appRoot+'/lyco/network.js').LycoNetwork);
 },{appRoot,observer:path.join(import.meta.dirname,'core-startup-observer.cjs')});
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
 const state=await page.evaluate(()=>window.ops.lycoStatus());
 assert.ok(state.connected&&Number.isInteger(state.port));
 const control=await new Promise((resolve,reject)=>{
  const request=http.get({host:'127.0.0.1',port:state.port,path:`http://127.0.0.1:${originPort}/network-control`,headers:{Host:`127.0.0.1:${originPort}`} },response=>{let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({body,proxied:response.headers['x-lyco-fixture-proxy']}))});
  request.on('error',reject);request.setTimeout(5000,()=>request.destroy(Error('Real core control timed out')));
 });
 assert.deepEqual(control,{body:'LYCO core control',proxied:'yes'});
 report.checks.push('real-mihomo-core-http-positive-control');
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
  assert.ok(navigations.some(r=>r.proxied&&r.phase===phase),phase+': navigation bypassed proxy');
  await page.evaluate(id=>window.ops.stopProfile(id),profiles[index].id);
  report.checks.push(phase+'-proxied-storage');
 }
 const rtcTarget=`http://127.0.0.1:${originPort}/webrtc-probe`;
 const rtcProfile=await page.evaluate(({profile,target})=>window.adoptLycoProfile({...profile,
  startUrl:target,platform:{type:'other',startUrl:target},advanced:{...profile.advanced,startUrls:target},
  privacy:{...profile.privacy,langFromIp:false,timezoneFromIp:false,geoFromIp:false,webrtc:'proxy'}}),{profile:profiles[0],target:rtcTarget});
 await page.evaluate(source=>window.ops.startProfile(source),rtcProfile);
 const rtcDeadline=Date.now()+22000;
 while(Date.now()<rtcDeadline&&!privacyProbe.snapshot().rtc)await new Promise(resolve=>setTimeout(resolve,150));
 const rtc=privacyProbe.snapshot();report.webrtcAudit=rtc;
 assert.ok(rtc.rtc?.completed,'Packaged kernel did not complete WebRTC observation');
 assert.equal(rtc.rtc.blocked,false,'WebRTC must exercise an actual peer connection');
 assert.equal(rtc.pageProxied,true);assert.equal(rtc.reportProxied,true);
 assert.equal(rtc.rtc.ipCandidate,false,'WebRTC exposed a literal IP candidate');
 assert.equal(rtc.udpPackets,0,'WebRTC sent direct UDP to the proven reachable STUN fixture');
 const sessions=await page.evaluate(()=>window.ops.syncSessions());
 const session=sessions.find(row=>row.id===profiles[0].id);
 assert.ok(session?.port,'Real managed environment has no debugging session');
 kernelConnection=await chromium.connectOverCDP(`http://127.0.0.1:${session.port}`);
 const kernelPage=kernelConnection.contexts().flatMap(context=>context.pages()).find(tab=>tab.url()===rtcTarget);
 assert.ok(kernelPage,'Real managed RTC page is missing');
 report.failedProxyAudit=await failureProbe.audit(kernelPage,async()=>{
  proxyUnavailable=true;
  for(const socket of proxyUpstreams)socket.destroy();
 });
 report.checks.push('native-failed-upstream-no-direct-http-websocket-or-tls-connection');
 await page.evaluate(id=>window.ops.stopProfile(id),profiles[0].id);
 report.checks.push('native-webrtc-peer-connection-no-literal-ip-or-direct-stun-packets');
 const directTarget=`http://127.0.0.1:${originPort}/network-control`;
 const directProfile=await page.evaluate(({profile,id,target})=>window.adoptLycoProfile({...profile,id,name:'CI direct network control',networkMode:'direct',proxy:null,proxyId:null,proxyMeta:{},
  startUrl:target,platform:{type:'other',startUrl:target},advanced:{startUrls:target},
  privacy:{...profile.privacy,languageMode:'profile',langFromIp:false,timezoneFromIp:false,geoFromIp:false}}),{profile:profiles[0],id:randomUUID(),target:directTarget});
 await page.evaluate(profile=>window.ops.startProfile(profile),directProfile);
 const directSession=(await page.evaluate(()=>window.ops.syncSessions())).find(row=>row.id===directProfile.id);
 assert.ok(directSession?.port);
 kernelConnection=await chromium.connectOverCDP(`http://127.0.0.1:${directSession.port}`);
 const directPage=kernelConnection.contexts().flatMap(context=>context.pages()).find(tab=>tab.url()===directTarget);
 assert.ok(directPage,'Unmanaged native control page is missing');
 report.unmanagedProxyControl=await failureProbe.auditUnmanaged(directPage);
 await page.evaluate(id=>window.ops.stopProfile(id),directProfile.id);
 report.checks.push('unmanaged-native-http-websocket-tls-direct-positive-controls');
 await page.evaluate(()=>window.ops.lycoLogout());
 assert.equal((await page.evaluate(()=>window.ops.lycoStatus())).logged_in,false);
 report.checks.push('native-logout');
 await page.screenshot({path:path.join(evidence,'workbench.png')});
}catch(error){report.failure=String(error?.stack||error);throw error}
finally{
 report.failedProxyConnections=failureProbe.snapshot();
 if(app)try{report.coreStartup=await app.evaluate(()=>globalThis.__lycoUnixCoreEvidence||[])}catch{}
 await app?.close().catch(()=>{});
 await kernelConnection?.close().catch(()=>{});
 await privacyProbe.close();
 await failureProbe.close();
 for(const socket of sockets)socket.destroy();origin.close();proxy.close();geo.close();
 await fs.writeFile(path.join(evidence,'report.json'),JSON.stringify(report,null,2));
 // The runner's app userData remains outside this report directory.
 // Only report.json and workbench.png are uploaded, never identity caches.
}
