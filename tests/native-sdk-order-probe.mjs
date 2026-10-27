// Actions-only SDK investigation. No product scripts, generated identities,
// credentials, fingerprint payloads or licence workarounds enter the evidence.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
if (process.env.GITHUB_ACTIONS !== 'true' || process.platform !== 'win32') throw Error('Windows Actions only');
const appRoot = path.resolve(process.argv[2]);
const requireApp = createRequire(path.join(appRoot, 'package.json'));
const cdp = requireApp('./cdp');
const {ensureKernelReadyForLaunch} = requireApp('./automation/browser-kernel');
const binary = path.join(appRoot, 'kernels/windows-x64/chrome.exe');
const evidence = path.join(process.env.RUNNER_TEMP, 'lyco-sdk-order-probe');
await fs.mkdir(evidence, {recursive: true});
const rows = [], observations = new Map();
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const key = url.searchParams.get('case');
  if (!/^(cold|ready|ready-cpu|native-settings|persona-launch|combined|native-locale|native-gpu|native-two-step)-[12]$/.test(key || '')) {res.writeHead(404).end();return;}
  if (url.pathname === '/report' && req.method === 'POST') {
    let body = '';for await (const chunk of req) {body += chunk;if(body.length > 2048) {res.writeHead(413).end();return;}}
    const value = JSON.parse(body);
    observations.set(key, {cores: value.cores, memory: value.memory});res.end('ok');return;
  }
  res.setHeader('Content-Type','text/html');res.setHeader('Cache-Control','no-store');
  // First executable bytes in our fixture only read browser-owned properties.
  res.end('<!doctype html><script>fetch("/report?case='+key+'",{method:"POST",body:JSON.stringify({cores:navigator.hardwareConcurrency,memory:navigator.deviceMemory})})</script><p>LYCO native SDK ordering probe</p>');
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const origin = 'http://127.0.0.1:'+server.address().port;
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
const unpack = result => {
  const raw = result?.fingerprint ?? result;
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Native response unavailable');
  return value;
};
const matches = (value,wanted) => Object.fromEntries(['hardwareConcurrency','deviceMemory'].map(key => [key,value?.[key]===wanted[key]]));
try {
  // Use the same upstream, owner-authorized initialization as the application.
  // It accepts the vendor terms; it does not supply or manufacture a token.
  await ensureKernelReadyForLaunch({path: binary});
  for (const mode of ['cold','ready','ready-cpu','native-settings','persona-launch','combined','native-locale','native-gpu','native-two-step']) {
    const profile = await fs.mkdtemp(path.join(process.env.RUNNER_TEMP,'lyco-sdk-profile-'));
    const persona = ['--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
      '--lang=en-GB','--accept-lang=en-GB,en','--force-device-scale-factor=1','--disable-blink-features=AutomationControlled'];
    const child = spawn(binary,['--user-data-dir='+profile,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1',
      '--no-first-run','--no-default-browser-check','--disable-background-networking',
      ...(['persona-launch','combined'].includes(mode)?persona:[]),'about:blank'],{stdio:'ignore',windowsHide:false});
    let connection;
    try {
      let port;
      for (let attempt=0;attempt<150;attempt++) {
        try {port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split(/\r?\n/)[0]);if(port)break;} catch {}
        await sleep(200);
      }
      if (!Number.isInteger(port) || port<1024 || port>65535) throw Error('Owned kernel did not provide a loopback debugger');
      const tabs = await cdp.tabs(port);
      const blank = tabs.find(tab=>tab.type==='page' && tab.url==='about:blank');
      if (!blank) throw Error('No initial blank page');
      const seed = unpack(await cdp.call(blank.webSocketDebuggerUrl,'Wayfern.getFingerprint',{}));
      // Both hardware values must differ from the original native defaults, so
      // a coincidentally matching generated identity cannot pass this probe.
      const wanted = {hardwareConcurrency:seed.hardwareConcurrency===6?8:6,deviceMemory:seed.deviceMemory===4?2:4};
      const settings = {
        ...(['native-settings','combined','native-locale','native-two-step'].includes(mode) ?
          {languages:['en-GB','en'],language:'en-GB',timezone:'Asia/Tokyo'} : {}),
        ...(['native-settings','combined','native-gpu','native-two-step'].includes(mode) ?
          {webglVendor:'Google Inc. (Intel)',webglRenderer:'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)'} : {}),
      };
      const device = {...seed,...settings,...wanted};
      const pending = new Map();
      const failures = [];
      connection = await new cdp.PersistentConnection(await cdp.browserSocket(port),{onEvent:event=>{
        if (event.method!=='Target.attachedToTarget' || event.params.targetInfo.type!=='page') return;
        const {sessionId,targetInfo,waitingForDebugger} = event.params;
        const operation = (async()=>{
          const row = {mode,paused:waitingForDebugger,baselineDiffers:matches(seed,wanted),requested:wanted};
          const command = (method,params={})=>connection.command(method,params,{sessionId,timeout:5000});
          const ready = ['ready','ready-cpu'].includes(mode);
          if (ready) {await command('Page.enable');await command('Runtime.enable');}
          let receipt=unpack(await command('Wayfern.setFingerprint',device));
          row.initialReceiptMatches=matches(receipt,wanted);
          if(mode==='native-two-step') receipt=unpack(await command('Wayfern.setFingerprint',{...receipt,...wanted}));
          row.receiptMatches=matches(receipt,wanted);
          const immediate=unpack(await command('Wayfern.getFingerprint'));
          row.immediateNativeMatches=matches(immediate,wanted);
          row.nativeCanvasSeedPreserved=Object.hasOwn(seed,'canvasNoiseSeed') && immediate.canvasNoiseSeed===seed.canvasNoiseSeed;
          if(!ready) {await command('Page.enable');await command('Runtime.enable');}
          if(mode==='ready-cpu') await command('Emulation.setHardwareConcurrencyOverride',{hardwareConcurrency:wanted.hardwareConcurrency});
          await command('Runtime.runIfWaitingForDebugger');
          return {row,sessionId,targetId:targetInfo.targetId};
        })();
        pending.set(targetInfo.targetId,operation);operation.catch(()=>failures.push('Native setup failed'));
      }}).open();
      await connection.command('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter:[{type:'page',exclude:false}]});
      // Existing blank attachment must finish before measuring newly created
      // targets; failures are preserved instead of resuming an unprepared page.
      await Promise.all([...pending.values()]);
      for (const ordinal of [1,2]) {
        const key=mode+'-'+ordinal;
        const {targetId}=await connection.command('Target.createTarget',{url:origin+'/probe?case='+key});
        for(let attempt=0;attempt<80 && !pending.has(targetId);attempt++) await sleep(100);
        if(!pending.has(targetId)) throw Error('New target was not intercepted');
        const {row,sessionId}=await pending.get(targetId);
        for(let attempt=0;attempt<80 && !observations.has(key);attempt++) await sleep(100);
        row.case=key;row.firstScript=observations.get(key)||null;
        row.firstScriptMatches={hardwareConcurrency:row.firstScript?.cores===wanted.hardwareConcurrency,deviceMemory:row.firstScript?.memory===wanted.deviceMemory};
        row.laterNativeMatches=matches(unpack(await connection.command('Wayfern.getFingerprint',{},{sessionId})),wanted);
        rows.push(row);
        await fs.writeFile(path.join(evidence,'results.json'),JSON.stringify(rows,null,2)+'\n');
        await connection.command('Target.closeTarget',{targetId});
      }
      if(failures.length) throw Error('Native setup failed');
    } finally {
      connection?.close();
      if(child.pid) await promisify(execFile)('taskkill',['/PID',String(child.pid),'/T','/F']).catch(()=>{});
      await fs.rm(profile,{recursive:true,force:true}).catch(()=>{});
    }
  }
  console.log(JSON.stringify({scope:'Pinned SDK ordering investigation, not release acceptance',cases:rows.length,
    modes:rows.map(row=>({case:row.case,firstScriptMatches:row.firstScriptMatches,laterNativeMatches:row.laterNativeMatches}))},null,2));
  if(rows.length!==18 || rows.some(row=>!row.firstScript)) throw Error('Investigation incomplete');
} finally {await new Promise(resolve=>server.close(resolve));}
