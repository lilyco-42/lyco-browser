'use strict';
// Applied ONLY by GitHub Actions to the pinned upstream checkout.
const fs=require('node:fs'),path=require('node:path');
const {replaceOne}=require('./source-patch');
const {nativeGetterMatches}=require('../src/native-navigator');
const {noisyRectGeometry}=require('../src/rect-geometry');
const {parseProductVersion}=require('../src/product-version');
const base=path.resolve(__dirname,'..'),app=path.resolve(process.argv[2]||path.join(base,'upstream','Browserapp'));
if(!fs.existsSync(path.join(app,'main.js'))||!fs.existsSync(path.join(app,'package.json')))throw Error('Pinned OpenBrowser source required');
const productFile=path.join(base,'apps','universal','src','product.json');
const product=parseProductVersion(JSON.parse(fs.readFileSync(productFile,'utf8')));
const packageFile=path.join(app,'package.json');
const packageInfo=JSON.parse(fs.readFileSync(packageFile,'utf8'));
packageInfo.version=product.version;
fs.writeFileSync(packageFile,JSON.stringify(packageInfo,null,2)+'\n');
function one(file,from,to){
 const p=path.join(app,file),s=fs.readFileSync(p,'utf8');
 fs.writeFileSync(p,replaceOne(s,from,to,file),'utf8');
}
const join=(...parts)=>parts.join('\n');
// Native kernels may expose a navigator member directly on the instance.
// Keep absent APIs absent, but do not skip an exposed own member just because
// it is not installed on Navigator.prototype.
one('automation/fingerprint.js',
 '        try { if (!(key in navProto)) continue; } catch (_) { continue; }',
 '        try { if (!(key in navProto) && !(typeof navigator !== "undefined" && key in navigator)) continue; } catch (_) { continue; }');
// A newly discovered country cannot confirm the country of a stale/default
// saved timezone. Preserve valid exact network timezones and explicit custom
// settings; only let IP-mode fallback derive from the newly known country.
one('automation/locale-from-country.js',
 '  const countryChanged = Boolean(netCountry && profCountry && netCountry !== profCountry);',
 '  const countryChanged = Boolean(netCountry && netCountry !== profCountry);');
// An explicit native layout policy uses the restored kernel's font isolation
// and CSS geometry. Preserve the legacy random and real policies unchanged.
one('engine/profile-sanitizer.js',
 'clientRects: allowed(privacyValue.clientRects, ["real", "noise"], privacyValue.clientRects === "real" ? "real" : "noise"),',
 'clientRects: allowed(privacyValue.clientRects, ["real", "noise", "native"], privacyValue.clientRects === "real" ? "real" : "noise"),');
one('automation/fingerprint.js',
 "  const clientRectsMode = mode('clientRects', ['real', 'noise'], 'noise');",
 "  const clientRectsMode = mode('clientRects', ['real', 'noise', 'native'], 'noise');");
one('index.html',
 '<label>ClientRects<select id="editor-client-rects"><option value="noise">随机微扰</option><option value="real">真实直通</option></select></label>',
 '<label>布局保护<select id="editor-client-rects"><option value="noise">随机微扰（旧模式）</option><option value="native" title="使用受支持内核隔离本机额外字体，保留正常页面布局">一致保护（原生字体）</option><option value="real">真实直通</option></select></label>');
one('renderer.js',
 "['ClientRects', privacy.clientRects === 'real' ? '真实' : '随机'],",
 "['布局保护', privacy.clientRects === 'native' ? '原生字体与一致布局' : (privacy.clientRects === 'real' ? '真实' : '随机微扰（旧）')],");
// Preserve authored silence inside an otherwise audible rendered buffer.
// Adding noise to every zero creates samples before a scheduled source starts
// and after it stops; nonzero samples retain the original per-profile noise.
one('automation/fingerprint.js', '                    if (inAuthoredSpan(spans, i)) continue;',
 '                    if (inAuthoredSpan(spans, i) || data[i] === 0) continue;');
one('automation/fingerprint.js', '  // --- client rects ---',
 '  const lycoNoisyRectGeometry = '+noisyRectGeometry.toString()+';\n  // --- client rects ---');
one('automation/fingerprint.js', join(
 '                const x = rect.x + noisePx, y = rect.y + noisePx;',
 '                const width = rect.width === 0 ? 0 : Math.max(0, rect.width + noiseSize);',
 '                const height = rect.height === 0 ? 0 : Math.max(0, rect.height + noiseSize);',
 '                return TargetDOMRect && TargetDOMRect.fromRect ? TargetDOMRect.fromRect({ x, y, width, height }) : rect;'),
 join('                const geometry = lycoNoisyRectGeometry(rect, noisePx, noiseSize);',
 '                return TargetDOMRect && TargetDOMRect.fromRect ? TargetDOMRect.fromRect(geometry) : rect;'));
one('automation/fingerprint.js', join(
 '                  const width = rect.width === 0 ? 0 : Math.max(0, rect.width + noiseSize);',
 '                  const height = rect.height === 0 ? 0 : Math.max(0, rect.height + noiseSize);',
 '                  rects.push(TargetDOMRect && TargetDOMRect.fromRect',
 '                    ? TargetDOMRect.fromRect({ x: rect.x + noisePx, y: rect.y + noisePx, width, height })'),
 join('                  const geometry = lycoNoisyRectGeometry(rect, noisePx, noiseSize);',
 '                  rects.push(TargetDOMRect && TargetDOMRect.fromRect',
 '                    ? TargetDOMRect.fromRect(geometry)'));
