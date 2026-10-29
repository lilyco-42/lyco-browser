import assert from 'node:assert/strict';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';
import {createWorkspaceRoutingFixture} from './workspace-routing-fixture.mjs';
export async function verifyNativeWorkspaceRoutes({app,page,report,evidence}){
 if(process.env.GITHUB_ACTIONS!=='true')throw Error('Packaged workspace route acceptance requires Actions');
 const fixture=await createWorkspaceRoutingFixture({chainedA:true}),created=[],connections=[];
 const result=report.workspaceRoutes={observations:[],pageRequests:[],checks:[]};
 const choose=async(id,label)=>{
  await page.locator('#'+id+'-button').click();
  await page.locator('#'+id+'-menu').getByRole('option',{name:label,exact:true}).click();
 };
 const waitPhase=async(phase,expected,previous)=>{
  const deadline=Date.now()+45000;
  while(Date.now()<deadline&&!fixture.observations.some(row=>row.phase===phase))await new Promise(resolve=>setTimeout(resolve,150));
  const row=fixture.observations.find(row=>row.phase===phase);assert.ok(row,phase+': no real browser observation');
  assert.equal(row.route,expected,phase+': browser used another route or went direct');
  assert.deepEqual(row.before,{cookie:previous,local:previous});assert.deepEqual(row.after,{cookie:expected,local:expected});
 };
 const configure=async(profile,phase,owner)=>{
  const target=fixture.originUrl+'/page?owner='+owner+'&phase='+phase;
  return page.evaluate(({profile,target})=>window.adoptLycoProfile({...profile,startUrl:target,platform:{type:'other',startUrl:target},
   advanced:{...profile.advanced,startUrls:target,saveCookies:true},privacy:{...profile.privacy,languageMode:'profile',langFromIp:false,timezoneFromIp:false,geoFromIp:false,refreshFingerprintOnStart:false}}),{profile,target});
 };
 try{
  await app.evaluate((_electron,subscription)=>{globalThis.__lycoWorkspaceRouteSubscription=subscription},fixture.subscription);
  await page.evaluate(()=>{window.__lycoRoutePreviousCreated={present:Object.hasOwn(window,'__lycoCreated'),value:window.__lycoCreated};window.__lycoRouteOriginalAdopt=window.adoptLycoProfile;window.adoptLycoProfile=profile=>{const value=window.__lycoRouteOriginalAdopt(profile);window.__lycoRouteCreated=value;return value}});
  await page.locator('[data-view="lyco"]').click();await page.locator('#lyco-load-routes').click();
  await page.locator('#lyco-create-route option').filter({hasText:'CI route A'}).waitFor({state:'attached'});
  const options=await page.locator('#lyco-create-route option').evaluateAll(nodes=>nodes.map(node=>({id:node.value,label:node.textContent})));
  assert.doesNotMatch(JSON.stringify(options),/CI_PRIVATE_ROUTE|password|127\.0\.0\.1/);
  for(const owner of ['A','B']){
   await page.locator('[data-view="lyco"]').click();
   await choose('lyco-create-route','CI route '+owner);
   const selected=await page.locator('#lyco-create-route').inputValue();
   await page.locator('#lyco-load-routes').click();
   await page.waitForFunction(()=>document.getElementById('view-lyco').getAttribute('aria-busy')==='false'&&document.getElementById('lyco-feedback').textContent.includes('官网线路已加载'));
   assert.equal(await page.locator('#lyco-create-route').inputValue(),selected,'Refreshing a catalog must not silently change the chosen route to default');
   await page.evaluate(()=>{delete window.__lycoRouteCreated});await page.locator('#lyco-create-profile').click();
   await page.waitForFunction(()=>Boolean(window.__lycoRouteCreated));created.push(await page.evaluate(()=>window.__lycoRouteCreated));
  }
  assert.notEqual(created[0].proxy,created[1].proxy);
  for(const [index,owner] of ['A','B'].entries()){
   const badge=page.locator(`#profile-table tr[data-profile-id="${created[index].id}"] .lyco-bound-route`);
   await badge.waitFor({state:'visible'});
   assert.ok((await badge.textContent()).includes('CI route '+owner));
   assert.doesNotMatch(await badge.textContent(),/CI_PRIVATE_ROUTE|password|127\.0\.0\.1/);
   const fit=await badge.evaluate(button=>{
    const b=button.getBoundingClientRect(),cell=button.closest('td').getBoundingClientRect();
    return {left:b.left,right:b.right,width:b.width,cellLeft:cell.left,cellRight:cell.right};
   });
   assert.ok(fit.width>0&&fit.left>=fit.cellLeft-1&&fit.right<=fit.cellRight+1,'The actual route action must fit inside its environment name cell');
  }
  await page.screenshot({path:path.join(evidence,'workspace-route-list.png')});
  await page.locator(`#profile-table tr[data-profile-id="${created[0].id}"] .lyco-bound-route`).click();
  await page.locator(`[data-profile-route="${created[0].id}"]`).waitFor();
  const geometry=await page.locator('#lyco-route-card').evaluate(card=>({client:card.clientWidth,scroll:card.scrollWidth}));
  assert.ok(geometry.scroll<=geometry.client+1,'Selected route controls must fit the actual workbench');
  await page.screenshot({path:path.join(evidence,'workspace-selected-routes.png')});
  result.checks.push('actual-workbench-selected-node-controls-and-safe-catalog');
  result.checks.push('owned-route-bindings-visible-in-environment-list-with-direct-management-entry');
  for(const [index,owner] of ['A','B'].entries()){
   const configured=await configure(created[index],'selected-'+owner+'-first',owner);
   await page.evaluate(profile=>window.ops.startProfile(profile),configured);await waitPhase('selected-'+owner+'-first',owner,null);
  }
  let sessions=await page.evaluate(()=>window.ops.syncSessions());
  assert.ok(created.every(profile=>sessions.some(row=>row.id===profile.id)),'A and B must run concurrently on their selected routes');
  await page.evaluate(id=>window.ops.stopProfile(id),created[0].id);
  const reopened=await configure(created[0],'selected-A-reopen','A');
  await page.evaluate(profile=>window.ops.startProfile(profile),reopened);await waitPhase('selected-A-reopen','A','A');
  result.checks.push('two-real-selected-routes-with-isolated-storage-and-persisted-reopen');
  sessions=await page.evaluate(()=>window.ops.syncSessions());
  const pages=[];
  for(const profile of created){
   const session=sessions.find(row=>row.id===profile.id);assert.ok(session?.port);
   const connection=await chromium.connectOverCDP('http://127.0.0.1:'+session.port);connections.push(connection);
   const tab=connection.contexts().flatMap(context=>context.pages()).find(tab=>tab.url().startsWith(fixture.originUrl+'/page'));assert.ok(tab);pages.push(tab);
  }
  assert.ok(fixture.entryProbes.some(row=>row.authorized&&row.targetIsA&&row.connected),'A must traverse the authenticated entry hop');
  assert.ok(fixture.proxyProbes.some(row=>row.route==='A'&&row.authorized&&row.viaEntry===true),'A egress must observe the real entry TCP source');
  await fixture.stopNode('ENTRY');
  await pages[0].goto(fixture.originUrl+'/page?owner=A&phase=selected-entry-stopped',{timeout:15000}).catch(()=>{});
  assert.equal(fixture.pageRequests.some(row=>row.phase==='selected-entry-stopped'),false,'Failed entry must not reach A directly, B, or the origin');
  await pages[1].goto(fixture.originUrl+'/page?owner=B&phase=selected-B-after-entry-stopped',{timeout:15000});
  await waitPhase('selected-B-after-entry-stopped','B','B');
  await fixture.restartNode('ENTRY');
  await pages[0].goto(fixture.originUrl+'/page?owner=A&phase=selected-entry-recovered',{timeout:15000});
  await waitPhase('selected-entry-recovered','A','A');
  result.checks.push('real-entry-hop-loss-no-direct-egress-and-recovery-with-original-storage');
  await fixture.stopNode('A');
  await pages[0].goto(fixture.originUrl+'/page?owner=A&phase=selected-A-stopped',{timeout:15000}).catch(()=>{});
  assert.equal(fixture.pageRequests.some(row=>row.phase==='selected-A-stopped'),false,'Failed selected A must not reach the origin via B or directly');
  await pages[1].goto(fixture.originUrl+'/page?owner=B&phase=selected-B-after-A-stopped',{timeout:15000});
  await waitPhase('selected-B-after-A-stopped','B','B');
  const direct=await new Promise((resolve,reject)=>{http.get(fixture.originUrl+'/check?key=native-direct-control',res=>{let body='';res.on('data',part=>body+=part);res.on('end',()=>resolve(JSON.parse(body)))}).on('error',reject)});
  assert.equal(direct.route,'direct');
  result.checks.push('selected-A-loss-no-fallback-or-direct-while-native-B-remains-usable');
  await page.locator('[data-view="profiles"]').click();
  await page.locator(`#profile-table tr[data-profile-id="${created[0].id}"] .lyco-bound-route`).click();
  const row=page.locator(`[data-profile-route="${created[0].id}"]`);
  await choose('lyco-route-'+created[0].id,'CI route B');await row.getByRole('button',{name:'停止并更换线路',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('lyco-feedback').textContent.includes('线路已保存'));
  await page.locator('[data-view="profiles"]').click();
  await page.waitForFunction(id=>document.querySelector(`#profile-table tr[data-profile-id="${id}"] .lyco-bound-route`)?.textContent.includes('CI route B'),created[0].id);
  sessions=await page.evaluate(()=>window.ops.syncSessions());
  assert.equal(sessions.some(item=>item.id===created[0].id),false);assert.ok(sessions.some(item=>item.id===created[1].id));
  const switched=await configure(created[0],'selected-A-changed-to-B','A');
  await page.evaluate(profile=>window.ops.startProfile(profile),switched);
  // Stored owner remains A even though this workspace now uses B's upstream.
  const deadline=Date.now()+45000;
  while(Date.now()<deadline&&!fixture.observations.some(item=>item.phase==='selected-A-changed-to-B'))await new Promise(resolve=>setTimeout(resolve,150));
  const changed=fixture.observations.find(item=>item.phase==='selected-A-changed-to-B');assert.ok(changed);assert.equal(changed.route,'B');assert.deepEqual(changed.before,{cookie:'A',local:'A'});assert.deepEqual(changed.after,{cookie:'A',local:'A'});
  result.checks.push('real-route-change-stops-only-A-and-preserves-its-existing-storage');
  report.checks.push('native-per-workspace-selected-upstreams-reopen-failure-and-route-change');
 }finally{
  for(const profile of created)await page.evaluate(id=>window.ops.stopProfile(id),profile.id).catch(()=>{});
  for(const connection of connections)await connection.close().catch(()=>{});
  await page.evaluate(()=>{if(window.__lycoRouteOriginalAdopt)window.adoptLycoProfile=window.__lycoRouteOriginalAdopt;if(window.__lycoRoutePreviousCreated?.present)window.__lycoCreated=window.__lycoRoutePreviousCreated.value;else delete window.__lycoCreated;delete window.__lycoRoutePreviousCreated;delete window.__lycoRouteOriginalAdopt;delete window.__lycoRouteCreated}).catch(()=>{});
  await app.evaluate(()=>{delete globalThis.__lycoWorkspaceRouteSubscription}).catch(()=>{});
  result.observations=fixture.observations;result.pageRequests=fixture.pageRequests;result.directChecks=fixture.checks;result.proxyProbes=fixture.proxyProbes;result.entryProbes=fixture.entryProbes;
  await fixture.close();
 }
}
