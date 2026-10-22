// Actions-only observation of the actual LYCO kernel on a public, direct CI
// route. Separate process and fresh profile from managed-proxy fixture tests.
// No preexisting account cookies/tokens, authenticated service calls, detector
// patches or score edits. Public sites may create their own ordinary cookies.
import {_electron as electron, chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {classifyPublicPage, classifyPublicCell} from './public-network-result.mjs';
import {readWebglIdentity, assertWebglIdentity} from './browser-webgl-identity.mjs';

if(process.env.GITHUB_ACTIONS !== 'true') throw Error('Public product diagnostics run only in Actions');
const binary = path.resolve(process.argv[2]);
const appRoot = path.resolve(process.argv[3]);
const evidence = path.resolve(process.argv[4] || 'lyco-public-network');
await fs.mkdir(evidence, {recursive: true});
const report = {commit: process.env.GITHUB_SHA, route: 'actual-LYCO-profile/direct/github-hosted-runner',
  certifiesCustomerRoute: false, officialClaudeVerdict: null, accountsUsed: 0, realPayments: 0,
  pages: [], settings: [], limitations: ['CI direct route is not the customer subscription route',
    'Public diagnostics and reputation scores are third-party observations, not platform eligibility'], startedAt: new Date().toISOString()};
const id = 'public-' + randomUUID();
let application, browser;
const save = () => fs.writeFile(path.join(evidence, 'public-network.json'), JSON.stringify(report, null, 2));
try {
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES(?:\(X86\))?|COMMONPROGRAMFILES|HOMEDRIVE|HOMEPATH|OS|PROCESSOR_ARCHITECTURE|NUMBER_OF_PROCESSORS)$/i.test(key)));
  application = await electron.launch({executablePath: binary, args: [appRoot], timeout: 60000,
    env: {...cleanEnv, OPENBROWSER_API_PORT: String(53000 + Math.floor(Math.random() * 1000))}});
  const shell = await application.firstWindow();
  await shell.waitForLoadState('domcontentloaded');
  assert.equal((await shell.evaluate(() => window.ops.lycoStatus())).logged_in, false, 'Public diagnostics must not reuse a subscription login');
  const existing = await shell.evaluate(() => window.ops.profileStatus());
  assert.ok(existing.every(row => !row.running && row.id !== id), 'Previous CI environments must be stopped and the public profile must be new');
  let profile = await shell.evaluate(id => window.adoptLycoProfile({id, number: 90001, name: 'CI public network',
    browser: 'Google Chrome', os: 'Windows', networkMode: 'direct', proxy: 'direct',
    language: 'en-US', startUrl: 'about:blank',
    platform: {type: 'other', startUrl: 'about:blank'},
    advanced: {startUrls: 'about:blank', tabMode: 'custom', restoreSession: false},
    // Use the ordinary IP-mode resolver. Do not force an artificial language or
    // timezone just to make this external observation easier to pass.
    privacy: {deviceProfile: 'persona', clientRects: 'native', languageMode: 'ip',
      langFromIp: true, uiLanguage: 'profile', timezoneMode: 'ip',
      canvas: 'noise', refreshFingerprintOnStart: false},
  }), id);
  try {
    const checked = await shell.evaluate(profile => window.ops.checkProfileProxy(profile), profile);
    report.geoProbe = {state: 'observed', countryCode: checked.countryCode || null, timezone: checked.timezone || null};
    profile = await shell.evaluate(profile => window.adoptLycoProfile(profile), checked.profile);
  } catch(error) {
    report.geoProbe = {state: 'unavailable', error: String(error.message).slice(0, 1000)};
  }
  await shell.evaluate(profile => window.ops.startProfile(profile), profile);
  const state = await shell.evaluate(async id => (await window.ops.profileStatus()).find(row => row.id === id), id);
  assert.ok(state?.running && Number.isInteger(state.port), 'Actual LYCO public profile must start');
  assert.ok(state.profileDirectory && path.isAbsolute(state.profileDirectory));
  const cache = path.join(state.profileDirectory, `lyco-native-identity-${id}.json`);
  const cachedDevice = await fs.readFile(cache);
  const cachedRecord = JSON.parse(cachedDevice);
  assert.equal(cachedRecord.schema, 1);
  assert.equal(cachedRecord.profileId, id);
  assert.ok(cachedRecord.fingerprint && typeof cachedRecord.fingerprint === 'object');
  report.product = {browser: state.browser, running: state.running, nativeIdentityRequired: true,
    newProfile: true, selectedMode: 'ip', resolvedLanguage: state.language,
    resolvedTimezone: state.privacy?.timezone || state.exitTimezone || null,
    exitCountryCode: state.exitCountryCode || null,
    nativeCacheDigest: createHash('sha256').update(cachedDevice).digest('hex')};
  // Attach to the already-running product, never launch stock Chromium/Edge.
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${state.port}`, {timeout: 20000});
  const context = browser.contexts()[0];
  const responseRows = [], documents = new WeakMap();
  context.on('response', response => {
    try {
      const url = new URL(response.url());
      if(response.request().isNavigationRequest() && !response.frame().parentFrame())
        documents.set(response.frame().page(), {status: response.status()});
      if(url.hostname === 'ip.net.coffee' && responseRows.length < 120) responseRows.push({
        // API paths can contain the public CI IP; keep only the route family.
        route: url.pathname.startsWith('/api/') ? url.pathname.split('/').slice(0, 3).join('/') : url.pathname,
        status: response.status(),
      });
    } catch {} // Responses without a frame (e.g. a service worker) are not documents.
  });
  await shell.locator('[data-view="profiles"]').click();
  await shell.locator('#lyco-check-environment').click();
  await shell.locator('#lyco-diagnostics-profile-button').click();
  await shell.locator('#lyco-diagnostics-profile-menu [data-option-index="1"]').click();
  assert.equal(await shell.locator('#lyco-diagnostics-profile').inputValue(), id);
  await shell.screenshot({path: path.join(evidence, 'environment-checks-ready.png')});
  for (const route of ['claude', 'gpt', 'dns', 'webrtc']) {
    const row = {route, state: 'unavailable', cells: {}, observations: []};
    report.pages.push(row); await save();
    // The normal UI must open a real new tab in the selected product profile.
    // Never replace this with shell.openExternal or harness page.goto.
    const [target] = await Promise.all([context.waitForEvent('page', {timeout: 20000}),
      shell.locator('#lyco-diagnostics-' + route).click()]);
    await shell.waitForFunction(route => document.getElementById('lyco-diagnostics-feedback').dataset.opened === route, route);
    try {
      try {await target.waitForLoadState('domcontentloaded', {timeout: 35000});}
      catch(error) {row.navigationError = String(error.message).slice(0, 1000);}
      // The standalone pages require their own normal button click. Merely
      // reaching their landing pages does not run their DNS/STUN checks.
      if(route === 'dns' || route === 'webrtc') {
        const selector = route === 'dns' ? '#btnStandard' : '#testBtn';
        row.siteAction = {kind: route === 'dns' ? 'standard-dns' : 'webrtc', clicked: false, completed: false};
        const trigger = target.locator(selector);
        if(await trigger.count() === 1) {
          await trigger.click({timeout: 5000}); row.siteAction.clicked = true;
          try {
            await target.waitForFunction(selector => document.querySelector(selector)?.disabled === false, selector, {timeout: 30000});
            row.siteAction.completed = true;
          } catch(error) {row.siteAction.error = String(error.message).slice(0, 1000);}
        } else {row.siteAction.unavailable = 'Original site test button missing or page challenged';}
      } else {
        // Summary pages run their own bounded parallel checks automatically.
        // One observation interval; no reload/retry or forced success text.
        await target.waitForTimeout(18000);
      }
      row.status = documents.get(target)?.status ?? null;
      row.statusSource = row.status === null ? null : 'navigation-response';
      if(row.status === null) {
        // Tabs created through native IPC can finish their initial response
        // before Playwright attaches. Read the browser's original navigation
        // timing, not a guessed 200 or a second request taking another route.
        const timingStatus = await target.evaluate(() => {
          const status = performance.getEntriesByType('navigation')[0]?.responseStatus;
          return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
        });
        if(timingStatus !== null) {row.status = timingStatus; row.statusSource = 'navigation-timing';}
      }
      row.title = await target.title();
      const finalLocation = new URL(target.url());
      row.finalLocation = {origin: finalLocation.origin, pathname: finalLocation.pathname};
      row.text = (await target.locator('body').innerText({timeout: 5000})).slice(0, 24000);
      row.state = classifyPublicPage({status: row.status, origin: finalLocation.origin, title: row.title, text: row.text});
      if(row.state === 'observed') assert.ok(finalLocation.pathname.startsWith('/' + route + '/'), 'Diagnostic button opened the wrong page');
      const settings = await target.evaluate(() => ({language: navigator.language,
        languages: Array.from(navigator.languages), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        offset: new Date().getTimezoneOffset(), userAgent: navigator.userAgent,
        cookieEnabled: navigator.cookieEnabled,
        viewport: {width: innerWidth, height: innerHeight, clientWidth: document.documentElement.clientWidth,
          clientHeight: document.documentElement.clientHeight, dpr: devicePixelRatio}}));
      report.settings.push({route, ...settings});
      row.webgl = await target.evaluate('(' + readWebglIdentity.toString() + ')()');
      // This is consistency with the engine's selected IP-mode configuration,
      // not an independent oracle for geographic correctness. The original
      // site's warnings and actual public-IP observations remain below.
      assert.ok(typeof report.product.resolvedLanguage === 'string' && report.product.resolvedLanguage.length);
      assert.equal(settings.language, report.product.resolvedLanguage, 'Public navigation lost the selected language');
      assert.equal(settings.languages[0], report.product.resolvedLanguage);
      assert.ok(typeof report.product.resolvedTimezone === 'string' && report.product.resolvedTimezone.length);
      const canonical = value => {
        assert.equal(typeof value, 'string', 'Observed timezone must be available');
        try {return new Intl.DateTimeFormat('en', {timeZone: value}).resolvedOptions().timeZone;}
        catch {assert.fail('Observed or selected timezone is invalid');}
      };
      assert.equal(canonical(settings.timezone), canonical(report.product.resolvedTimezone), 'Public navigation lost the selected timezone');
      for (const cell of ['deviceContent', 'ipAddr', 'ipAddrClaude', 'ipAddrGPT', 'dnsLeakContent', 'udpLeakContent', 'gaugeScore',
        'statusBar', 'verdictArea', 'dnsBody', 'rtcStatus', 'resultBody']) {
        const element = target.locator('#' + cell);
        if(await element.count()) {
          const text = (await element.innerText()).slice(0, 6000);
          row.cells[cell] = {text, classification: classifyPublicCell(text)};
          if(text.trim() && ['deviceContent', 'verdictArea'].includes(cell))
            await element.screenshot({path: path.join(evidence, `netcoffee-${route}-${cell}.png`)});
        }
      }
      await target.screenshot({path: path.join(evidence, `netcoffee-${route}.png`)});
      await save();
      assertWebglIdentity(row.webgl, report.gpuIdentityFirst, route);
      report.gpuIdentityFirst ||= row.webgl;
      const rendered = row.cells.deviceContent?.text.match(/WebGL 渲染器\n([^\n]+)/)?.[1];
      if(rendered) assert.equal(row.webgl.webgl.renderer, rendered,
        'The original site saw a different first-read GPU than the later page read');
    } catch(error) {
      // Assertion failures are product regressions, not third-party outages.
      if(error.code === 'ERR_ASSERTION') throw error;
      assert.equal(target.isClosed(), false, 'Product diagnostic tab closed unexpectedly');
      assert.equal(browser.isConnected(), true, 'Product browser disconnected during diagnostics');
      row.error = String(error.message).slice(0, 1500);
      row.state = 'unavailable';
      await target.screenshot({path: path.join(evidence, `netcoffee-${route}-unavailable.png`)}).catch(() => {});
    } finally {await target.close().catch(() => {});}
    await save();
  }
  report.responses = responseRows;
  await shell.locator('#lyco-diagnostics-close').click();
  report.normalUiRoutesVerified = 4;
  assert.deepEqual(await fs.readFile(cache), cachedDevice, 'Public diagnostics must not replace the native identity');
  report.cacheUnchanged = true;
  report.observedPages = report.pages.filter(row => row.state === 'observed').length;
  report.settingsVerified = report.settings.length;
  report.allNetworkChecksPassed = null; // No automatic verdict from page reachability.
  report.networkVerdict = 'review-original-results; customer-route-not-tested';
} catch(error) {
  report.failure = String(error.stack || error);
  throw error;
} finally {
  if(application) {
    try {const shell = await application.firstWindow(); await shell.evaluate(id => window.ops.stopProfile(id), id);} catch {}
    await browser?.close().catch(() => {});
    await application.close();
  }
  report.completedAt = new Date().toISOString();
  await save();
}
