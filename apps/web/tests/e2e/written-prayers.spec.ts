import { expect, test } from '@playwright/test';
import { uiScreenshotPath } from './artifacts';
import { register, login } from './helpers';

test('halaman Doa meminta login awal sebelum menulis doa', async ({ page }) => {
  await page.goto('/doa');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#um-account-title')).toHaveText('Masuk ke Untukmu');
  await expect(frame.locator('#um-written-prayer')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(frame.locator('#um-account-title')).toBeVisible();
  await expect(frame.locator('#um-doa')).toHaveClass(/on/);
  await expect(frame.getByRole('button', { name: 'Daftar akun', exact: true })).toBeVisible();
});

test('doa tertulis tersimpan pada tujuan yang benar; retry tidak menggandakan galaksi; draf tetap ada saat membuka kunci', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const { frame, email, password } = await register(page, 'written-prayer');
  await frame.locator('#um-comp [data-act=cancel]').first().click();
  const previousTarget = await page.frames()[1].evaluate(async () =>
    window.UM.store.saveGalaksi({ nama: 'Kenangan yang sudah ada', kategori: 'sahabat' }));
  await frame.locator('.um-dock [data-act=doa]').click();
  await frame.locator('#um-doa [data-act=write-prayer]').click();
  const form = frame.locator('#um-written-prayer');
  await expect(form).toBeVisible();
  await expect(form.locator('#um-written-name')).toBeEnabled();
  await expect(form.locator('#um-written-tradition option')).toHaveCount(7);
  await form.locator('#um-written-target').selectOption(previousTarget.id);
  await form.getByRole('button', { name: '+ Galaksi baru', exact: true }).click();
  await expect(form.locator('#um-written-target')).toHaveValue('new');
  await form.locator('#um-written-kind').selectOption('ellipsoid');
  await form.locator('#um-written-color').fill('#b9a7ff');
  await form.locator('#um-written-radius').selectOption('175');
  await form.locator('#um-written-name').fill('Untuk Ibu');
  await form.locator('#um-written-category').selectOption('orang-tua');
  await form.locator('#um-written-tradition').selectOption('islam');
  const privateText = 'Isi doa pribadi pengujian untuk Ibu.';
  await form.locator('#um-written-text').fill(privateText);
  await expect(form.locator('#um-written-privacy')).toHaveValue('privat');
  for (const width of [320, 390, 1366]) {
    await page.setViewportSize({ width, height: 844 });
    const layout = await form.evaluate(screen => {
      const boxes = Array.from(screen.querySelectorAll('button')).map(button => button.getBoundingClientRect());
      let overlaps = 0;
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlaps++;
      }
      return { overlaps, overflow: screen.scrollWidth > screen.clientWidth, outside: boxes.some(box => box.left < 0 || box.right > innerWidth) };
    });
    expect(layout).toEqual({ overlaps: 0, overflow: false, outside: false });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: await uiScreenshotPath('mobile', 'tulis-doa-390.png') });

  const writes: string[] = [];
  let galaxyCreates = 0;
  page.on('request', request => {
    if (request.url().endsWith('/constellations') && request.method() === 'POST') galaxyCreates++;
  });
  await page.route('**/api/v1/messages', async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    writes.push(route.request().postData()!);
    if (writes.length === 1) await route.fulfill({ status: 503, json: { detail: 'Koneksi uji terputus; silakan coba lagi.' } });
    else await route.continue();
  });
  const save = form.getByRole('button', { name: 'Simpan doa', exact: true });
  await save.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(form.getByRole('alert')).toContainText('Koneksi uji terputus');
  await expect(save).toBeEnabled();
  expect(writes).toHaveLength(1);
  expect(galaxyCreates).toBe(1);
  const newTargetId = await form.locator('#um-written-target').inputValue();
  expect(newTargetId).not.toBe('new');
  await expect(form.locator('#um-written-text')).toHaveValue(privateText);

  // A failed scene refresh happens after persistence. The success state must
  // remain visible, and its refresh action must never resend the prayer.
  await page.frames()[1].evaluate(() => {
    const original = window.UM.galaksi.refresh;
    window.UM.galaksi.refresh = async () => { window.UM.galaksi.refresh = original; throw new Error('Scene refresh fixture'); };
  });
  await save.click();
  await expect(form.getByRole('status')).toContainText('Doa untuk Untuk Ibu sudah tersimpan.');
  await expect(form.getByRole('alert')).toContainText('Doa sudah tersimpan');
  await form.getByRole('button', { name: 'Muat ulang tampilan' }).click();
  await expect(form.getByRole('alert')).toHaveCount(0);
  expect(writes).toHaveLength(2);
  expect(galaxyCreates).toBe(1);
  expect(writes.join('\n')).not.toContain(privateText);
  expect(JSON.parse(writes[1])).toMatchObject({ entry_type: 'prayer', visibility: 'private', constellation_ids: [newTargetId], tags: ['doa', 'islam'] });
  expect(await page.frames()[1].evaluate(async id => window.UM.store.getGalaksi(id), newTargetId))
    .toMatchObject({ kind: 'ellipsoid', warna: '#b9a7ff', radius: 175, count: 8500 });
  expect(await page.frames()[1].evaluate(async () => {
    const messages = await window.UM.store.listPesan();
    return { count: messages.length, target: messages[0].galaksiId, text: await window.UM.store.bacaIsi(messages[0]), prayers: messages[0].pendoa.total };
  })).toEqual({ count: 1, target: newTargetId, text: privateText, prayers: 0 });

  await form.getByRole('button', { name: 'Tulis doa lagi' }).click();
  await expect(form.locator('#um-written-text')).toHaveValue('');
  await form.locator('#um-written-target').selectOption(previousTarget.id);
  await form.locator('#um-written-tradition').selectOption('hindu');
  await form.locator('#um-written-privacy').selectOption('publik');
  const publicText = 'Doa tertulis publik pengujian untuk sahabat.';
  await form.locator('#um-written-text').fill(publicText);
  await save.click();
  await expect(form.getByRole('status')).toContainText('Doa untuk Kenangan yang sudah ada sudah tersimpan.');
  await expect(form).toContainText('menunggu peninjauan');
  expect(JSON.parse(writes[2])).toMatchObject({ visibility: 'public_anon', constellation_ids: [previousTarget.id], tags: ['doa', 'hindu'], public_body: publicText });
  expect(galaxyCreates).toBe(1);
  await form.getByRole('button', { name: 'Lihat di Ruang Pribadi' }).click();
  await expect(frame.locator('#um-dash')).toHaveClass(/on/);
  await expect(frame.locator('#um-dash [data-stat=doa] b')).toHaveText('2');
  await expect(frame.locator('#um-dash [data-stat=pesan] b')).toHaveText('0');
  await expect(frame.locator('#um-dash-doa .um-item')).toHaveCount(2);
  await expect(frame.locator('#um-dash-doa')).toContainText(privateText);
  await expect(frame.locator('#um-dash-doa')).toContainText(publicText);
  await expect(frame.locator('#um-dash-pesan .um-item')).toHaveCount(0);
  await frame.locator('#um-dash-doa [data-act=manage]').first().click();
  await expect(frame.locator('#manage-title')).toHaveText('Kelola doa');
  await frame.locator('#um-react-account .um-screen.on').getByRole('button', { name: 'Tutup', exact: true }).click();

  await page.reload();
  await login(page, email, password);
  await page.frames()[1].evaluate(() => window.UM.crypto.lock());
  await frame.locator('#um-entry [data-act=skip]').click();
  await frame.locator('.um-dock [data-act=doa]').click();
  await frame.locator('#um-doa [data-act=write-prayer]').click();
  await form.locator('#um-written-target').selectOption(newTargetId);
  const nextDraft = 'Draf doa tetap ada setelah membuka kunci.';
  await form.locator('#um-written-text').fill(nextDraft);
  await expect(save).toBeDisabled();
  await form.getByRole('button', { name: 'Buka kunci enkripsi', exact: true }).click();
  await frame.locator('#um-pw').fill(password);
  await frame.locator('#um-setup [data-act=unlock]').click();
  await expect(frame.locator('#um-setup [data-act=lock]')).toBeVisible({ timeout: 60000 });
  await frame.locator('#um-setup [data-act=close]').click();
  await frame.locator('.um-dock [data-act=doa]').click();
  await frame.locator('#um-doa [data-act=write-prayer]').click();
  await expect(form.locator('#um-written-text')).toHaveValue(nextDraft);
  await expect(form.locator('#um-written-target')).toHaveValue(newTargetId);
  await expect(save).toBeEnabled();
  await form.getByRole('button', { name: 'Batal', exact: true }).click();
  await expect(frame.locator('#um-doa')).toHaveClass(/on/);
  expect(writes).toHaveLength(3);
  expect(await page.frames()[1].evaluate(async () => (await window.UM.store.listPesan()).length)).toBe(2);
  // An ordinary message, even with a #doa tag, belongs only in Pesan.
  await page.frames()[1].evaluate(async id => {
    await window.UM.store.simpanPesan({ galaksiId: id, teks: 'Pesan biasa untuk sahabat', tag: ['doa', 'islam'] });
    window.UM.ui.bukaDash();
  }, previousTarget.id);
  await expect(frame.locator('#um-dash [data-stat=pesan] b')).toHaveText('1');
  await expect(frame.locator('#um-dash [data-stat=doa] b')).toHaveText('2');
  await expect(frame.locator('#um-dash-pesan .um-item')).toHaveCount(1);
  await expect(frame.locator('#um-dash-pesan')).toContainText('Pesan biasa untuk sahabat');
  await expect(frame.locator('#um-dash-doa .um-item')).toHaveCount(2);
  await expect(frame.locator('#um-dash-doa')).not.toContainText('Pesan biasa untuk sahabat');
  await frame.locator('#um-dash [data-act=write-prayer]').click();
  await expect(form).toBeVisible();
  await form.getByRole('button', { name: 'Tutup', exact: true }).click();
  expect(errors).toEqual([]);
});
