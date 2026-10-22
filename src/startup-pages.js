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
      // Multiple about:blank targets can share a renderer. Allocating the
      // next paused blank before the owner has prepared this one can leave
      // both sessions waiting on that renderer. Keep all configured URLs,
      // but finish one target's preparation/navigation before allocating more.
      let tab;
      const deadline = Date.now() + 5000;
      do {
        assertActive();
        tab = (await cdp.tabs(port)).find(target => target.id === result.targetId);
        if (tab) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      } while (Date.now() < deadline);
      let socket;
      try { socket = new URL(tab?.webSocketDebuggerUrl); } catch { throw Error('额外启动页尚未提供调试目标'); }
      if (tab.url !== 'about:blank' || (tab.type && tab.type !== 'page') || socket.protocol !== 'ws:'
          || !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(socket.hostname)
          || Number(socket.port) !== port || socket.username || socket.password) {
        throw Error('额外启动页不是本环境的空白目标');
      }
      // Discovery is not readiness: wait for this exact owner's preparation
      // AND resume acknowledgement before a competing direct-page command.
      if (isPrepared) {
        const readyDeadline = Date.now() + 8000; // Same bounded owner barrier as new-tab-gate.
        while (!isPrepared(result.targetId)) {
          assertActive();
          if (Date.now() >= readyDeadline) throw Error('额外启动页身份准备未完成，环境未就绪');
          await new Promise(resolve => setTimeout(resolve, 25));
        }
      }
      assertActive();
      await prepare();
      assertActive();
      const navigated = await cdp.call(tab.webSocketDebuggerUrl, 'Page.navigate', {url});
      if (navigated?.errorText) throw Error('额外启动页导航失败');
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
