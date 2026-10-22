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
    language: 'en-US', startUrl: 'https://ip.net.coffee/claude/',
    platform: {type: 'other', startUrl: 'https://ip.net.coffee/claude/'},
    advanced: {startUrls: 'https://ip.net.coffee/claude/', tabMode: 'custom', restoreSession: false},
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
  const target = context.pages().find(page => page.url().startsWith('https://ip.net.coffee/')) || context.pages()[0];
  assert.ok(target, 'Product page unavailable');
  const responseRows = [];
  target.on('response', response => {
    const url = new URL(response.url());
    if (url.hostname === 'ip.net.coffee' && responseRows.length < 120) responseRows.push({
      // API paths can contain the public CI IP, so keep only the route family.
      route: url.pathname.startsWith('/api/') ? url.pathname.split('/').slice(0, 3).join('/') : url.pathname,
      status: response.status(),
    });
  });
  for (const route of ['claude', 'gpt', 'dns', 'webrtc']) {
    const row = {route, state: 'unavailable', cells: {}, observations: []};
    report.pages.push(row); await save();
    try {
      const response = await target.goto(`https://ip.net.coffee/${route}/`, {waitUntil: 'domcontentloaded', timeout: 35000});
      row.status = response?.status() ?? null;
      // Let the unchanged site's bounded parallel DNS/STUN/network checks run.
      // One observation interval; no reload/retry or forced success text.
      await target.waitForTimeout(18000);
      row.title = await target.title();
      const finalLocation = new URL(target.url());
      row.finalLocation = {origin: finalLocation.origin, pathname: finalLocation.pathname};
      row.text = (await target.locator('body').innerText({timeout: 5000})).slice(0, 24000);
      row.state = classifyPublicPage({status: row.status, origin: finalLocation.origin, title: row.title, text: row.text});
      const settings = await target.evaluate(() => ({language: navigator.language,
        languages: Array.from(navigator.languages), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        offset: new Date().getTimezoneOffset(), userAgent: navigator.userAgent,
        cookieEnabled: navigator.cookieEnabled}));
      report.settings.push({route, ...settings});
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
      for (const cell of ['deviceContent', 'ipAddr', 'ipAddrClaude', 'ipAddrGPT', 'dnsLeakContent', 'udpLeakContent', 'gaugeScore']) {
        const element = target.locator('#' + cell);
        if(await element.count()) {
          const text = (await element.innerText()).slice(0, 6000);
          row.cells[cell] = {text, classification: classifyPublicCell(text)};
        }
      }
      await target.screenshot({path: path.join(evidence, `netcoffee-${route}.png`)});
    } catch(error) {
      // Assertion failures are product regressions, not third-party outages.
      if(error.code === 'ERR_ASSERTION') throw error;
      row.error = String(error.message).slice(0, 1500);
      row.state = 'unavailable';
      await target.screenshot({path: path.join(evidence, `netcoffee-${route}-unavailable.png`)}).catch(() => {});
    }
    await save();
  }
  report.responses = responseRows;
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
