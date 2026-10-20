import { expect, test } from "@playwright/test";
import { login, register } from "./helpers";

test("muat ulang mempertahankan akun dengan kunci terkunci; ganti akun menjaga data akun lama", async ({
  page,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { frame, email, password } = await register(page, "account-original");
  await frame.locator("#um-comp .um-close").click();
  const original = await page.frames()[1].evaluate(() => window.UM.store.identitas());
  expect(original?.email).toBe(email);
  const secret = "Kenangan privat milik akun pertama";
  await page.frames()[1].evaluate(async (secret) => {
    const g = await window.UM.store.saveGalaksi({
      nama: "Kenangan akun pertama",
      kategori: "sahabat",
    });
    await window.UM.store.simpanPesan({ galaksiId: g.id, teks: secret });
    await window.UM.store.simpanPesan({ galaksiId: g.id, teks: "Doa privat akun pertama" });
  }, secret);
  await page.reload();
  await expect(frame.locator("#um-entry")).toHaveClass(/on/);
  await expect(frame.locator("#um-account-title")).toHaveCount(0);
  expect(await page.frames()[1].evaluate(() => window.UM.account.isLogged())).toBe(true);
  expect(await page.frames()[1].evaluate(() => window.UM.store.identitas())).toMatchObject({
    id: original!.id,
    email,
  });
  expect(await page.frames()[1].evaluate(() => window.UM.crypto.unlocked())).toBe(false);
  const locked = await page.frames()[1].evaluate(async () => {
    const rows = await window.UM.store.listPesan();
    return Promise.all(rows.map((row) => window.UM.store.bacaIsi(row)));
  });
  expect(locked).toEqual([null, null]);
  await frame.locator("#um-entry [data-act=skip]").click();
  await frame.locator(".um-dock [data-act=set]").click();
  await Promise.all([
    page.waitForEvent("framenavigated", { predicate: (frame) => frame.parentFrame() !== null }),
    frame.locator("#um-set [data-act=switch-account]").click(),
  ]);
  await expect(frame.locator("#um-entry")).toHaveClass(/on/);
  expect(await page.frames()[1].evaluate(() => window.UM.account.isLogged())).toBe(false);
  expect(await page.frames()[1].evaluate(() => window.UM.crypto.unlocked())).toBe(false);
  await page.reload();
  await expect(frame.locator("#um-entry")).toHaveClass(/on/);
  expect(await page.frames()[1].evaluate(() => window.UM.account.isLogged())).toBe(false);
  await page.frames()[1].evaluate(() => window.UM.account.open());
  await expect(frame.locator("#um-account-title")).toHaveText("Masuk ke Untukmu", {
    timeout: 20000,
  });
  await expect(frame.getByRole("button", { name: "Daftar akun", exact: true })).toBeVisible();
  const other = await register(page, "account-other", { startComposer: false });
  expect(
    await page.frames()[1].evaluate(async () => (await window.UM.store.listPesan()).length),
  ).toBe(0);
  await other.frame.locator("#um-entry [data-act=skip]").click();
  await other.frame.locator(".um-dock [data-act=set]").click();
  await Promise.all([
    page.waitForEvent("framenavigated", { predicate: (frame) => frame.parentFrame() !== null }),
    other.frame.locator("#um-set [data-act=switch-account]").click(),
  ]);
  await login(page, email, password);
  const restored = await page.frames()[1].evaluate(async () => {
    const rows = await window.UM.store.listPesan();
    return Promise.all(
      rows.map(async (row) => ({ type: row.jenis, text: await window.UM.store.bacaIsi(row) })),
    );
  });
  expect(restored).toEqual([
    { type: "pesan", text: secret },
    { type: "pesan", text: "Doa privat akun pertama" },
  ]);
  expect(errors).toEqual([]);
});

for (const action of ["keep", "delete"] as const) {
  test(`hapus akun dengan pilihan ${action}: konfirmasi, retry, dan akun baru terpisah`, async ({
    page,
  }) => {
    test.setTimeout(240000);
    const { frame, email, password } = await register(page, `delete-${action}`);
    await frame.locator("#um-comp .um-close").click();
    await page.frames()[1].evaluate(async () => {
      const g = await window.UM.store.saveGalaksi({
        nama: "Galaksi sebelum hapus",
        kategori: "sahabat",
      });
      await window.UM.store.simpanPesan({
        galaksiId: g.id,
        teks: "Pesan untuk menguji penghapusan",
      });
    });
    await frame.locator(".um-dock [data-act=set]").click();
    await frame.locator("#um-set [data-act=delete-account]").click();
    await expect(frame.locator("#um-account-title")).toHaveText("Hapus akun");
    await expect(
      frame.getByRole("button", { name: "Hapus akun permanen", exact: true }),
    ).toBeDisabled();
    await frame.getByRole("button", { name: "Batal, kembali ke pengaturan" }).click();
    expect(
      await page.frames()[1].evaluate(async () => (await window.UM.store.listPesan()).length),
    ).toBe(1);
    await frame.getByRole("button", { name: "Hapus akun", exact: true }).click();
    await frame.locator(`input[name="content-action"][value="${action}"]`).check();
    await frame.locator("#delete-account-password").fill("kata-sandi-salah");
    await frame.getByRole("checkbox", { name: /Saya memahami/ }).check();
    await frame.getByRole("button", { name: "Hapus akun permanen", exact: true }).click();
    await expect(frame.getByRole("alert")).toContainText("Kata sandi tidak cocok", {
      timeout: 60000,
    });
    await frame.locator("#delete-account-password").fill(password);
    await Promise.all([
      page.waitForEvent("framenavigated", { predicate: (frame) => frame.parentFrame() !== null }),
      frame.getByRole("button", { name: "Hapus akun permanen", exact: true }).click(),
    ]);
    await expect(frame.locator("html")).toHaveAttribute("data-renderer", "react-three-fiber");
    await page.frames()[1].evaluate(() => window.UM.account.open());
    await expect(frame.locator("#um-account-title")).toHaveText("Masuk ke Untukmu", {
      timeout: 60000,
    });
    await frame.locator("#um-email").fill(email);
    await frame.locator("#um-account-password").fill(password);
    await frame.getByRole("button", { name: "Masuk", exact: true }).click();
    await expect(frame.getByRole("alert")).toContainText("tidak cocok", { timeout: 60000 });
    await register(page, `replacement-${action}`, { startComposer: false });
    expect(
      await page.frames()[1].evaluate(async () => (await window.UM.store.listPesan()).length),
    ).toBe(0);
  });
}

test("pesan publik tanpa tujuan tetap dapat dibaca lintas akun melalui Jelajah", async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  const shared = {
    id: "161bdab6-4d99-4b65-aa3c-8feac3181666",
    entry_type: "message",
    visibility: "public_anon",
    public_body: "Doa publik untuk semua yang sedang berjuang",
    moderation_status: "approved",
    author_deleted: true,
    is_mine: false,
    constellation_ids: [],
    attachment_ids: [],
    created_at: new Date().toISOString(),
    prayer_count: 2,
    empathy_count: 0,
    tags: [],
  };
  const context = await browser.newContext();
  const second = await context.newPage();
  try {
    for (const [index, accountPage] of [page, second].entries()) {
      await accountPage.route("**/api/v1/explore?*", (route) => route.fulfill({ json: [shared] }));
      await accountPage.route("**/api/v1/explore/constellations?*", (route) =>
        route.fulfill({ json: [] }),
      );
      await accountPage.route("**/api/v1/explore/messages?*", (route) =>
        route.fulfill({ json: [shared] }),
      );
      const { frame } = await register(accountPage, `shared-${index}`, { startComposer: false });
      await frame.locator("#um-entry [data-act=skip]").click();
      const data = await accountPage.frames()[1].evaluate(async () => ({
        own: await window.UM.store.listPesan(),
        sceneMessages: await window.UM.store.listPesanLadang(),
        shared: await window.UM.store.explore(),
        galaxies: await window.UM.store.listGalaksiLadang(),
      }));
      expect(data.own).toEqual([]);
      expect(data.shared).toMatchObject([
        { jenis: "pesan", publicBody: shared.public_body, authorDeleted: true, sendiri: false },
      ]);
      expect(data.galaxies).toEqual([]);
      expect(data.sceneMessages).toMatchObject([{ id: shared.id, galaksiIds: [], sendiri: false }]);
      await frame.locator(".um-dock [data-act=jelajah]").click();
      await expect(frame.locator("#um-exp .txt")).toHaveText(shared.public_body);
    }
  } finally {
    await context.close();
  }
});

