'use strict';

// Keep the existing engine's profile and runtime setup. Extra user URLs must
// never be process arguments: every target starts blank and is prepared first.
async function openPreparedStartupPages({urls, port, connection, cdp, prepare, isPrepared, assertActive = () => {}}) {
  if (!Array.isArray(urls) || urls.length > 19 || urls.some(url => typeof url !== 'string' || !url.trim())
      || !Number.isInteger(port) || port < 1024 || port > 65535 || typeof prepare !== 'function') {
    throw Error('额外启动页面参数无效');
  }
  const created = [];
  try {
    for (const url of urls) {
      assertActive();
      const result = await connection.command('Target.createTarget', {url: 'about:blank'});
      if (typeof result?.targetId !== 'string' || !result.targetId || created.some(row => row.id === result.targetId)) {
        throw Error('内核未创建独立的空白启动页');
      }
      created.push({id: result.targetId, url});
    }
    if (!created.length) return [];
    let targets;
    const deadline = Date.now() + 5000;
    do {
      assertActive();
      targets = await cdp.tabs(port);
      if (created.every(row => targets.some(tab => tab.id === row.id))) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    } while (Date.now() < deadline);
    const pages = created.map(row => {
      const tab = targets.find(target => target.id === row.id);
      let socket;
      try { socket = new URL(tab?.webSocketDebuggerUrl); } catch { throw Error('额外启动页尚未提供调试目标'); }
      if (tab.url !== 'about:blank' || (tab.type && tab.type !== 'page') || socket.protocol !== 'ws:'
          || !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(socket.hostname)
          || Number(socket.port) !== port || socket.username || socket.password) {
        throw Error('额外启动页不是本环境的空白目标');
      }
      return {...row, socket: tab.webSocketDebuggerUrl};
    });
    // Discovery is not readiness. The owning auto-attach session can still be
    // preparing a paused page: a second, direct page command then waits for a
    // renderer which cannot run yet. Observe the owner's preparation AND
    // resume acknowledgement before the ordinary runtime pass/navigation.
    if (isPrepared) {
      const readyDeadline = Date.now() + 8000; // Same bounded owner barrier as new-tab-gate.
      while (!created.every(row => isPrepared(row.id))) {
        assertActive();
        if (Date.now() >= readyDeadline) throw Error('额外启动页身份准备未完成，环境未就绪');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
    assertActive();
    await prepare();
    for (const page of pages) {
      assertActive();
      const result = await cdp.call(page.socket, 'Page.navigate', {url: page.url});
      if (result?.errorText) throw Error('额外启动页导航失败');
    }
    return created.map(row => row.id);
  } catch (error) {
    // Close only targets allocated by this operation. The caller retains the
    // original engine cleanup for a failed profile start.
    await Promise.allSettled(created.map(row => connection.command('Target.closeTarget', {targetId: row.id})));
    throw error;
  }
}

module.exports = {openPreparedStartupPages};