// Preserve native UA getters when CDP/native settings already match. The
// upstream checks the prototype as a receiver, which throws by design and
// unnecessarily replaces valid Web IDL getters (actual CreepJS: 63 findings).
one('automation/user-agent.js', '  const sameValue = (obj, key, expected) => {', join(
 '  const lycoNativeGetterMatches = '+nativeGetterMatches.toString()+';',
 '  const sameValue = (obj, key, expected, receiver) => {',
 '    if (receiver) return lycoNativeGetterMatches(obj, key, receiver, expected);'));
one('automation/user-agent.js', '  const define = (obj, key, getter) => {\n    if (sameValue(obj, key, getter())) return true;',
 '  const define = (obj, key, getter, receiver) => {\n    if (sameValue(obj, key, getter(), receiver)) return true;');
one('automation/user-agent.js', '  const applyNavPatches = (proto) => {',
 '  const applyNavPatches = (proto, receiver = typeof navigator !== "undefined" ? navigator : null) => {');
one('automation/user-agent.js', '        applyNavPatches(subWin.Navigator.prototype);',
 '        applyNavPatches(subWin.Navigator.prototype, subWin.navigator);');
for (const [key,value] of [['userAgent','U.userAgent'],['appVersion','U.appVersion'],['platform','U.platform'],['vendor','U.vendor'],
 ['appCodeName','"Mozilla"'],['appName','"Netscape"'],['product','"Gecko"'],['productSub','"20030107"'],['vendorSub','""']]) {
 one('automation/user-agent.js', 'define(proto, "'+key+'", () => '+value+');',
  'define(proto, "'+key+'", () => '+value+', receiver);');
}
for(const file of ['network.js','profiles.js','native-identity.js','new-tab-gate.js','startup-pages.js','session-restore.js','update-policy.js','update-download.js','view.html','ui.js','workbench.js','workbench.css','account.css','desktop-appearance.js','desktop-ui.js','diagnostics-controller.js','diagnostics-ui.js']){
 const dst=path.join(app,'lyco',file);fs.mkdirSync(path.dirname(dst),{recursive:true});
 fs.copyFileSync(path.join(base,'src',file),dst);
}
fs.mkdirSync(path.join(app,'lyco','core'),{recursive:true});
fs.copyFileSync(productFile,path.join(app,'lyco','product.json'));
fs.copyFileSync(path.join(base,'src','LICENSE-MIHOMO.txt'),path.join(app,'lyco','core','LICENSE-MIHOMO.txt'));
fs.copyFileSync(path.join(base,'src','LICENSE-MIHOMO.source.json'),path.join(app,'lyco','core','LICENSE-MIHOMO.source.json'));
const view=fs.readFileSync(path.join(base,'src','view.html'),'utf8');
one('index.html','<title>OpenBrowser</title>','<title>LYCO Browser · 代理与会员</title>');
one('index.html','href="assets/logo-pixel.png?v=20261002-flat"','href="assets/logo.png"');
one('index.html','src="assets/logo-pixel.png?v=20261002-flat" alt="OpenBrowser"','src="assets/logo.png" alt="Lyco 原创角色"');
one('index.html','<strong>OpenBrowser</strong><small data-i18n="app.brand.sub">','<strong>LYCO Browser</strong><small data-i18n="app.brand.sub">');
one('index.html','href="https://github.com/sheying2013/OpenBrowser"','href="https://github.com/lilyco-42/lyco-browser"');
one('main.js',"const UPDATE_REPOSITORY = 'sheying2013/OpenBrowser';",join(
 "const UPDATE_REPOSITORY = 'lilyco-42/lyco-browser';",
 "const {resolveStableReleaseMeta, updateAssetUrlIsAllowed} = require('./lyco/update-policy');",
 "const {resolveAssetSha256, copyVerifiedUpdate} = require('./lyco/update-download');"));
// The pinned upstream's Atom-first resolver also sees CI and preview tags.
// Keep its callers, but resolve only official stable releases for this product.
for(const [pattern,replacement] of [
 [/async function resolveLatestReleaseMeta\(\) \{[\s\S]*?\n\}\n(?=\nasync function resolveReleaseAsset)/g,
  'async function resolveLatestReleaseMeta() {\n  return resolveStableReleaseMeta({fetch, userAgent: updateUserAgent(), timeout: UPDATE_TIMEOUT_MS});\n}\n'],
 [/function updateUrlIsAllowed\(value, assetName\) \{[\s\S]*?\n\}\n(?=\nfunction updateUserAgent)/g,
  'function updateUrlIsAllowed(value, assetName) {\n  return updateAssetUrlIsAllowed(value, assetName);\n}\n'],
 [/      const reader = response\.body\.getReader\(\);\n      while \(true\) \{[\s\S]*?\n      \}\n/g,
  join('      received = await copyVerifiedUpdate({reader: response.body.getReader(), file,',
   '        expectedSha256: result.asset.sha256,',
   "        expectedSize: result.asset.size || (response.headers.get('content-encoding') ? 0 : contentLength),",
   '        maxBytes: UPDATE_MAX_BYTES, onProgress: value => {',
   '          received = value;',
   "          emit({ type: 'app-update-progress', received, total: contentLength || result.asset.size || 0, percent: contentLength ? Math.min(100, Math.round(received / contentLength * 100)) : null, version: result.remoteVersion });",
   '        }});','')],
]){
 const matches=fs.readFileSync(path.join(app,'main.js'),'utf8').replace(/\r\n/g,'\n').match(pattern);
 if(matches?.length!==1)throw Error('Pinned updater function boundary mismatch');
 one('main.js',matches[0],replacement);
}
one('main.js','        const asset = Array.isArray(release.assets)',join(
 '        if (release.draft !== false || release.prerelease !== false || release.tag_name !== `v${remoteVersion}`) return null;',
 '        const asset = Array.isArray(release.assets)'));
