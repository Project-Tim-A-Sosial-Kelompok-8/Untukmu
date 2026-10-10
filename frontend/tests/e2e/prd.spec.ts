import { expect, test } from '@playwright/test';
import { register } from './helpers';

test('doa tersedia untuk pengunjung dengan tujuh tradisi dan isi yang bisa dipilih', async ({ page }) => {
  await page.goto('/doa');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#um-doa')).toHaveClass(/on/);
  await expect(frame.locator('#um-account-title')).toHaveCount(0);
  for (const tradition of ['islam', 'kristen', 'katolik', 'hindu', 'buddha', 'konghucu', 'umum']) {
    await frame.locator(`[data-act=hub-trad][data-id=${tradition}]`).click();
    await frame.locator('[data-act=hub-entri]').first().click();
    await expect(frame.locator('[data-prayer-content] .tx').first()).not.toBeEmpty();
  }
  const initial = await page.frames()[1].evaluate<{ camera: number[] }>(`(() => ({
    camera:camera.position.toArray(), fov:camera.fov, milkyWay:DUST.count, radius:DUST.radius,
    galaxies:defaultBackground.length, backgroundVisible:galaxyLODs.slice(0,7).every(lod => lod.pts.visible && lod.pts.parent === scene),
    domeStars:skyScene.children.filter(obj => obj.isPoints && obj.material.uniforms?.uMul).reduce((total,obj) => total+obj.geometry.attributes.position.count,0),
    skyFov:skyCamera.fov, rotation:skyControls.rotateSpeed, bloom:!!composer
  }))()`);
  expect(initial.camera[0]).toBeCloseTo(0);
  expect(initial.camera[1]).toBeCloseTo(529);
  expect(initial.camera[2]).toBeCloseTo(715);
  expect(initial).toMatchObject({ fov:55, milkyWay:85000, radius:360, galaxies:7, backgroundVisible:true, domeStars:182, skyFov:60, rotation:-.35, bloom:true });
  // Read the final rendered canvas: a blue clear colour passed through ACES
  // would make every empty corner blue even though the CSS background is dark.
  const background = await page.frames()[1].evaluate<number[]>(`(() => {
    UM_ENGINE.frame();
    const gl=renderer.getContext(), values=[];
    for(const [x,y] of [[8,8],[16,8],[8,16],[gl.drawingBufferWidth-8,8],[8,gl.drawingBufferHeight-8]]) {
      const pixel=new Uint8Array(4); gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      values.push(Math.max(pixel[0],pixel[1],pixel[2]));
    }
    return values.sort((a,b)=>a-b);
  })()`);
  expect(background[Math.floor(background.length/2)]).toBeLessThanOrEqual(5);
  await page.keyboard.press('Escape');
  await expect(frame.locator('#um-doa')).not.toHaveClass(/on/);
  await register(page, 'prd');
  await frame.locator('#um-comp .um-close').click();
  await frame.locator('.um-dock [data-act=doa]').click();
  await expect(frame.locator('#um-doa [data-act=hub-trad]')).toHaveCount(7);
  await expect(frame.locator('[data-act=write-prayer], #um-written-prayer')).toHaveCount(0);
  const engine = page.frames()[1];
  expect(await engine.evaluate('typeof SKY_CONS + ":" + typeof BEACONS + ":" + typeof solarSystem')).toBe('undefined:undefined:undefined');
  await frame.locator('#um-doa [data-act=close]').click();
  await frame.locator('.um-dock [data-act=peta]').click();
  await expect(frame.locator('.um-skyctl [data-mode=kenangan]')).toHaveClass(/on/);
  await expect(frame.locator('.um-skyctl')).toContainText('Bintang berwarna menandai galaksi kenanganmu.');
  await expect(frame.locator('[data-mode=astronomi], #galaxystrip, #solarstrip')).toHaveCount(0);
  await frame.locator('.um-dock [data-act=rumah]').click();
  await expect.poll(() => engine.evaluate(() => window.UM_ENGINE!.metrics().mode)).toBe('galaxy');
  expect(await engine.evaluate('UM.galaksi.state.daftar.length')).toBe(0);
});
