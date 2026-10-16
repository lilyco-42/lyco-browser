'use strict';
// Applied ONLY by GitHub Actions to the pinned upstream checkout.
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..'),app=path.resolve(process.argv[2]||path.join(base,'upstream','Browserapp'));
if(!fs.existsSync(path.join(app,'main.js'))||!fs.existsSync(path.join(app,'package.json')))throw Error('Pinned OpenBrowser source required');
function one(file,from,to){
 const p=path.join(app,file),s=fs.readFileSync(p,'utf8'),count=s.split(from).length-1;
 if(count!==1)throw Error(file+': upstream anchor mismatch: '+from.slice(0,80)+' ('+count+')');
 fs.writeFileSync(p,s.replace(from,to),'utf8');
}
const join=(...parts)=>parts.join('\n');
for(const file of ['network.js','profiles.js','view.html','ui.js']){
 const dst=path.join(app,'lyco',file);fs.mkdirSync(path.dirname(dst),{recursive:true});
 fs.copyFileSync(path.join(base,'src',file),dst);
}
fs.mkdirSync(path.join(app,'lyco','core'),{recursive:true});
fs.copyFileSync(path.join(base,'src','LICENSE-MIHOMO.txt'),path.join(app,'lyco','core','LICENSE-MIHOMO.txt'));
const view=fs.readFileSync(path.join(base,'src','view.html'),'utf8');
one('index.html','<title>OpenBrowser</title>','<title>LYCO Browser · 代理与会员</title>');
one('index.html','href="assets/logo-pixel.png?v=20261002-flat"','href="assets/logo.png"');
one('index.html','src="assets/logo-pixel.png?v=20261002-flat" alt="OpenBrowser"','src="assets/logo.png" alt="Lyco 原创角色"');
one('index.html','<strong>OpenBrowser</strong><small data-i18n="app.brand.sub">','<strong>LYCO Browser</strong><small data-i18n="app.brand.sub">');
one('index.html','href="https://github.com/sheying2013/OpenBrowser"','href="https://github.com/lilyco-42/lyco-browser"');
one('main.js',"const UPDATE_REPOSITORY = 'sheying2013/OpenBrowser';","const UPDATE_REPOSITORY = 'lilyco-42/lyco-browser';");
one('index.html','<button class="nav" data-view="proxies">',join(
 '<button class="nav" data-view="lyco" lang="zh-CN" translate="no"><i data-lucide="shield-check"></i><span>LYCO 代理与会员</span></button>',
 '<button class="nav" data-view="proxies">'));
one('index.html','<section class="view" id="view-groups">',view+'\n<section class="view" id="view-groups">');
one('index.html','</body>','<script src="lyco/ui.js"></script>\n</body>');
// Respect the standard opt-out on the localized LYCO panel. The upstream
// word-substitution fallback otherwise turns complete Chinese into mixed text.
one('i18n.js',
 "    if (el.closest('script, style, code, pre, [contenteditable=\"true\"]')) return true;",
 "    if (el.closest('script, style, code, pre, [contenteditable=\"true\"], [translate=\"no\"]')) return true;");
one('renderer.js','function viewMetaFor(view) {',join(
 'function viewMetaFor(view) {',
 '  if (view === "lyco") return ["LYCO 代理与会员","代理权益、独立环境与官方结算"];'));
one('preload.js',"  getInfo: () => ipcRenderer.invoke('system:info'),",join(
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
 "let lycoProfiles = null;",
 "let lycoNetwork = null;"));
one('main.js','app.whenReady().then(async () => {',join(
 'app.whenReady().then(async () => {',
 '  lycoNetwork = new LycoNetwork({',
 "    dataDir: app.getPath('userData'),",
 "    bundledCore: path.join(__dirname, 'lyco', 'core', process.platform === 'win32' ? 'mihomo.exe' : 'mihomo'),",
 '  });'));
one('main.js',"  registerTrustedIpc('app:open-github', async () => {",join(
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

// Pinned upstream declares browser inside try, but references it from catch.
// Preserve the real startup failure and cleanup instead of masking it with a
// ReferenceError on every failed launch (including failures before selection).
one('engine.js','    let liveItem = null;','    let liveItem = null;\n    let browser = null;');
one('engine.js','    const browser = this.chooseBrowser(profile);','    browser = this.chooseBrowser(profile);');
one('engine.js',"      const kernelVer = browser?.version || (isOpenBrowser148(browser) ? '148' : 'system');",
 "      const kernelVer = browser?.version || (browser && isOpenBrowser148(browser) ? '148' : 'system');");

one('main.js',"  engine = new BrowserEngine(app, { profileDataRoot: localSettings.profileDataRoot });",join(
 "  engine = new BrowserEngine(app, { profileDataRoot: localSettings.profileDataRoot });",
 "  lycoProfiles = new LycoProfiles({network:lycoNetwork,engine,proxyStore:()=>automation?.proxyStore,dataDir:app.getPath('userData')});"));
one('renderer.js','function renderProfiles() {',join(
 'window.adoptLycoProfile = function(profile) {',
 '  if (!profile || !profile.id) throw Error("创建环境未返回有效标识");',
 '  const index=ui.profiles.findIndex(p=>p.id===profile.id);',
 '  const value=normalizeProfileSettings(profile);',
 '  if(index<0) ui.profiles.push(value); else ui.profiles[index]=value;',
 '  ui.nextProfileNumber=Math.max(ui.nextProfileNumber||1,(Number(value.number)||0)+1);',
 '  save(); invalidateViewCache(["profiles","groups","sync","extensions","proxies"]);',
 '  renderProfiles();',
 '};',
 'function renderProfiles() {'));

const icon=path.join(base,'resources','branding','icon-source.png');
fs.copyFileSync(icon,path.join(app,'assets','logo.png'));
// Upstream's native window/dock code still reads this legacy asset name.
fs.copyFileSync(icon,path.join(app,'assets','logo-pixel.png'));
for(const name of ['icon-source.json','ICON-LICENSE.md']) {
 fs.copyFileSync(path.join(base,'resources','branding',name),path.join(app,'lyco',name));
}
