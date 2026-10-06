import { expect, test } from '@playwright/test';
import { register } from './helpers';

test('Jelajah menerapkan filter, mengurutkan, dan menavigasi lebih dari 30 pesan', async ({ page }) => {
  const requests: URL[] = [];
  const rows = Array.from({ length: 64 }, (_, i) => ({
    id: `public-${i}`, constellation_ids: ['public-galaxy'], visibility: 'public_anon',
    moderation_status: 'approved', public_body: `Ucapan nomor ${i}`, is_mine: false,
    created_at: new Date(2026, 0, i + 1).toISOString(), prayer_count: i % 9,
    mood: i % 2 ? 'rindu' : 'syukur', tags: [i % 2 ? 'keluarga' : 'kenangan'], attachment_ids: [],
  }));
  await page.route('**/api/v1/explore?*', async route => {
    const url = new URL(route.request().url()); requests.push(url);
    const q = url.searchParams;
    const filtered = rows.filter(row => (!q.get('mood') || row.mood === q.get('mood')) && (!q.get('tag') || row.tags.includes(q.get('tag')!)));
    filtered.sort((a, b) => (q.get('sort') === 'prayers' ? b.prayer_count - a.prayer_count : 0) || b.created_at.localeCompare(a.created_at));
    const offset = Number(q.get('offset'));
    await route.fulfill({ json: filtered.slice(offset, offset + Number(q.get('limit'))) });
  });
  const { frame } = await register(page, 'explore-regression', { startComposer: false });
  await frame.locator('#um-entry [data-act=skip]').click();
  await frame.locator('.um-dock [data-act=jelajah]').click();
  await expect(frame.locator('#um-exp .um-item')).toHaveCount(30);
  await expect(frame.locator('#um-exp .txt').first()).toHaveText('Ucapan nomor 63');
  await frame.locator('#um-exp [data-act=next-page]').click();
  await expect(frame.locator('#um-exp .txt').first()).toHaveText('Ucapan nomor 33');
  await frame.locator('#um-exp [data-act=next-page]').click();
  await expect(frame.locator('#um-exp .um-item')).toHaveCount(4);
  await expect(frame.locator('#um-exp [data-act=next-page]')).toBeDisabled();
  await expect(frame.locator('#um-exp')).toContainText('Tidak ada halaman berikutnya');
  await frame.locator('#um-exp [data-act=prev-page]').click();
  await expect(frame.locator('#um-exp .um-item')).toHaveCount(30);
  await frame.locator('#um-filter-tag').fill('#keluarga');
  await frame.locator('#um-filter-mood').selectOption('rindu');
  await frame.locator('#um-exp [data-act=filter]').click();
  await expect(frame.locator('#um-exp [data-filter-summary]')).toContainText('#keluarga');
  await expect(frame.locator('#um-exp [data-act=prev-page]')).toBeDisabled();
  await frame.locator('#um-exp [data-act=sort][data-id=doa]').click();
  await expect(frame.locator('#um-exp .txt').first()).toHaveText('Ucapan nomor 53');
  await expect(frame.locator('#um-exp')).toContainText('jumlah pendoa terbanyak');
  await frame.locator('#um-exp [data-act=next-page]').click();
  await expect(frame.locator('#um-exp .um-item')).toHaveCount(2);
  await frame.locator('#um-exp [data-act=reset-filter]').click();
  await expect(frame.locator('#um-exp [data-filter-summary]')).toContainText('Semua tag');
  await expect(frame.locator('#um-filter-mood')).toHaveValue('');
  expect(requests.some(url => url.searchParams.get('mood') === 'rindu' && url.searchParams.get('tag') === 'keluarga' && url.searchParams.get('sort') === 'prayers')).toBe(true);
  expect(requests.some(url => url.searchParams.get('offset') === '60')).toBe(true);
  expect(requests.filter(url => url.searchParams.has('offset')).every(url => url.searchParams.get('limit') === '31')).toBe(true);
  await frame.locator('#um-filter-tag').fill('tidak-ada');
  await frame.locator('#um-exp [data-act=filter]').click();
  await expect(frame.locator('#um-exp .um-item')).toHaveCount(0);
  await expect(frame.locator('#um-exp-page-status')).toHaveText('Tidak ada ucapan untuk ditampilkan.');
  await expect(frame.locator('#um-exp [data-act=prev-page]')).toBeDisabled();
  await expect(frame.locator('#um-exp [data-act=next-page]')).toBeDisabled();
  await expect(frame.locator('#um-exp')).toContainText('halaman pertama');
  await frame.locator('#um-exp [data-act=close]').click();
  await expect(frame.locator('#um-exp')).not.toHaveClass(/on/);
});

