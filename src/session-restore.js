'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {generateKeyPairSync, createPublicKey, createHash, randomUUID} = require('node:crypto');

// Local sessions-only extension: no hosts, content scripts, external messages,
// cookies, network permission or public control endpoint.
const background = `'use strict';
chrome.runtime.onInstalled.addListener(() => {});
chrome.runtime.onStartup.addListener(() => {});
// Registering the native event router loads the previous session entries.
// getRecentlyClosed alone only reads the service's current in-memory list.
chrome.sessions.onChanged.addListener(() => {});
globalThis.lycoRestoreSavedWindow = async function () {
  let windows = [];
  const deadline = Date.now() + 5000;
  do {
    const entries = await chrome.sessions.getRecentlyClosed({maxResults: 25});
    windows = entries.filter(entry => entry.window && typeof entry.window.sessionId === 'string');
    if (windows.length) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  windows.sort((left, right) => right.lastModified - left.lastModified);
  if (!windows.length) return {restored: false, reason: 'no-closed-window'};
  const restored = await chrome.sessions.restore(windows[0].window.sessionId);
  return {restored: Boolean(restored && restored.window),
    tabCount: Array.isArray(restored?.window?.tabs) ? restored.window.tabs.length : 0};
};
`;

async function prepareSessionBridge(root) {
  if (!path.isAbsolute(root || '')) throw Error('会话恢复目录无效');
  const directory = path.join(await fs.realpath(root), 'LycoSessionRestore');
  await fs.mkdir(directory, {recursive: true, mode: 0o700});
  const info = await fs.lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw Error('会话恢复组件目录无效');
  let key;
  try {
    key = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8')).key;
    if (typeof key !== 'string' || !key || key.length > 8192) throw Error('Invalid local extension key');
  }
  catch (error) { if (error.code !== 'ENOENT') throw Error('会话恢复组件标识损坏，请恢复环境备份'); }
  if (key === undefined) {
    // Only a public key identifies the unpacked per-profile extension.
    // No signing private key, credential or shared installation ID is stored.
    key = generateKeyPairSync('rsa', {modulusLength: 2048}).publicKey.export({type: 'spki', format: 'der'}).toString('base64');
  }
  let publicKey;
  try { publicKey = createPublicKey({key: Buffer.from(key, 'base64'), type: 'spki', format: 'der'}).export({type: 'spki', format: 'der'}); }
  catch { throw Error('会话恢复组件标识无效'); }
  const id = createHash('sha256').update(publicKey).digest('hex').slice(0, 32)
    .replace(/[0-9a-f]/g, digit => String.fromCharCode(97 + parseInt(digit, 16)));
  const manifest = {manifest_version: 3, name: 'LYCO 会话恢复', version: '1.0.0', key,
    description: '仅在本机恢复当前独立环境关闭的窗口，不上传浏览记录。',
    permissions: ['sessions'], background: {service_worker: 'restore.js'}};
  for (const [name, content] of [['manifest.json', JSON.stringify(manifest)], ['restore.js', background]]) {
    const temporary = path.join(directory, name + '.' + randomUUID() + '.tmp');
    try { await fs.writeFile(temporary, content, {flag: 'wx', mode: 0o600}); await fs.rename(temporary, path.join(directory, name)); }
    finally { await fs.rm(temporary, {force: true}).catch(() => {}); }
  }
  return {directory, workerUrl: `chrome-extension://${id}/restore.js`};
}

