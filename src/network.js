'use strict';
// LYCO Browser network bridge. Only invoked from trusted Electron main-process IPC.
// Billing JWT/subscription secrets never cross the renderer boundary.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

const API = 'https://lain42.top/studio/api';
const SHOP = 'https://lain42.top/vpn/#plans';
const ACCOUNT = 'https://lain42.top/account/';
const SUB_REGEX = /^https:\/\/lain42\.top\/panel\/api\/sub\/([A-Za-z0-9_-]{6,128})$/;
const TOKEN_REGEX = /^[A-Za-z0-9_-]{6,128}$/;

function extractEntitlement(me, now = Date.now()) {
  if (!me || !Array.isArray(me.entitlements)) return null;
  for (const item of me.entitlements) {
    if (item.product !== 'proxy_1m' || item.status !== 'active') continue;
    const match = SUB_REGEX.exec(item.meta?.sub_url || '');
    if (!match) continue;
    const expire = item.expires_at ? Date.parse(item.expires_at) : null;
    if (item.expires_at && (!Number.isFinite(expire) || expire <= now)) continue;
    const purchased=item.purchase_product||item.meta?.purchase_product||item.product;
    let plan_name='代理订阅';
    switch(purchased){
      case 'proxy_1m':plan_name='代理月卡';break;
      case 'proxy_3m':plan_name='代理季卡';break;
      case 'proxy_4m':plan_name='代理120天套餐';break;
      case 'proxy_1y':plan_name='代理年卡';break;
    }
    return { token: match[1], expires_at: item.expires_at || null, plan_name };
  }
  return null;
}

function makeConfig(input, port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid local port');
  const obj = typeof input === 'string' ? JSON.parse(input) : input;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) ||
      !Array.isArray(obj.proxies) || !obj.proxies.length ||
      !Array.isArray(obj['proxy-groups']) || !obj['proxy-groups'].length ||
      !obj['proxy-groups'].some(g => g?.name === 'PROXY')) {
    throw Error('订阅配置缺少合法的代理节点或 PROXY 分组');
  }
  // A managed workspace must never silently bypass its proxy exit.
  // Mihomo's COMPATIBLE empty fallback is equivalent to DIRECT.
  const bypass=new Set(['DIRECT','COMPATIBLE','PASS','PASS-RULE']);
  const isBypass=name=>typeof name==='string' && bypass.has(name.toUpperCase());
  const proxies=obj.proxies.map(node=>{
    if(!node || typeof node!=='object' || Array.isArray(node) ||
      typeof node.name!=='string' || !node.name ||
      typeof node.type!=='string' || !node.type ||
      isBypass(node.name) || ['direct','pass','dns'].includes(node.type.toLowerCase()) ||
      isBypass(node['dialer-proxy']))throw Error('订阅包含不安全的直连节点');
    return {...node};
  });
  const groups=obj['proxy-groups'].map(group=>{
    if(!group || typeof group!=='object' || Array.isArray(group) ||
      typeof group.name!=='string' || !group.name ||
      !Array.isArray(group.proxies) ||
      !group.proxies.every(name=>typeof name==='string') ||
      group.use?.length || group['include-all'] || group['include-all-proxies'] ||
      group['include-all-providers'])throw Error('订阅含无法验证的代理分组');
    const allowed=group.proxies.filter(name=>!isBypass(name));
    if(!allowed.length)throw Error('代理分组没有非直连节点');
    return {...group,proxies:allowed,'empty-fallback':'REJECT',
      'default-selected':allowed.includes(group['default-selected'])?group['default-selected']:allowed[0],
      'include-all':false,'include-all-proxies':false,'include-all-providers':false};
  });
  const known=new Set([...proxies.map(node=>node.name),...groups.map(group=>group.name),'REJECT','REJECT-DROP']);
  if(!groups.some(group=>group.name==='PROXY') ||
    groups.some(group=>group.proxies.some(name=>!known.has(name))) ||
    proxies.some(node=>node['dialer-proxy'] && !known.has(node['dialer-proxy'])))
    throw Error('订阅存在未知代理出口，拒绝降级直连');
  return {
    'mixed-port': port, 'allow-lan': false, 'bind-address': '127.0.0.1',
    ipv6: false, mode: 'rule', 'log-level': 'warning',
    proxies, 'proxy-groups':groups, rules:['MATCH,PROXY'],
  };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      s.close(err => err ? reject(err) : resolve(addr.port));
    });
  });
}

function waitForPort(port, child, timeoutMs = 10000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    function tryConnect() {
      if (child.exitCode !== null || child.killed) return reject(Error('Mihomo 内核意外退出'));
      const client = net.connect({ host: '127.0.0.1', port });
      client.setTimeout(450);
      client.once('connect', () => { client.destroy(); resolve(); });
      client.once('error', retry);
      client.once('timeout', retry);
      function retry() {
        client.destroy();
        if (Date.now() - started > timeoutMs) return reject(Error('本地代理监听超时'));
        setTimeout(tryConnect, 220);
      }
    }
    tryConnect();
  });
}