one('main.js',"const APP_UPDATE_CACHE_FILE = path.join(app.getPath('userData'), 'openbrowser-update-status.json');",
 "const APP_UPDATE_CACHE_FILE = path.join(app.getPath('userData'), 'lyco-stable-update-status.json');");
one('main.js','  return {\n    // supported = can show green/red',join(
 '  if (asset) asset.sha256 = await resolveAssetSha256({asset, remoteVersion, release: meta.apiRelease,',
 '    userAgent: updateUserAgent()}).catch(() => null);',
 '  return {',
 '    // supported = can show green/red'));
one('main.js','canDownload: Boolean(assetName && asset?.browser_download_url),',
 'canDownload: Boolean(assetName && asset?.browser_download_url && asset?.sha256),');
one('main.js','asset: asset ? { name: asset.name, size: asset.size || 0, browser_download_url: asset.browser_download_url } : null,',
 'asset: asset ? { name: asset.name, size: asset.size || 0, browser_download_url: asset.browser_download_url, sha256: asset.sha256 } : null,');
one('main.js',"    const file = await fsp.open(temporaryPath, 'w');","    const file = await fsp.open(temporaryPath, 'wx');");
one('main.js','      canDownload: Boolean(raw.canDownload),',
 "      canDownload: Boolean(raw.canDownload && /^[a-f\\d]{64}$/i.test(raw.asset?.sha256 || '')),");
// The updater must request the assets this product actually publishes.
one('main.js', "  'darwin:x64': 'OpenBrowser-macOS-x86_64.dmg',\n", '');
one('main.js', "'darwin:arm64': 'OpenBrowser-macOS-arm64-with-kernel.dmg'", "'darwin:arm64': 'LYCO-Browser-macOS-arm64-MVP.dmg'");
one('main.js', "'win32:x64': 'OpenBrowser-Windows-x86_64-with-kernel.exe'", "'win32:x64': 'LYCO-Browser-Windows-x64-MVP.exe'");
one('main.js', "'linux:x64': 'OpenBrowser-Linux-x86_64-with-kernel.tar.gz'", "'linux:x64': 'LYCO-Browser-Linux-x64-MVP.tar.gz'");
one('index.html','<button class="nav" data-view="proxies">',join(
 '<button class="nav" data-view="lyco" lang="zh-CN" translate="no" aria-label="LYCO 账户与代理" title="LYCO 账户与代理"><i data-lucide="shield-check"></i><span class="lyco-nav-label">账户与代理</span></button>',
 '<button class="nav" data-view="proxies">'));
one('index.html','<section class="view" id="view-groups">',view+'\n<section class="view" id="view-groups">');
one('index.html','</head>','<link rel="stylesheet" href="lyco/workbench.css">\n</head>');
one('index.html','</head>','<link rel="stylesheet" href="lyco/account.css">\n</head>');
one('index.html','</body>','<script src="lyco/ui.js"></script>\n<script src="lyco/workbench.js"></script>\n<script src="lyco/desktop-ui.js"></script>\n<script src="lyco/diagnostics-controller.js"></script>\n<script src="lyco/diagnostics-ui.js"></script>\n</body>');
// UDA reads the host desktop only. Profile-specific locale/fingerprint APIs are
// untouched, and an explicit light/dark preference still wins over the OS.
one('renderer.js', 'function systemPrefersDark() {', join(
 'function systemPrefersDark() {',
 "  const theme = window.lycoDesktopAppearance?.theme;",
 "  if (theme === 'light' || theme === 'dark') return theme === 'dark';"));
one('renderer.js', 'let uiColorMode = resolveColorMode(uiColorPreference);', join(
 'let uiColorMode = resolveColorMode(uiColorPreference);',
 "window.lycoApplySystemAppearance = () => { if (uiColorPreference === 'auto') applyColorMode('auto', false); };"));
// The count already uses the parameterized catalogue. Auto-translation must
// not restore its cached initial Chinese zero over a later English count.
one('index.html','id="profile-selection-count"','id="profile-selection-count" translate="no"');
one('index.html','<div class="group-chip-row" id="profile-group-chips"></div>',join(
 '<aside class="lyco-group-navigation" aria-label="Environment groups">',
 '<div class="lyco-group-heading"><strong data-lyco-label="groups" translate="no">分组</strong><button id="lyco-group-create" type="button" data-lyco-label="newGroup" translate="no">新建分组</button></div>',
 '<div class="group-chip-row" id="profile-group-chips"></div></aside>'));
// Respect the standard opt-out on the localized LYCO panel. The upstream
// word-substitution fallback otherwise turns complete Chinese into mixed text.
one('i18n.js',
 "    if (el.closest('script, style, code, pre, [contenteditable=\"true\"]')) return true;",
 "    if (el.closest('script, style, code, pre, [contenteditable=\"true\"], [translate=\"no\"]')) return true;");
one('renderer.js','function viewMetaFor(view) {',join(
 'function viewMetaFor(view) {',
 '  if (view === "lyco") return ["LYCO 代理与会员","代理权益、独立环境与官方结算"];'));