test('komposer kedua dapat memilih nama, kenangan baru, kategori, dan silang', async ({ page }) => {
  const { frame } = await register(page, 'composer-repeat');
  await frame.locator('#um-nama').fill('Kenangan pertama');
  await frame.locator('#um-comp [data-act=next]').click();
  await frame.locator('#um-comp [data-act=next]').click();
  await frame.locator('#um-isi').fill('Pesan pertama');
  await frame.locator('#um-comp [data-act=next]').click();
  await frame.locator('#um-comp [data-act=save]').click();
  await expect(frame.locator('#um-comp')).not.toHaveClass(/on/);
  await frame.locator('.um-dock [data-act=tulis]').click();
  await frame.locator('#um-comp [data-act=baru]').click();
  await frame.locator('#um-nama').fill('Nama yang tidak boleh hilang');
  await frame.locator('#um-comp [data-act=cat]').first().click();
  await expect(frame.locator('#um-nama')).toHaveValue('Nama yang tidak boleh hilang');
  await frame.locator('#um-comp [data-act=pick-galaksi]').click();
  await expect(frame.locator('#um-comp .um-note')).toContainText('Kenangan pertama');
  await frame.locator('#um-comp [data-act=baru]').click();
  await expect(frame.locator('#um-nama')).toHaveValue('Nama yang tidak boleh hilang');
  await frame.locator('#um-comp .um-close').click();
  await expect(frame.locator('#um-comp')).not.toHaveClass(/on/);
  await frame.locator('.um-dock [data-act=tulis]').click();
  await frame.locator('#um-comp .um-close').click();
  await expect(frame.locator('#um-comp')).not.toHaveClass(/on/);
  // A delayed list must not reopen or overwrite a later composer screen.
  await page.frames()[1].evaluate(`(() => {
    const original = UM.store.listGalaksi;
    UM.store.listGalaksi = async () => { await new Promise(r => setTimeout(r, 700)); return original(); };
    UM.ui.bukaKomposer();
  })()`);
  await frame.locator('#um-comp .um-close').click();
  await page.waitForTimeout(850);
  await expect(frame.locator('#um-comp')).not.toHaveClass(/on/);
});

test('tooltip Kenangan dan label Konstelasi tersembunyi saat kamera digeser menjauh', async ({ page }) => {
  const { frame } = await register(page, 'map-labels');
  await frame.locator('#um-nama').fill('Kenangan dengan nama yang sangat panjang untuk pemeriksaan tepi layar');
  await frame.locator('#um-comp [data-act=next]').click();
  await frame.locator('#um-comp [data-act=next]').click();
  await frame.locator('#um-isi').fill('Pesan untuk peta');
  await frame.locator('#um-comp [data-act=next]').click();
  await frame.locator('#um-comp [data-act=save]').click();
  await expect(frame.locator('#um-comp')).not.toHaveClass(/on/);
  await frame.locator('.um-dock [data-act=peta]').click();
  await expect(frame.locator('#um-galaksilabels')).not.toBeVisible();
  const engine = page.frames()[1];
  await expect(frame.locator('.um-dock button').nth(0)).toHaveAttribute('data-act', 'tulis');
  await expect(frame.locator('.um-dock button').nth(1)).toHaveAttribute('data-act', 'doa');
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const mode of ['kenangan', 'astronomi']) {
      await frame.locator(`.um-skyctl [data-mode=${mode}]`).click();
      await engine.evaluate(`(() => {
        skyControls.autoRotate = false;
        skyCamera.position.copy(UM.sky.state.daftar[0].dir).multiplyScalar(-.1);
        skyControls.target.set(0,0,0); skyControls.update();
      })()`);
      await page.mouse.move(width / 2, 300);
      await page.mouse.down();
      await page.mouse.move(width / 2 + 80, 360, { steps: 10 });
      await page.mouse.up();
      if (mode === 'kenangan') await expect(frame.locator('#um-petalabels .um-memory-tooltip').first()).not.toBeVisible();
      else await expect(frame.locator('#um-petalabels')).not.toBeVisible();
      await expect(frame.locator('#um-galaksilabels')).not.toBeVisible();
      await expect(frame.locator('#skylabels')).not.toBeVisible();
    }
  }
  await frame.locator('.um-dock [data-act=rumah]').click();
  await frame.locator('#galaxystrip button').first().click();
  await frame.locator('#bp-solar-link').click();
  await expect.poll(() => engine.evaluate(() => window.UM_ENGINE!.metrics().mode)).toBe('solar');
  await expect(frame.locator('#um-petalabels')).not.toBeVisible();
  await expect(frame.locator('#um-galaksilabels')).not.toBeVisible();
});
