'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
if (process.env.GITHUB_ACTIONS !== 'true') throw Error('Patched upstream acceptance runs only in Actions');
const {sanitizeProfile} = require(path.resolve(__dirname, '../../upstream/Browserapp/engine/profile-sanitizer.js'));
const {buildFingerprint} = require(path.resolve(__dirname, '../../upstream/Browserapp/automation/fingerprint.js'));
const {resolveProfileTimezone, resolveProfileLanguage} = require(path.resolve(__dirname, '../../upstream/Browserapp/automation/locale-from-country.js'));
const {BrowserEngine} = require(path.resolve(__dirname, '../../upstream/Browserapp/engine.js'));

async function nativeSessionPreparation(refuseFinal=false){
 const events=[],state={cores:4,memory:8};
 const profile=sanitizeProfile({id:'ci-native-finalization-'+refuseFinal,name:'Native finalization',os:'Windows',language:'en-GB',
  privacy:{deviceProfile:'default',cores:6,memory:4,clientRects:'noise',languageMode:'profile',langFromIp:false,timezoneMode:'custom',timezone:'Asia/Tokyo'}});
 const fp=buildFingerprint(profile);
 const item={profile,lycoNativeIdentity:{ownsHtmlCanvasNoise:false,async applySession(){
  events.push('native');state.cores=6;state.memory=8;
 },async finalizeSession(){
  if(refuseFinal)throw Error('Final native preparation refused');
  events.push('final-cpu');state.cores=6;
 }}};
 const connection={async command(method){
  events.push(method);
  // Reproduce an intervening generic override invalidating native hardware
  // preparation. Success requires native finalization before page readiness.
  if(['Emulation.setUserAgentOverride','Network.setUserAgentOverride'].includes(method)){state.cores=4;state.memory=8}
  if(['Emulation.clearDeviceMetricsOverride','Emulation.setDeviceMetricsOverride'].includes(method))state.cores=4;
  if(method==='Page.addScriptToEvaluateOnNewDocument'){state.cores=6;state.memory=4}
  return method==='Page.addScriptToEvaluateOnNewDocument'?{identifier:'ci-document-start'}:{};
 }};
 const engine=Object.assign(Object.create(BrowserEngine.prototype),{networkInfo:new Map()});
 const preparation=engine.applyFingerprintToSession(connection,'ci-session-'+refuseFinal,item,fp,
  {type:'page',targetId:'ci-page-'+refuseFinal,url:'about:blank',waitingForDebugger:true});
 return {preparation,events,state,item};
}

test('native session hardware is finalized after generic document preparation and before page readiness',async()=>{
 const {preparation,events,state,item}=await nativeSessionPreparation();
 await preparation;
 assert.deepEqual(state,{cores:6,memory:4});
 assert.ok(events.indexOf('native')<events.indexOf('Page.addScriptToEvaluateOnNewDocument'));
 assert.equal(events.filter(event=>event==='native').length,1,'The full device must not be restored after document scripts');
 assert.equal(events.at(-1),'final-cpu','Only the Chromium CPU override is reasserted before readiness');
 assert.equal(item.fpAppliedTargets.has('ci-page-false'),true);
});

test('a rejected final native restore cannot mark the page ready',async()=>{
 const {preparation,item}=await nativeSessionPreparation(true);
 await assert.rejects(preparation,/Final native preparation refused/);
 assert.equal(item.fpAppliedTargets?.has('ci-page-true')||false,false);
});

test('native and legacy layout choices survive the real sanitizer and fingerprint builder', () => {
  for (const mode of ['native', 'noise', 'real']) {
    const profile = sanitizeProfile({id: 'layout-policy-contract', name: 'Layout policy', privacy: {clientRects: mode}});
    assert.equal(profile.privacy.clientRects, mode);
    assert.equal(buildFingerprint(profile).clientRects.mode, mode);
  }
  assert.equal(sanitizeProfile({id: 'unmigrated-policy', name: 'Existing'}).privacy.clientRects, 'noise',
    'The shared sanitizer must not silently change the default of existing profiles');
});

test('an IP-derived country without timezone cannot inherit an unconfirmed UTC default', () => {
  const profile = {exitTimezone: 'Etc/UTC', language: 'zh-CN', privacy: {timezoneMode: 'ip', languageMode: 'ip'}};
  assert.equal(resolveProfileTimezone(profile, {countryCode: 'KR'}), 'Asia/Seoul');
  assert.equal(resolveProfileLanguage(profile, {countryCode: 'KR'}), 'ko-KR');
  assert.equal(resolveProfileTimezone(profile, {countryCode: 'JP'}), 'Asia/Tokyo');
  assert.equal(resolveProfileTimezone({...profile, exitCountryCode: 'US', exitTimezone: 'America/New_York'},
    {countryCode: 'US'}), 'America/New_York', 'Same known country keeps its regional timezone');
  assert.equal(resolveProfileTimezone({...profile, exitCountryCode: 'US', exitTimezone: 'America/New_York'},
    {countryCode: 'KR'}), 'Asia/Seoul', 'Country switch cannot retain the previous exit timezone');
  assert.equal(resolveProfileTimezone(profile, {}), 'Etc/UTC', 'Unavailable geo data does not erase saved settings');
  assert.equal(resolveProfileTimezone({...profile, privacy: {timezoneMode: 'custom', timezone: 'Asia/Tokyo'}},
    {countryCode: 'KR'}), 'Asia/Tokyo', 'Explicit user choice remains authoritative');
  assert.equal(resolveProfileTimezone(profile, {countryCode: 'US', timezone: 'America/Chicago'}), 'America/Chicago',
    'Valid exact network timezone remains authoritative');
});