one('preload.js',"  getInfo: () => ipcRenderer.invoke('system:info'),",join(
 "  lycoDesktopAppearance: () => ipcRenderer.invoke('lyco:desktop-appearance'),",
 "  lycoCreateProfile: () => ipcRenderer.invoke('lyco:create-profile'),",
 "  lycoCopyExtension: () => ipcRenderer.invoke('lyco:copy-extension'),",
 "  lycoStatus: () => ipcRenderer.invoke('lyco:status'),",
 "  lycoLogin: (params) => ipcRenderer.invoke('lyco:login', params),",
 "  lycoRefresh: () => ipcRenderer.invoke('lyco:refresh'),",
 "  lycoLogout: () => ipcRenderer.invoke('lyco:logout'),",
 "  lycoConnect: () => ipcRenderer.invoke('lyco:connect'),",
 "  lycoDisconnect: () => ipcRenderer.invoke('lyco:disconnect'),",
 "  lycoChooseCore: () => ipcRenderer.invoke('lyco:choose-core'),",
 "  lycoOpenShop: () => ipcRenderer.invoke('lyco:open-shop'),",
 "  lycoOpenAccount: () => ipcRenderer.invoke('lyco:open-account'),",
 "  getInfo: () => ipcRenderer.invoke('system:info'),"));
one('main.js',"const { randomUUID } = require('crypto');",join(
 "const { randomUUID } = require('crypto');",
 "const { LycoNetwork, SHOP: LYCO_SHOP, ACCOUNT: LYCO_ACCOUNT } = require('./lyco/network');",
 "const { LycoProfiles } = require('./lyco/profiles');",
 "const lycoDesktopAppearance = require('./lyco/desktop-appearance').createDesktopAppearance({directory: path.join(__dirname, 'lyco')});",
 "let lycoProfiles = null;",
 "let lycoNetwork = null;"));
one('main.js','app.whenReady().then(async () => {',join(
 'app.whenReady().then(async () => {',
 '  lycoNetwork = new LycoNetwork({',
 "    dataDir: app.getPath('userData'),",
 "    bundledCore: path.join(__dirname, 'lyco', 'core', process.platform === 'win32' ? 'mihomo.exe' : 'mihomo'),",
 '  });'));
one('main.js',"  registerTrustedIpc('app:open-github', async () => {",join(
 "  registerTrustedIpc('lyco:desktop-appearance', () => lycoDesktopAppearance());",
 "  registerTrustedIpc('lyco:status', () => lycoNetwork.status());",
 "  registerTrustedIpc('lyco:login', (_event, credentials) => lycoProfiles.login(credentials || {}));",
 "  registerTrustedIpc('lyco:refresh', () => lycoNetwork.refresh());",
 "  registerTrustedIpc('lyco:logout', () => lycoProfiles.disconnect({logout:true}));",
 "  registerTrustedIpc('lyco:connect', () => lycoNetwork.connect());",
 "  registerTrustedIpc('lyco:disconnect', () => lycoProfiles.disconnect());",
 "  registerTrustedIpc('lyco:create-profile', () => lycoProfiles.create());",
 "  registerTrustedIpc('lyco:copy-extension', async () => {",
 "    const connection = await lycoNetwork.extensionConnection();",
 "    require('electron').clipboard.writeText(JSON.stringify(connection));",
 "    return {ok:true};",
 "  });",
 "  registerTrustedIpc('lyco:choose-core', async () => {",
 '    const choice = await dialog.showOpenDialog(mainWindow, {',
 "      title: '选择官方 Mihomo 代理内核',",
 "      filters: process.platform === 'win32' ? [{name:'Mihomo',extensions:['exe']}] : [],",
 "      properties:['openFile'],",
 '    });',
 '    if (choice.canceled || !choice.filePaths?.length) return lycoNetwork.status();',
 '    return lycoNetwork.selectCore(choice.filePaths[0]);',
 '  });',
 "  registerTrustedIpc('lyco:open-shop', () => shell.openExternal(LYCO_SHOP));",
 "  registerTrustedIpc('lyco:open-account', () => shell.openExternal(LYCO_ACCOUNT));",
 "  registerTrustedIpc('app:open-github', async () => {"));
one('main.js','.then(() => localSettingsWriter.flushNow())',join(
 '.then(() => localSettingsWriter.flushNow())',
 '    .then(() => lycoNetwork?.disconnect())'));
console.log('LYCO overlay applied to pinned upstream');

// Protect only LYCO owned proxy windows from the upstream local-host bypass.
// Preserve unowned/manual profiles and legacy local start pages.
one('engine.js',
 "const { BrowserKernelManager, ensureKernelReadyForLaunch } = require('./automation/browser-kernel');",
 join("const { BrowserKernelManager, ensureKernelReadyForLaunch, isWayfernKernel } = require('./automation/browser-kernel');",
 "const { prepareNativeIdentity, nativeRuntimeFingerprint } = require('./lyco/native-identity');",
 "const { openPreparedStartupPages } = require('./lyco/startup-pages');",
 "const { openSavedSession, prepareSessionBridge } = require('./lyco/session-restore');",
 "const { createPausedTabGate, createDocumentStartGuard, observeExecutionContexts, hasDefaultExecutionContext } = require('./lyco/new-tab-gate');"));
// The owning connection already handles its Workers. Do not inject module-wide
// latestFingerprint into the privileged local session service (or other profiles).
one('engine.js', "        if (sessionId && targetInfo.type === 'service_worker') {",
 "        if (sessionId && targetInfo.type === 'service_worker' && !options.lycoOwnWorkerEvents) {");
