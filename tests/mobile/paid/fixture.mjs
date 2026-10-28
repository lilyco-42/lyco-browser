import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {createWorkspaceRoutingFixture} from '../../workspace-routing-fixture.mjs';
import {nodeIdentityInput} from '../../../apps/universal/src/mobile-route-policy.mjs';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Paid mobile fixtures run only in GitHub Actions');
const directory=path.join(process.env.RUNNER_TEMP,'lyco-mobile-paid');await fs.mkdir(directory,{recursive:true});
const routes=await createWorkspaceRoutingFixture({browserOriginHost:'10.0.2.2',indexedDB:true,visibleStatus:true});
const requests=[];let hideA=false,revoked=false;
const owners=new Map([['CI_OWNER_A_TOKEN','ci-owner-a'],['CI_OWNER_B_TOKEN','ci-owner-b']]);
const subscription=()=>{
 const nodes=routes.subscription.proxies.filter(node=>!hideA||node.name!=='CI route A').map(node=>({...node,server:'10.0.2.2'}));
 return {proxies:nodes,'proxy-groups':[{name:'PROXY',type:'select',proxies:nodes.map(node=>node.name)}]};
};
let writing=Promise.resolve();
const write=()=>{
 const content=JSON.stringify({requests,observations:routes.observations,pageRequests:routes.pageRequests,checks:routes.checks,proxyProbes:routes.proxyProbes,hideA,revoked},null,2);
 writing=writing.then(async()=>{const temporary=path.join(directory,'network.json.tmp');await fs.writeFile(temporary,content);await fs.rename(temporary,path.join(directory,'network.json'))});
 return writing;
};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://fixture');let body='';for await(const chunk of req)body+=chunk;
 const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Connection':'close'});res.end(JSON.stringify(value))};
 if(url.pathname==='/control'){
  const action=JSON.parse(body);
  if(action.hideA!==undefined)hideA=Boolean(action.hideA);
  if(action.revoked!==undefined)revoked=Boolean(action.revoked);
  if(action.stop)await routes.stopNode(action.stop);
  if(action.restart)await routes.restartNode(action.restart);
  await write();send(200,{ok:true});return;
 }
 const owner=owners.get(String(req.headers.authorization||'').replace(/^Bearer /,''));
 const logged={path:url.pathname,owner:owner||null,method:req.method,revoked,nativeGuard:/^Dalvik\//.test(req.headers['user-agent']||'')};requests.push(logged);
 if(url.pathname==='/studio/api/login'){
  const data=JSON.parse(body);logged.owner=['ci-owner-a','ci-owner-b'].includes(data.username)?data.username:null;
  if(!logged.owner||data.password!=='CI_fixture_password')send(401,{});
  else send(200,{token:data.username==='ci-owner-a'?'CI_OWNER_A_TOKEN':'CI_OWNER_B_TOKEN'});
 }else if(!owner)send(401,{});
 else if(url.pathname==='/studio/api/me')send(200,{username:owner,points:{balance:1000},entitlements:revoked?[]:[{product:'proxy_1m',purchase_product:'proxy_1y',status:'active',expires_at:'2099-01-01T00:00:00Z',meta:{sub_url:'https://lain42.top/panel/api/sub/CIMobilePaid'}}]});
 else if(url.pathname==='/studio/api/sub/CIMobilePaid/clash')send(200,subscription());
 else send(404,{});
 await write();
});
await new Promise(resolve=>server.listen(18086,'127.0.0.1',resolve));
const descriptors=subscription().proxies.map(node=>{
 const value={name:node.name,outbound:{type:'http',server:node.server,server_port:node.port}};
 return {name:node.name,id:createHash('sha256').update(nodeIdentityInput(value)).digest('hex')};
});
await fs.writeFile(path.join(directory,'fixture.json'),JSON.stringify({origin:routes.originUrl,originPort:Number(new URL(routes.originUrl).port),apiPort:18086,routes:descriptors}));
await write();const timer=setInterval(()=>{void write()},500);timer.unref();
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,async()=>{clearInterval(timer);await write();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await routes.close();process.exit(0)});
