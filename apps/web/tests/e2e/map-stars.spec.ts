import { expect, test } from '@playwright/test';
import { uiScreenshotPath } from './artifacts';
import { register } from './helpers';
type ScreenPoint = { x: number; y: number };

test('bintang Kenangan dan 25 konstelasi terlihat dan dapat diklik langsung pada langit', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const { frame } = await register(page, 'map-stars');
  await frame.locator('#um-comp .um-close').click();
  const engine = page.frames()[1];
  const target = await engine.evaluate(async () => {
    const target = await window.UM.store.saveGalaksi({ nama: 'Bintang kenangan Ibu', kategori: 'orang-tua', warna: '#b9a7ff' });
    await Promise.all([window.UM.galaksi.refresh(), window.UM.sky.refresh()]);
    return target;
  });
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await frame.locator('.um-dock [data-act=peta]').click();
    await frame.locator('.um-skyctl [data-mode=kenangan]').click();
    const position = await engine.evaluate<ScreenPoint>(`(() => {
      const item = UM.sky.state.daftar[0];
      skyControls.autoRotate = false; skyControls.enableDamping = false;
      skyCamera.position.copy(item.dir).multiplyScalar(-.1);
      skyControls.target.set(0,0,0); skyControls.update();
      const v = item.dir.clone().multiplyScalar(SKY_R * .96).project(skyCamera);
      return {x:(v.x*.5+.5)*innerWidth,y:(-v.y*.5+.5)*innerHeight,
        visible:item.marker.visible, points:item.marker.geometry.attributes.position.count,
        originalStars:SKY_CONS.every(c=>c.starMat.visible), lines:SKY_CONS.some(c=>c.lineMat.visible)};
    })()`);
    expect(position).toMatchObject({ visible: true, points: 1, originalStars: true, lines: false });
    await expect(frame.locator('#um-petalabels')).not.toBeVisible();
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
    await frame.locator('.um-dock [data-act=peta]').click();
    await frame.locator('.um-skyctl [data-mode=astronomi]').click();
    const count = await engine.evaluate<number>(`SKY_CONS.length`);
    expect(count).toBe(25);
    const indices = width === 1366 ? Array.from({ length: count }, (_, index) => index) : [0, 12, 24];
    for (const index of indices) {
      // Orient the real camera, then click the actual star on the canvas.
      // selectSky is never invoked by the test.
      const star = await engine.evaluate<ScreenPoint & { name: string }>(`(() => {
        clearSkySelection();
        const c=SKY_CONS[${index}], s=c.z.stars[0], d=raDecDir(s[0],s[1]);
        skyControls.autoRotate=false; skyControls.enableDamping=false;
        skyCamera.position.copy(d).multiplyScalar(-.1);skyControls.target.set(0,0,0);skyControls.update();
        skyCamera.updateMatrixWorld(); const v=d.clone().multiplyScalar(SKY_R).project(skyCamera);
        return {x:(v.x*.5+.5)*innerWidth,y:(-v.y*.5+.5)*innerHeight,name:c.z.t.id||c.z.t.en,
          stars:c.starMat.visible,lines:c.lineMat.visible,memories:UM.sky.state.daftar.some(g=>g.marker.visible)};
      })()`);
      expect(star).toMatchObject({ stars: true, lines: true, memories: false });
      await page.mouse.click(star.x, star.y);
      await expect(frame.locator('#beacon-panel')).toHaveClass(/open/);
      await expect(frame.locator('#bp-name')).toContainText(star.name);
      expect(await engine.evaluate<number>('skySelected')).toBe(index);
      await expect(frame.locator('#bp-desc')).not.toBeEmpty();
      await expect(frame.locator('#skylabels')).not.toBeVisible();
      const layout = await engine.evaluate(() => {
        const panel = document.querySelector('#beacon-panel')!.getBoundingClientRect();
        const dock = document.querySelector('.um-dock')!.getBoundingClientRect();
        const controls = document.querySelector('.um-skyctl')!.getBoundingClientRect();
        const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        return { dockOverlap: overlaps(panel, dock), controlsOverlap: overlaps(panel, controls), outside: panel.left < 0 || panel.right > innerWidth || panel.top < 0 || panel.bottom > innerHeight };
      });
      expect(layout).toEqual({ dockOverlap: false, controlsOverlap: false, outside: false });
      if (index === 12) await page.screenshot({ path: await uiScreenshotPath(width <= 640 ? 'mobile' : 'desktop', `peta-konstelasi-${width}.png`) });
    }
    const line = await engine.evaluate<ScreenPoint>(`(() => {
      clearSkySelection();
      const c=SKY_CONS[12], edge=c.z.lines[0];
      const a=c.z.stars[edge[0]], b=c.z.stars[edge[1]];
      const da=raDecDir(a[0],a[1]), db=raDecDir(b[0],b[1]);
      skyCamera.position.copy(da.clone().add(db).normalize()).multiplyScalar(-.1);
      skyControls.target.set(0,0,0);skyControls.update();skyCamera.updateMatrixWorld();
      const pa=da.multiplyScalar(SKY_R).project(skyCamera), pb=db.multiplyScalar(SKY_R).project(skyCamera);
      return {x:((pa.x+pb.x)*.25+.5)*innerWidth,y:(-(pa.y+pb.y)*.25+.5)*innerHeight};
    })()`);
    await page.mouse.click(line.x, line.y);
    expect(await engine.evaluate<number>('skySelected')).toBe(12);
    await expect(frame.locator('#bp-name')).toContainText('Ursa Major');
    // Verify the information card can be closed using its actual control.
    await frame.locator('#bp-close').click();
    await expect(frame.locator('#beacon-panel')).not.toHaveClass(/open/);
    await frame.locator('.um-skyctl [data-mode=kenangan]').click();
    await expect(frame.locator('#beacon-panel')).not.toHaveClass(/open/);
    expect(await engine.evaluate(`skySelected === null && UM.sky.state.daftar[0].marker.visible && SKY_CONS.every(c => c.starMat.uniforms.uMul.value === 1)`)).toBe(true);
    await frame.locator('.um-dock [data-act=rumah]').click();
  }
  expect(errors).toEqual([]);
});