one('engine.js', '      onEvent: onAttached,', '      onEvent: onAttached,\n      lycoOwnWorkerEvents: true,');
// Use tab-level attachment only for native session restoration: those pages
// cannot answer early direct-page commands. Ordinary launches retain the
// original direct Page pause. A Tab pause alone did not reliably stop a new
// renderer's first script in packaged Actions39410773730.
one('engine.js',
 '      await connection.command(\'Target.setAutoAttach\', {\n        autoAttach: true,\n        waitForDebuggerOnStart: true,\n        flatten: true,\n      });',
 '      await connection.command(\'Target.setAutoAttach\', {\n        autoAttach: true,\n        waitForDebuggerOnStart: true,\n        flatten: true,\n        ...(item.lycoNativeIdentity && item.lycoDeferredRestore ? {filter: [{type: "browser", exclude: true}, {type: "page", exclude: true}, {type: "iframe", exclude: true}, {}]} : {}),\n      });');
one('engine.js',
 "          if (targetInfo.type === 'page' || targetInfo.type === 'iframe' || pageLikeTypes.has(targetInfo.type)) {",
 join("          if (targetInfo.type === 'tab') {",
 '            const prepared = waitingForDebugger && item.lycoNativeIdentity ? newTabGate.begin(sessionId, targetId) : null;',
 "            await connection.command('Target.setAutoAttach', {",
 '              autoAttach: true, waitForDebuggerOnStart: true, flatten: true,',
 '              filter: [{type: "browser", exclude: true}, {type: "tab", exclude: true}, {}],',
 '            }, {sessionId});',
 '            if (prepared) await prepared;',
 "          } else if (targetInfo.type === 'page' || targetInfo.type === 'iframe' || pageLikeTypes.has(targetInfo.type)) {",
 '            const parentResumed = newTabGate.whenResumed(event.sessionId);'));
one('engine.js',
 '  async applyFingerprintToSession(connection, sessionId, item, fingerprint, targetInfo = {}) {',
 join('  async applyFingerprintToSession(connection, sessionId, item, fingerprint, targetInfo = {}) {',
 '    await item?.lycoNativeIdentity?.applySession(connection, sessionId, targetInfo);'));
one('engine.js', '    const fp = fingerprint || buildFingerprint(enriched);',
 '    const fp = nativeRuntimeFingerprint(fingerprint || buildFingerprint(enriched), options.trackOn?.lycoNativeIdentity);');
one('engine.js', '    const baseFp = fingerprint || item.fingerprint || buildFingerprint(enriched);',
 '    const baseFp = nativeRuntimeFingerprint(fingerprint || item.fingerprint || buildFingerprint(enriched), item.lycoNativeIdentity);');
one('engine.js', '  async startWorkerFingerprintInjection(item, fingerprint) {', join(
 '  async startWorkerFingerprintInjection(item, fingerprint) {',
 '    fingerprint = nativeRuntimeFingerprint(fingerprint, item?.lycoNativeIdentity);'));
// Suppress only the HTML 2D/export layer actually owned by the restored native
// device. Keep original window OffscreenCanvas and Worker JS noise; neither
// Worker target supports the native protocol in the actual capability probe.
one('automation/fingerprint.js', '        hookGetAndPut(ctxProto);',
 '        if (!CFG.canvas.nativeHtmlPixels) hookGetAndPut(ctxProto);');
one('automation/fingerprint.js', '        if (canvasProto && canvasProto.toDataURL) {',
 '        if (!CFG.canvas.nativeHtmlPixels && canvasProto && canvasProto.toDataURL) {');
one('automation/fingerprint.js', '        if (canvasProto && canvasProto.toBlob) {',
 '        if (!CFG.canvas.nativeHtmlPixels && canvasProto && canvasProto.toBlob) {');
// Preserve the accepted native path for the other, not-yet-characterized
// transfer APIs; do not introduce a second noise pass through an HTML copy.
one('automation/fingerprint.js', "        if (videoFrameProto && typeof videoFrameProto.copyTo === 'function') {",
 "        if (!CFG.canvas.nativeHtmlPixels && videoFrameProto && typeof videoFrameProto.copyTo === 'function') {");
one('automation/fingerprint.js', "        if (gpuQueueProto && typeof gpuQueueProto.copyExternalImageToTexture === 'function') {",
 "        if (!CFG.canvas.nativeHtmlPixels && gpuQueueProto && typeof gpuQueueProto.copyExternalImageToTexture === 'function') {");
one('engine.js',
 "    const isWaiting = Boolean(targetInfo?.waitingForDebugger || targetInfo?.isWaiting || !targetInfo?.url || targetInfo?.url === 'about:blank');",
 join("    const isWaiting = Boolean(targetInfo?.waitingForDebugger || targetInfo?.isWaiting || !targetInfo?.url || targetInfo?.url === 'about:blank');",
 '    const needsDocumentStartGuard = Boolean(item?.lycoNativeIdentity) && isWaiting && !isSubframe;',
 // The command injects into existing default contexts and registers for all
 // future documents. Do not request a frame tree from a paused restored page:
 // the renderer may not serve that command until it has been resumed.
 '    const documentStart = createDocumentStartGuard(needsDocumentStartGuard, () => hasDefaultExecutionContext(connection, sessionId));'));
one('engine.js', '    const onAttached = (event, connection) => {', join(
 '    const onAttached = (event, connection) => {',
 '      observeExecutionContexts(connection, event);'));
one('engine.js', '        return await connection.command(method, params, { sessionId, timeout });', join(
 '        const result = await connection.command(method, documentStart.parameters(method, params), {sessionId, timeout});',
 '        documentStart.succeeded(method, result);',
 '        return result;'));
