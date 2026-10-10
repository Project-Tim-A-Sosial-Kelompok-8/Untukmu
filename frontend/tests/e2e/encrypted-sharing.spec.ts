import { expect, test } from '@playwright/test';
import { register } from './helpers';

test('tautan terbatas didekripsi penerima tanpa mengirim isi atau kunci ke API; perubahan privasi mencabut tautan', async ({ page, browser }) => {
  const wire: string[] = [];
  page.on('request', request => {if (request.url().includes('/api/v1/')) wire.push(request.url() + (request.postData() || ''));});
  const { frame } = await register(page, 'encrypted-share', {startComposer: false});
  const secret = 'Isi tautan ini hanya untuk penerima yang dituju.';
  await page.frames()[1].evaluate(async secret => {
    const g = await window.UM.store.saveGalaksi({nama: 'Pesan melalui tautan', kategori: 'sahabat'});
    await window.UM.store.simpanPesan({galaksiId: g.id, teks: secret, privasi: 'unlisted'});
  }, secret);
  await frame.locator('#um-entry [data-act=skip]').click();
  await frame.locator('.um-dock [data-act=dash]').click();
  await frame.locator('#um-dash [data-act=manage]').first().click();
  await expect(frame.locator('#manage-text')).toHaveValue(secret);
  await frame.getByRole('button', {name: 'Buat tautan baru'}).click();
  const link = await frame.locator('[role=status]').filter({hasText: '/bagi#'}).innerText();
  const key = link.split('.').at(-1)!;
  expect(wire.join('\n')).not.toContain(secret);
  expect(wire.join('\n')).not.toContain(key);
  const guest = await browser.newPage();
  try {
    await guest.goto(link);
    await expect(guest.frameLocator('iframe').locator('article')).toContainText(secret);
    await frame.locator('#manage-privacy').selectOption('privat');
    await frame.getByRole('button', {name: 'Simpan perubahan'}).click();
    await expect(frame.locator('#manage-text')).toHaveCount(0);
    await guest.reload();
    await expect(guest.frameLocator('iframe').locator('article')).toContainText('Tautan tidak berlaku');
    const rows = await page.frames()[1].evaluate(async () => {
      const p = (await window.UM.store.listPesan())[0];
      return {privacy: p.privasi, text: await window.UM.store.bacaIsi(p)};
    });
    expect(rows).toEqual({privacy: 'privat', text: secret});
  } finally {await guest.close();}
});

test('jadwal disimpan dan kapsul privat menampilkan waktu pembukaan, dengan pengelolaan isi tetap tersedia', async ({ page }) => {
  const { frame } = await register(page, 'capsule');
  await frame.locator('#um-nama').fill('Kapsul untuk diri sendiri');
  await frame.locator('#um-comp [data-act=next]').click();
  await frame.locator('#um-comp [data-act=next]').click();
  const text = 'Pesan untuk diriku di masa depan';
  await frame.locator('#um-isi').fill(text);
  await frame.locator('#um-comp [data-act=next]').click();
  const time = new Date(Date.now() + 86400000);
  const local = new Date(time.getTime() - time.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await frame.locator('#um-release-at').fill(local);
  await frame.locator('#um-comp [data-act=save]').click();
  await expect(frame.locator('#um-comp')).not.toHaveClass(/on/);
  await frame.locator('.um-dock [data-act=dash]').click();
  await expect(frame.locator('#um-dash')).toContainText('Kapsul waktu akan dibuka');
  await frame.locator('#um-dash [data-act=manage]').first().click();
  await expect(frame.locator('#manage-text')).toHaveValue(text);
  await expect(frame.locator('#manage-release')).toHaveValue(local);
});

test('pembaruan enkripsi pesan tautan lama yang tertunda tidak menghalangi akses pemilik', async ({ page }) => {
  const id = 'c5bb3f8e-203f-434a-b096-4ab9c61efc18';
  const text = 'Pesan lama tetap tersedia untuk pemilik';
  let attempted = false;
  await page.route('**/api/v1/dashboard/messages?*', route => route.fulfill({json: [{
    id, entry_type: 'message', visibility: 'unlisted', is_mine: true, public_body: text,
    needs_client_encryption: true, constellation_ids: ['3505356d-0a1e-447c-8176-054adf0d0eb5'], attachment_ids: [], tags: [],
    date_label: null, mood: null, release_at: null, created_at: new Date().toISOString(),
    moderation_status: 'approved', empathy_count: 0, prayer_count: 0,
    payload: {alg: 'server-A256GCM', ct: 'legacy-ciphertext', iv: 'server-managed'},
  }]}));
  await page.route(`**/api/v1/messages/${id}`, async route => {
    attempted = true;
    const body = route.request().postDataJSON();
    expect(body.payload.alg).toBe('A256GCM');
    expect(route.request().postData()).not.toContain(text);
    await route.fulfill({status: 429, json: {detail: 'Batas pembaruan sementara; coba lagi nanti.'}});
  });
  await register(page, 'legacy-share-retry', {startComposer: false});
  expect(attempted).toBe(true);
  expect(await page.frames()[1].evaluate(() => window.UM.account.isLogged())).toBe(true);
  expect(await page.frames()[1].evaluate(async () => {
    const rows = await window.UM.store.listPesan();
    return window.UM.store.bacaIsi(rows[0], true);
  })).toBe(text);
});
