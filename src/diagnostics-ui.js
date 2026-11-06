'use strict';
(() => {
  const labels = {
    'zh-CN': {entry: '环境检测', title: '检查正在运行的环境', hint: '检测网页会在所选环境中打开，沿用它的代理、语言和时区。',
      environment: '选择运行环境', choose: '请选择环境', empty: '暂无可检测的环境，请先启动一个环境。', close: '关闭',
      claude: 'Claude IP 检测', gpt: 'GPT / Codex IP 检测', dns: 'DNS 泄露检测', webrtc: 'WebRTC 泄露检测',
      opening: '正在打开检测页…', opened: '已在所选环境打开检测页。请在该环境查看原始结果。',
      note: '检测由 Net.Coffee 提供，结果仅供诊断，不代表服务商的账号准入结论。',
      support: 'Claude / Google Play 订阅帮助',
      purchaseHint: 'Google Play 内购需在 Claude 官方 Android 应用完成。付款前核对 Claude 账号、Google Play 账号及已有订阅；已扣款未到账时，先核对原订单并联系官方支持。',
      verificationHint: '网络检测无法确认账号审核或支付验证是否通过。设备认证和身份验证由平台决定，请按官方流程处理。选择运行环境后可打开以下官方帮助。',
      subscribe: '官方 Android 订阅流程', payments: 'Google Play 付款问题',
      certification: 'Google Play 设备认证', verification: 'Claude 身份验证说明',
      supportOpening: '正在打开官方帮助…', supportOpened: '已在所选环境打开官方帮助。',
      NOT_RUNNING: '该环境尚未运行或已停止。请先启动环境，再重新打开检测。',
      NO_TARGET: '环境已变化，未打开页面。请重新选择正在运行的环境。', BUSY: '正在打开页面，请稍候。', error: '未能打开检测页，请检查环境状态。'},
    en: {entry: 'Environment checks', title: 'Inspect a running environment', hint: 'Pages open inside your selected environment, using its proxy, language and timezone.',
      environment: 'Running environment', choose: 'Choose an environment', empty: 'No environment is ready. Start one first.', close: 'Close',
      claude: 'Claude IP', gpt: 'GPT / Codex IP', dns: 'DNS leaks', webrtc: 'WebRTC leaks',
      opening: 'Opening diagnostic page…', opened: 'Opened in the selected environment. View the original results there.',
      note: 'Diagnostics are provided by Net.Coffee. Results do not determine account eligibility.',
      support: 'Claude / Google Play subscription help',
      purchaseHint: 'Google Play purchases use the official Claude Android app. Check your Claude account, Google Play account and existing subscriptions before paying. If charged without access, check the original order and contact official support first.',
      verificationHint: 'Network checks cannot confirm account approval or payment verification. Device certification and identity verification are determined by the platforms. Follow their official process. Select a running environment to open the help pages below.',
      subscribe: 'Official Android subscription steps', payments: 'Google Play payment issues',
      certification: 'Google Play device certification', verification: 'Claude identity verification',
      supportOpening: 'Opening official help…', supportOpened: 'Opened official help in the selected environment.',
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
    '<details id="lyco-subscription-help"><summary data-diagnostics-label="support"></summary>' +
    '<p data-diagnostics-label="purchaseHint"></p><p data-diagnostics-label="verificationHint"></p>' +
    '<div class="lyco-support-grid"></div></details>' +
    '<p id="lyco-diagnostics-feedback" role="status" aria-live="polite"></p></div>' +
    '<footer><p data-diagnostics-label="note"></p><button type="button" id="lyco-diagnostics-close"></button></footer>';
  document.body.append(dialog);
  const select = dialog.querySelector('select'), feedback = dialog.querySelector('#lyco-diagnostics-feedback');
  const syncSelect = () => {if(typeof syncThemedSelect === 'function') syncThemedSelect(select);};
  const buttons = [];
  let busy = false;
  const status = (key, error = false) => {feedback.textContent = t(key); feedback.dataset.error = String(error);};
  function addButton(key, support) {
    const button = document.createElement('button'); button.type = 'button';
    button.dataset[support ? 'supportTarget' : 'diagnosticsTarget'] = key;
    button.id = (support ? 'lyco-support-' : 'lyco-diagnostics-') + key; button.className = 'outline'; buttons.push(button);
    button.onclick = async () => {
      if(busy) return;
      busy = true; buttons.forEach(item => item.disabled = true); select.disabled = true; syncSelect();
      status(support ? 'supportOpening' : 'opening'); feedback.dataset.opened = '';
      try {
        await (support ? controller.openSupport : controller.open)(select.value, key);
        status(support ? 'supportOpened' : 'opened'); feedback.dataset.opened = (support ? 'support:' : '') + key;
      }
      catch(error) {status(Object.hasOwn(labels.en, error?.code) ? error.code : 'error', true);}
      finally {busy = false; select.disabled = false; syncSelect(); buttons.forEach(item => item.disabled = !select.value);}
    };
    dialog.querySelector(support ? '.lyco-support-grid' : '.lyco-diagnostics-grid').append(button);
  }
  for(const key of Object.keys(window.LycoDiagnostics.targets)) addButton(key, false);
  for(const key of Object.keys(window.LycoDiagnostics.supportTargets)) addButton(key, true);
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
    buttons.forEach(button => button.textContent = t(button.dataset.diagnosticsTarget || button.dataset.supportTarget));
    const placeholder = select.querySelector('option[value=""]'); if(placeholder) placeholder.textContent = t('choose');
    select.setAttribute('aria-label', t('environment'));
    syncSelect();
  }
  translate(); window.OpenBrowserI18n?.onChange(translate);
})();
