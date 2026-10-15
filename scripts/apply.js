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
for(const file of ['network.js','view.html','ui.js']){
 const dst=path.join(app,'lyco',file);fs.mkdirSync(path.dirname(dst),{recursive:true});
 fs.copyFileSync(path.join(base,'src',file),dst);
}
const view=fs.readFileSync(path.join(base,'src','view.html'),'utf8');
one('index.html','<title>OpenBrowser</title>','<title>LYCO Browser · 代理与会员</title>');
one('index.html','<button class="nav" data-view="proxies">',join(
 '<button class="nav" data-view="lyco"><i data-lucide="shield-check"></i><span>LYCO 代理与会员</span></button>',
 '<button class="nav" data-view="proxies">'));
one('index.html','<section class="view" id="view-groups">',view+'\n<section class="view" id="view-groups">');
one('index.html','</body>','<script src="lyco/ui.js"></script>\n</body>');
one('renderer.js','function viewMetaFor(view) {',join(
 'function viewMetaFor(view) {',
 '  if (view === "lyco") return ["LYCO 代理与会员","代理权益、独立环境与官方结算"];'));
one('preload.js',"  getInfo: () => ipcRenderer.invoke('system:info'),",join(
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
 "let lycoNetwork = null;"));
one('main.js','app.whenReady().then(async () => {',join(
 'app.whenReady().then(async () => {',
 '  lycoNetwork = new LycoNetwork({',
 "    dataDir: app.getPath('userData'),",
 "    bundledCore: path.join(__dirname, 'lyco', 'core', 'mihomo.exe'),",
 '  });'));
one('main.js',"  registerTrustedIpc('app:open-github', async () => {",join(
 "  registerTrustedIpc('lyco:status', () => lycoNetwork.status());",
 "  registerTrustedIpc('lyco:login', (_event, credentials) => lycoNetwork.login(credentials || {}));",
 "  registerTrustedIpc('lyco:refresh', () => lycoNetwork.refresh());",
 "  registerTrustedIpc('lyco:logout', () => lycoNetwork.logout());",
 "  registerTrustedIpc('lyco:connect', () => lycoNetwork.connect());",
 "  registerTrustedIpc('lyco:disconnect', () => lycoNetwork.disconnect());",
 "  registerTrustedIpc('lyco:choose-core', async () => {",
 '    const choice = await dialog.showOpenDialog(mainWindow, {',
 "      title: '选择官方 Mihomo 代理内核',",
 "      filters: [{name:'Mihomo',extensions:['exe']}],",
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
