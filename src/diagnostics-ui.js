'use strict';
(() => {
  const labels = {
    'zh-CN': {entry: '环境检测', title: '检查正在运行的环境', hint: '检测网页会在所选环境中打开，沿用它的代理、语言和时区。',
      environment: '选择运行环境', choose: '请选择环境', empty: '暂无可检测的环境，请先启动一个环境。', close: '关闭',
      claude: 'Claude IP 检测', gpt: 'GPT / Codex IP 检测', dns: 'DNS 泄露检测', webrtc: 'WebRTC 泄露检测',
      opening: '正在打开检测页…', opened: '已在所选环境打开检测页。请在该环境查看原始结果。',
      note: '检测由 Net.Coffee 提供，结果仅供诊断，不代表服务商的账号准入结论。',
      NOT_RUNNING: '该环境尚未运行或已停止。请先启动环境，再重新打开检测。',
      NO_TARGET: '环境已变化，未打开页面。请重新选择正在运行的环境。', BUSY: '正在打开页面，请稍候。', error: '未能打开检测页，请检查环境状态。'},
    en: {entry: 'Environment checks', title: 'Inspect a running environment', hint: 'Pages open inside your selected environment, using its proxy, language and timezone.',
      environment: 'Running environment', choose: 'Choose an environment', empty: 'No environment is ready. Start one first.', close: 'Close',
      claude: 'Claude IP', gpt: 'GPT / Codex IP', dns: 'DNS leaks', webrtc: 'WebRTC leaks',
      opening: 'Opening diagnostic page…', opened: 'Opened in the selected environment. View the original results there.',
      note: 'Diagnostics are provided by Net.Coffee. Results do not determine account eligibility.',
      NOT_RUNNING: 'This environment is not running. Start it and reopen these checks.',
      NO_TARGET: 'The environment changed. Select a running environment again.', BUSY: 'A page is already opening.', error: 'Could not open the page. Check the environment status.'},
  };
  const t = key => (labels[window.OpenBrowserI18n?.getLocale()] || labels.en)[key];
  const controller = window.LycoDiagnostics.create({getProfiles: () => window.ops.profileStatus(),
    openTab: (ids, action, payload) => window.ops.tabAction(ids, action, payload)});
  const entry = document.createElement('button'); entry.type = 'button'; entry.className = 'outline';
  entry.id = 'lyco-check-environment'; entry.translate = false;
  entry.setAttribute('aria-haspopup', 'dialog'); entry.setAttribute('aria-controls', 'lyco-diagnostics-dialog');
  document.querySelector('#view-profiles .profile-primary-toolbar .toolbar-left').append(entry);
  const dialog = document.createElement('dialog'); dialog.id = 'lyco-diagnostics-dialog'; dialog.className = 'lyco-diagnostics-dialog';
  dialog.setAttribute('translate', 'no'); dialog.setAttribute('aria-labelledby', 'lyco-diagnostics-title');
  dialog.setAttribute('aria-describedby', 'lyco-diagnostics-hint');
  dialog.innerHTML = '<header><h2 id="lyco-diagnostics-title"></h2><p id="lyco-diagnostics-hint" data-diagnostics-label="hint"></p></header>' +
    '<div class="lyco-diagnostics-body"><label for="lyco-diagnostics-profile" data-diagnostics-label="environment"></label>' +
    '<select id="lyco-diagnostics-profile"></select><div class="lyco-diagnostics-grid"></div>' +
    '<p id="lyco-diagnostics-feedback" role="status" aria-live="polite"></p></div>' +
    '<footer><p data-diagnostics-label="note"></p><button type="button" id="lyco-diagnostics-close"></button></footer>';
  document.body.append(dialog);
  const select = dialog.querySelector('select'), feedback = dialog.querySelector('#lyco-diagnostics-feedback');
  const syncSelect = () => {if(typeof syncThemedSelect === 'function') syncThemedSelect(select);};
  const buttons = [];
  let busy = false;
  const status = (key, error = false) => {feedback.textContent = t(key); feedback.dataset.error = String(error);};
  for(const key of Object.keys(window.LycoDiagnostics.targets)) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.diagnosticsTarget = key;
    button.id = 'lyco-diagnostics-' + key; button.className = 'outline'; buttons.push(button);
    button.onclick = async () => {
      if(busy) return;
      busy = true; buttons.forEach(item => item.disabled = true); select.disabled = true; syncSelect();
      status('opening'); feedback.dataset.opened = '';
      try {await controller.open(select.value, key); status('opened'); feedback.dataset.opened = key;}
      catch(error) {status(Object.hasOwn(labels.en, error?.code) ? error.code : 'error', true);}
      finally {busy = false; select.disabled = false; syncSelect(); buttons.forEach(item => item.disabled = !select.value);}
    };
    dialog.querySelector('.lyco-diagnostics-grid').append(button);
  }
  select.onchange = () => {buttons.forEach(button => button.disabled = busy || !select.value);};
  const close = dialog.querySelector('#lyco-diagnostics-close'); close.onclick = () => dialog.close();
  entry.onclick = async () => {
    if(dialog.open) return;
    entry.disabled = true;
    try {
      const previous = select.value, rows = await controller.available();
      select.replaceChildren(new Option(t('choose'), ''));
      for(const row of rows) select.append(new Option(row.label, row.id));
      if(rows.some(row => row.id === previous)) select.value = previous;
      select.disabled = busy; syncSelect();
      buttons.forEach(button => button.disabled = busy || !select.value);
      feedback.textContent = rows.length ? '' : t('empty'); feedback.dataset.opened = '';
      dialog.showModal(); (dialog.querySelector('#lyco-diagnostics-profile-button') || select).focus();
    } catch {feedback.textContent = t('error'); dialog.showModal();}
    finally {entry.disabled = false;}
  };
  dialog.addEventListener('close', () => {if(typeof closeSelectMenu === 'function') closeSelectMenu(); entry.focus();});
  function translate() {
    entry.textContent = t('entry'); close.textContent = t('close');
    dialog.querySelector('h2').textContent = t('title');
    dialog.querySelectorAll('[data-diagnostics-label]').forEach(node => node.textContent = t(node.dataset.diagnosticsLabel));
    buttons.forEach(button => button.textContent = t(button.dataset.diagnosticsTarget));
    const placeholder = select.querySelector('option[value=""]'); if(placeholder) placeholder.textContent = t('choose');
    select.setAttribute('aria-label', t('environment'));
    syncSelect();
  }
  translate(); window.OpenBrowserI18n?.onChange(translate);
})();
