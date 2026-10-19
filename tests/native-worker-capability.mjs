import {createHash} from 'node:crypto';

// A new, read-only protocol capability probe after first-script capture. Never
// use engine-wrapped cdp.connect: its service-worker event handler evaluates
// injection scripts. A bare, callback-free PersistentConnection does not.
export async function inspectNativeWorkerCapability({cdp, port, pageSocket, pageUrl, phase, expected}) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw Error('Native protocol inspection only runs in Actions');
  const canonical = value => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
  const device = value => {
    const raw = value?.fingerprint ?? value;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('Invalid native response');
    return parsed;
  };
  const query = async call => {
    try {return {available: true, value: device(await call())};}
    catch (error) {return {available: false,
      methodUnavailable: /not found|wasn't found|unknown method|not supported/i.test(String(error?.message || error))};}
  };
  const window = await query(() => cdp.call(pageSocket, 'Wayfern.getFingerprint', {}, 3000));
  const result = {windowNativeAvailable: window.available, targets: {}};
  const socket = await cdp.browserSocket(port);
  const endpoint = new URL(socket);
  if (endpoint.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)
      || Number(endpoint.port) !== port || endpoint.username || endpoint.password) throw Error('Not the owned browser endpoint');
  const connection = await new cdp.PersistentConnection(socket).open(3000);
  try {
    const {targetInfos = []} = await connection.command('Target.getTargets', {}, {timeout: 3000});
    for (const [kind, type] of Object.entries({dedicated: 'worker', service: 'service_worker'})) {
      const url = new URL('/concurrent-worker.js?phase=' + phase + '&kind=' + kind, pageUrl).href;
      const matches = targetInfos.filter(target => target.type === type && target.url === url);
      if (matches.length !== 1) {result.targets[kind] = {matchingTargets: matches.length, available: false}; continue;}
      let sessionId;
      try {
        ({sessionId} = await connection.command('Target.attachToTarget', {targetId: matches[0].targetId, flatten: true}, {timeout: 3000}));
        if (typeof sessionId !== 'string' || !sessionId) throw Error('Worker session not attached');
        const read = await query(() => connection.command('Wayfern.getFingerprint', {}, {sessionId, timeout: 3000}));
        const observed = {type, available: read.available, methodUnavailable: read.methodUnavailable};
        if (read.available) {
          const value = read.value;
          observed.hasNativeCanvasSeed = Object.hasOwn(value, 'canvasNoiseSeed');
          observed.fullDeviceMatchesOwningWindow = Boolean(window.available && digest(value) === digest(window.value));
          observed.canvasSeedMatchesOwningWindow = Boolean(window.available && observed.hasNativeCanvasSeed
            && Object.hasOwn(window.value, 'canvasNoiseSeed') && value.canvasNoiseSeed === window.value.canvasNoiseSeed);
          observed.configuredFieldsMatch = Object.fromEntries(Object.entries({language: expected.language,
            timezone: expected.timezone, hardwareConcurrency: expected.cores, deviceMemory: expected.memory})
            .map(([key, wanted]) => [key, value[key] === wanted]));
        }
        result.targets[kind] = observed;
      } catch {result.targets[kind] = {type, available: false, attachOrReadFailed: true};}
      finally {
        if (sessionId) await connection.command('Target.detachFromTarget', {sessionId}, {timeout: 1000}).catch(() => {});
      }
    }
  } finally {connection.close();}
  return result;
}
