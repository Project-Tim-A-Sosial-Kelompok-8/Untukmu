import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { register } from './helpers';

test('PWA, keyboard, perpindahan kamera, dan cache privat', async ({ page, context }) => {
  let testingOffline = false;
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error' && !(testingOffline && e.text().includes('net::ERR_INTERNET_DISCONNECTED'))) errors.push(e.text() + ' ' + e.location().url);});
  const {frame,registrationConsoleError}=await register(page,'quality',{startComposer:false});await frame.locator('#um-entry.on').waitFor({timeout:20000});
  await expect(frame.locator('html')).toHaveAttribute('lang','id');
  const engine=page.frames()[1];
  await expect(frame.locator('#um-entry')).toHaveAttribute('role','dialog');
  // A full-screen form retains the rendered background without spending GPU
  // time on animation; closing it must resume the original scene.
  await page.waitForTimeout(300);
  const pausedFrames = await engine.evaluate(() => window.UM_ENGINE!.metrics().frames);
  await page.waitForTimeout(400);
  expect(await engine.evaluate(() => window.UM_ENGINE!.metrics().frames)).toBe(pausedFrames);
  const last=frame.locator('#um-entry button').last();await last.focus();await page.keyboard.press('Tab');
  expect(await engine.evaluate(()=>document.querySelector('#um-entry')?.contains(document.activeElement))).toBe(true);
  await frame.locator('#um-entry [data-act=skip]').click();
  const before=await engine.evaluate(()=>window.UM_ENGINE!.metrics());
  await frame.locator('.um-dock [data-act=peta]').click();
  await expect.poll(()=>engine.evaluate(()=>window.UM_ENGINE!.metrics().mode)).toBe('sky');
  await frame.locator('.um-dock [data-act=peta]').click();
  await expect.poll(()=>engine.evaluate(()=>window.UM_ENGINE!.metrics().mode)).toBe('galaxy');
  await page.keyboard.press('f');await expect(frame.locator('body')).toHaveClass(/gx-cinema/);await page.keyboard.press('f');
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>engine.evaluate(()=>window.UM_ENGINE!.metrics().frames)).toBeGreaterThan(before.frames);
  const after=await engine.evaluate(()=>window.UM_ENGINE!.metrics());
  expect(after.pixelRatio).toBeLessThanOrEqual(2);
  await mkdir(resolve('../../docs/pengujian/hasil'),{recursive:true});await writeFile(resolve('../../docs/pengujian/hasil/camera-metrics.json'),JSON.stringify({environment:'Headless Chromium, software WebGL; not a physical-device FPS benchmark',before,after},null,2));
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.reload();await frame.locator('#um-entry.on').waitFor({timeout:20000});
  const manifest=await (await page.request.get('/manifest.webmanifest')).json();expect(manifest.display).toBe('standalone');expect(manifest.icons).toHaveLength(3);
  const keys=await page.evaluate(async()=>{const urls:string[]=[];for(const name of await caches.keys())for(const key of await (await caches.open(name)).keys())urls.push(key.url);return urls;});
  expect(keys.some(key=>key.includes('/offline.html'))).toBe(true);
  expect(keys.some(key=>/\/api\/|\/uploads\//.test(key))).toBe(false);
  testingOffline = true; // The intentional network failure is what triggers the verified offline page.
  await context.setOffline(true);await page.goto('/');await expect(page.getByText('Koneksi belum tersedia.',{exact:false})).toBeVisible();
  await context.setOffline(false);expect(errors.filter(error => error !== registrationConsoleError)).toEqual([]);
});
