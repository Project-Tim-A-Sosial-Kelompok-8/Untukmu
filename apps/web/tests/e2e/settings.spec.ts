import { expect, test } from '@playwright/test';
import { register } from './helpers';

test('pengaturan tersimpan; hapus dapat dibatalkan dan dicoba ulang; keluar menutup sesi', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const { frame, password } = await register(page, 'settings');
  await frame.locator('#um-comp [data-act=cancel]').first().click();
  await page.frames()[1].evaluate(async () => {
    const galaxy = await window.UM.store.saveGalaksi({ nama: 'Kenangan pengaturan', kategori: 'keluarga' });
    await window.UM.store.simpanPesan({ galaksiId: galaxy.id, teks: 'Pesan akun uji pengaturan.' });
  });
  await frame.locator('.um-dock [data-act=set]').click();
  await frame.locator('#um-set [data-act=gb][data-id="0"]').click();
  await expect(frame.locator('#um-set [data-act=gb][data-id="0"]')).toHaveClass(/on/);
  await page.reload();
  await frame.locator('#um-entry [data-act=skip]').click();
  await frame.locator('.um-dock [data-act=set]').click();
  await expect(frame.locator('#um-set [data-act=gb][data-id="0"]')).toHaveClass(/on/);
  await frame.locator('#um-set [data-act=gb][data-id="1"]').click();
  await expect(frame.locator('#um-set [data-act=gb][data-id="1"]')).toHaveClass(/on/);
  await frame.locator('#um-set [data-act=account]').click();
  await expect(frame.locator('#um-account-title')).toHaveText('Pengaturan akun');
  const profileSaved = page.waitForResponse(response => response.url().endsWith('/users/me/settings') && response.request().method() === 'PATCH');
  await frame.locator('#um-profile').selectOption('public');
  expect((await profileSaved).ok()).toBe(true);
  await frame.getByRole('button', { name: 'Kelola pemblokiran', exact: true }).click();
  await expect(frame.locator('#um-social-title')).toHaveText('Daftar pemblokiran');
  await expect(frame.getByText('Belum ada pengirim yang diblokir.')).toBeVisible();
  await frame.getByRole('dialog', { name: 'Daftar pemblokiran' }).getByRole('button', { name: 'Tutup', exact: true }).click();
  await frame.locator('#um-set [data-act=account]').click();
  await expect(frame.locator('#um-profile')).toHaveValue('public');
  await frame.locator('#um-react-account .um-close').click();

  // Destructive controls run only on this isolated test account. Cancel must
  // preserve its records; a wrong password must leave the control usable.
  page.once('dialog', dialog => dialog.dismiss());
  await frame.locator('#um-set [data-act=reset]').click();
  expect(await page.frames()[1].evaluate(async () => (await window.UM.store.listPesan()).length)).toBe(1);
  let confirmationPassword = 'kata-sandi-yang-salah';
  page.on('dialog', async dialog => {
    if (dialog.type() === 'confirm') await dialog.accept();
    else await dialog.accept(confirmationPassword);
  });
  await frame.locator('#um-set [data-act=reset]').click();
  await expect(frame.locator('.um-toast')).toContainText('Kata sandi', { timeout: 60000 });
  await expect(frame.locator('#um-set [data-act=reset]')).toBeEnabled();
  expect(await page.frames()[1].evaluate(async () => (await window.UM.store.listPesan()).length)).toBe(1);
  confirmationPassword = password;
  await frame.locator('#um-set [data-act=reset]').click();
  await expect(frame.locator('#um-set [data-act=reset]')).toBeDisabled();
  await expect(frame.locator('#um-set .um-close')).toBeDisabled();
  await expect(frame.locator('#um-set')).toHaveClass(/on/);
  await frame.locator('#um-entry.on').waitFor({ timeout: 60000 });
  expect(await page.frames()[1].evaluate(async () => ({
    messages: (await window.UM.store.listPesan()).length,
    galaxies: (await window.UM.store.listGalaksi()).length,
  }))).toEqual({ messages: 0, galaxies: 0 });
  await frame.locator('#um-entry [data-act=skip]').click();
  await frame.locator('.um-dock [data-act=set]').click();
  await frame.locator('#um-set [data-act=account]').click();
  await expect(frame.locator('#um-profile')).toHaveValue('public');
  await frame.getByRole('button', { name: 'Keluar', exact: true }).click();
  await frame.locator('#um-entry.on').waitFor({ timeout: 20000 });
  await frame.locator('#um-entry [data-act=skip]').click();
  const write = frame.locator('.um-dock [data-act=tulis]');
  await expect(write).toBeEnabled();
  await write.click();
  await expect(frame.locator('#um-account-title')).toHaveText('Masuk ke Untukmu');
  expect(errors).toEqual([]);
});
