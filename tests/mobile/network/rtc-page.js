// Real native RTC observations. This fixture never replaces candidates, SDP,
// statistics, configurations, transports or the product's script policy.
(async () => {
 const config=LYCO_FIXTURE_CONFIGURATION;
 const cases=config.cases;
 const literal=address=>/^(?:\d{1,3}\.){3}\d{1,3}$/.test(address)||address.includes(':');
 const candidate=value=>{
  const fields=String(value||'').replace(/^a=/,'').split(/\s+/);
  return {raw:String(value||''),address:fields[4]||'',type:fields[7]||'',protocol:fields[2]||''};
 };
 async function observe(scope,name,phase,turn=false){
  const audit={case:name,phase,apiPresent:typeof scope.RTCPeerConnection==='function',applicable:true,
   offerCreated:false,blocked:false,completed:false,candidates:[],localStats:[],sdp:'',literalIP:false,dataAck:false};
  let pc;
  try{
   let Constructor=scope.RTCPeerConnection;
   if(name==='legacy-constructor'){
    Constructor=scope.webkitRTCPeerConnection;
    if(typeof Constructor!=='function'){audit.applicable=false;return audit}
   }
   if(name==='prototype-constructor'){
    const seed=new Constructor();Constructor=seed.constructor;seed.close();
   }
   const servers=turn?[{urls:'turn:10.0.2.2:'+config.turnPorts[phase]+'?transport=tcp',username:'lyco-ci',credential:'lyco-ci-owned-turn-only'}]:
    [{urls:'stun:10.0.2.2:'+config.ports[phase][name]}];
   const settings={iceServers:servers,iceTransportPolicy:turn?'relay':'all'};
   if(name==='set-configuration'){
    pc=new Constructor();pc.setConfiguration(settings);
   }else if(name==='changed-primordials'){
    // Separate frame only. The caller still supplies actual STUN; poisoned
    // intrinsics must not turn a validated native configuration into direct ICE.
    const before=scope.Object.getOwnPropertyDescriptor(scope.Array.prototype,scope.Symbol.iterator);
    const trim=scope.String.prototype.trim;
    try{
     scope.Array.prototype[scope.Symbol.iterator]=function*(){yield servers[0]};
     scope.String.prototype.trim=function(){return servers[0].urls};
     pc=new Constructor(settings);
    }finally{
     scope.Object.defineProperty(scope.Array.prototype,scope.Symbol.iterator,before);
     scope.String.prototype.trim=trim;
    }
   }else pc=new Constructor(settings);
   pc.addEventListener('icecandidate',event=>{
    if(event.candidate&&audit.candidates.length<64)audit.candidates.push(candidate(event.candidate.candidate));
   });
   const channel=pc.createDataChannel('lyco-owned-probe');
   const ack=new Promise(resolve=>{
    channel.onopen=()=>channel.send('LYCO_OWNED_TURN_PING');
    channel.onmessage=event=>{if(event.data==='LYCO_OWNED_TURN_ACK'){audit.dataAck=true;resolve()}};
    setTimeout(resolve,18000);
   });
   await pc.setLocalDescription(await pc.createOffer());audit.offerCreated=true;
   await new Promise(resolve=>{
    const timeout=setTimeout(resolve,4500);
    const done=()=>{if(pc.iceGatheringState==='complete'){clearTimeout(timeout);resolve()}};
    pc.addEventListener('icegatheringstatechange',done);done();
   });
   if(turn&&audit.candidates.some(row=>row.type==='relay')){
    const response=await fetch('http://10.0.2.2:18080/offer?phase='+encodeURIComponent(phase),
     {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pc.localDescription)});
    if(!response.ok)throw Error('Owned signaling failed');
    await pc.setRemoteDescription(await response.json());await ack;
   }
  }catch(error){audit.blocked=true;audit.errorType=error.name;audit.errorMessage=String(error.message).slice(0,500)}
  finally{
   if(pc){
    audit.gatheringState=pc.iceGatheringState;
    audit.connectionState=pc.connectionState;
    audit.sdp=pc.localDescription?.sdp||'';
    try{audit.configuration=pc.getConfiguration()}catch{}
    try{(await pc.getStats()).forEach(row=>{if(row.type==='local-candidate')audit.localStats.push(JSON.parse(JSON.stringify(row)))})}catch(error){audit.statsError=error.name}
    pc.close();
   }
   audit.literalIP=audit.candidates.some(row=>literal(row.address));audit.completed=true;
  }
  return audit;
 }
 if(config.case){
  async function childRun(phase){
   let frame;
   const scope=config.case==='srcdoc-nested'?(()=>{
    frame=document.createElement('iframe');document.documentElement.appendChild(frame);return frame.contentWindow;
   })():window;
   const observation=await observe(scope,config.case,phase);if(frame)frame.remove();
   parent.postMessage({lycoOwnedCase:config.case,observation},'*');
  }
  window.addEventListener('message',event=>{
   if(event.source===parent&&event.data?.lycoOwnedRun==='stopped')childRun('stopped');
  });
  await childRun(config.phase);return;
 }
 let retained;const frames=new Map();
 const child=(name,phase,srcdoc=false)=>new Promise(resolve=>{
  const existing=frames.get(name),frame=existing||document.createElement('iframe');frame.style.display='none';
  const timer=setTimeout(()=>{window.removeEventListener('message',message);resolve({case:name,completed:false,errorType:'MissingFrameReport'})},12000);
  function message(event){
   if(event.source!==frame.contentWindow||event.data?.lycoOwnedCase!==name||event.data.observation?.phase!==phase)return;
   clearTimeout(timer);window.removeEventListener('message',message);resolve(event.data.observation);
  }
  window.addEventListener('message',message);
  if(existing){frame.contentWindow.postMessage({lycoOwnedRun:phase},'*');return}
  const url='http://10.0.2.2:'+(name==='cross-origin'?18082:18080)+'/frame?phase='+encodeURIComponent(phase)+'&case='+name;
  if(srcdoc)frame.srcdoc='<script src="'+url+'&script=1"><\/script>';else frame.src=url;
  frames.set(name,frame);document.documentElement.appendChild(frame);
 });
 async function run(phase){
  // The first page script creates a real PC before constructing other contexts.
  const first=observe(window,'first-script',phase);
  const blankNames=['initial-aboutblank','frames-index','document-default-view'];
  const blanks=blankNames.map(name=>{
   const frame=document.createElement('iframe');frame.style.display='none';document.documentElement.appendChild(frame);
   const scope=name==='frames-index'?window.frames[window.frames.length-1]:name==='document-default-view'?frame.contentDocument.defaultView:frame.contentWindow;
   return observe(scope,name,phase).finally(()=>frame.remove());
  });
  const remaining=cases.filter(name=>name!=='first-script'&&!blankNames.includes(name)).map(name=>child(name,phase,name==='srcdoc-nested'));
  const turn=observe(window,'turn-tcp',phase,true);
  const loopbacks=Promise.all(config.loopbacks.map(async host=>{
   const result={host,phase,ok:false};const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),3500);
   try{const response=await fetch('http://'+host+':18080/loopback?phase='+phase+'&family='+encodeURIComponent(host),{signal:controller.signal});
    result.ok=response.ok&&(await response.json()).alive===true;
   }catch(error){result.errorType=error.name}finally{clearTimeout(timeout)}return result;
  }));
  const observations=await Promise.all([first,...blanks,...remaining]);
  retained={phase,completed:true,apiPresent:true,offerCreated:observations.every(row=>row.applicable===false||row.offerCreated),
   blocked:observations.some(row=>row.blocked),literalIP:observations.some(row=>row.literalIP),cases:observations,turn:await turn,loopbacks:await loopbacks};
  document.getElementById('details').textContent='LYCO_RTC_JSON:'+JSON.stringify({phase,completed:true,offerCreated:retained.offerCreated,
   cases:observations.map(row=>({case:row.case,applicable:row.applicable,completed:row.completed,offerCreated:row.offerCreated,blocked:row.blocked,literalIP:row.literalIP})),
   turn:{completed:retained.turn.completed,dataAck:retained.turn.dataAck,offerCreated:retained.turn.offerCreated}});
  document.getElementById('status').textContent='LYCO RTC '+phase+' completed';
  document.title='LYCO RTC '+phase+' completed';
  try{await upload()}catch{}
 }
 async function upload(){
  const response=await fetch('/report?phase='+encodeURIComponent(retained.phase),{method:'POST',body:JSON.stringify(retained)});
  if(!response.ok)throw Error('Report upload failed');
 }
 async function uploadRetained(){
  try{await upload();document.getElementById('status').textContent='LYCO RTC stopped report retained';document.title='LYCO RTC stopped report retained'}catch{}
 }
 window.addEventListener('hashchange',()=>{
  if(location.hash==='#stopped')run('stopped');
  if(location.hash==='#upload')uploadRetained();
 });
 document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('again').onclick=()=>run('stopped');
  document.getElementById('upload').onclick=uploadRetained;
 });
 await run(config.phase);
})();
