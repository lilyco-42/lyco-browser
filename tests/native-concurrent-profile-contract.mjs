import assert from 'node:assert/strict';

export async function verifyConcurrentWorkerProfiles({page, profiles, settings, ua, originPort, fixture, report, checkpoint, cdp}) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw Error('Real concurrent browser acceptance only runs in Actions');
  const active = {}, evidence = {bothRunning: false, profiles: {}};
  report.concurrentProfiles = evidence;
  const wait = async predicate => {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {const result = await predicate(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 100));}
    throw Error('Actual concurrent browser observation timed out');
  };
  const statuses = () => page.evaluate(() => window.ops.profileStatus());
  const checkRealm = (value, expected, label) => {
    assert.ok(value, label + ' did not produce a first-script observation');
    assert.equal(value.language, expected.language, label + ' language crossed environments');
    assert.deepEqual(value.languages, [expected.language, expected.language.split('-')[0]], label + ' languages crossed environments');
    assert.equal(value.cores, expected.cores, label + ' CPU crossed environments');
    assert.equal(value.memory, expected.memory, label + ' memory crossed environments');
    assert.equal(value.timezone, expected.timezone, label + ' timezone crossed environments');
    assert.match(value.shapePixels, /^[0-9a-f]{8}$/);
  };
  try {
    for (const owner of ['A', 'B']) {
      const expected = settings[owner], phase = owner.toLowerCase() + '-concurrent';
      const target = `http://127.0.0.1:${originPort}/concurrent-probe?phase=${phase}`;
      const configured = await page.evaluate(({source, expected, target, ua}) => window.adoptLycoProfile({
        ...source, os: 'Windows', language: expected.language, userAgent: ua, startUrl: target, platform: {type: 'other', startUrl: target},
        advanced: {...source.advanced, startUrls: target, saveCookies: true},
        fingerprint: {...source.fingerprint, cores: expected.cores, memory: expected.memory},
        privacy: {...source.privacy, deviceProfile: 'default', cores: expected.cores, memory: expected.memory,
          languageMode: 'profile', uiLanguage: 'profile', langFromIp: false, timezoneFromIp: false, geoFromIp: false,
          timezoneMode: 'custom', timezone: expected.timezone, canvas: 'noise', refreshFingerprintOnStart: false},
      }), {source: profiles[owner], expected, target, ua});
      await checkpoint('concurrent:' + owner + ':start');
      await page.evaluate(source => window.ops.startProfile(source), configured);
      const observed = await wait(() => fixture.result(phase)?.page);
      checkRealm(observed.initial, expected, owner + ' window');
      assert.deepEqual(observed.before, {cookie: owner, local: owner});
      assert.equal(fixture.result(phase).pageProxied, true);
      assert.equal(fixture.result(phase).pageReportProxied, true);
      active[owner] = {id: configured.id, phase, target, initial: observed.initial};
    }
    const running = (await statuses()).filter(item => [active.A.id, active.B.id].includes(item.id));
    assert.equal(running.length, 2); assert.ok(running.every(item => item.running));
    assert.notEqual(running[0].port, running[1].port); assert.notEqual(running[0].profileDirectory, running[1].profileDirectory);
    evidence.bothRunning = true;
    await checkpoint('concurrent:both-running');
    const readWorkers = async owner => {
      const current = active[owner], expected = settings[owner];
      const state = (await statuses()).find(item => item.id === current.id);
      assert.ok(state?.running, owner + ' must remain running during worker creation');
      const socket = (await cdp.tabs(state.port)).find(tab => tab.url === current.target)?.webSocketDebuggerUrl;
      assert.ok(socket, owner + ' actual page target missing');
      fixture.clearWorkers(current.phase);
      // Click the page's normal button; its own JS creates ordinary workers.
      // No fingerprint override, reload, or direct worker evaluation by the harness.
      await cdp.call(socket, 'Runtime.evaluate', {expression: 'document.getElementById("read-workers").click()'}, 2000);
      const workers = await wait(() => fixture.result(current.phase)?.workers);
      assert.equal(workers.error, undefined, owner + ': ' + workers.error);
      for (const realm of ['windowStart', 'windowNow', 'dedicated', 'service']) {
        checkRealm(workers[realm], expected, owner + ' ' + realm);
        assert.equal(workers[realm].shapePixels, current.initial.shapePixels, owner + ' ' + realm + ' pixel noise differs');
      }
      const entry = fixture.result(current.phase);
      assert.equal(entry.workersReportProxied, true);
      for (const kind of ['dedicated', 'service']) {
        const requests = entry.requests.filter(row => row.kind === kind);
        assert.ok(requests.length > 0, kind + ' was not fetched');
        assert.ok(requests.every(row => row.proxied), kind + ' bypassed Mihomo');
        assert.ok(requests.every(row => row.language.split(',')[0] === expected.language), owner + ' worker request language crossed environments');
      }
      return structuredClone(entry);
    };
    for (const owner of ['A', 'B']) {
      await checkpoint('concurrent:' + owner + ':workers');
      evidence.profiles[owner] = await readWorkers(owner);
      assert.equal((await statuses()).filter(item => [active.A.id, active.B.id].includes(item.id) && item.running).length, 2);
    }
    assert.notEqual(active.A.initial.shapePixels, active.B.initial.shapePixels, 'Parallel environments lost distinct shape noise');
    await page.evaluate(id => window.ops.stopProfile(id), active.B.id);
    await wait(async () => !(await statuses()).find(item => item.id === active.B.id)?.running);
    evidence.afterStoppingB = await readWorkers('A');
    report.checks.push('native-concurrent-profiles-first-script-worker-storage-and-proxy-isolation');
    await checkpoint('concurrent:passed');
  } finally {
    for (const profile of Object.values(profiles)) await page.evaluate(id => window.ops.stopProfile(id), profile.id).catch(() => {});
    await checkpoint('concurrent:stopped');
  }
}