class LycoNetwork {
  constructor({ dataDir, bundledCore, fetchFn = (...args) => globalThis.fetch(...args), spawnFn = spawn } = {}) {
    if (!dataDir) throw Error('dataDir required');
    this.dataDir = dataDir;
    this.bundledCore = bundledCore || '';
    this.fetchFn = fetchFn;
    this.spawnFn = spawnFn;
    this.token = null;
    this.username = null;
    this.entitlement = null;
    this.child = null;
    this.port = null;
    this.configPath = null;
    this.customCore = null;
    this.expiryTimer = null;
    this.connecting = null;
    this.connectionEpoch = 0;
    this.authGeneration = 0;
    this.onCoreExit = null;
    this.onAuthorizationLost = null;
    this.validationTimer = null;
    this.lastVerifiedAt = 0;
  }
  async request(route, { body, jwt = this.token, raw = false } = {}) {
    const response = await this.fetchFn(API + route, {
      method: body ? 'POST' : 'GET',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(jwt ? { Authorization: 'Bearer ' + jwt } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    if (!response.ok) {
      if ((response.status === 401 || response.status === 403) && jwt && jwt === this.token) {
        this.token = null; this.entitlement = null; this.username = null;
        await this.endAuthorization();
      }
      throw Error(response.status === 401 ? '登录失败或会话已过期' :
        '官网 API 请求失败（HTTP ' + response.status + '）');
    }
    if (raw) {
      const contentLength = Number(response.headers?.get?.('content-length') || 0);
      if (contentLength > 2_000_000) throw Error('订阅配置过大');
      const txt = await response.text();
      if (txt.length > 2_000_000) throw Error('订阅配置过大');
      return txt;
    }
    return response.json();
  }
  async login({ username, password } = {}) {
    if (typeof username !== 'string' || !/^[\s\S]{3,120}$/.test(username.trim()) ||
        typeof password !== 'string' || password.length < 8 || password.length > 256) {
      throw Error('请输入合法的网站用户名与密码');
    }
    const generation = ++this.authGeneration;
    this.token = null; this.username = null; this.entitlement = null;
    await this.disconnect();
    if (generation !== this.authGeneration) throw Error('登录已取消，请重新操作');
    const result = await this.request('/login', { body: { username: username.trim(), password }, jwt: null });
    if (generation !== this.authGeneration) throw Error('登录已取消，请重新操作');
    if (typeof result.token !== 'string' || result.token.length > 4096) throw Error('官网登录结果无效');
    this.token = result.token;
    return this.refresh();
  }
  async refresh() {
    if (!this.token) throw Error('请先登录网站账号');
    const sessionToken=this.token,epoch=this.connectionEpoch;
    const me = await this.request('/me');
    if(this.token!==sessionToken || this.connectionEpoch!==epoch)throw Error('登录会话已变化，请重新操作');
    this.username = typeof me.username === 'string' ? me.username : '';
    this.lastVerifiedAt = Date.now();
    this.entitlement = extractEntitlement(me);
    if (!this.entitlement && this.child) await this.endAuthorization();
    if(this.child) this.armExpiry();
    return this.status();
  }
  armExpiry() {
    clearTimeout(this.expiryTimer);
    if(!this.entitlement?.expires_at) return;
    const remaining=Date.parse(this.entitlement.expires_at)-Date.now();
    if(!Number.isFinite(remaining) || remaining<=0) {
      void this.endAuthorization();return;
    }
    this.expiryTimer=setTimeout(()=>this.armExpiry(),Math.min(remaining,2147483647));
    this.expiryTimer.unref?.();
  }
  async endAuthorization() {
    this.entitlement = null;
    const disconnected = this.disconnect();
    // The core stops immediately; owned windows also stop when Billing revokes
    // access. Explicit core disconnect does not emit the unexpected-exit hook.
    await Promise.allSettled([disconnected, Promise.resolve().then(()=>this.onAuthorizationLost?.())]);
    return this.status();
  }
  async validateConnection() {
    const child=this.child,epoch=this.connectionEpoch;
    if(!child) return this.status();
    try { return await this.refresh(); }
    catch(error) {
      // A short API outage may recover. An unverified paid connection cannot
      // continue forever, and a late old response cannot stop a new connection.
      if(this.child===child && this.connectionEpoch===epoch && Date.now()-this.lastVerifiedAt>=300000)
        await this.endAuthorization();
      throw error;
    }
  }
  armValidation() {
    clearTimeout(this.validationTimer);
    const child=this.child;
    if(!child) return;
    this.validationTimer=setTimeout(async()=>{
      try { await this.validateConnection(); } catch (_) { /* bounded lease above */ }
      if(this.child===child) this.armValidation();
    },60000);
    this.validationTimer.unref?.();
  }
  status() {
    const connected = Boolean(this.child && this.child.exitCode === null && !this.child.killed && this.port);
    return {
      username: this.username || '', logged_in: Boolean(this.token),
      entitled: Boolean(this.entitlement), expires_at: this.entitlement?.expires_at || null,
      plan_name: this.entitlement ? this.entitlement.plan_name||'代理订阅' : null,
      connected, port: connected ? this.port : null,
      has_core: Boolean(this.findCore()),
    };
  }
  async extensionConnection() {
    const state = await this.refresh();
    if (!state.entitled || !state.connected) throw Error('请先登录有效代理订阅并连接本地代理');
    const issuedAt = Date.now();
    const expiresAt = Math.min(issuedAt + 8 * 60 * 60 * 1000,
      this.entitlement?.expires_at ? Date.parse(this.entitlement.expires_at) : Infinity);
    return {kind:'lyco-loopback-proxy',version:1,scheme:'http',host:'127.0.0.1',port:state.port,issuedAt,expiresAt};
  }
  findCore() {
    const opts = [this.customCore, this.bundledCore,
      process.env.LYCO_MIHOMO_PATH].filter(Boolean);
    return opts.find(p => {
      try { return ['mihomo.exe','mihomo'].includes(path.basename(p).toLowerCase()) && fs.statSync(p).isFile(); }
      catch (_) { return false; }
    }) || null;
  }
  selectCore(p) {
    if (typeof p !== 'string' || !['mihomo.exe','mihomo'].includes(path.basename(p).toLowerCase()) ||
        !fs.existsSync(p) || !fs.statSync(p).isFile()) throw Error('请选择官方 Mihomo 的 mihomo.exe 文件');
    this.customCore = p;
    return this.status();
  }
  connect() {
    if(this.connecting) return this.connecting;
    const pending=this.connectOnce().finally(()=>{if(this.connecting===pending)this.connecting=null;});
    this.connecting=pending;
    return pending;
  }
  async connectOnce() {
    const epoch=this.connectionEpoch;
    const stillCurrent=()=>{if(epoch!==this.connectionEpoch)throw Error('连接已取消，请重新连接');};
    if (this.status().connected) return this.status();
    if (!this.token || !this.entitlement) throw Error('需要先购买并激活代理订阅');
    if (!TOKEN_REGEX.test(this.entitlement.token)) throw Error('订阅令牌无效');
    const core = this.findCore();
    if (!core) throw Error('请先导入官方 mihomo.exe 代理内核');
    // Refresh entitlement before every connection, not only at login.
    await this.refresh();
    stillCurrent();
    if (!this.entitlement) throw Error('代理权益已过期，请先续费');
    const subscription = await this.request('/sub/' + encodeURIComponent(this.entitlement.token) + '/clash', { raw: true });
    stillCurrent();
    const port = await freePort();
    stillCurrent();
    const config = makeConfig(subscription, port);
    const dataDir = path.join(this.dataDir, 'lyco-network');
    await fsp.mkdir(dataDir, { recursive: true, mode: 0o700 });
    const configPath = path.join(dataDir, 'config.json');
    await fsp.writeFile(configPath, JSON.stringify(config), { encoding: 'utf8', mode: 0o600 });
    this.configPath = configPath;
    try {stillCurrent();}catch(error){await this.cleanupConfig();throw error;}
    const child = this.spawnFn(core, ['-f', configPath, '-d', dataDir],
      { cwd: dataDir, windowsHide: true, stdio: 'ignore' });
    this.child = child; this.port = port;
    const onGone=()=>{
      if(this.child!==child)return;
      this.child=null;this.port=null;clearTimeout(this.expiryTimer);clearTimeout(this.validationTimer);
      // Unexpected core loss closes managed windows. Explicit disconnect
      // clears this.child first, so the callback is never invoked for it.
      try { Promise.resolve(this.onCoreExit?.()).catch(()=>{}); } catch (_) {}
      this.cleanupConfig().catch(()=>{});
    };
    child.on('error',onGone);child.on('exit',onGone);
    try {
      await waitForPort(port, child);
      stillCurrent();
      this.armExpiry();
      this.armValidation();
      return this.status();
    } catch (e) {
      await this.disconnect();
      throw e;
    }
  }
  async cleanupConfig() {
    const p = this.configPath;
    this.configPath = null;
    if (p) await fsp.rm(p, { force: true }).catch(() => {});
  }
  async disconnect() {
    this.connectionEpoch++;
    clearTimeout(this.expiryTimer);this.expiryTimer=null;
    clearTimeout(this.validationTimer);this.validationTimer=null;
    if (this.child) {
      const child = this.child;
      this.child = null; this.port = null;
      if (child.exitCode === null) child.kill();
    }
    await this.cleanupConfig();
    return this.status();
  }
  async logout() {
    this.authGeneration++;
    this.token = null; this.username = null; this.entitlement = null;
    await this.disconnect();
    return this.status();
  }
}
module.exports = { LycoNetwork, extractEntitlement, makeConfig, SHOP, ACCOUNT, API };
