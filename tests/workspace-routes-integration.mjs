import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {createWorkspaceRoutingFixture} from './workspace-routing-fixture.mjs';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Real Mihomo integration runs in GitHub Actions only');
const require=createRequire(import.meta.url),{LycoNetwork}=require('../src/network'),{LycoProfiles}=require('../src/profiles');
async function verifyRoutes(chainedA){
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lyco-real-selected-routes-'));
const evidence=path.join(process.env.RUNNER_TEMP,'lyco-workspace-route-evidence');await fs.mkdir(evidence,{recursive:true});
const fixture=await createWorkspaceRoutingFixture({chainedA}),report={source:process.env.GITHUB_SHA,chainedA,checks:[],routeChecks:[]};
let revoked=false;const starts=[],stops=[],proxies=new Map();
const network=new LycoNetwork({dataDir:directory,bundledCore:process.env.LYCO_MIHOMO_PATH,fetchFn:async url=>{
 if(url.endsWith('/login'))return new Response(JSON.stringify({token:'CI_PRIVATE_ACCOUNT_TOKEN'}));
 if(url.endsWith('/me'))return new Response(JSON.stringify({username:'ci-route-owner',entitlements:revoked?[]:[{product:'proxy_1m',status:'active',expires_at:'2099-01-01T00:00:00Z',meta:{sub_url:'https://lain42.top/panel/api/sub/CIroutefixture'}}]}));
 if(url.endsWith('/sub/CIroutefixture/clash'))return new Response(JSON.stringify(fixture.subscription));
 throw Error('Unexpected Billing fixture endpoint');
}});
const engine={profiles:new Map(),start:async profile=>{starts.push(profile);return profile},stop:async id=>{stops.push(id)},syncProfiles:async profiles=>{engine.profiles=new Map(profiles.map(row=>[row.id,row]))}};
const proxyStore={create:async source=>{const record={...source,id:'proxy-'+proxies.size};proxies.set(record.id,record);return record},update:async(id,source)=>{const record={...source,id};proxies.set(id,record);return record}};
const service=new LycoProfiles({network,engine,proxyStore,dataDir:directory});
function request(port,key,authorization){return new Promise((resolve,reject)=>{
 const url=fixture.originUrl+'/check?key='+key;
 const req=http.get(port?{host:'127.0.0.1',port,path:url,headers:{host:new URL(fixture.originUrl).host,...(authorization?{'Proxy-Authorization':authorization}:{})},agent:false}:url,res=>{let body='';res.on('data',part=>body+=part);res.on('end',()=>resolve({status:res.statusCode,body}))});
 req.on('error',reject);req.setTimeout(5000,()=>req.destroy(Error('Route request timed out')));
})}
try{
 await service.login({username:'ci-route-owner',password:'CI-owned-password'});
 const catalog=await service.routeCatalog();
 assert.equal(catalog.nodes.length,chainedA?3:2);assert.doesNotMatch(JSON.stringify(catalog),/CI_PRIVATE|password|127\.0\.0\.1|sub_url/);
 if(chainedA){
  const node=fixture.subscription.proxies.find(row=>row.name==='CI route A'),before=fixture.checks.length;
  const denied=await request(node.port,'entry-required-control','Basic '+Buffer.from(node.username+':'+node.password).toString('base64'));
  assert.equal(denied.status,403);assert.equal(fixture.checks.length,before);
  report.checks.push('egress-requires-the-real-entry-tcp-connection-even-with-correct-credentials');
 }
 const a=await service.create({routeId:catalog.nodes.find(row=>row.label==='CI route A').id}),b=await service.create({routeId:catalog.nodes.find(row=>row.label==='CI route B').id});
 assert.notEqual(a.profile.proxy,b.profile.proxy);
 const saved=JSON.parse(await fs.readFile(service.file,'utf8'));assert.equal(saved.version,2);
 const ports=[a,b].map(row=>Number(new URL(row.profile.proxy).port));
 for(const [index,route] of ['A','B'].entries()){
  const result=await request(ports[index],'healthy-'+route);assert.equal(result.status,200);assert.equal(JSON.parse(result.body).route,route);
 }
 report.checks.push('real-mihomo-two-selected-authenticated-upstreams');
 await engine.stop(a.profile.id);assert.equal(service.routes.entries.has(b.profile.id),true);
 const restarted=await engine.start(a.profile),reopenedPort=Number(new URL(restarted.proxy).port);
 assert.equal(JSON.parse((await request(reopenedPort,'reopened-A')).body).route,'A');
 report.checks.push('stopped-workspace-reopens-on-the-persisted-node');
 if(chainedA){
  assert.ok(fixture.entryProbes.some(row=>row.authorized&&row.targetIsA&&row.connected));
  assert.ok(fixture.proxyProbes.some(row=>row.route==='A'&&row.authorized&&row.viaEntry===true));
  await fixture.stopNode('ENTRY');const before=fixture.checks.length;
  const stopped=await request(reopenedPort,'stopped-entry').catch(error=>({error:error.code||error.message}));
  assert.notEqual(stopped.status,200);assert.equal(fixture.checks.length,before,'Entry loss must not dial the egress directly or use B');
  assert.equal(JSON.parse((await request(ports[1],'B-survives-entry-loss')).body).route,'B');
  assert.equal(JSON.parse((await request(null,'entry-loss-direct-control')).body).route,'direct');
  report.checks.push('entry-hop-loss-no-direct-egress-or-alternative-route-while-B-and-origin-remain-healthy');
  await fixture.restartNode('ENTRY');
  assert.equal(JSON.parse((await request(reopenedPort,'entry-recovered-A')).body).route,'A');
  report.checks.push('same-selected-chain-recovers-after-entry-restarts');
 }
 await fixture.stopNode('A');const before=fixture.checks.length;
 const stopped=await request(reopenedPort,'stopped-A').catch(error=>({error:error.code||error.message}));
 assert.notEqual(stopped.status,200);assert.equal(fixture.checks.length,before,'Stopped A must not reach the origin directly or through B');
 assert.equal(JSON.parse((await request(ports[1],'B-survives-A-loss')).body).route,'B');
 assert.equal(JSON.parse((await request(null,'direct-control')).body).route,'direct');
 report.checks.push('stopped-selected-upstream-no-fallback-or-direct-while-B-remains-usable');
 revoked=true;await network.validateConnection();
 assert.equal(network.status().connected,false);assert.equal(service.routes.entries.size,0);assert.ok(stops.includes(a.profile.id)&&stops.includes(b.profile.id));
 report.checks.push('revocation-stops-all-workspace-cores-and-owned-environments');
 assert.equal((await fs.readdir(path.join(directory,'lyco-workspace-routes'))).length,0);
 report.checks.push('private-route-configs-removed-after-revocation');
}catch(error){report.failure=error.stack;throw error}
finally{
 report.routeChecks=fixture.checks;
 report.proxyProbes=fixture.proxyProbes;
 report.entryProbes=fixture.entryProbes;
 await service.disconnect({logout:true});await fixture.close();await fs.rm(directory,{recursive:true,force:true});
 await fs.writeFile(path.join(evidence,chainedA?'real-mihomo-chain-routes.json':'real-mihomo-routes.json'),JSON.stringify(report,null,2));
}
}
await verifyRoutes(false);
await verifyRoutes(true);
