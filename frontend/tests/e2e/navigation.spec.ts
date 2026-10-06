import { expect, test, type Page } from "@playwright/test";
import { register } from "./helpers";

async function expectClearLayout(page: Page) {
  const overlaps = await page.frames()[1].evaluate(() => {
    const selectors = [".um-brand", "#return-home", "#skyback", ".um-skyctl", ".um-dock", "#beacon-panel"];
    const regions = selectors.flatMap(selector => {
      const el = document.querySelector<HTMLElement>(selector);
      return el?.getClientRects().length ? [{ selector, rect: el.getBoundingClientRect() }] : [];
    });
    const result: string[] = [];
    for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) {
      const a = regions[i], b = regions[j];
      if (a.rect.left < b.rect.right && a.rect.right > b.rect.left && a.rect.top < b.rect.bottom && a.rect.bottom > b.rect.top) result.push(`${a.selector} / ${b.selector}`);
    }
    return result;
  });
  expect(overlaps).toEqual([]);
}

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`navigasi dan panel tidak bertumpuk, semua menu bisa diklik (${viewport.width}px)`, async ({ page }, testInfo) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize(viewport);
    const { frame } = await register(page, `navigation-${viewport.width}`, { startComposer: false });
    const engine = page.frames()[1];
    await frame.locator("#um-entry [data-act=skip]").click();
    await expectClearLayout(page);

    await frame.locator('.um-dock [data-act=peta]').click();
    await expect.poll(() => engine.evaluate(() => window.UM_ENGINE!.metrics().mode)).toBe("sky");
    await expectClearLayout(page);
    await page.screenshot({ path: testInfo.outputPath("peta.png") });
    await frame.locator('#skyback').click();
    await expect.poll(() => engine.evaluate(() => window.UM_ENGINE!.metrics().mode)).toBe("galaxy");

    for (const [action, screen] of [["tulis", "um-comp"], ["dash", "um-dash"], ["setup", "um-setup"]]) {
      await frame.locator(`.um-dock [data-act=${action}]`).click();
      await expect(frame.locator(`#${screen}`)).toHaveClass(/on/);
      await frame.locator(`#${screen} .um-close`).click();
      await expect(frame.locator(`#${screen}`)).not.toHaveClass(/on/);
    }
    await frame.locator('.um-dock [data-act=jelajah]').click();
    await frame.locator('#um-exp [data-act=sort][data-id=doa]').click();
    await frame.locator('#um-exp [data-act=filter]').click();
    await frame.locator('#um-exp [data-act=close]').click();
    await frame.locator('.um-dock [data-act=doa]').click();
    await expect(frame.locator('#um-doa')).toHaveClass(/on/);
    await expect(frame.locator('#um-doa [data-act=hub-trad]')).toHaveCount(7);
    await frame.locator('#um-doa [data-act=close]').click();
    await frame.locator('.um-dock [data-act=set]').click();
    await frame.locator('#um-set .um-close').click();
    await expectClearLayout(page);
    await page.screenshot({ path: testInfo.outputPath("rumah.png") });
    expect(errors).toEqual([]);
  });
}

test("tombol kunci bisa dicoba lagi setelah salah kata sandi; galaksi tetap ada", async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const { frame, password } = await register(page, "navigation-key");
  await frame.locator('#um-comp [data-act=cancel]').first().click();
  await page.frames()[1].evaluate(async () => {
    const g = await window.UM.store.saveGalaksi({ nama: "Galaksi tetap", kategori: "sahabat" });
    await window.UM.store.simpanPesan({ galaksiId: g.id, teks: "Tetap ada setelah kunci dibuka lagi" });
    await window.UM.galaksi.refresh();
  });
  await frame.locator('.um-dock [data-act=setup]').click();
  await frame.locator('#um-setup [data-act=lock]').click();
  await frame.locator('#um-pw').fill("kata-sandi-salah");
  await frame.locator('#um-setup [data-act=unlock]').click();
  await expect(frame.locator('#um-setup .um-error')).not.toBeEmpty({ timeout: 60000 });
  await expect(frame.locator('#um-setup [data-act=unlock]')).toBeEnabled();
  await frame.locator('#um-pw').fill(password);
  await frame.locator('#um-setup [data-act=unlock]').click();
  await expect(frame.locator('#um-setup [data-act=lock]')).toBeVisible({ timeout: 60000 });
  await frame.locator('#um-setup [data-act=close]').click();
  await frame.locator('.um-dock [data-act=rumah]').click();
  await expect(frame.locator('.um-glabel')).toContainText("Galaksi tetap");
  await frame.locator('.um-dock [data-act=dash]').click();
  await frame.locator('#um-dash [data-act=terbang]').first().click();
  await expect(frame.locator('#bp-name')).toHaveText("Galaksi tetap");
  await frame.locator('#um-gk-list [data-bintang]').first().click();
  await expect(frame.locator('#bp-desc')).toContainText("Tetap ada setelah kunci dibuka lagi");
  await frame.locator('#beacon-panel [data-act=manage]').click();
  await frame.locator('#manage-text').fill("Pesan diperbarui");
  await frame.getByRole('button', { name: 'Simpan perubahan', exact: true }).click();
  await expect(frame.locator('#manage-text')).not.toBeVisible();
  await expect(frame.locator('#beacon-panel')).not.toHaveClass(/open/);
  await expect.poll(() => page.frames()[1].evaluate(async () => window.UM.store.bacaIsi((await window.UM.store.listPesan())[0]))).toBe("Pesan diperbarui");
  expect(errors).toEqual([]);
});
