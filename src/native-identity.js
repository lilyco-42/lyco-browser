'use strict';
// The native engine owns its complete fingerprint format. Keep that payload
// opaque and private; restore it before user-page navigation, then let the
// existing profile settings and document-start overrides run as usual.
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID, createHash} = require('node:crypto');
const LIMIT = 2 * 1024 * 1024;

function fingerprint(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { throw Error('原生指纹数据格式无效，环境未启动'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) {
    throw Error('内核未返回有效原生身份，环境未启动');
  }
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded) > LIMIT) throw Error('原生身份数据超出限制，环境未启动');
  return JSON.parse(encoded);
}

async function readCache(file, profileId) {
  let info;
  try { info = await fs.lstat(file); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw Error('无法读取已保存的原生身份，请检查环境目录权限');
  }
  if (!info.isFile() || info.isSymbolicLink() || info.size > LIMIT + 4096) {
    throw Error('原生身份文件无效；不会静默生成新身份');
  }
  let record;
  try { record = JSON.parse(await fs.readFile(file, 'utf8')); } catch {
    throw Error('原生身份文件损坏；请恢复备份，不会静默生成新身份');
  }
  if (record.schema !== 1 || record.profileId !== profileId) {
    throw Error('原生身份与当前环境不匹配，环境未启动');
  }
  return fingerprint(record.fingerprint);
}

async function writeCache(file, profileId, value) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    await fs.writeFile(temporary, JSON.stringify({schema: 1, profileId, fingerprint: value}), {flag: 'wx', mode: 0o600});
    await fs.rename(temporary, file);
  } catch {
    throw Error('原生身份保存失败，环境未启动；请检查可用空间与目录权限');
  } finally {
    // A unique leaf beneath the already resolved, engine-owned profile root.
    await fs.rm(temporary, {force: true}).catch(() => {});
  }
}

function pageTargets(tabs, port) {
  return tabs.filter(tab => {
    if (!tab.webSocketDebuggerUrl || (tab.type && tab.type !== 'page')) return false;
    let endpoint;
    try { endpoint = new URL(tab.webSocketDebuggerUrl); } catch { throw Error('原生身份调试地址无效'); }
    if (endpoint.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(endpoint.hostname)
        || Number(endpoint.port) !== port || endpoint.username || endpoint.password) {
      throw Error('拒绝向非本环境的调试地址发送原生身份');
    }
    return true;
  });
}

async function prepareNativeIdentity({enabled, profileRoot, profileId, port, cdp, refresh = false}) {
  if (!enabled) return null; // Stock Chromium and legacy kernels retain their own path.
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(profileId || '') || !path.isAbsolute(profileRoot || '')
      || !Number.isInteger(port) || port < 1024 || port > 65535) throw Error('原生身份环境参数无效');
  const root = await fs.realpath(profileRoot);
  const file = path.join(root, 'lyco-native-identity-' + profileId + '.json');
  const saved = await readCache(file, profileId);
  const targets = pageTargets(await cdp.tabs(port), port);
  if (!targets.length) throw Error('内核尚未提供页面目标，原生身份未应用');
  let device = saved;
  if (!saved || refresh) {
    let result;
    try { result = await cdp.call(targets[0].webSocketDebuggerUrl, 'Wayfern.getFingerprint', {}, 5000); } catch {
      throw Error('原生身份读取失败，环境未启动；请检查已授权内核的连接');
    }
    device = fingerprint(result?.fingerprint ?? result);
    await writeCache(file, profileId, device);
  }
  const applied = new Set();
  const apply = async tabs => {
    const current = pageTargets(tabs, port);
    const live = new Set(current.map(tab => tab.webSocketDebuggerUrl));
    for (const target of applied) if (!live.has(target)) applied.delete(target);
    for (const tab of current) {
      if (applied.has(tab.webSocketDebuggerUrl)) continue;
      try { await cdp.call(tab.webSocketDebuggerUrl, 'Wayfern.setFingerprint', device, 5000); } catch {
        throw Error('原生身份恢复失败，环境未启动；已保存身份不会被重置');
      }
      applied.add(tab.webSocketDebuggerUrl);
    }
  };
  await apply(targets);
  return {digest: createHash('sha256').update(JSON.stringify(device)).digest('hex'), apply};
}

module.exports = {prepareNativeIdentity};
