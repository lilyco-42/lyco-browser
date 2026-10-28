import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyNativeAccountPanel({page, report, evidence}) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw Error('Account UI acceptance only runs in Actions');
  await page.waitForFunction(() => document.getElementById('view-lyco').getAttribute('aria-busy') === 'false');
  assert.equal(await page.locator('#lyco-steps>li').count(), 4);
  assert.equal(await page.locator('#lyco-account-chip').textContent(), '待登录');
  assert.equal(await page.locator('#lyco-network-chip').textContent(), '未连接');
  await page.locator('#lyco-go-profiles').click();
  await page.locator('#view-profiles').waitFor({state: 'visible'});
  await page.locator('[data-view="lyco"]').click();
  await page.locator('#lyco-network-advanced>summary').click();
  assert.equal(await page.locator('#lyco-pick-core').isVisible(), true);
  await page.locator('#lyco-go-proxies').click();
  await page.locator('#view-proxies').waitFor({state: 'visible'});
  await page.locator('[data-view="lyco"]').click();
  await page.locator('#lyco-network-advanced>summary').click();
  const result = report.accountPanel = {realNavigationRoutes: true, layouts: [], surfaces: {}};
  for (const mode of ['light', 'dark']) {
    await page.locator('#theme-trigger').click();
    await page.locator(`#theme-appearance [data-color-mode="${mode}"]`).click();
    await page.waitForFunction(mode => document.documentElement.dataset.colorMode === mode, mode);
    await page.locator('#theme-trigger').click();
    for (const width of [900, 1024, 1440]) {
      await page.setViewportSize({width, height: 900});
      await page.waitForFunction(width => innerWidth === width, width);
      const geometry = await page.locator('.lyco-panel-shell').evaluate(panel => {
        const bounds = element => {const box = element.getBoundingClientRect(); return {left: box.left, right: box.right, width: box.width, height: box.height};};
        return {viewport: innerWidth, panel: bounds(panel), clientWidth: panel.clientWidth, scrollWidth: panel.scrollWidth,
          cards: [...panel.querySelectorAll('.lyco-panel-card:not([hidden])')].map(bounds),
          fields: [...panel.querySelectorAll('input')].map(bounds),
          background: getComputedStyle(panel.querySelector('.lyco-panel-card')).backgroundColor};
      });
      assert.ok(geometry.scrollWidth <= geometry.clientWidth + 1, `${mode}/${width}: panel overflow`);
      assert.equal(geometry.cards.length, 3);
      for (const card of geometry.cards) {
        assert.ok(card.width > 200 && card.left >= geometry.panel.left - 1 && card.right <= geometry.panel.right + 1,
          `${mode}/${width}: card outside real panel`);
      }
      for (const field of geometry.fields) assert.ok(field.width > 120 && field.height >= 40);
      result.layouts.push({mode, width, ...geometry});
      result.surfaces[mode] = geometry.background;
      await page.locator('#lyco-panel-title').scrollIntoViewIfNeeded();
      await page.screenshot({path: path.join(evidence, `windows-account-${mode}-${width}.png`)});
    }
  }
  assert.notEqual(result.surfaces.dark, result.surfaces.light, 'Account cards must follow the actual app color mode');
  await page.locator('#theme-trigger').click();
  await page.locator('#theme-appearance [data-color-mode="light"]').click();
  await page.locator('#theme-trigger').click();
  await page.setViewportSize({width: 1024, height: 800});
  await page.locator('#lyco-username').scrollIntoViewIfNeeded();
  report.checks.push('native-account-onboarding-real-routes-layout-and-color-modes');
}