test("refresh pada tab lama tidak menerima identitas akun lain dari cookie bersama", async ({
  page,
  context,
}) => {
  test.setTimeout(240000);
  const first = await register(page, "tab-first", { startComposer: false });
  await first.frame.locator("#um-entry [data-act=skip]").click();
  const other = await context.newPage();
  try {
    const second = await register(other, "tab-second", { startComposer: false });
    let navigations = 0;
    page.on("framenavigated", (frame) => {
      if (frame.parentFrame()) navigations++;
    });
    await page.route("**/api/v1/dashboard/summary", (route) =>
      route.fulfill({ status: 401, json: { detail: "Sesi uji telah berakhir." } }),
    );
    await page.frames()[1].evaluate(() => {
      void window.UM.store.stats().catch(() => undefined);
    });
    await expect(first.frame.locator("#um-entry")).toHaveClass(/on/, { timeout: 30000 });
    expect(await page.frames()[1].evaluate(() => window.UM.account.isLogged())).toBe(false);
    expect(await page.frames()[1].evaluate(() => window.UM.crypto.unlocked())).toBe(false);
    expect(await page.frames()[1].evaluate(() => window.UM.store.identitas())).toBeNull();
    expect(navigations).toBeLessThanOrEqual(1);
    await page.reload();
    await expect(first.frame.locator("#um-entry")).toHaveClass(/on/);
    expect(await page.frames()[1].evaluate(() => window.UM.store.identitas())).toBeNull();
    expect(await other.frames()[1].evaluate(() => window.UM.store.identitas())).toMatchObject({
      email: second.email,
    });
    expect(await other.frames()[1].evaluate(() => window.UM.account.isLogged())).toBe(true);
  } finally {
    await other.close();
  }
});