one('engine.js',
 '        if (isSubframe && /Command can only be executed on top-level targets|Cannot find default execution context/i.test(String(err?.message || err))) {',
 join('        documentStart.failed(method, err);',
 '        if (isSubframe && /Command can only be executed on top-level targets|Cannot find default execution context/i.test(String(err?.message || err))) {'));
one('engine.js',
 '    // Synchronize Blink physical layout scaling with target devicePixelRatio for desktop personas.',
 join('    documentStart.assertReady();',
 '    // Synchronize Blink physical layout scaling with target devicePixelRatio for desktop personas.'));
one('engine.js', '    const completedInitialTargets = new Set();', join(
 '    const completedInitialTargets = new Set();',
 '    const newTabGate = createPausedTabGate({onRefused: (sessionId, targetId) => {',
 '      connection.lycoIdentityRefusedSessions ||= new Set();',
 '      connection.lycoIdentityRefusedSessions.add(sessionId);',
 "      void connection.command('Target.closeTarget', {targetId}).catch(() => {});",
 '    }});'));
// Generic UA/metrics preparation may invalidate Chromium's CPU override.
// Finalize only that override after document scripts: restoring the complete
// native device here would overwrite their configured navigator properties.
one('engine.js', '    if (!item.fpAppliedTargets) item.fpAppliedTargets = new Set();', join(
 '    await item?.lycoNativeIdentity?.finalizeSession(connection, sessionId, targetInfo);',
 '    if (!item.fpAppliedTargets) item.fpAppliedTargets = new Set();'));
one('engine.js', '        const destroyedId = event.params?.targetId;', join(
 '        const destroyedId = event.params?.targetId;',
 '        newTabGate.targetClosed(destroyedId);',
 '        item.lycoPreparedPageTargets?.delete(destroyedId);',
 '        item.lycoResumedPageTargets?.delete(destroyedId);'));
one('engine.js',
 '        const detachedTargetId = event.params?.targetId || (detachedSessionId ? workerSessionToTargetId.get(detachedSessionId) : null);',
 join('        const detachedTargetId = event.params?.targetId || (detachedSessionId ? workerSessionToTargetId.get(detachedSessionId) : null);',
 '        newTabGate.fail(detachedSessionId, Error("标签调试连接已断开"));',
 '        item.lycoPreparedPageTargets?.delete(detachedTargetId);',
 '        item.lycoResumedPageTargets?.delete(detachedTargetId);'));
one('engine.js',
 'await this.applyFingerprintToSession(connection, sessionId, item, fingerprint, { ...targetInfo, waitingForDebugger });',
 'await this.applyFingerprintToSession(connection, sessionId, item, fingerprint, { ...targetInfo, waitingForDebugger: waitingForDebugger || newTabGate.has(event.sessionId) });');
one('engine.js', '            if (isInitial && !completedInitialTargets.has(targetId)) {', join(
 '            item.lycoPreparedPageTargets ||= new Set();',
 '            if (targetInfo.type === "page") item.lycoPreparedPageTargets.add(targetId);',
 '            newTabGate.ready(event.sessionId);',
 '            if (isInitial && !completedInitialTargets.has(targetId)) {'));
one('engine.js', join(
 '            if (waitingForDebugger) {',
 "              await connection.command('Runtime.runIfWaitingForDebugger', {}, { sessionId }).catch(() => {});",
 '            }',
 "          } else if (workerTypes.has(targetInfo.type) && !internalUrl.test(String(targetInfo.url || ''))) {"),
 join('            if (waitingForDebugger) {',
 "              await connection.command('Runtime.runIfWaitingForDebugger', {}, {sessionId}).catch(error => {",
 '                if (item.lycoNativeIdentity) throw error;',
 '              });',
 '            }',
 '            await parentResumed;',
 '            item.lycoResumedPageTargets ||= new Set();',
 '            if (targetInfo.type === "page") item.lycoResumedPageTargets.add(targetId);',
 "          } else if (workerTypes.has(targetInfo.type) && !internalUrl.test(String(targetInfo.url || ''))) {"));
one('engine.js', '        } catch (error) {\n          report(error, targetInfo);\n          this.emit({', join(
 '        } catch (error) {',
 '          if (item.lycoNativeIdentity && (waitingForDebugger || newTabGate.has(event.sessionId))) {',
 '            connection.lycoIdentityRefusedSessions ||= new Set();',
 '            connection.lycoIdentityRefusedSessions.add(sessionId);',
 "            void connection.command('Target.closeTarget', {targetId}).catch(() => {});",
 '          }',
 '          newTabGate.fail(sessionId, error);',
 '          newTabGate.fail(event.sessionId, error);',
 '          report(error, targetInfo);',
 '          this.emit({'));
one('engine.js',
 '        } finally {\n          if (waitingForDebugger) {\n            await connection.command(\'Runtime.runIfWaitingForDebugger\', {}, { sessionId })',
 '        } finally {\n          if (waitingForDebugger && !connection.lycoIdentityRefusedSessions?.has(sessionId)) {\n            await connection.command(\'Runtime.runIfWaitingForDebugger\', {}, { sessionId })');
one('engine.js', join(
 "            await connection.command('Runtime.runIfWaitingForDebugger', {}, { sessionId })",
 '              .catch((error) => report(error, targetInfo));'),
 join("            await connection.command('Runtime.runIfWaitingForDebugger', {}, { sessionId })",
 '              .then(() => newTabGate.resumed(sessionId))',
 '              .catch((error) => { newTabGate.fail(sessionId, error); report(error, targetInfo); });'));
