import {_electron as electron} from 'playwright';
import http from 'node:http';
import net from 'node:net';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseConnection} from '../extensions/lain42/connection.mjs';
import {createBrowserPrivacyFixture} from './browser-privacy-fixture.mjs';
import {createBrowserProfileFixture} from './browser-profile-fixture.mjs';
import {verifyNativeProfileIsolation} from './native-profile-contract.mjs';
import {verifyNativeAccountPanel} from './native-account-panel.mjs';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Only Actions runs native product acceptance');
const binary=path.resolve(process.argv[2]);
const appRoot=path.resolve(process.argv[3]);
const evidence=path.resolve(process.argv[4]||'lyco-native-evidence');await fs.mkdir(evidence,{recursive:true});
const report={commit:process.env.GITHUB_SHA,binary,fixtureBilling:true,realPayments:0,proxyRequests:[],checks:[]};
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const tunnelPorts=new Set(),tunnelSockets=new Set();
const privacyProbe=createBrowserPrivacyFixture();await privacyProbe.start();
const profileProbe=createBrowserProfileFixture();
const checkpoint=async stage=>{
 report.stage=stage;report.stageAt=new Date().toISOString();report.profileAudit=profileProbe.snapshot();
 await fs.writeFile(path.join(evidence,'native-workspaces.json'),JSON.stringify(report,null,2));
};
const origin=http.createServer((req,res)=>{
 const proxied=tunnelPorts.has(req.socket.remotePort)||req.headers['x-ci-proxy']==='yes';
 report.proxyRequests.push({path:req.url,proxied});
 if(privacyProbe.route(req,res,proxied))return;
 if(profileProbe.route(req,res,proxied))return;
 res.end('LYCO browser fixture reached through proxy');
});
const originPort=await listen(origin);
const geo=http.createServer((_req,res)=>{
 report.geoProbeRequests=(report.geoProbeRequests||0)+1;
 res.writeHead(200,{'Content-Type':'application/json'});
 res.end(JSON.stringify({status:'success',query:'203.0.113.7',countryCode:'US',country:'CI',timezone:'Etc/UTC',lat:0,lon:0}));
});
const geoPort=await listen(geo);
const proxy=http.createServer((req,res)=>{
 const url=new URL(req.url);
 if(!['127.0.0.1','lyco-fixture.invalid'].includes(url.hostname)||url.port!==String(originPort)) {res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({status:'success',query:'203.0.113.7',ip:'203.0.113.7',countryCode:'US',country:'CI',timezone:'Etc/UTC',lat:0,lon:0}));return;}
 url.hostname='127.0.0.1';
 const upstream=http.request(url,{headers:{...req.headers,'x-ci-proxy':'yes'}},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res)});
 upstream.on('error',()=>{res.writeHead(502);res.end()});req.pipe(upstream);
});
// Mihomo's HTTP adapter uses CONNECT even for HTTP targets. Permit ONLY the
// ephemeral CI origin, never a general-purpose tunnel or public listener.
proxy.on('connect',(req,socket,head)=>{
 const targetPort=req.url==='ip-api.com:80'?geoPort:
  [`127.0.0.1:${originPort}`,`lyco-fixture.invalid:${originPort}`].includes(req.url)?originPort:null;
 if(!targetPort) {
  socket.end('HTTP/1.1 502 CI fixture only\r\n\r\n');return;
 }
 const upstream=net.connect({host:'127.0.0.1',port:targetPort});
 tunnelSockets.add(socket);tunnelSockets.add(upstream);
 upstream.once('connect',()=>{
  const port=upstream.localPort;tunnelPorts.add(port);
  upstream.once('close',()=>tunnelPorts.delete(port));
  socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
  if(head.length)upstream.write(head);
  socket.pipe(upstream);upstream.pipe(socket);
 });
 upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());
 socket.once('close',()=>{tunnelSockets.delete(socket);upstream.destroy()});
 upstream.once('close',()=>{tunnelSockets.delete(upstream);socket.destroy()});
});
const proxyPort=await listen(proxy);
let application;
try {
 await checkpoint('launch-workbench');
 const cleanEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES(?:\(X86\))?|COMMONPROGRAMFILES|HOMEDRIVE|HOMEPATH|OS|PROCESSOR_ARCHITECTURE|NUMBER_OF_PROCESSORS)$/i.test(key)));
 application=await electron.launch({executablePath:binary,args:[appRoot],timeout:60000,
  env:{...cleanEnv,OPENBROWSER_API_PORT:String(51000+Math.floor(Math.random()*1000))}});
 const page=await application.firstWindow();page.setDefaultTimeout(30000);await page.waitForLoadState('domcontentloaded');
 // Observe the actual installed/portable core without changing product files,
 // timeout, proxy selection or permissions. Raw output/secrets are discarded.
 await application.evaluate((_electron,{appRoot,observer})=>{
  const require=process.mainModule.require.bind(process.mainModule);
  const {LycoNetwork}=require(appRoot+'/lyco/network.js');
  globalThis.__lycoCoreStartupEvidence=require(observer).installCoreStartupObserver(LycoNetwork);
  globalThis.__lycoTargetEvidence=require(observer.replace('core-startup-observer.cjs','browser-target-observer.cjs'))
   .installBrowserTargetObserver({BrowserEngine:require(appRoot+'/engine.js').BrowserEngine,cdp:require(appRoot+'/cdp.js')});
 },{appRoot,observer:path.join(import.meta.dirname,'core-startup-observer.cjs')});
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
 // The workbench must drive existing real dialogs and data, not demo rows.
 await page.locator('#lyco-group-create').click();
 const groupName=`CI ${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}-${path.basename(evidence)}`;
 await page.locator('#group-name').fill(groupName);
 await page.locator('#group-form button[value="default"]').click();
 const groupChip=page.locator('#profile-group-chips [data-group-filter]').filter({hasText:groupName});
 await groupChip.click();const groupId=await groupChip.getAttribute('data-group-filter');
 await page.locator('#create-profile').click();
 assert.equal(await page.locator('#profile-create-group').inputValue(),groupId);
 await page.locator('#profile-form .dialog-head button[value="cancel"]').click();
 await page.locator('#batch-add').click();
 assert.equal(await page.locator('#batch-add-group').inputValue(),groupId);
 await page.locator('#batch-add-form button[value="cancel"]').last().click();
 report.checks.push('real-native-group-create-and-current-group-dialog-defaults');
 await page.locator('[data-view="lyco"]').click();
 await page.locator('#view-lyco').waitFor({state:'visible'});
 // Use the actual upstream translator in both languages; its fallback must
 // not split our complete localized strings into Chinese/English fragments.
 for (const locale of ['zh-CN','en']) {
  assert.equal(await page.evaluate(locale=>window.OpenBrowserI18n.setLocale(locale),locale),locale);
  assert.equal(await page.locator('#lyco-login button[type="submit"]').textContent(),'登录并验证月卡');
  assert.equal(await page.locator('#lyco-copy-extension').textContent(),'复制浏览器插件连接码');
  assert.equal(await page.locator('[data-view="lyco"] span').textContent(),'LYCO 代理与会员');
  assert.equal(await page.locator('#lyco-password').getAttribute('placeholder'),'网站密码');
 }
 report.checks.push('localized-panel-survives-upstream-language-switch');
 await verifyNativeAccountPanel({page,report,evidence});
 assert.equal(await page.locator('#lyco-create-profile').isDisabled(),true);
 await page.locator('#lyco-username').fill('ci-owner-a');await page.locator('#lyco-password').fill('CI-owned-password');
 await page.locator('#lyco-login button[type="submit"]').click();
 await page.waitForFunction(()=>!document.getElementById('lyco-create-profile').disabled);
 assert.equal(await page.locator('#lyco-account-chip').textContent(),'月卡可用');
 report.checks.push('native-login-valid-entitlement');
 const connections=await page.evaluate(()=>Promise.all([window.ops.lycoConnect(),window.ops.lycoConnect()]));
 assert.equal(connections[0].port,connections[1].port);
 report.checks.push('concurrent-connect-same-core-port');
 await page.locator('#lyco-copy-extension').click();
 await page.waitForFunction(()=>document.getElementById('lyco-feedback').textContent.includes('已复制连接码'));
 const connection=parseConnection(await application.evaluate(({clipboard})=>clipboard.readText()));
 assert.equal(connection.port,connections[0].port);
 assert.equal(connection.scheme,'http');report.checks.push('real-main-process-extension-handoff-no-account-secrets');
 assert.equal(await page.locator('#lyco-network-chip').textContent(),'已连接');
 await page.evaluate(()=>{const adopt=window.adoptLycoProfile;window.adoptLycoProfile=p=>{const value=adopt(p);window.__lycoCreated=value;return value}});
 await page.locator('#lyco-create-profile').click();
 await page.waitForFunction(()=>Boolean(window.__lycoCreated));
 const profile=await page.evaluate(()=>window.__lycoCreated);
 assert.ok(profile.proxyId);
 assert.equal(profile.groupId,groupId);
 assert.equal(await page.locator('.profile-table-compact thead th:visible').count(),5);
 await page.locator('.lyco-list-extras summary').click();await page.locator('#lyco-profile-details').click();
 assert.equal(await page.locator('.profile-table-compact thead th:visible').count(),10);
 await page.locator('.lyco-list-extras summary').click();await page.locator('#lyco-profile-details').click();
 report.checks.push('compact-columns-retain-expanded-details');
 // Inspect real native geometry: upstream's 980px table and sticky actions
 // previously hid the network/status columns despite five displayed headers.
 report.compactLayouts=[];
 for(const width of [1024,1440]) {
  // Size the actual packaged renderer's viewport, not Windows' decorated
  // outerWidth (which differs with native caption/DPI and screen limits).
  await page.setViewportSize({width,height:800});
  await page.waitForFunction(width=>window.innerWidth===width,width);
  const layout=await page.locator('#view-profiles .table-card').evaluate(card=>{
   const rect=element=>{const r=element.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width}};
   const visible=element=>getComputedStyle(element).display!=='none';
   return {viewport:innerWidth,card:rect(card),clientWidth:card.clientWidth,scrollWidth:card.scrollWidth,
    headers:[...card.querySelectorAll('thead th')].filter(visible).map(rect),
    cells:[...card.querySelector('tbody tr[data-profile-id]').children].filter(visible).map(rect)};
  });
  assert.equal(layout.headers.length,5);assert.equal(layout.cells.length,5);
  assert.ok(layout.scrollWidth<=layout.clientWidth+1,'Compact information must fit without horizontal scrolling');
  for(let index=0;index<5;index++) {
   const cell=layout.cells[index],header=layout.headers[index];
   assert.ok(cell.width>20&&cell.left>=layout.card.left-1&&cell.right<=layout.card.right+1,'Every compact cell must fit inside its card');
   assert.ok(Math.abs(header.left-cell.left)<=1&&Math.abs(header.right-cell.right)<=1,'Headers must align with their cells');
   if(index)assert.ok(layout.cells[index-1].right<=cell.left+1,'Compact cells must not overlap');
  }
  report.compactLayouts.push(layout);
 }
 await page.setViewportSize({width:1024,height:800});
 await page.waitForFunction(()=>window.innerWidth===1024);
 report.checks.push('native-compact-columns-fit-at-1024-and-1440-without-overlap');
 await page.locator('#theme-trigger').click();
 await page.locator('#theme-appearance [data-color-mode="dark"]').click();
 await page.waitForFunction(()=>document.documentElement.dataset.colorMode==='dark');
 const groupBackground=await page.locator('.lyco-group-navigation').evaluate(element=>getComputedStyle(element).backgroundColor);
 assert.ok(groupBackground.match(/\d+/g).slice(0,3).every(channel=>Number(channel)<128),'The group rail must use the actual dark theme surface');
 await page.locator('#theme-trigger').click();
 await page.screenshot({path:path.join(evidence,'windows-workspace-dark.png')});
 await page.locator('#theme-trigger').click();
 await page.locator('#theme-appearance [data-color-mode="light"]').click();
 await page.locator('#theme-trigger').click();
 report.checks.push('native-workbench-follows-existing-dark-and-light-theme');
 const beforeBatch=await page.locator('#profile-table tr[data-profile-id]').evaluateAll(rows=>rows.map(row=>row.dataset.profileId));
 await page.locator('#batch-add').click();await page.locator('#batch-add-count').fill('2');
 assert.equal(await page.locator('#batch-add-group').inputValue(),groupId);
 await page.locator('#batch-add-form button[value="default"]').click();
 await page.locator('#batch-add-dialog').waitFor({state:'hidden'});
 await page.waitForFunction(expected=>document.querySelectorAll('#profile-table tr[data-profile-id]').length===expected,beforeBatch.length+2);
 const afterBatch=await page.locator('#profile-table tr[data-profile-id]').evaluateAll(rows=>rows.map(row=>row.dataset.profileId));
 const batchIds=afterBatch.filter(id=>!beforeBatch.includes(id));assert.equal(batchIds.length,2);
 const appData=await application.evaluate(({app})=>app.getPath('userData'));
 report.userDataPath=appData;
 const persisted=JSON.parse(await fs.readFile(path.join(appData,'openbrowser-engine.json'),'utf8'));
 for(const id of batchIds)assert.equal(persisted.profiles.find(row=>row.id===id)?.groupId,groupId);
 report.checks.push('real-batch-create-two-environments-persists-selected-group');
 async function expectSelectionCount(count) {
  const expected=await page.evaluate(count=>window.OpenBrowserI18n.t('profiles.selected',{n:count}),count);
  assert.equal(await page.locator('#profile-selection-count').textContent(),expected);
 }
 for(const locale of ['en','zh-CN','en']) {
  await page.evaluate(locale=>window.OpenBrowserI18n.setLocale(locale),locale);
  await expectSelectionCount(2);
 }
 const batchCheckbox=page.locator(`#profile-table tr[data-profile-id="${batchIds[0]}"] [data-profile-select]`);
 await batchCheckbox.uncheck();await expectSelectionCount(1);
 await batchCheckbox.check();await expectSelectionCount(2);
 await page.locator('#select-all-profiles').check();await expectSelectionCount(3);
 await page.locator('#select-all-profiles').uncheck();await expectSelectionCount(0);
 assert.equal(await page.locator('#profile-selection-bar').isVisible(),false);
 for(const id of batchIds)await page.locator(`#profile-table tr[data-profile-id="${id}"] [data-profile-select]`).check();
 await expectSelectionCount(2);
 report.checks.push('native-bulk-selection-counts-survive-locales-and-selection-changes');
 report.bulkLayouts=[];
 for(const width of [1024,1440]) {
  await page.setViewportSize({width,height:800});
  const layout=await page.locator('#profile-selection-bar .selection-actions').evaluate(toolbar=>{
   const bounds=element=>{const rect=element.getBoundingClientRect();return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom}};
   return {viewport:innerWidth,clientWidth:toolbar.clientWidth,scrollWidth:toolbar.scrollWidth,bounds:bounds(toolbar),
    controls:[...toolbar.children].filter(element=>getComputedStyle(element).display!=='none').map(bounds)};
  });
  assert.ok(layout.controls.length<=4,'Keep at most four primary bulk controls');
  assert.ok(layout.scrollWidth<=layout.clientWidth+1,'Bulk actions must fit without horizontal scrolling');
  for(const control of layout.controls)assert.ok(control.left>=layout.bounds.left-1&&control.right<=layout.bounds.right+1,'Every bulk control must fit in the toolbar');
  report.bulkLayouts.push(layout);
 }
 await page.setViewportSize({width:1024,height:800});
 await page.locator('#lyco-bulk-more summary').click();
 await page.screenshot({path:path.join(evidence,'windows-bulk-actions.png')});
 await page.locator('#batch-edit-preferences').click();
 await page.locator('#batch-preferences-dialog').waitFor({state:'visible'});
 assert.match(await page.locator('#batch-pref-summary').textContent(),/2/);
 await page.locator('#batch-preferences-form .dialog-head button[value="cancel"]').click();
 await page.locator('#lyco-bulk-more summary').press('Enter');
 assert.equal(await page.locator('#lyco-bulk-more').evaluate(element=>element.open),true);
 await page.locator('#lyco-bulk-more summary').press('Escape');
 assert.equal(await page.locator('#lyco-bulk-more').evaluate(element=>element.open),false);
 report.checks.push('native-bulk-toolbar-fits-and-opens-existing-preferences');
 // ProxyStore appends an encoded display label as a URI fragment. Validate
 // the actual endpoint; that label is not part of the socket destination.
 const endpoint=new URL(profile.proxy);
 assert.equal(endpoint.protocol,'http:');assert.equal(endpoint.hostname,'127.0.0.1');
 assert.ok(Number(endpoint.port)>1023);assert.equal(endpoint.username,'');assert.equal(endpoint.password,'');
 assert.equal(endpoint.search,'');assert.equal(endpoint.pathname,'/');
 assert.equal(await page.locator(`#profile-table tr[data-profile-id="${profile.id}"]`).count(),1);
 const state=await page.evaluate(()=>window.ops.lycoStatus());assert.equal(state.connected,true);
 await new Promise((resolve,reject)=>{
  http.get({host:'127.0.0.1',port:state.port,path:`http://127.0.0.1:${originPort}/mihomo-probe`,headers:{Host:`127.0.0.1:${originPort}`}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>{try{assert.match(text,/reached through proxy/);resolve()}catch(e){reject(e)}})}).on('error',reject);
 });
 assert.ok(report.proxyRequests.some(row=>row.path==='/mihomo-probe'&&row.proxied));
 report.checks.push('packaged-native-login-create-profile','actual-bundled-mihomo-http-routing');
 await page.screenshot({path:path.join(evidence,'windows-workspace.png')});
 // Exercise the actual existing engine with the bound profile and bundled browser.
 await checkpoint('managed-browser-probe');
 const target=`http://lyco-fixture.invalid:${originPort}/browser-probe`;
 await page.evaluate(({profile,target})=>window.adoptLycoProfile({...profile,startUrl:target,platform:{type:'other',startUrl:target},advanced:{startUrls:target},privacy:{...profile.privacy,langFromIp:false,timezoneFromIp:false,geoFromIp:false}}),{profile,target});
 await page.locator(`#profile-table tr[data-profile-id="${profile.id}"] .col-name`).dblclick();
 const deadline=Date.now()+30000;
 while(Date.now()<deadline&&!report.proxyRequests.some(r=>r.path==='/browser-probe'))await new Promise(r=>setTimeout(r,250));
 assert.ok(report.proxyRequests.some(r=>r.path==='/browser-probe'&&r.proxied),'Real bundled Chromium traffic must pass through the managed proxy');
 assert.equal(report.proxyRequests.some(r=>r.path==='/browser-probe'&&!r.proxied),false);
 report.checks.push('real-bundled-chromium-via-managed-proxy');
 report.checks.push('double-click-environment-starts-real-managed-browser');
 await page.evaluate(()=>window.ops.stopProfile(window.__lycoCreated.id));
 // Negative control: the CI runner can reach 127.0.0.1 without a proxy.
 // This passes only if packaged Chromium uses Mihomo, not a local bypass.
 await new Promise((resolve,reject)=>{
  http.get({host:'127.0.0.1',port:originPort,path:'/direct-loopback-canary'},response=>{
   let body='';response.on('data',chunk=>body+=chunk);
   response.on('end',()=>{try{assert.match(body,/reached through proxy/);resolve()}catch(error){reject(error)}});
  }).on('error',reject);
 });
 assert.ok(report.proxyRequests.some(row=>row.path==='/direct-loopback-canary'&&!row.proxied));
 report.loopbackDirectControl=true;
 const loopbackTarget='http://127.0.0.1:'+originPort+'/loopback-probe';
 await checkpoint('managed-loopback-probe');
 await page.evaluate(({profile,target})=>window.adoptLycoProfile({
  ...profile,startUrl:target,platform:{type:'other',startUrl:target},
  advanced:{startUrls:target},
  privacy:{...profile.privacy,langFromIp:false,timezoneFromIp:false,geoFromIp:false},
 }),{profile,target:loopbackTarget});
 await page.locator('#profile-table tr[data-profile-id="'+profile.id+'"] .col-name').dblclick();
 const loopbackDeadline=Date.now()+30000;
 while(Date.now()<loopbackDeadline&&!report.proxyRequests.some(row=>row.path==='/loopback-probe'))
  await new Promise(resolve=>setTimeout(resolve,250));
 const loopbackRows=report.proxyRequests.filter(row=>row.path==='/loopback-probe');
 assert.ok(loopbackRows.length>0,'Expected loopback fixture request from packaged Chromium');
 assert.ok(loopbackRows.every(row=>row.proxied),
   'Managed Chromium MUST NOT bypass its proxy for 127.0.0.1 even when direct access works');
 report.checks.push('real-bundled-chromium-managed-loopback-cannot-bypass-mihomo');
 await page.evaluate(()=>window.ops.stopProfile(window.__lycoCreated.id));
 // Actual packaged Chromium/WebRTC versus CI-owned UDP STUN endpoint. The
 // fixture confirms localhost UDP is reachable. Any packet is a direct leak.
 const rtcTarget='http://127.0.0.1:'+originPort+'/webrtc-probe';
 await checkpoint('webrtc-probe');
 await page.evaluate(({profile,target})=>window.adoptLycoProfile({
  ...profile,startUrl:target,platform:{type:'other',startUrl:target},
  advanced:{startUrls:target},
  privacy:{...profile.privacy,langFromIp:false,timezoneFromIp:false,geoFromIp:false,webrtc:'proxy'},
 }),{profile,target:rtcTarget});
 await page.locator('#profile-table tr[data-profile-id="'+profile.id+'"] .col-name').dblclick();
 const rtcDeadline=Date.now()+22000;
 while(Date.now()<rtcDeadline&&!privacyProbe.snapshot().rtc)
  await new Promise(resolve=>setTimeout(resolve,150));
 const rtcResult=privacyProbe.snapshot();
 assert.ok(rtcResult.rtc?.completed,'Actual Chromium failed to execute the WebRTC probe');
 assert.equal(rtcResult.rtc.blocked,false,'WebRTC probe did not exercise a peer connection');
 assert.equal(rtcResult.pageProxied,true,'WebRTC probe page bypassed Mihomo');
 assert.equal(rtcResult.reportProxied,true,'WebRTC probe result bypassed Mihomo');
 assert.equal(rtcResult.rtc.ipCandidate,false,'WebRTC returned a literal IP candidate');
 assert.equal(rtcResult.udpPackets,0,'WebRTC leaked direct UDP packets to the CI STUN endpoint');
 report.webrtcAudit={completed:true,blocked:rtcResult.rtc.blocked,
  candidateCount:rtcResult.rtc.candidateCount,directUdpPackets:rtcResult.udpPackets};
 report.checks.push('native-webrtc-ice-udp-zero-direct-packets');
 await checkpoint('webrtc-stop');
 await page.evaluate(()=>window.ops.stopProfile(window.__lycoCreated.id));
 await verifyNativeProfileIsolation({page,profile,originPort,fixture:profileProbe,report,checkpoint,appRoot});
 await page.locator(`#profile-table tr[data-profile-id="${profile.id}"] .col-name`).click({button:'right'});
 await page.locator('#lyco-profile-menu [data-lyco-action="edit"]').click();
 await page.locator('#view-profile-editor').waitFor({state:'visible'});
 assert.equal(await page.locator('#editor-id').inputValue(),profile.id);
 await page.locator('[data-view="profiles"]').click();
 report.checks.push('context-menu-opens-existing-environment-editor');
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
 await page.waitForFunction(()=>document.getElementById('lyco-account-chip').textContent==='待购买或续费'
  && document.getElementById('lyco-network-chip').textContent==='未连接'
  && document.getElementById('view-lyco').getAttribute('aria-busy')==='false');
 report.checks.push('native-account-state-reflects-login-connection-and-expiry');
 report.checks.push('official-purchase-link-no-payment','cross-account-start-rejected','expired-entitlement-disconnects');
 await page.screenshot({path:path.join(evidence,'windows-expired-membership.png')});
} catch(error) {
 report.failure=String(error.stack||error);
 if(application) {
  try {const p=await application.firstWindow();report.feedback=await p.locator('#lyco-feedback').textContent();report.state=await p.evaluate(()=>window.ops.lycoStatus());await p.screenshot({path:path.join(evidence,'windows-failure.png')});}catch{}
  try {
   const p=await application.firstWindow();
   report.browserFailures=await p.evaluate(async()=> (await window.ops.profileStatus()).map(row=>({
    running:row.running,starting:row.starting,verificationBlocked:row.verificationBlocked,
    cdpError:row.cdpError,startStage:row.startStage,startMessage:row.startMessage,
   })));
  }catch{}
 }
 throw error;
} finally {
 report.profileAudit=profileProbe.snapshot();
 if(application)try{report.coreStartup=await application.evaluate(()=>globalThis.__lycoCoreStartupEvidence||[])}catch{}
 if(application)try{report.targetTrace=await application.evaluate(()=>globalThis.__lycoTargetEvidence||[])}catch{}
 if(application){try{const p=await application.firstWindow();await p.evaluate(()=>window.ops.lycoLogout())}catch{}await application.close();}
 for(const socket of tunnelSockets)socket.destroy();
 await privacyProbe.close();
 origin.closeAllConnections();geo.closeAllConnections();proxy.closeAllConnections();await new Promise(r=>origin.close(r));await new Promise(r=>geo.close(r));await new Promise(r=>proxy.close(r));
 await fs.writeFile(path.join(evidence,'native-workspaces.json'),JSON.stringify(report,null,2));
}
