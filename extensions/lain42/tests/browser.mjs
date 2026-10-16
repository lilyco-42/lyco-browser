import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Real extension acceptance only in Actions');
const report={commit:process.env.GITHUB_SHA,checks:[],requests:[],payments:0};
const evidence=path.resolve('extension-evidence');await fs.mkdir(evidence,{recursive:true});
const listen=server=>new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server.address().port)));
const origin=http.createServer((req,res)=>{report.requests.push({path:req.url,proxied:req.headers['x-ci-extension']==='yes'});res.end('CI extension origin');});
const originPort=await listen(origin);
const proxy=http.createServer((req,res)=>{
 let url;try{url=new URL(req.url)}catch{res.writeHead(400);res.end();return;}
 if(url.hostname!=='lyco-extension.invalid'||url.port!==String(originPort)){res.writeHead(502);res.end();return;}
 url.hostname='127.0.0.1';
 const outgoing=http.request(url,{headers:{...req.headers,'x-ci-extension':'yes'}},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res)});
 outgoing.on('error',()=>{res.writeHead(502);res.end()});req.pipe(outgoing);
});
proxy.on('connect',(_req,socket)=>socket.end('HTTP/1.1 502 CI-only fixture\r\n\r\n'));
const proxyPort=await listen(proxy);
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'lyco-extension-'));
const directory=path.resolve('dist/lyco-subscription-extension');
const cleanEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|HOME|DISPLAY|XAUTHORITY|TMPDIR|LANG|LC_ALL)$/i.test(key)));
let context;
try{
 context=await chromium.launchPersistentContext(profile,{headless:false,env:cleanEnv,
  args:[`--disable-extensions-except=${directory}`,`--load-extension=${directory}`],ignoreDefaultArgs:['--disable-extensions']});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const id=new URL(worker.url()).hostname;
 const popup=await context.newPage();await popup.setViewportSize({width:380,height:850});
 await popup.goto(`chrome-extension://${id}/popup.html`);await popup.locator('#connect').waitFor();
 await popup.locator('header img').evaluate(img=>img.decode());
 const read=()=>worker.evaluate(()=>new Promise(r=>chrome.proxy.settings.get({incognito:false},r)));
 const original=await read();
 const code={kind:'lyco-loopback-proxy',version:1,scheme:'http',host:'127.0.0.1',port:proxyPort,issuedAt:Date.now(),expiresAt:Date.now()+600000};
 const beforeTabs=context.pages().length;
 await popup.locator('#connection').fill(JSON.stringify({...code,host:'evil.example'}));
 await popup.locator('#connect').click();await popup.locator('#message').filter({hasText:'仅接受'}).waitFor();
 assert.deepEqual(await read(),original);assert.equal(context.pages().length,beforeTabs);
 await popup.locator('#connection').fill(JSON.stringify(code));await popup.locator('#connect').click();
 await popup.locator('#state').filter({hasText:'浏览器代理已启用'}).waitFor();
 assert.equal((await read()).levelOfControl,'controlled_by_this_extension');
 const browserPage=await context.newPage();
 await browserPage.goto(`http://lyco-extension.invalid:${originPort}/through-proxy`);
 assert.ok(report.requests.some(row=>row.path==='/through-proxy'&&row.proxied));
 assert.equal(await popup.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await popup.screenshot({path:path.join(evidence,'extension-enabled.png'),fullPage:true});
 report.checks.push('real-unpacked-extension-UI','invalid-code-no-settings-or-tabs-change','original-Lyco-icon','actual-Chromium-proxy-traffic');
 // Deliberately stop the only proxy. Chromium must not silently bypass it.
 proxy.closeAllConnections();await new Promise(r=>proxy.close(r));
 await assert.rejects(()=>browserPage.goto(`http://lyco-extension.invalid:${originPort}/offline`,{timeout:10000}),/ERR_PROXY_CONNECTION_FAILED/);
 assert.equal(report.requests.some(row=>row.path==='/offline'),false);
 report.checks.push('dead-core-no-direct-fallback');
 // Fault-inject expired session data, then exercise the actual popup/status
 // path. There is no production-only test endpoint or permission bypass.
 await worker.evaluate(async()=>{const {connection}=await chrome.storage.session.get('connection');connection.expiresAt=Date.now()-1;await chrome.storage.session.set({connection})});
 await popup.reload();await popup.locator('#state').filter({hasText:'代理已暂停'}).waitFor();
 assert.equal((await read()).value.rules.singleProxy.port,9);
 await popup.screenshot({path:path.join(evidence,'extension-expired.png'),fullPage:true});
 await popup.locator('#disconnect').click();await popup.locator('#state').filter({hasText:'尚未启用'}).waitFor();
 assert.notEqual((await read()).levelOfControl,'controlled_by_this_extension');
 assert.equal((await read()).value.mode,original.value.mode);
 await browserPage.goto(`http://127.0.0.1:${originPort}/restored`);
 assert.ok(report.requests.some(row=>row.path==='/restored'&&!row.proxied));
 report.checks.push('expired-session-blocks-until-explicit-disconnect','restores-original-browser-proxy');
 const opened=context.waitForEvent('page');await popup.locator('#shop').click();const shop=await opened;
 await shop.waitForURL('https://lain42.top/shop/#proxy_1m',{waitUntil:'commit',timeout:20000});
 report.checks.push('explicit-own-subscription-link');await shop.close();
}catch(error){report.failure=String(error.stack||error);throw error}
finally{
 if(context)await context.close();
 proxy.closeAllConnections();if(proxy.listening)await new Promise(r=>proxy.close(r));
 origin.closeAllConnections();await new Promise(r=>origin.close(r));
 await fs.writeFile(path.join(evidence,'extension-acceptance.json'),JSON.stringify(report,null,2));
 await fs.rm(profile,{recursive:true,force:true});
}
