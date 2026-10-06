import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { register, login } from './helpers';

test('kurator memakai unggahan tim dan persetujuan memerlukan rekaman', async ({ page }) => {
  test.skip(process.env.UNTUKMU_BROWSER_TEST !== '1', 'Requires an isolated admin fixture.');
  const { frame, email, password } = await register(page, 'prayer-curator');
  await frame.locator('#um-comp .um-close').click();
  execFileSync(process.env.UNTUKMU_TEST_PYTHON || 'python', [resolve('../backend/tests/promote_browser_admin.py'), email], { env: process.env });
  await page.goto('/admin');
  await login(page, email, password);
  await expect(frame.getByText('Kurasi doa dan audio', { exact: true })).toBeVisible();
  await frame.locator('#prayer-catalog').selectOption('katolik/bapa-kami-katolik');
  await expect(frame.getByRole('button', { name: 'Gunakan rekaman ini', exact: true })).toHaveCount(0);
  await expect(frame.locator('#prayer-audio')).toBeVisible();
  await frame.getByLabel('Judul', { exact: true }).fill('Draf kurator tim');
  await frame.getByLabel('Atribusi sumber', { exact: true }).fill('Naskah fixture pengujian');
  await frame.getByLabel('Tautan sumber HTTPS', { exact: true }).fill('https://example.invalid/fixture');
  await frame.getByLabel('Catatan peninjauan', { exact: true }).fill('Hanya fixture pengujian; belum merupakan materi doa produksi.');
  await frame.locator('[name=reviewed]').check();
  await frame.getByRole('button', { name: 'Simpan kurasi', exact: true }).click();
  await expect(frame.getByRole('alert')).toContainText('Pasang rekaman doa');
  await frame.locator('[name=reviewed]').uncheck();
  await frame.getByRole('button', { name: 'Simpan kurasi', exact: true }).click();
  await expect(frame.getByRole('status').filter({ hasText: 'Kurasi tersimpan' })).toBeVisible();
});
