'use strict';
// LYCO Browser network bridge. Only invoked from trusted Electron main-process IPC.
// Billing JWT/subscription secrets never cross the renderer boundary.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

const API = 'https://lain42.top/studio/api';
const SHOP = 'https://lain42.top/shop/#proxy_1m';
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
    return { token: match[1], expires_at: item.expires_at || null };
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
  return {
    'mixed-port': port, 'allow-lan': false, 'bind-address': '127.0.0.1',
    ipv6: false, mode: 'rule', 'log-level': 'warning',
    proxies: obj.proxies, 'proxy-groups': obj['proxy-groups'],
    rules: ['DOMAIN-SUFFIX,lain42.top,DIRECT',
      'DOMAIN-SUFFIX,github.com,PROXY',
      'DOMAIN-SUFFIX,githubusercontent.com,PROXY',
      'MATCH,PROXY'],
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
  constructor({ dataDir, bundledCore, fetchFn = globalThis.fetch, spawnFn = spawn } = {}) {
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
  }
  async request(route, { body, jwt = this.token, raw = false } = {}) {
    const response = await this.fetchFn(API + route, {
      method: body ? 'POST' : 'GET',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(jwt ? { Authorization: 'Bearer ' + jwt } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      if (response.status === 401 && jwt === this.token) {
        this.token = null; this.entitlement = null; this.username = null;
        await this.disconnect();
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
    const result = await this.request('/login', { body: { username: username.trim(), password }, jwt: null });
    if (typeof result.token !== 'string' || result.token.length > 4096) throw Error('官网登录结果无效');
    await this.disconnect();
    this.token = result.token;
    return this.refresh();
  }
  async refresh() {
    if (!this.token) throw Error('请先登录网站账号');
    const me = await this.request('/me');
    this.username = typeof me.username === 'string' ? me.username : '';
    this.entitlement = extractEntitlement(me);
    if (!this.entitlement && this.child) await this.disconnect();
    return this.status();
  }
  status() {
    const connected = Boolean(this.child && this.child.exitCode === null && !this.child.killed && this.port);
    return {
      username: this.username || '', logged_in: Boolean(this.token),
      entitled: Boolean(this.entitlement), expires_at: this.entitlement?.expires_at || null,
      connected, port: connected ? this.port : null,
      has_core: Boolean(this.findCore()),
    };
  }
  findCore() {
    const opts = [this.customCore, this.bundledCore,
      process.env.LYCO_MIHOMO_PATH].filter(Boolean);
    return opts.find(p => {
      try { return path.basename(p).toLowerCase() === 'mihomo.exe' && fs.statSync(p).isFile(); }
      catch (_) { return false; }
    }) || null;
  }
  selectCore(p) {
    if (typeof p !== 'string' || path.basename(p).toLowerCase() !== 'mihomo.exe' ||
        !fs.existsSync(p) || !fs.statSync(p).isFile()) throw Error('请选择官方 Mihomo 的 mihomo.exe 文件');
    this.customCore = p;
    return this.status();
  }
  async connect() {
    if (this.status().connected) return this.status();
    if (!this.token || !this.entitlement) throw Error('需要先购买并激活 proxy_1m 代理月卡');
    if (!TOKEN_REGEX.test(this.entitlement.token)) throw Error('订阅令牌无效');
    const core = this.findCore();
    if (!core) throw Error('请先导入官方 mihomo.exe 代理内核');
    // Refresh entitlement before every connection, not only at login.
    await this.refresh();
    if (!this.entitlement) throw Error('代理权益已过期，请先续费');
    const subscription = await this.request('/sub/' + encodeURIComponent(this.entitlement.token) + '/clash', { raw: true });
    const port = await freePort();
    const config = makeConfig(subscription, port);
    const dataDir = path.join(this.dataDir, 'lyco-network');
    await fsp.mkdir(dataDir, { recursive: true, mode: 0o700 });
    const configPath = path.join(dataDir, 'config.json');
    await fsp.writeFile(configPath, JSON.stringify(config), { encoding: 'utf8', mode: 0o600 });
    this.configPath = configPath;
    const child = this.spawnFn(core, ['-f', configPath, '-d', dataDir],
      { cwd: dataDir, windowsHide: true, stdio: 'ignore' });
    this.child = child; this.port = port;
    child.on('error', () => { this.child = null; this.port = null; this.cleanupConfig().catch(() => {}); });
    child.on('exit', () => { this.child = null; this.port = null; this.cleanupConfig().catch(() => {}); });
    try {
      await waitForPort(port, child);
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
    if (this.child) {
      const child = this.child;
      this.child = null; this.port = null;
      if (child.exitCode === null) child.kill();
    }
    await this.cleanupConfig();
    return this.status();
  }
  async logout() {
    await this.disconnect();
    this.token = null; this.username = null; this.entitlement = null;
    return this.status();
  }
}
module.exports = { LycoNetwork, extractEntitlement, makeConfig, SHOP, ACCOUNT, API };