one('engine.js', '      for (const extra of customStartUrls.slice(1)) args.push(extra);',
 '      // Extra URLs are opened only after the original runtime is ready.');
// Keep this inside the original injection try: injectionFailed is block-scoped.
// Run after keepDefaultTab, which intentionally closes other preexisting tabs.
one('engine.js', '      // Brand window title as 环境 N (not generic Chrome)', join(
 '    if (!restoreSession && customStartUrls.length > 1 && !item.verificationBlocked && !item.cdpError && !injectionFailed) {',
'      try {',
 '      await openPreparedStartupPages({',
 '        urls: customStartUrls.slice(1), port: item.port, connection, cdp,',
 '        assertActive: () => this.assertStartGenerationActive(profile.id, lifecycleGeneration),',
 '        isPrepared: item.lycoNativeIdentity ? id => Boolean(item.lycoPreparedPageTargets?.has(id) && item.lycoResumedPageTargets?.has(id)) : undefined,',
 '        prepare: () => this.applyRuntimeSettings(item.port, profile,',
 '          item.nativeKernelFingerprint ? fingerprintForNativeKernelInject(item.fingerprint) : item.fingerprint, {',
 '            appliedTargetIds: item.fpAppliedTargets, appliedFingerprintHash: item.fpAppliedHash,',
 '            trackOn: item, phase: "lyco-extra-startup-pages",',
 '          }),',
 '      });',
'      } catch (error) {',
'        item.lycoStartupPagesFailed = true;',
'        throw error;',
'      }',
 '    }',
'      // Brand window title as 环境 N (not generic Chrome)'));
one('engine.js', '      item.startUrl = startUrl;', join(
 '      item.startUrl = startUrl;',
 '      item.lycoDeferredRestore = lycoDeferredRestore;',
 '      try {',
 '        item.lycoNativeIdentity = await prepareNativeIdentity({',
 '          enabled: isWayfernKernel(browser), profileRoot: root, profileId: profile.id,',
 '          port: item.port, cdp, refresh: allowSeedRefresh,',
 '          deferredRestore: lycoDeferredRestore,',
 '          requireNativeFontLayout: profile.privacy.clientRects === "native",',
 '          settings: {hardwareConcurrency: fingerprint.hardwareConcurrency, deviceMemory: fingerprint.deviceMemory,',
 '            ...(fingerprint.webgl?.mode !== "blocked" && ["noise", "custom"].includes(fingerprint.webgl?.metaMode)',
 '              ? {webglVendor: fingerprint.webgl.vendor, webglRenderer: fingerprint.webgl.renderer} : {}),',
 '            languages: profile.privacy.languageMode === "real" ? undefined : fingerprint.languages,',
 '            timezone: profile.privacy.timezoneMode === "real" ? undefined : fingerprint.timezone},',
 '        });',
 '      } catch (error) {',
 '        item.lycoNativeIdentityFailed = true;',
 '        item.verificationBlocked = true;',
 '        throw error;',
 '      }'));
// A restored page can run while the original engine is still connecting CDP.
// Bring up the same kernel/profile without windows, install its original
// page/worker auto-attach handling, then request Chromium's own session service.
one('engine.js', '    const restoreSession = profile.advanced.tabMode === \'restore\' || profile.advanced.restoreSession;', join(
 '    const restoreSession = profile.advanced.tabMode === \'restore\' || profile.advanced.restoreSession;',
 '    const lycoDeferredRestore = Boolean(restoreSession && isWayfernKernel(browser));'));
one('engine.js', '    const finalArgs = loadPaths.length ? mergeLoadExtensionArgs(args, loadPaths) : args;', join(
 '    const lycoSessionBridge = lycoDeferredRestore ? await prepareSessionBridge(root) : null;',
 '    if (lycoSessionBridge) loadPaths.push(lycoSessionBridge.directory);',
 '    const finalArgs = loadPaths.length ? mergeLoadExtensionArgs(args, loadPaths) : args;'));
one('engine.js', "    if (restoreSession) args.push('--restore-last-session');",
 "    if (lycoDeferredRestore) args.push('--no-startup-window');\n    else if (restoreSession) args.push('--restore-last-session');");
one('engine.js', '      const injectionFailed = !injectSucceeded || !workerSucceeded;', join(
 '      if (lycoDeferredRestore && injectSucceeded && workerSucceeded) {',
 '        try {',
 '          await openSavedSession({bridge: lycoSessionBridge, port: item.port, cdp,',
 '            assertActive: () => {',
 '              this.assertStartGenerationActive(profile.id, lifecycleGeneration);',
 '              if (item.cleanedUp || item.stopping || item.childExitState?.exited) throw Error("会话恢复时环境已关闭");',
 '            },',
 '            isPrepared: () => Boolean(item.lycoNativeIdentity && item.workerFingerprintConnection?.opened && !item.workerFingerprintConnection.closed && item.workerFingerprintConnection === item.workerFingerprintConnectionReady),',
 '            isPagePrepared: id => Boolean(item.lycoPreparedPageTargets?.has(id) && item.lycoResumedPageTargets?.has(id)),',
 '            hasPreparedPage: exclude => Boolean([...item.lycoPreparedPageTargets || []].some(id => id !== exclude && item.lycoResumedPageTargets?.has(id))),',
 '          });',
 '        } catch (error) { item.lycoNativeIdentityFailed = true; throw error; }',
 '      }',
 '      const injectionFailed = !injectSucceeded || !workerSucceeded;'));
