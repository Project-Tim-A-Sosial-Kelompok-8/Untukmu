import { expect, test } from '@playwright/test';
import { uiScreenshotPath } from './artifacts';
import { register } from './helpers';
type ScreenPoint = { x: number; y: number };

test('bintang Kenangan menampilkan tooltip dan dapat diklik pada desktop dan ponsel', async ({ page }, testInfo) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const { frame } = await register(page, 'map-stars');
  await frame.locator('#um-comp .um-close').click();
  const engine = page.frames()[1];
  const target = await engine.evaluate(async () => {
    const target = await window.UM.store.saveGalaksi({ nama: 'Bintang kenangan Ibu', kategori: 'orang-tua', warna: '#b9a7ff' });
    await window.UM.store.simpanPesan({ galaksiId: target.id, teks: 'Pesan untuk Ibu' });
    await window.UM.store.simpanPesan({ galaksiId: target.id, teks: 'Doa untuk Ibu' });
    await Promise.all([window.UM.galaksi.refresh(), window.UM.sky.refresh()]);
    return target;
  });
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await frame.locator('.um-dock [data-act=peta]').click();
    const position = await engine.evaluate<ScreenPoint>(`(() => {
      const item = UM.sky.state.daftar[0];
      skyControls.autoRotate = false; skyControls.enableDamping = false;
      skyCamera.position.copy(item.dir).multiplyScalar(-.1);
      skyControls.target.set(0,0,0); skyControls.update();
      skyCamera.updateMatrixWorld();
      const v = item.dir.clone().multiplyScalar(SKY_R * .96).project(skyCamera);
      return {x:(v.x*.5+.5)*innerWidth,y:(-v.y*.5+.5)*innerHeight,
        visible:item.marker.visible, points:item.marker.geometry.attributes.position.count};
    })()`);
    expect(position).toMatchObject({ visible: true, points: 1 });
    const tooltip = frame.locator('.um-memory-tooltip').filter({ hasText: target.nama });
    await expect(tooltip).not.toBeVisible();
    await page.mouse.move(position.x, position.y);
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('2 pesan · 0 doa');
    const bounds = await tooltip.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`tooltip-kenangan-${width}.png`) });
    await page.mouse.move(5, 150);
    await expect(tooltip).not.toBeVisible();
    await page.screenshot({ path: await uiScreenshotPath(width <= 640 ? 'mobile' : 'desktop', `peta-kenangan-${width}.png`) });
    await page.mouse.move(position.x, position.y);
    await page.mouse.down();
    await page.mouse.move(position.x + 55, position.y + 25, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => engine.evaluate(() => window.UM_ENGINE!.metrics().mode)).toBe('sky');
    const moved = await engine.evaluate<ScreenPoint>(`(() => {
      skyCamera.updateMatrixWorld();
      const v=UM.sky.state.daftar[0].dir.clone().multiplyScalar(SKY_R*.96).project(skyCamera);
      return {x:(v.x*.5+.5)*innerWidth,y:(-v.y*.5+.5)*innerHeight};
    })()`);
    expect(Math.hypot(moved.x - position.x, moved.y - position.y)).toBeGreaterThan(5);
    await page.mouse.click(moved.x, moved.y);
    await expect.poll(() => engine.evaluate(() => window.UM_ENGINE!.metrics().mode)).toBe('galaxy');
    await expect(frame.locator('#bp-name')).toHaveText(target.nama);
    await expect.poll(() => engine.evaluate('!!flyState'), { timeout: 20000 }).toBe(false);
    await expect(frame.locator('#beacon-panel')).toBeVisible();
    await expect(frame.locator('#bp-name')).toHaveCSS('font-size', '18px');
    await expect(frame.locator('#beacon-panel')).toHaveCSS('background-color', 'rgba(10, 14, 24, 0.92)');
    await expect(frame.locator('#beacon-panel')).toHaveCSS('border-top-left-radius', width <= 640 ? '14px' : '12px');
    await page.screenshot({ path: testInfo.outputPath(`panel-kenangan-${width}.png`) });
    await frame.locator('.um-dock [data-act=rumah]').click();
  }
  expect(errors).toEqual([]);
});
