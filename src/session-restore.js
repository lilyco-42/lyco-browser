'use strict';
const path = require('node:path');

// Chromium's ordinary process-singleton command opens the saved session only
// after the already-running browser has its page auto-attach protection ready.
// Do not read/rewrite Sessions, enumerate URLs, reload pages or replay scripts.
async function openSavedSession({binary, root, spawn, assertActive, isPrepared, hasPreparedPage, timeoutMs = 15000}) {
  if (!path.isAbsolute(binary || '') || !path.isAbsolute(root || '') || typeof spawn !== 'function'
      || typeof assertActive !== 'function' || typeof isPrepared !== 'function'
      || typeof hasPreparedPage !== 'function' || !(timeoutMs > 0 && timeoutMs <= 30000)) {
    throw Error('会话恢复参数无效，环境未启动');
  }
  assertActive();
  if (!isPrepared()) throw Error('会话恢复保护尚未就绪，环境未启动');
  const args = [`--user-data-dir=${root}`, '--profile-directory=Default', '--restore-last-session',
    '--no-first-run', '--no-default-browser-check'];
  const child = spawn(binary, args, {windowsHide: true, stdio: 'ignore'});
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('会话恢复请求超时，环境未启动')), timeoutMs);
      const finish = (error) => {clearTimeout(timer); child.removeListener('error', onError); child.removeListener('exit', onExit); error ? reject(error) : resolve();};
      const onError = () => finish(Error('无法打开已保存的会话，环境未启动'));
      const onExit = (code, signal) => finish(code === 0 && !signal ? null : Error('内核未接受会话恢复请求，环境未启动'));
      child.once('error', onError); child.once('exit', onExit);
    });
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      assertActive();
      if (!isPrepared()) throw Error('会话恢复保护已断开，环境未启动');
      if (hasPreparedPage()) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw Error('恢复页面未完成身份准备，环境未启动');
  } finally {
    // Only this short-lived singleton notification child; the engine owns the
    // actual browser lifecycle and its existing cleanup handles any failure.
    if (child.exitCode == null && child.signalCode == null) child.kill();
  }
}

module.exports = {openSavedSession};