one('engine.js', '    item.workerFingerprintConnection = connection;\n    return connection;',
 '    item.workerFingerprintConnection = connection;\n    item.workerFingerprintConnectionReady = connection;\n    return connection;');
// The upstream inner catch normally attempts a last-chance navigation. A
// rejected identity must reach the existing outer cleanup, never that fallback.
one('engine.js', '      item.cdpError = error.message;', join(
 '      if (item.lycoNativeIdentityFailed || item.lycoStartupPagesFailed) throw error;',
 '      item.cdpError = error.message;'));
one('engine.js',
 '    const tabs = await cdp.tabs(port);',
 join('    const tabs = await cdp.tabs(port);',
 '    await options.trackOn?.lycoNativeIdentity?.apply(tabs, options.trackOn?.fpAppliedTargets);'));
one('engine.js',
 "      let bypass = '<-loopback>;127.0.0.1;localhost';",
 "      let bypass = this.lycoIsManagedProfile?.(profile) ? '<-loopback>' : '<-loopback>;127.0.0.1;localhost';");
// Pinned upstream declares browser inside try, but references it from catch.
// Preserve the real startup failure and cleanup instead of masking it with a
// ReferenceError on every failed launch (including failures before selection).
one('engine.js','    let liveItem = null;','    let liveItem = null;\n    let browser = null;');
one('engine.js','    const browser = this.chooseBrowser(profile);','    browser = this.chooseBrowser(profile);');
one('engine.js',"      const kernelVer = browser?.version || (isOpenBrowser148(browser) ? '148' : 'system');",
 "      const kernelVer = browser?.version || (browser && isOpenBrowser148(browser) ? '148' : 'system');");

one('main.js',"  engine = new BrowserEngine(app, { profileDataRoot: localSettings.profileDataRoot });",join(
 "  engine = new BrowserEngine(app, { profileDataRoot: localSettings.profileDataRoot });",
 "  lycoProfiles = new LycoProfiles({network:lycoNetwork,engine,proxyStore:()=>automation?.proxyStore,dataDir:app.getPath('userData'),layoutPolicy:()=>require('./automation/browser-kernel').isWayfernKernel(engine.browserSelection()?.browser||{})?'native':'noise'});"));
one('renderer.js','function renderProfiles() {',join(
 'function lycoPreferredGroup() {',
 "  return activeGroupFilter === 'ungrouped' ? UNGROUPED_ID : (findGroup(activeGroupFilter)?.id || listGroups()[0]?.id || UNGROUPED_ID);",
 '}',
 'window.lycoWorkbenchActions = {',
 '  createGroup: () => openGroupDialog(null),',
 '  start: id => startProfile(id), stop: id => stopProfile(id),',
 '  edit: id => openProfileEditor(id), clone: id => cloneProfile(id),',
 '  running: id => Boolean(profileEngine(id).running),',
 '};',
 'window.adoptLycoProfile = function(profile) {',
 '  if (!profile || !profile.id) throw Error("创建环境未返回有效标识");',
 '  const index=ui.profiles.findIndex(p=>p.id===profile.id);',
 '  if (index < 0 && !profile.groupId) profile = {...profile, groupId: lycoPreferredGroup()};',
 '  const value=normalizeProfileSettings(profile);',
 '  if(index<0) ui.profiles.push(value); else ui.profiles[index]=value;',
 '  ui.nextProfileNumber=Math.max(ui.nextProfileNumber||1,(Number(value.number)||0)+1);',
 '  save(); invalidateViewCache(["profiles","groups","sync","extensions","proxies"]);',
 '  renderProfiles();',
 '  return value;',
 '};',
 'function renderProfiles() {'));

// Only change the defaults at actual create entry points, not startup/migration.
for(const [header,field] of [
 ['function openCreateProfileDialog() {','profile-create-group'],
 ["$('#batch-add').addEventListener('click', () => {\n  $('#batch-add-start').value = String(nextProfileNumber());",'batch-add-group'],
]) {
 const file=path.join(app,'renderer.js');
 const source=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
 const anchor=header+"\n  fillGroupSelect($('#"+field+"'), listGroups()[0]?.id || UNGROUPED_ID);";
 if(source.split(anchor).length!==2)throw Error('Renderer group-create anchor mismatch: '+field);
 fs.writeFileSync(file,source.replace(anchor,header+"\n  fillGroupSelect($('#"+field+"'), lycoPreferredGroup());"),'utf8');
}
one('renderer.js',join("    const nameCell = document.createElement('td');",'    nameCell.append(buildEnvIdentity(profile));'),
 join("    const nameCell = document.createElement('td'); nameCell.className = 'col-name'; row.tabIndex = 0;",'    nameCell.append(buildEnvIdentity(profile));'));
one('renderer.js','    networkCell.append(networkInfo);',join(
 '    networkCell.append(networkInfo);',
 "    const compactExit = networkInfo.cloneNode(true); compactExit.classList.add('lyco-inline-exit'); proxyCell.append(compactExit);",
 "    nameCell.append(element('small', 'lyco-environment-meta', groupNameOf(profile)));"));

const icon=path.join(base,'resources','branding','icon-source.png');
fs.copyFileSync(icon,path.join(app,'assets','logo.png'));
// Upstream's native window/dock code still reads this legacy asset name.
fs.copyFileSync(icon,path.join(app,'assets','logo-pixel.png'));
for(const name of ['icon-source.json','ICON-LICENSE.md']) {
 fs.copyFileSync(path.join(base,'resources','branding',name),path.join(app,'lyco',name));
}
require('./brand-windows-installer')(app);
