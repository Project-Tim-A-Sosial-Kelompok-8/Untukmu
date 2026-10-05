import { expect, test } from '@playwright/test';
import { register } from './helpers';

test('label dan kartu galaksi menghitung doa serta pesan sesuai jenis, termasuk setelah edit dan hapus', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const { frame } = await register(page, 'galaxy-counts');
  let engine = page.frames()[1];
  await frame.locator('#um-comp .um-close').click();
  await frame.locator('.um-dock [data-act=doa]').click();
  await frame.locator('#um-doa [data-act=write-prayer]').click();
  const form = frame.locator('#um-written-prayer');
  await form.locator('#um-written-name').fill('Galaksi label untuk Ibu');
  await form.locator('#um-written-text').fill('Doa pertama untuk Ibu');
  await form.getByRole('button', { name: 'Simpan doa', exact: true }).click();
  await expect(form.getByRole('status')).toContainText('sudah tersimpan');
  const galaxy = (await engine.evaluate(async () => window.UM.store.listGalaksi()))[0];
  const label = frame.locator('.um-glabel').filter({ hasText: galaxy.nama });

  async function counts(messages: number, prayers: number) {
    await expect(label.locator('[data-count=pesan]')).toHaveText(`${messages} pesan`);
    await expect(label.locator('[data-count=doa]')).toHaveText(`${prayers} doa`);
    await expect.poll(() => engine.evaluate(`(() => {
      const g=UM.sky.state.daftar.find(item=>item.g.id===${JSON.stringify(galaxy.id)});
      return {pesan:g.nPesan,doa:g.nDoaTertulis+g.nBatu};
    })()`)).toEqual({ pesan: messages, doa: prayers });
  }
  async function openGalaxy() {
    await frame.locator('.um-dock [data-act=dash]').click();
    await frame.locator(`#um-dash [data-act=terbang][data-id="${galaxy.id}"]`).click();
    await expect(frame.locator('#bp-name')).toHaveText(galaxy.nama);
  }
  async function card(messages: number, prayers: number) {
    await expect(frame.locator('[data-galaxy-count=pesan] .v')).toHaveText(String(messages));
    await expect(frame.locator('[data-galaxy-count=doa-tertulis] .v')).toHaveText(String(prayers));
    await expect(frame.locator('[data-galaxy-count=doa-diterima] .v')).toHaveText('0');
  }

  await counts(0, 1);
  await form.getByRole('button', { name: 'Lihat di Ruang Pribadi', exact: true }).click();
  await frame.locator(`#um-dash [data-act=terbang][data-id="${galaxy.id}"]`).click();
  await card(0, 1);

  // Use the normal composer so its save/refresh path is exercised too.
  await frame.locator('.um-dock [data-act=tulis]').click();
  await frame.locator(`#um-comp [data-act=pick-galaksi][data-id="${galaxy.id}"]`).click();
  await frame.locator('#um-comp [data-act=next]').click();
  await frame.locator('#um-isi').fill('Pesan biasa untuk Ibu');
  await frame.locator('#um-tag').fill('doa, islam');
  await frame.locator('#um-comp [data-act=next]').click();
  await frame.locator('#um-comp [data-act=save]').click();
  await expect(frame.locator('#um-comp')).not.toHaveClass(/on/);
  await counts(1, 1);
  await openGalaxy();
  await card(1, 1);

  await frame.locator('.um-dock [data-act=doa]').click();
  await frame.locator('#um-doa [data-act=write-prayer]').click();
  await form.locator('#um-written-target').selectOption(galaxy.id);
  await form.locator('#um-written-text').fill('Doa kedua untuk Ibu');
  await form.getByRole('button', { name: 'Simpan doa', exact: true }).click();
  await expect(form.getByRole('status')).toContainText('sudah tersimpan');
  await counts(1, 2);
  await form.getByRole('button', { name: 'Lihat di Ruang Pribadi', exact: true }).click();
  await frame.locator(`#um-dash [data-act=terbang][data-id="${galaxy.id}"]`).click();
  await card(1, 2);

  // Both kinds remain clickable stars; separating counters must not remove
  // written prayers from the galaxy's message slots.
  expect(await engine.evaluate(`UM.galaksi.state.peta[${JSON.stringify(galaxy.id)}].pesanSendiri.length`)).toBe(3);
  await frame.locator('#um-gk-list li').filter({ hasText: 'Doa pertama untuk Ibu' }).locator('[data-bintang]').click();
  await frame.locator('#beacon-panel [data-act=manage]').click();
  await expect(frame.locator('#manage-title')).toHaveText('Kelola doa');
  await frame.locator('#manage-text').fill('Doa pertama diperbarui');
  await frame.getByRole('button', { name: 'Simpan perubahan', exact: true }).click();
  await expect(frame.locator('#manage-text')).not.toBeVisible();
  await counts(1, 2);
  await openGalaxy();
  await card(1, 2);

  await frame.locator('.um-dock [data-act=dash]').click();
  await frame.locator('#um-dash-doa .um-item').filter({ hasText: 'Doa pertama diperbarui' }).locator('[data-act=manage]').click();
  page.once('dialog', dialog => void dialog.accept());
  await frame.getByRole('button', { name: 'Hapus doa', exact: true }).click();
  await expect(frame.locator('#manage-text')).not.toBeVisible();
  await counts(1, 1);
  await frame.locator('#um-dash [data-act=close]').click();
  await openGalaxy();
  await card(1, 1);

  // All destinations of a message get their own count; other entries do not
  // leak across galaxies. These fixtures go through the real API.
  const other = await engine.evaluate(async id => {
    const other = await window.UM.store.saveGalaksi({ nama: 'Galaksi label Sahabat' });
    await window.UM.store.simpanPesan({ galaksiId: id, galaksiIds: [id, other.id], teks: 'Pesan untuk dua galaksi', tag: ['doa'] });
    await Promise.all([window.UM.galaksi.refresh(), window.UM.sky.refresh()]);
    return other;
  }, galaxy.id);
  await counts(2, 1);
  const otherLabel = frame.locator('.um-glabel').filter({ hasText: other.nama });
  await expect(otherLabel.locator('[data-count=pesan]')).toHaveText('1 pesan');
  await expect(otherLabel.locator('[data-count=doa]')).toHaveText('0 doa');
  expect(await engine.evaluate(`(() => {
    const g=UM.sky.state.daftar.find(item=>item.g.id===${JSON.stringify(other.id)});
    return {pesan:g.nPesan,doa:g.nDoaTertulis+g.nBatu};
  })()`)).toEqual({ pesan: 1, doa: 0 });
  await page.reload();
  await frame.locator('#um-entry [data-act=skip]').click();
  engine = page.frames()[1];
  await counts(2, 1);
  await expect(otherLabel.locator('[data-count=pesan]')).toHaveText('1 pesan');
  await expect(otherLabel.locator('[data-count=doa]')).toHaveText('0 doa');
  expect(errors).toEqual([]);
});
