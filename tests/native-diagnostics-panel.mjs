import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyNativeDiagnosticsPanel({page, report, evidence}) {
  if(process.env.GITHUB_ACTIONS !== 'true') throw Error('Diagnostic UI acceptance runs only in Actions');
  await page.locator('[data-view="profiles"]').click();
  const result = report.diagnosticsPanel = {emptyState: true, layouts: []};
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
    const layout = await panel.evaluate(element => {
      const box = node => {const r = node.getBoundingClientRect(); return {left: r.left, right: r.right, top: r.top, width: r.width};};
      return {viewport: innerWidth, panel: box(element), clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
        surface: getComputedStyle(element).backgroundColor, buttons: [...element.querySelectorAll('[data-diagnostics-target]')].map(box)};
    });
    assert.ok(layout.scrollWidth <= layout.clientWidth + 1, 'Diagnostic panel must not overflow');
    assert.ok(layout.panel.left >= 0 && layout.panel.right <= layout.viewport);
    assert.ok(layout.buttons[1].left >= layout.buttons[0].right, 'First row controls must not overlap');
    assert.ok(Math.abs(layout.buttons[2].left - layout.buttons[0].left) <= 1);
    assert.ok(layout.buttons[2].top > layout.buttons[0].top, 'Four checks must form a compact two-row grid');
    result.layouts.push({mode, ...layout});
    await page.screenshot({path: path.join(evidence, `windows-diagnostics-empty-${mode}.png`)});
    await panel.press('Escape');
    await panel.waitFor({state: 'hidden'});
    await page.waitForFunction(() => document.activeElement.id === 'lyco-check-environment');
  }
  assert.notEqual(result.layouts[0].surface, result.layouts[1].surface, 'Diagnostic panel must follow actual dark/light mode');
  report.checks.push('native-diagnostics-panel-real-empty-state-themes-and-keyboard-close');
  await page.locator('[data-view="lyco"]').click();
}
