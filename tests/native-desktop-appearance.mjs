import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export async function verifyNativeDesktopAppearance({page, report, evidence, appRoot}) {
  if(process.env.GITHUB_ACTIONS !== 'true') throw Error('UDA runtime acceptance only runs in Actions');
  const directory = path.join(appRoot, 'lyco', 'desktop');
  const bytes = await fs.readFile(path.join(directory, 'lyco-desktop-probe.exe'));
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.equal(digest, process.env.LYCO_UDA_BINARY_SHA256?.toLowerCase(), 'The actual portable/installed helper must be the Actions-built binary');
  for(const name of ['LICENSE-MIT-UDA.txt', 'LICENSE-APACHE-UDA.txt', 'NOTICE.txt']) {
    assert.ok((await fs.readFile(path.join(directory, name), 'utf8')).length > 100, 'Redistribution notice must be packaged');
  }
  const actual = await page.evaluate(() => window.ops.lycoDesktopAppearance());
  assert.equal(actual.state, 'ready');
  assert.equal(actual.revision, 'a74bd2cf372efad2407d6be4b57739e682cf1d9a');
  assert.ok(['dark','light'].includes(actual.theme), 'This supported Windows runner must publish its real desktop appearance');
  await page.waitForFunction(() => document.getElementById('lyco-desktop-status').dataset.state === 'ready');
  await page.locator('#lyco-desktop-details>summary').click();
  await page.locator('#theme-trigger').click();
  await page.locator('#theme-appearance [data-color-mode="auto"]').click();
  await page.waitForFunction(theme => document.documentElement.dataset.colorMode === theme, actual.theme);
  await page.locator('#theme-trigger').click();
  const manual = actual.theme === 'light' ? 'dark' : 'light';
  await page.locator('#theme-trigger').click();
  await page.locator(`#theme-appearance [data-color-mode="${manual}"]`).click();
  await page.locator('#theme-trigger').click();
  await page.locator('#lyco-desktop-refresh').click();
  await page.waitForFunction(() => !document.getElementById('lyco-desktop-refresh').disabled);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.colorMode), manual, 'Native refresh must not override an explicit theme');
  await page.locator('#theme-trigger').click();
  await page.locator('#theme-appearance [data-color-mode="auto"]').click();
  await page.locator('#theme-trigger').click();
  await page.waitForFunction(theme => document.documentElement.dataset.colorMode === theme, actual.theme);
  await page.locator('#lyco-desktop-details').scrollIntoViewIfNeeded();
  await page.screenshot({path: path.join(evidence, 'windows-uda-desktop.png')});
  report.desktopAppearance = {actual, helperSha256: digest, autoThemeMatches: true, manualThemePreserved: true, noticesPackaged: true};
  report.checks.push('actual-packaged-uda-desktop-appearance-and-manual-override');
  await page.locator('#lyco-desktop-details>summary').click();
  await page.locator('#theme-trigger').click();
  await page.locator('#theme-appearance [data-color-mode="light"]').click();
  await page.locator('#theme-trigger').click();
}
