import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyNativeDiagnosticsPanel({page, report, evidence}) {
  if(process.env.GITHUB_ACTIONS !== 'true') throw Error('Diagnostic UI acceptance runs only in Actions');
  await page.locator('[data-view="profiles"]').click();
  const result = report.diagnosticsPanel = {emptyState: true, layouts: []};
  const previousLocale = await page.evaluate(() => window.OpenBrowserI18n.getLocale());
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  for(const locale of ['zh-CN', 'en']) {
    await page.evaluate(value => window.OpenBrowserI18n.setLocale(value), locale);
    for(const mode of ['dark', 'light']) {
      await page.locator('#theme-trigger').click();
      await page.locator(`#theme-appearance [data-color-mode="${mode}"]`).click();
      await page.locator('#theme-trigger').click();
      await page.locator('#lyco-check-environment').click();
      const panel = page.locator('#lyco-diagnostics-dialog');
      await panel.waitFor({state: 'visible'});
      assert.equal(await panel.locator('[data-diagnostics-target]').count(), 4);
      for(const button of await panel.locator('[data-diagnostics-target]').all()) assert.equal(await button.isDisabled(), true);
      assert.ok((await panel.locator('#lyco-diagnostics-feedback').textContent()).trim());
      const help = panel.locator('#lyco-subscription-help');
      await help.locator('summary').focus(); await help.locator('summary').press('Enter');
      await page.waitForFunction(() => document.getElementById('lyco-subscription-help').open);
      assert.equal(await help.locator('[data-support-target]').count(), 4);
      for(const button of await help.locator('[data-support-target]').all()) assert.equal(await button.isDisabled(), true);
      assert.equal(await help.locator('summary').textContent(), locale === 'zh-CN' ?
        'Claude / Google Play 订阅帮助' : 'Claude / Google Play subscription help');
      assert.match(await help.locator('[data-diagnostics-label="purchaseHint"]').textContent(), locale === 'zh-CN' ? /原订单/ : /original order/);
      assert.match(await help.locator('[data-diagnostics-label="verificationHint"]').textContent(), locale === 'zh-CN' ? /无法确认/ : /cannot confirm/);
      const layout = await panel.evaluate(element => {
        const box = node => {const r = node.getBoundingClientRect(); return {left: r.left, right: r.right, top: r.top, width: r.width};};
        return {viewport: innerWidth, panel: box(element), clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
          surface: getComputedStyle(element).backgroundColor, buttons: [...element.querySelectorAll('[data-diagnostics-target]')].map(box),
          support: [...element.querySelectorAll('[data-support-target]')].map(box)};
      });
      assert.ok(layout.scrollWidth <= layout.clientWidth + 1, 'Diagnostic panel must not overflow');
      assert.ok(layout.panel.left >= 0 && layout.panel.right <= layout.viewport);
      assert.ok(layout.buttons[1].left >= layout.buttons[0].right, 'First row controls must not overlap');
      assert.ok(Math.abs(layout.buttons[2].left - layout.buttons[0].left) <= 1);
      assert.ok(layout.buttons[2].top > layout.buttons[0].top, 'Four checks must form a compact two-row grid');
      for(const button of layout.support) assert.ok(button.left >= layout.panel.left && button.right <= layout.panel.right,
        'Official help controls must stay within the panel');
      result.layouts.push({locale, mode, ...layout});
      await page.screenshot({path: path.join(evidence, `${platform}-diagnostics-empty-${locale}-${mode}.png`)});
      await help.locator('summary').click();
      await panel.press('Escape');
      await panel.waitFor({state: 'hidden'});
      await page.waitForFunction(() => document.activeElement.id === 'lyco-check-environment');
    }
  }
  await page.evaluate(value => window.OpenBrowserI18n.setLocale(value), previousLocale);
  assert.notEqual(result.layouts[0].surface, result.layouts[1].surface, 'Diagnostic panel must follow actual dark/light mode');
  report.checks.push('native-diagnostics-panel-real-empty-state-themes-and-keyboard-close');
  report.checks.push('native-official-subscription-help-both-locales-and-themes');
  await page.locator('[data-view="lyco"]').click();
}
