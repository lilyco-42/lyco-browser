(async () => {
  const config = LYCO_VPN_CONFIGURATION;
  const first = document.createElement('iframe');
  document.body.appendChild(first);
  const nested = first.contentDocument.createElement('iframe');
  first.contentDocument.documentElement.appendChild(nested);
  async function observe(win, name) {
    const row = {name, candidates: [], errors: [], localStats: [], sdp: '', finishedBecause: ''};
    let pc;
    try {
      pc = new win.RTCPeerConnection({iceServers: [{urls: `stun:${config.host}:${config.ports[name]}`} ]});
      const done = new Promise(resolve => {
        pc.onicecandidate = event => {
          if (event.candidate) row.candidates.push({json: event.candidate.toJSON(), address: event.candidate.address, port: event.candidate.port, candidateType: event.candidate.type});
          else { row.finishedBecause = 'gather-complete'; resolve(); }
        };
        pc.onicecandidateerror = event => row.errors.push({errorCode: event.errorCode, errorText: event.errorText, address: event.address, url: event.url});
        setTimeout(() => { if (!row.finishedBecause) row.finishedBecause = 'deadline'; resolve(); }, 8000);
      });
      pc.createDataChannel('owned-vpn-observation');
      await pc.setLocalDescription(await pc.createOffer());
      await done;
      row.sdp = pc.localDescription.sdp;
      const stats = await pc.getStats();
      row.localStats = [...stats.values()].filter(value => value.type === 'local-candidate' || value.type === 'candidate-pair');
    } catch (error) { row.exception = String(error); }
    finally { if (pc) pc.close(); }
    return row;
  }
  const observations = await Promise.all([
    observe(window, 'top'), observe(first.contentWindow, 'initial-empty'), observe(nested.contentWindow, 'nested-empty'),
  ]);
  await fetch('/report', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({phase: config.phase, userAgent: navigator.userAgent, observations})});
  document.title = `VPN OBSERVATION COMPLETE: ${config.phase}`;
})();
