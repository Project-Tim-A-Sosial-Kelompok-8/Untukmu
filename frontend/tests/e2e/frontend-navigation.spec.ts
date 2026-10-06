import { expect, test } from '@playwright/test';
import { uiScreenshotPath } from './artifacts';
import { register } from './helpers';

for (const width of [320, 390, 1366]) {
  test(`Tulis dan Doa tersedia pada navigasi bawah tanpa tombol tambahan di atas (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const { frame } = await register(page, `frontend-nav-${width}`, { startComposer: false });
    await expect(page.locator('.app-navigation')).toHaveCount(0);
    await frame.locator('#um-entry [data-act=skip]').click();
    const navigation = frame.locator('.um-dock');
    const prayer = navigation.locator('[data-act=doa]');
    const write = navigation.locator('[data-act=tulis]');
    await expect(prayer).toBeVisible();
    await expect(write).toBeEnabled();
    const initialURL = page.frames()[1].url();
    const canvas = await page.locator('iframe').boundingBox();
    expect(canvas).toEqual({ x: 0, y: 0, width, height: 844 });
    await expect(navigation.locator('button').nth(0)).toHaveAttribute('data-act', 'tulis');
    await expect(navigation.locator('button').nth(1)).toHaveAttribute('data-act', 'doa');
    const bottom = await navigation.boundingBox();
    expect(bottom!.y).toBeGreaterThan(844 / 2);
    expect(bottom!.y + bottom!.height).toBeLessThanOrEqual(844);
    for (const control of [prayer, write]) {
      const box = await control.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    await prayer.focus();
    await page.keyboard.press('Enter');
    await expect(frame.locator('#um-doa')).toHaveClass(/on/);
    await expect(frame.locator('#um-doa [data-act=hub-trad]')).toHaveCount(7);
    await expect(frame.locator('#um-entry')).not.toHaveClass(/on/);
    expect(page.frames()[1].url()).toBe(initialURL);
    await expect(frame.locator('#um-doa [data-act=write-prayer]')).toHaveCount(0);
    await page.screenshot({ path: await uiScreenshotPath(width <= 640 ? 'mobile' : 'desktop', `doa-${width}.png`) });
    await frame.locator('#um-doa [data-act=close]').click();
    await write.click();
    await expect(frame.locator('#um-comp')).toHaveClass(/on/);
    await frame.locator('#um-comp .um-close').click();
    await expect(frame.locator('#um-comp')).not.toHaveClass(/on/);
    await prayer.click();
    await expect(frame.locator('#um-doa')).toHaveClass(/on/);
    expect(errors).toEqual([]);
  });
}
