import dgram from 'node:dgram';

// Used ONLY by tests/native-workspaces.mjs in GitHub Actions. This test owns
// every network endpoint; it sends no user/device identifiers to third parties.
export function createBrowserPrivacyFixture() {
  if (process.env.GITHUB_ACTIONS !== 'true') throw Error('CI only');
  const udp = dgram.createSocket('udp4');
  let packets = 0;
  let port = null;
  let completed = null;
  let reportProxied = false;
  let pageProxied = false;
  udp.on('message', () => { packets++; });

  async function start() {
    await new Promise((resolve, reject) => {
      udp.once('error', reject);
      udp.bind(0, '127.0.0.1', resolve);
    });
    port = udp.address().port;
    // Positive control. Without a working local UDP receiver, an empty
    // WebRTC leak capture would not be meaningful evidence.
    const client = dgram.createSocket('udp4');
    try {
      await new Promise((resolve, reject) => client.send(Buffer.from('ci-udp-control'), port, '127.0.0.1', error => error ? reject(error) : resolve()));
      const deadline = Date.now() + 2500;
      while (packets === 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
      if (packets === 0) throw Error('UDP listener negative-control receiver unavailable');
    } finally {
      client.close();
    }
    packets = 0;
  }
  function pageHtml() {
    const html = [
      '<!doctype html><meta charset="utf-8"><title>LYCO CI WebRTC probe</title><script>',
      '(async()=>{',
      'const audit={completed:false,blocked:false,ipCandidate:false,candidateCount:0};',
      'try {',
      ' if(typeof RTCPeerConnection!=="function"){audit.blocked=true;}',
      ' else {',
      '  const pc=new RTCPeerConnection({iceServers:[{urls:"stun:127.0.0.1:' + port + '"}]});',
      '  pc.onicecandidate=(e)=>{',
      '    if(!e.candidate)return;',
      '    audit.candidateCount++;',
      '    const addr=String(e.candidate.candidate||"").split(/\\s+/)[4]||"";',
      '    if(/^(?:\\d{1,3}\\.){3}\\d{1,3}$/.test(addr)||addr.includes(":"))audit.ipCandidate=true;',
      '  };',
      '  pc.createDataChannel("lyco-ci");',
      '  await pc.setLocalDescription(await pc.createOffer());',
      '  await new Promise(resolve=>{',
      '    const done=()=>{if(pc.iceGatheringState==="complete"){clearTimeout(timeout);resolve();}};',
      '    const timeout=setTimeout(resolve,4500);',
      '    pc.addEventListener("icegatheringstatechange",done);done();',
      '  });',
      '  pc.close();',
      ' }',
      '}catch{audit.blocked=true;}',
      'audit.completed=true;',
      'await fetch("/webrtc-report",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(audit)});',
      '})();',
      '</script>'
    ];
    return html.join('\n');
  }
  function route(req, res, proxied) {
    if (req.url === '/webrtc-probe') {
      pageProxied = Boolean(proxied);
      res.writeHead(200, {'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store'});
      res.end(pageHtml());
      return true;
    }
    if (req.url === '/webrtc-report') {
      let data = '';
      req.on('data', chunk => { data += chunk; if (data.length > 4096) req.destroy(); });
      req.on('end', () => {
        try {
          const source = JSON.parse(data);
          completed = {
            completed:source.completed === true, blocked:source.blocked === true,
            ipCandidate:source.ipCandidate === true,
            candidateCount:Number(source.candidateCount || 0)
          };
          reportProxied = Boolean(proxied);
          res.writeHead(200, {'Content-Type':'text/plain', 'Cache-Control':'no-store'});
          res.end('ok');
        } catch (_) {
          res.writeHead(400); res.end('invalid');
        }
      });
      return true;
    }
    return false;
  }
  function snapshot() {
    return {udpPort:port, udpPackets:packets, rtc:completed, pageProxied, reportProxied};
  }
  async function close() {
    if (port !== null) await new Promise(resolve => udp.close(resolve));
  }
  return {start,route,snapshot,close};
}