// Use the real session service after the original page preparation connection
// is ready. No Sessions rewriting or recreating pages from a list of URLs.
async function openSavedSession({bridge, port, cdp, assertActive, isPrepared, hasPreparedPage, timeoutMs = 15000}) {
  if (!/^chrome-extension:\/\/[a-p]{32}\/restore\.js$/.test(bridge?.workerUrl || '')
      || !Number.isInteger(port) || port < 1024 || port > 65535 || !cdp?.PersistentConnection
      || typeof assertActive !== 'function' || typeof isPrepared !== 'function'
      || typeof hasPreparedPage !== 'function' || !(timeoutMs > 0 && timeoutMs <= 30000)) throw Error('会话恢复参数无效');
  assertActive();
  if (!isPrepared()) throw Error('会话恢复保护尚未就绪，环境未启动');
  let connection, sessionId, bootstrapId;
  try {
    const deadline = Date.now() + timeoutMs;
    let target;
    while (Date.now() < deadline) {
      assertActive();
      if (!isPrepared()) throw Error('会话恢复保护已断开');
      const matches = (await cdp.targets(port)).filter(row => row.type === 'service_worker' && row.url === bridge.workerUrl);
      if (matches.length > 1) throw Error('会话恢复组件存在重复目标');
      if (matches.length === 1) {target = matches[0]; break;}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!target) throw Error('会话恢复组件尚未就绪');
    const socket = await cdp.browserSocket(port), endpoint = new URL(socket);
    if (endpoint.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(endpoint.hostname)
        || Number(endpoint.port) !== port || endpoint.username || endpoint.password
        || !endpoint.pathname.startsWith('/devtools/browser/')) throw Error('会话恢复调试地址无效');
    // Callback-free: do not install the engine's global Worker wrapper on a
    // second connection or interfere with its paused page preparation.
    connection = await new cdp.PersistentConnection(socket).open(3000);
    const attached = await connection.command('Target.attachToTarget', {targetId: target.targetId || target.id, flatten: true});
    sessionId = attached?.sessionId;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId || '')) throw Error('会话恢复组件连接失败');
    let ready = false;
    while (Date.now() < deadline) {
      assertActive();
      if (!isPrepared()) throw Error('会话恢复保护已断开');
      const result = await connection.command('Runtime.evaluate',
        {expression: 'typeof globalThis.lycoRestoreSavedWindow === "function"', returnByValue: true}, {sessionId, timeout: 3000});
      if (result.result?.value === true) {ready = true; break;}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!ready) throw Error('会话恢复组件初始化超时');
    assertActive();
    if (!isPrepared()) throw Error('会话恢复保护已断开');
    // The native sessions API requires a live browser/tab context even when
    // restoring a whole window. This blank context belongs to this operation,
    // opens no external URL, and is closed on every success/failure path.
    const bootstrap = await connection.command('Target.createTarget', {url: 'about:blank', newWindow: true});
    bootstrapId = bootstrap?.targetId;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(bootstrapId || '')) throw Error('会话恢复上下文创建失败');
    assertActive();
    if (!isPrepared()) throw Error('会话恢复保护已断开');
    const result = await connection.command('Runtime.evaluate',
      {expression: 'globalThis.lycoRestoreSavedWindow()', awaitPromise: true, returnByValue: true}, {sessionId, timeout: timeoutMs});
    if (result.exceptionDetails) throw Error('浏览器会话恢复接口执行失败，环境未启动');
    if (result.result?.value?.restored !== true) throw Error('没有可恢复的完整窗口，请保留环境数据');
    const pageDeadline = Date.now() + timeoutMs;
    while (Date.now() < pageDeadline) {
      assertActive();
      if (!isPrepared()) throw Error('会话恢复保护已断开');
      if (hasPreparedPage(bootstrapId)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw Error('恢复页面未完成身份准备，环境未启动');
  } finally {
    if (connection && /^[A-Za-z0-9_-]{1,128}$/.test(bootstrapId || '')) {
      await connection.command('Target.closeTarget', {targetId: bootstrapId}, {timeout: 3000}).catch(() => {});
    }
    if (connection && sessionId) await connection.command('Target.detachFromTarget', {sessionId}, {timeout: 3000}).catch(() => {});
    connection?.close();
  }
}

module.exports = {openSavedSession, prepareSessionBridge};