for (const expiresDuringRestore of [false, true]) {
  test(`sesi ${expiresDuringRestore ? "kedaluwarsa saat dipulihkan" : "dicabut"} membuka tamu tanpa perulangan refresh`, async ({
    page,
  }) => {
    let statuses = 0;
    let refreshes = 0;
    let navigations = 0;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("framenavigated", (frame) => {
      if (frame.parentFrame()) navigations++;
    });
    await page.route("**/api/v1/auth/status", (route) => {
      statuses++;
      return route.fulfill({ json: { authenticated: expiresDuringRestore } });
    });
    await page.route("**/api/v1/auth/refresh", (route) => {
      refreshes++;
      return route.fulfill({ status: 401, json: { detail: "Sesi telah berakhir." } });
    });
    await page.goto("/");
    const frame = page.frameLocator("iframe");
    for (let load = 1; load <= 2; load++) {
      await expect(frame.locator("#um-entry")).toHaveClass(/on/);
      const state = await page.frames()[1].evaluate(async () => {
        await Promise.all([
          window.UM.store.ready(),
          window.UM.store.ready(),
          window.UM.store.listGalaksi(),
          window.UM.store.listPesan(),
        ]);
        return {
          logged: window.UM.account.isLogged(),
          identity: await window.UM.store.identitas(),
          unlocked: window.UM.crypto.unlocked(),
        };
      });
      expect(state).toEqual({ logged: false, identity: null, unlocked: false });
      await expect(frame.locator("#um-account-title")).toHaveCount(0);
      expect(statuses).toBe(load);
      expect(refreshes).toBe(expiresDuringRestore ? load : 0);
      expect(navigations).toBe(load);
      if (load === 1) await page.reload();
    }
    expect(errors).toEqual([]);
  });
}
