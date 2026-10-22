'use strict';
(() => {
  let pending;
  const status = document.getElementById('lyco-desktop-status');
  const swatch = document.getElementById('lyco-desktop-accent');
  const button = document.getElementById('lyco-desktop-refresh');
  async function refresh() {
    if (pending) return pending;
    pending = (async () => {
      button.disabled = true;
      try {
        const appearance = await window.ops.lycoDesktopAppearance();
        window.lycoDesktopAppearance = appearance;
        window.lycoApplySystemAppearance();
        status.dataset.state = appearance.state;
        status.textContent = appearance.state === 'ready'
          ? `桌面已连接 · ${appearance.theme === 'dark' ? '系统深色' : appearance.theme === 'light' ? '系统浅色' : '系统外观未提供'} · 跟随系统时自动应用`
          : appearance.state === 'unsupported' ? '当前系统暂未接入桌面接口，继续使用浏览器外观设置。'
          : '桌面外观暂不可读，继续使用浏览器外观设置。';
        swatch.hidden = !appearance.accent;
        if (appearance.accent) {
          swatch.style.backgroundColor = `rgba(${appearance.accent.slice(0, 3).join(',')},${appearance.accent[3] / 255})`;
          swatch.title = '系统强调色';
        }
      } catch (_) {
        window.lycoDesktopAppearance = null;
        window.lycoApplySystemAppearance();
        status.dataset.state = 'unavailable';
        status.textContent = '桌面外观暂不可读，继续使用浏览器外观设置。';
        swatch.hidden = true;
      } finally {button.disabled = false;}
    })();
    try {await pending;} finally {pending = undefined;}
  }
  button.onclick = refresh;
  window.addEventListener('focus', refresh);
  window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener('change', refresh);
  void refresh();
})();
