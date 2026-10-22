// Actions-only diagnostics: no page evaluation, breakpoint, resume, settings,
// detector changes or captured local variables. Never retain source URLs.
export function sanitizeCpuProfile(profile) {
  if (!Array.isArray(profile?.nodes) || !Array.isArray(profile?.samples)
      || !Array.isArray(profile?.timeDeltas)) throw Error('Invalid CPU profile');
  const kind = url => {
    try {
      const path = new URL(url).pathname;
      if (path.startsWith('/independent/creepjs/')) return 'creepjs';
      if (path.startsWith('/independent/locale/')) return 'locale';
      if (path.startsWith('/independent/sdk/')) return 'sdk';
      if (path.startsWith('/independent/fingerprintjs/')) return 'fingerprintjs';
      if (path.startsWith('/independent/botd/')) return 'botd';
    } catch {}
    return url ? 'other' : 'anonymous';
  };
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  const nodes = profile.nodes.slice(0, 10000).filter(node => integer(node?.id)).map(node => ({
    id: node.id,
    callFrame: {
      functionName: String(node.callFrame?.functionName || '').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 160),
      sourceKind: kind(node.callFrame?.url),
      lineNumber: Number.isSafeInteger(node.callFrame?.lineNumber) ? node.callFrame.lineNumber : -1,
      columnNumber: Number.isSafeInteger(node.callFrame?.columnNumber) ? node.callFrame.columnNumber : -1,
    },
    hitCount: integer(node.hitCount) ? node.hitCount : 0,
    children: Array.isArray(node.children) ? node.children.filter(integer).slice(0, 10000) : [],
  }));
  const samples = profile.samples.slice(0, 20000).filter(integer);
  const timeDeltas = profile.timeDeltas.slice(0, 20000).filter(value => Number.isFinite(value) && value >= 0);
  return {nodes, samples, timeDeltas,
    truncated: profile.nodes.length > 10000 || profile.samples.length > 20000 || profile.timeDeltas.length > 20000};
}

export async function beginCpuDiagnostic(cdp, socket) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw Error('CPU diagnostics run only in Actions');
  const state = {available: false, samplingIntervalUs: 10000};
  let connection, started = false;
  try {
    // Bare connection: do not install the browser engine's auto-attach wrapper.
    connection = await new cdp.PersistentConnection(socket).open(1200);
    await connection.command('Profiler.enable', {}, {timeout: 1200});
    await connection.command('Profiler.setSamplingInterval', {interval: state.samplingIntervalUs}, {timeout: 1200});
    await connection.command('Profiler.start', {}, {timeout: 1200});
    started = true; state.available = true;
  } catch (error) {
    state.error = /timeout|timed.*out/i.test(String(error?.message)) ? 'profiler-start-timeout' : 'profiler-unavailable';
    connection?.close();
  }
  return {available: state.available, async finish() {
    if (!started) return {...state};
    started = false;
    try {
      const result = await connection.command('Profiler.stop', {}, {timeout: 3000});
      const profile = sanitizeCpuProfile(result.profile);
      const top = [...profile.nodes].sort((a, b) => b.hitCount - a.hitCount).slice(0, 20)
        .map(node => ({...node.callFrame, hitCount: node.hitCount}));
      return {...state, profile, top};
    } catch (error) {
      return {...state, collected: false,
        error: /timeout|timed.*out/i.test(String(error?.message)) ? 'profiler-stop-timeout' : 'profiler-result-unavailable'};
    } finally {connection.close();}
  }};
}
