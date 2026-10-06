import { expect, test } from '@playwright/test';
import { register, login } from './helpers';

test('pesan beberapa kenangan dihitung tanpa menganggap tag doa sebagai sesi doa', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const { frame, email, password } = await register(page, 'galaxy-counts');
  await frame.locator('#um-comp .um-close').click();
  const targets = await page.frames()[1].evaluate(async () => {
    const first = await window.UM.store.saveGalaksi({ nama: 'Kenangan Ibu' });
    const second = await window.UM.store.saveGalaksi({ nama: 'Kenangan Sahabat' });
    await window.UM.store.simpanPesan({ galaksiId: first.id, teks: 'Pesan untuk Ibu', tag: ['doa'] });
    await window.UM.store.simpanPesan({ galaksiId: first.id, galaksiIds: [first.id, second.id], teks: 'Pesan untuk keduanya' });
    await Promise.all([window.UM.galaksi.refresh(), window.UM.sky.refresh()]);
    return [first, second];
  });
  async function counts() {
    for (const [index, target] of targets.entries()) {
      const label = frame.locator('.um-glabel').filter({ hasText: target.nama });
      await expect(label.locator('[data-count=pesan]')).toHaveText(`${index ? 1 : 2} pesan`);
      await expect(label.locator('[data-count=doa]')).toHaveText('0 doa');
      await expect.poll(() => page.frames()[1].evaluate(`(() => {
        const item = UM.sky.state.daftar.find(item => item.g.id === ${JSON.stringify(target.id)});
        return {pesan: item.nPesan, doa: item.nBatu};
      })()`)).toEqual({ pesan: index ? 1 : 2, doa: 0 });
    }
  }
  await frame.locator('.um-dock [data-act=rumah]').click();
  await counts();
  await frame.locator('.um-dock [data-act=dash]').click();
  await frame.locator(`#um-dash [data-act=terbang][data-id="${targets[0].id}"]`).click();
  await expect(frame.locator('[data-galaxy-count=pesan] .v')).toHaveText('2');
  await expect(frame.locator('[data-galaxy-count=doa-diterima] .v')).toHaveText('0');
  await expect(frame.locator('[data-galaxy-count=doa-tertulis]')).toHaveCount(0);
  await page.reload();
  await login(page, email, password);
  await frame.locator('#um-entry [data-act=skip]').click();
  await counts();
  expect(errors).toEqual([]);
});
