import { expect, test } from '@playwright/test';
import { register } from './helpers';

test('login awal wajib dan doa tersedia sebagai tujuh pilihan tanpa formulir manual', async ({ page }) => {
  await page.goto('/doa');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#um-account-title')).toHaveText('Masuk ke Untukmu');
  await page.keyboard.press('Escape');
  await expect(frame.locator('#um-account-title')).toBeVisible();
  await register(page, 'prd');
  await frame.locator('#um-comp .um-close').click();
  await frame.locator('.um-dock [data-act=doa]').click();
  await expect(frame.locator('#um-doa [data-act=hub-trad]')).toHaveCount(7);
  await expect(frame.locator('[data-act=write-prayer], #um-written-prayer')).toHaveCount(0);
  const engine = page.frames()[1];
  expect(await engine.evaluate('typeof SKY_CONS + ":" + typeof BEACONS + ":" + typeof solarSystem')).toBe('undefined:undefined:undefined');
  await frame.locator('#um-doa [data-act=close]').click();
  await frame.locator('.um-dock [data-act=peta]').click();
  await expect(frame.locator('.um-skyctl')).toContainText('Peta Kenangan');
  await expect(frame.locator('[data-mode=astronomi], #galaxystrip, #solarstrip')).toHaveCount(0);
  await frame.locator('.um-dock [data-act=rumah]').click();
  await expect.poll(() => engine.evaluate(() => window.UM_ENGINE!.metrics().mode)).toBe('galaxy');
  expect(await engine.evaluate('UM.galaksi.state.daftar.length')).toBe(0);
});
