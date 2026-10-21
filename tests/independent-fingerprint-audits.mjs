import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {beginCpuDiagnostic} from './audit-cpu-diagnostic.mjs';
import {prepareAuditForeground, readAuditPageState} from './audit-page-lifecycle.mjs';

export const auditVersions = Object.freeze({
  creepjs: '10aa6724cd33a1015db1574211890518cd04f0cc',
  locale: '58a93a7b0304e40723c42f7fbe18035c1f353fdd',
  fingerprintjs: 'd43c48aeffd66165e102036af79e956b1fbbf4e1',
  botd: '66da86e9d9e7206e817a0f7fdbdfa8fe37f3cd47',
});

// Serve the pinned, unmodified detector assets on the existing private origin.
// This is not a public mirror and no detector code enters Browserapp/packages.
export async function createIndependentAuditFixture(workspace) {
  const roots = [
    {prefix: '/independent/creepjs/', root: await fs.realpath(path.join(workspace, 'fingerprint-audits/creepjs/docs'))},
    {prefix: '/independent/locale/', root: await fs.realpath(path.join(workspace, 'fingerprint-audits/claude-tester/dist'))},
    {prefix: '/independent/fingerprintjs/', root: await fs.realpath(path.join(workspace, 'fingerprint-audits/fingerprintjs/dist'))},
    {prefix: '/independent/botd/', root: await fs.realpath(path.join(workspace, 'fingerprint-audits/botd/dist'))},
  ];
  const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ogg': 'audio/ogg'};
  const requests = [];
  const hashes = {};
  for (const [name, file] of [['creepjs', path.join(roots[0].root, 'creep.js')],
    ['localeHtml', path.join(roots[1].root, 'index.html')],
    ['fingerprintjs', path.join(roots[2].root, 'fp.esm.js')], ['botd', path.join(roots[3].root, 'botd.esm.js')]]) {
    hashes[name] = createHash('sha256').update(await fs.readFile(file)).digest('hex');
  }
  return {hashes, requests, route(req, res, proxied) {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/independent/sdk/index.html') {
      requests.push({path: url.pathname, proxied, status: 200});
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
      res.end(`<!doctype html><meta charset="utf-8"><title>Private pinned SDK audit</title>
        <h1>FingerprintJS / BotD — actual product results</h1><pre id="results">Collecting…</pre>
        <script type="module">
          import * as FingerprintJS from '../fingerprintjs/fp.esm.js';
          import * as BotD from '../botd/botd.esm.js';
          const results = {};
          await Promise.all([
            (async () => {try {const agent = await FingerprintJS.load({monitoring: false});
              results.fingerprintjs = await agent.get();} catch (e) {results.fingerprintjs = {failed: String(e)};}})(),
            (async () => {try {const detector = await BotD.load({monitoring: false});
              results.botd = {detection: detector.detect(), components: detector.getComponents(), detections: detector.getDetections()};
              } catch (e) {results.botd = {failed: String(e)};}})(),
            (async () => {try {
              const context = new OfflineAudioContext(1, 2048, 44100);
              const oscillator = context.createOscillator();
              oscillator.frequency.value = 440;
              oscillator.connect(context.destination);
              oscillator.start(512 / context.sampleRate);
              oscillator.stop(1536 / context.sampleRate);
              const buffer = await context.startRendering();
              const data = buffer.getChannelData(0), copy = new Float32Array(data.length);
              buffer.copyFromChannel(copy, 0);
              const active = data.slice(512, 1536);
              const digest = await crypto.subtle.digest('SHA-256', active.buffer);
              results.audio = {leadSilent: data.slice(0, 512).every(value => value === 0),
                tailSilent: data.slice(1536).every(value => value === 0),
                signalPresent: active.some(value => value !== 0),
                copiesMatch: data.every((value, index) => Object.is(value, copy[index])),
                activeHash: Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')};
            } catch (e) {results.audio = {failed: String(e)};}})(),
          ]);
          const json = JSON.stringify(results, (_key, value) => value instanceof Error
            ? {name: value.name, message: value.message, stack: value.stack} : value);
          document.getElementById('results').textContent = json;
          window.independentSdkResults = JSON.parse(json);
        </script>`);
      return true;
    }
    // scanner/audio.ts intentionally uses absolute /audio/{1,2,3}.ogg URLs;
    // preserve those three original assets without rewriting detector code.
    const source = roots.find(row => url.pathname.startsWith(row.prefix))
      || (/^\/audio\/[123]\.ogg$/.test(url.pathname) ? {prefix: '/', root: roots[1].root} : null);
    if (!source) return false;
    const entry = {path: url.pathname, proxied, status: null}; requests.push(entry);
    (async () => {
      if (req.method !== 'GET') {entry.status = 405; res.writeHead(405); res.end(); return;}
      const leaf = decodeURIComponent(url.pathname.slice(source.prefix.length)) || 'index.html';
      const candidate = await fs.realpath(path.resolve(source.root, leaf));
      const relative = path.relative(source.root, candidate);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Forbidden asset path');
      const bytes = await fs.readFile(candidate);
      entry.status = 200;
      res.writeHead(200, {'Content-Type': types[path.extname(candidate)] || 'application/octet-stream',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
      res.end(bytes);
    })().catch(() => {entry.status = 404; if (!res.headersSent) res.writeHead(404); res.end();});
    return true;
  }};
}

export function assertIndependentResult(suite, value, expected) {
  assert.ok(value && typeof value === 'object', suite + ': no detector result');
  if (suite === 'sdk') {
    const fp = value.fingerprintjs, botd = value.botd;
    assert.equal(fp?.failed, undefined); assert.equal(botd?.failed, undefined);
    assert.match(fp?.visitorId || '', /^[0-9a-f]{32}$/);
    assert.ok(typeof fp.version === 'string' && typeof fp.confidence?.score === 'number');
    for (const key of ['canvas', 'fonts', 'languages', 'timezone', 'hardwareConcurrency', 'deviceMemory']) {
      assert.ok(fp.components?.[key] && Object.hasOwn(fp.components[key], 'value'), 'FingerprintJS missing component: ' + key);
      assert.equal(fp.components[key].error, undefined, 'FingerprintJS component failed: ' + key);
    }
    assert.equal(fp.components.hardwareConcurrency.value, expected.cores);
    assert.equal(fp.components.deviceMemory.value, expected.memory);
    assert.equal(fp.components.timezone.value, expected.timezone);
    assert.ok(botd?.components && Object.keys(botd.components).length > 0, 'BotD components missing');
    assert.ok(botd?.detections && Object.keys(botd.detections).length > 0, 'BotD detections missing');
    assert.equal(botd.detection?.bot, false, 'BotD identified automation; keep the real detection details');
    assert.equal(value.audio?.failed, undefined);
    for (const field of ['leadSilent', 'tailSilent', 'signalPresent', 'copiesMatch']) {
      assert.equal(value.audio?.[field], true, 'Scheduled audio preservation failed: ' + field);
    }
    assert.match(value.audio?.activeHash || '', /^[0-9a-f]{64}$/);
    return;
  }
  if (suite === 'locale') {
    assert.ok(Number.isInteger(value.score) && value.score >= 0 && value.score <= 100, 'Invalid community score');
    assert.equal(value.signals?.length, 6, 'Every community signal must complete');
    assert.deepEqual(value.signals.map(row => row.id).sort(),
      ['emoji', 'fonts', 'intlLocale', 'language', 'timezone', 'timezoneOffset'].sort());
    for (const row of value.signals) {
      assert.ok(typeof row.value === 'string' && row.value.trim() && row.value.trim() !== '—', row.id + ': detector failed');
      assert.ok(!['unknown', 'canvas unavailable'].includes(row.value.trim().toLowerCase()), row.id + ': detector unavailable');
      assert.match(row.contribution, /^\+\d+$/);
      assert.ok(['low', 'medium', 'high'].includes(row.verdict), row.id + ': incomplete verdict');
    }
    assert.equal(value.score, value.signals.reduce((sum, row) => sum + Number(row.contribution.slice(1)), 0));
    assert.equal(value.band, value.score <= 30 ? 'low' : value.score <= 60 ? 'medium' : 'high');
    assert.equal(value.signals.find(row => row.id === 'timezone').value, expected.timezone);
    assert.ok(value.signals.find(row => row.id === 'language').value.toLowerCase().includes(expected.language.toLowerCase()));
    assert.equal(value.band, 'low', 'Community locale heuristic is not low; keep the actual signals, not a fabricated zero');
    return;
  }
  assert.equal(suite, 'creepjs');
  const fp = value.fingerprint;
  for (const key of ['navigator', 'workerScope', 'timezone', 'fonts', 'lies', 'canvas2d', 'headless',
    'clientRects', 'offlineAudioContext', 'capturedErrors']) {
    assert.ok(fp?.[key] && typeof fp[key] === 'object', 'CreepJS missing surface: ' + key);
  }
  assert.equal(fp.navigator.hardwareConcurrency, expected.cores, 'CreepJS Window CPU mismatch');
  assert.equal(fp.workerScope.hardwareConcurrency, expected.cores, 'CreepJS Worker CPU mismatch');
  assert.equal(fp.navigator.deviceMemory, expected.memory, 'CreepJS Window memory mismatch');
  assert.equal(fp.workerScope.deviceMemory, expected.memory, 'CreepJS Worker memory mismatch');
  assert.equal(fp.workerScope.timezoneLocation, expected.timezone, 'CreepJS Worker timezone mismatch');
  assert.equal(fp.workerScope.language, expected.language, 'CreepJS Worker language mismatch');
  for (const key of ['elementClientRects', 'elementBoundingClientRect', 'rangeClientRects', 'rangeBoundingClientRect']) {
    assert.equal(fp.clientRects[key]?.length, 12, 'CreepJS geometry probe incomplete: ' + key);
    for (const rect of fp.clientRects[key]) for (const field of ['x', 'y', 'width', 'height', 'top', 'right', 'bottom', 'left']) {
      assert.ok(Number.isFinite(rect[field]), 'CreepJS geometry probe failed: ' + key + '.' + field);
    }
  }
  assert.ok(Number.isFinite(fp.offlineAudioContext.sampleSum) && fp.offlineAudioContext.sampleSum > 0, 'CreepJS audio did not render');
  assert.equal(fp.offlineAudioContext.binsSample?.length, 100, 'CreepJS audio samples missing');
  assert.ok(fp.offlineAudioContext.binsSample.every(Number.isFinite), 'CreepJS audio samples are invalid');
  assert.deepEqual(fp.offlineAudioContext.copySample, fp.offlineAudioContext.binsSample, 'AudioBuffer copy and direct reads disagree');
  assert.equal(fp.offlineAudioContext.noise, 0, 'AudioBuffer changed silent or authored samples');
  assert.deepEqual(fp.capturedErrors.data, [], 'CreepJS captured an execution error');
  assert.ok(Number.isInteger(fp.lies.totalLies), 'CreepJS omitted prototype/consistency result');
  assert.equal(fp.lies.totalLies, 0, 'CreepJS reports contradictions; raw lies remain in the private evidence');
  assert.equal(fp.navigator.lied, false, 'CreepJS rejects Navigator consistency');
  // The fixed CreepJS worker returns a numeric lie count (zero), while later
  // OS/UA checks can change it to true. Missing results must not pass as falsy.
  assert.ok(fp.workerScope.lied === 0 || fp.workerScope.lied === false, 'CreepJS rejects Worker consistency');
}

export async function verifyIndependentAudits({page, profiles, settings, ua, originPort, cdp,
  fixture, profileRoots, report, checkpoint, evidence}) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw Error('Independent product acceptance only runs in Actions');
  const result = report.independentAudits = {versions: auditVersions, hashes: fixture.hashes,
    networkScope: {privateOrigin: true, externalHttpBlocked: true,
      externalStun: 'not-accepted-by-this-suite; see separate local UDP canary contract'},
    officialClaudeVerdict: false, runs: {}, failures: []};
  const original = {};
  for (const owner of ['A', 'B']) original[owner] = await fs.readFile(path.join(profileRoots[owner],
    `lyco-native-identity-${profiles[owner].id}.json`));
  const evaluate = async (socket, expression) => {
    const response = await cdp.call(socket, 'Runtime.evaluate', {expression, returnByValue: true}, 5000);
    assert.equal(response.exceptionDetails, undefined, 'Detector page evaluation threw');
    return response.result?.value;
  };
  const observe = async (socket, expression, milliseconds) => {
    const until = Date.now() + milliseconds;
    while (Date.now() < until) {
      const value = await evaluate(socket, expression);
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw Error('Independent detector did not complete before its deadline');
  };
  try {
    for (const [phase, owner] of [['a-first', 'A'], ['b-parallel', 'B'], ['a-reopen', 'A']]) {
      if (phase === 'a-reopen') {
        for (const item of Object.values(profiles)) await page.evaluate(id => window.ops.stopProfile(id), item.id);
      }
      const expected = settings[owner];
      const urls = {creepjs: `http://127.0.0.1:${originPort}/independent/creepjs/index.html?phase=${phase}`,
        locale: `http://127.0.0.1:${originPort}/independent/locale/index.html?phase=${phase}`,
        sdk: `http://127.0.0.1:${originPort}/independent/sdk/index.html?phase=${phase}`};
      const configured = await page.evaluate(({source, expected, ua, urls}) => window.adoptLycoProfile({
        ...source, os: 'Windows', language: expected.language, userAgent: ua,
        startUrl: urls.creepjs, platform: {type: 'other', startUrl: urls.creepjs},
        advanced: {...source.advanced, startUrls: Object.values(urls).join('\n'), saveCookies: true},
        fingerprint: {...source.fingerprint, cores: expected.cores, memory: expected.memory},
        privacy: {...source.privacy, deviceProfile: 'default', cores: expected.cores, memory: expected.memory,
          languageMode: 'profile', uiLanguage: 'profile', langFromIp: false, timezoneFromIp: false, geoFromIp: false,
          timezoneMode: 'custom', timezone: expected.timezone, canvas: 'noise', refreshFingerprintOnStart: false},
      }), {source: profiles[owner], expected, ua, urls});
      result.runs[phase] = {expected, suites: {}};
      await checkpoint('independent:' + phase + ':start');
      await page.evaluate(source => window.ops.startProfile(source), configured);
      const state = await page.evaluate(async id => (await window.ops.profileStatus()).find(row => row.id === id), configured.id);
      assert.ok(state?.running);
      if (phase === 'b-parallel') {
        const running = await page.evaluate(() => window.ops.profileStatus());
        assert.equal(running.filter(row => Object.values(profiles).some(profile => profile.id === row.id) && row.running).length, 2);
        result.bothRunning = true;
      }
      for (const suite of ['creepjs', 'locale', 'sdk']) {
        const row = result.runs[phase].suites[suite] = {};
        let socket, cpuDiagnostic;
        try {
          socket = (await cdp.tabs(state.port)).find(tab => tab.url === urls[suite])?.webSocketDebuggerUrl;
          assert.ok(socket, suite + ': actual native page missing');
          // All three existing pages remain open in both running profiles.
          // Select the page under observation, as a real tab click would do;
          // record before/after instead of assuming background pages execute.
          row.foreground = await prepareAuditForeground(cdp, socket);
          if (suite === 'creepjs') {
            // The pinned detector's fixed-rotation check runs only at DPR=1.
            // Keep that scope visible; zero lies at another DPR is not proof
            // of the DPR=1 branch. Observe only, never change the profile/DPR.
            row.environment = await evaluate(socket, `({devicePixelRatio: window.devicePixelRatio,
              resolutionMatches: matchMedia('(resolution: ' + window.devicePixelRatio + 'dppx)').matches})`);
            row.raw = await observe(socket, `window.Fingerprint && window.Creep && ({fingerprint: window.Fingerprint, stable: window.Creep})`, 45000);
          } else if (suite === 'sdk') {
            row.raw = await observe(socket, 'window.independentSdkResults || null', 30000);
          } else {
            // A real foreground mouse click grants the same activation as a
            // person using this audio-enabled UI. Do not invoke scanner.run(),
            // synthesize scores or treat an idle initial zero as a result.
            row.browserErrors = [];
            const observer = await new cdp.PersistentConnection(socket, {onEvent: event => {
              if (row.browserErrors.length >= 30) return;
              if (event.method === 'Runtime.exceptionThrown') {
                const details = event.params?.exceptionDetails || {};
                row.browserErrors.push({kind: 'exception', message: String(details.exception?.description || details.text || '').slice(0, 1200)});
              } else if (event.method === 'Log.entryAdded') {
                const entry = event.params?.entry || {};
                if (entry.level === 'error') row.browserErrors.push({kind: 'log', message: String(entry.text || '').slice(0, 1200)});
              }
            }}).open(3000);
            try {
              await observer.command('Runtime.enable', {}, {timeout: 3000});
              await observer.command('Log.enable', {}, {timeout: 3000}).catch(() => {});
              await observer.command('Page.bringToFront', {}, {timeout: 3000});
              await observe(socket, `document.readyState === 'complete' && !!document.querySelector('#scan-btn:not(:disabled)')`, 12000);
              row.uiState = await evaluate(socket, `(() => {const button=document.getElementById('scan-btn');const r=button.getBoundingClientRect();
                return {visibility: document.visibilityState, focused: document.hasFocus(), x:r.x+r.width/2, y:r.y+r.height/2,
                  width:r.width, height:r.height};})()`);
              assert.equal(row.uiState.visibility, 'visible');
              assert.ok(row.uiState.width > 0 && row.uiState.height > 0);
              const object = await observer.command('Runtime.evaluate', {expression: `document.getElementById('scan-btn')`, objectGroup: 'lyco-locale-audit'}, {timeout: 3000});
              try {
                const listeners = await observer.command('DOMDebugger.getEventListeners', {objectId: object.result.objectId}, {timeout: 3000});
                row.clickListenerPresent = listeners.listeners.some(listener => listener.type === 'click');
              } catch {row.listenerInspectionUnavailable = true;}
              const pointer = {x: row.uiState.x, y: row.uiState.y, button: 'left', clickCount: 1};
              await observer.command('Input.dispatchMouseEvent', {...pointer, type: 'mousePressed'}, {timeout: 3000});
              await observer.command('Input.dispatchMouseEvent', {...pointer, type: 'mouseReleased'}, {timeout: 3000});
              row.raw = await observe(socket, `(() => {
              if (!document.querySelector('#scan-btn:not(:disabled)') || !document.getElementById('result') || document.getElementById('result').hidden) return null;
              return {score: Number(document.getElementById('score-value').textContent),
                band: document.getElementById('score-gauge').dataset.band,
                signals: [...document.querySelectorAll('[data-signal]')].map(node => ({id: node.dataset.signal,
                  verdict: node.dataset.verdict, value: node.querySelector('[data-field="value"]')?.textContent,
                  contribution: node.querySelector('[data-field="contrib"]')?.textContent}))};
              })()`, 12000);
            } finally {observer.close();}
          }
          const shot = await cdp.call(socket, 'Page.captureScreenshot', {format: 'png'}, 5000);
          assert.ok(shot.data); row.screenshot = `independent-${phase}-${suite}.png`;
          await fs.writeFile(path.join(evidence, row.screenshot), Buffer.from(shot.data, 'base64'));
          assertIndependentResult(suite, row.raw, expected);
          row.status = 'passed';
        } catch (error) {
          row.status = 'failed'; row.error = String(error.stack || error);
          if (socket) {
            let observer;
            try {
              observer = await new cdp.PersistentConnection(socket).open(1200);
              row.pageState = await readAuditPageState(observer);
            } catch {row.failureStateUnavailable = true;}
            finally {observer?.close();}
          }
          if (socket && !row.screenshot) {
            try {
              const shot = await cdp.call(socket, 'Page.captureScreenshot', {format: 'png'}, 5000);
              assert.ok(shot.data); row.screenshot = `independent-${phase}-${suite}-failed.png`;
              await fs.writeFile(path.join(evidence, row.screenshot), Buffer.from(shot.data, 'base64'));
            } catch {row.failureScreenshotUnavailable = true;}
          }
          result.failures.push({phase, suite, error: row.error});
          // Only after the original scenario has failed: profiling cannot
          // change its acceptance timing or turn a failed observation green.
          // No reload, resume, scanner call or second detector attempt.
          if (socket) {
            cpuDiagnostic = await beginCpuDiagnostic(cdp, socket);
            if (cpuDiagnostic.available) await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } finally {
          if (cpuDiagnostic) {
            const diagnostic = await cpuDiagnostic.finish();
            const {profile, ...metadata} = diagnostic;
            row.cpuDiagnostic = metadata;
            if (profile) {
              const file = `independent-${phase}-${suite}-cpu.json`;
              try {
                await fs.writeFile(path.join(evidence, file), JSON.stringify(profile));
                row.cpuDiagnostic.file = file;
              } catch {row.cpuDiagnostic.saveFailed = true;}
            }
          }
        }
        result.requests = [...fixture.requests];
        await checkpoint('independent:' + phase + ':' + suite + ':observed');
      }
    }
  } finally {
    for (const item of Object.values(profiles)) await page.evaluate(id => window.ops.stopProfile(id), item.id).catch(() => {});
    result.requests = [...fixture.requests];
    result.cacheUnchanged = {};
    for (const owner of ['A', 'B']) {
      const bytes = await fs.readFile(path.join(profileRoots[owner], `lyco-native-identity-${profiles[owner].id}.json`));
      result.cacheUnchanged[owner] = bytes.equals(original[owner]);
    }
    await checkpoint('independent:complete');
  }
  assert.ok(result.requests.length > 0 && result.requests.every(row => row.proxied), 'Independent audit assets bypassed Mihomo');
  assert.ok(Object.values(result.cacheUnchanged).every(Boolean), 'Independent audit replaced a saved native identity');
  assert.equal(result.failures.length, 0, 'Independent detector failed; inspect the raw results instead of claiming full compatibility');
  const visitor = phase => result.runs[phase].suites.sdk.raw.fingerprintjs.visitorId;
  assert.equal(visitor('a-first'), visitor('a-reopen'), 'FingerprintJS identity changed after reopening A');
  assert.notEqual(visitor('a-first'), visitor('b-parallel'), 'FingerprintJS did not distinguish the two configured environments');
  const audio = phase => result.runs[phase].suites.sdk.raw.audio.activeHash;
  assert.equal(audio('a-first'), audio('a-reopen'), 'Audible samples changed after reopening the same environment');
  assert.notEqual(audio('a-first'), audio('b-parallel'), 'Audible samples lost the per-profile audio identity');
  report.checks.push('independent-creepjs-locale-fingerprintjs-botd-on-real-product');
}
