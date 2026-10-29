import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { login, register } from "./helpers";

interface Metrics {
  days: number;
  scope: string;
  total_users: number;
  created_messages: number;
  admin_created_messages: number;
  messages_by_visibility: { private: number; public_anon: number; unlisted: number };
}

interface AdminUsers {
  total: number;
  items: {
    id: string;
    email: string;
    message_count: number;
    messages_by_visibility: { private: number; public_anon: number; unlisted: number };
  }[];
}

interface CatalogTradition {
  id: string;
  label: { id: string };
  entri: { id: string }[];
}

interface CatalogEntry {
  id: string;
  tradition: string;
  publicly_available: boolean;
  content: {
    nama: { id: string };
    teks?: { id: string } | null;
    arti?: { id: string } | null;
  };
}

async function noHorizontalOverflow(page: Page) {
  const layout = await page.frames()[1].evaluate(() => {
    const dialog = document.querySelector<HTMLElement>(
      '[role="dialog"][aria-labelledby="um-social-title"]',
    );
    if (!dialog) throw new Error("Panel administrator belum terbuka.");
    const bounds = dialog.getBoundingClientRect();
    return {
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      left: bounds.left,
      right: bounds.right,
      content: dialog.scrollWidth,
      available: dialog.clientWidth,
    };
  });
  expect(layout.document).toBeLessThanOrEqual(layout.viewport + 1);
  expect(layout.left).toBeGreaterThanOrEqual(0);
  expect(layout.right).toBeLessThanOrEqual(layout.viewport + 1);
  expect(layout.content).toBeLessThanOrEqual(layout.available + 1);
}

test("admin memisahkan metrik global dan akun, mencari pengguna, serta mengelola seluruh katalog tanpa membuka isi privat", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(process.env.UNTUKMU_BROWSER_TEST !== "1", "Requires an isolated admin fixture.");
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const admin = await register(page, "admin-overview", { startComposer: false });
  const secret = "Catatan privat khusus admin, bukan isi untuk daftar pengguna.";
  await page.frames()[1].evaluate(async (secret) => {
    const first = await window.UM.store.saveGalaksi({ nama: "Kenangan admin pertama" });
    const second = await window.UM.store.saveGalaksi({ nama: "Kenangan admin kedua" });
    // One message with two destinations still counts as one stored message.
    await window.UM.store.simpanPesan({
      galaksiId: first.id,
      galaksiIds: [first.id, second.id],
      teks: secret,
      privasi: "privat",
    });
    await window.UM.store.simpanPesan({
      galaksiId: first.id,
      teks: "Semoga hari ini membawa kedamaian bagi semua orang.",
      privasi: "publik",
    });
  }, secret);

  const otherContext = await browser.newContext({ baseURL: page.url() });
  let otherEmail = "";
  let reviewMessage = "";
  const publicText = "Ucapan publik akun lain untuk pemeriksaan tata letak administrator.";
  try {
    const other = await otherContext.newPage();
    const account = await register(other, "admin-listed-user", { startComposer: false });
    otherEmail = account.email;
    reviewMessage = await other.frames()[1].evaluate(async (text) => {
      const galaxy = await window.UM.store.saveGalaksi({ nama: "Kenangan pengguna lain" });
      const message = await window.UM.store.simpanPesan({
        galaksiId: galaxy.id,
        teks: text,
        privasi: "publik",
      });
      return message.id;
    }, publicText);
  } finally {
    await otherContext.close();
  }
  await page
    .frames()[1]
    .evaluate(
      (id) => window.UM.store.report(id, "Periksa ucapan fixture untuk pengujian antarmuka admin."),
      reviewMessage,
    );
  execFileSync(process.env.UNTUKMU_TEST_API_BIN!, ["make-admin", admin.email], {
    env: process.env,
  });
  await page.goto("/admin");
  await login(page, admin.email, admin.password);
  const frame = page.frameLocator("iframe");
  await expect(frame.getByRole("tab", { name: "Ringkasan", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(frame.locator('[data-metric="account-messages"]')).toHaveText("2");
  await expect(frame.getByLabel("Periode metrik", { exact: true })).toHaveValue("30");

  // Changing periods verifies that the numbers come from the real aggregate
  // endpoint and retain their explicit all-account versus current-account scope.
  for (const days of [7, 90, 365]) {
    const response = page.waitForResponse(
      (response) => response.url().includes(`/api/v1/admin/metrics?days=${days}`) && response.ok(),
    );
    await frame.getByLabel("Periode metrik", { exact: true }).selectOption(String(days));
    const metrics = (await (await response).json()) as Metrics;
    expect(metrics.scope).toBe("all_accounts");
    expect(metrics.days).toBe(days);
    expect(metrics.admin_created_messages).toBe(2);
    expect(metrics.created_messages).toBeGreaterThanOrEqual(3);
    expect(metrics.total_users).toBeGreaterThanOrEqual(2);
    expect(
      Object.values(metrics.messages_by_visibility).reduce((sum, count) => sum + count, 0),
    ).toBe(metrics.created_messages);
    await expect(frame.locator('[data-metric="account-messages"]')).toHaveText("2");
    await expect(frame.locator('[data-metric="global-created-messages"]')).toHaveText(
      metrics.created_messages.toLocaleString("id-ID"),
    );
    await expect(frame.locator('[data-metric="registered-users"]')).toHaveText(
      metrics.total_users.toLocaleString("id-ID"),
    );
  }

  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await frame.getByRole("tab", { name: "Ringkasan", exact: true }).click();
    await expect(frame.locator('[data-metric="account-messages"]')).toHaveText("2");
    await noHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`admin-ringkasan-${width}.png`) });

    await frame.getByRole("tab", { name: "Pengguna terdaftar", exact: true }).click();
    const query = width === 1366 ? otherEmail : otherEmail.split("@")[0];
    await frame.getByLabel("Cari pengguna", { exact: true }).fill(query);
    const response = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === "/api/v1/admin/users" &&
        url.searchParams.get("q") === query &&
        response.ok()
      );
    });
    await frame.getByRole("button", { name: "Cari", exact: true }).click();
    const users = (await (await response).json()) as AdminUsers;
    expect(users.total).toBe(1);
    expect(users.items).toMatchObject([
      {
        email: otherEmail,
        message_count: 1,
        messages_by_visibility: { private: 0, public_anon: 1, unlisted: 0 },
      },
    ]);
    expect(JSON.stringify(users)).not.toContain(secret);
    for (const user of users.items) {
      expect(user).not.toHaveProperty("payload");
      expect(user).not.toHaveProperty("public_body");
      expect(user).not.toHaveProperty("encryption_record");
    }
    await expect(frame.getByRole("row").filter({ hasText: otherEmail })).toContainText("1");
    await expect(frame.getByRole("row").filter({ hasText: admin.email })).toHaveCount(0);
    const header = frame.getByRole("columnheader", { name: "Pesan tersimpan", exact: true });
    if (width > 640) await expect(header).toBeVisible();
    else {
      await expect(header).toBeAttached();
      await expect(frame.locator('[data-label="Pesan tersimpan"] .um-admin-user-count')).toHaveText(
        "1",
      );
    }
    await noHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`admin-pengguna-${width}.png`) });

    await frame.getByRole("tab", { name: "Peninjauan konten", exact: true }).click();
    const review = frame.locator("article").filter({ hasText: publicText });
    await expect(review).toBeVisible();
    await expect(review.getByRole("button", { name: "Setujui", exact: true })).toBeVisible();
    await noHorizontalOverflow(page);
    await expect(
      frame.locator('[role="dialog"][aria-labelledby="um-social-title"]'),
    ).not.toContainText(secret);
    await page.screenshot({ path: testInfo.outputPath(`admin-peninjauan-${width}.png`) });
  }

  const reviewedCard = frame.locator("article").filter({ hasText: publicText });
  const decisionNote = "Ucapan fixture sudah diperiksa dan layak ditampilkan kepada publik.";
  await reviewedCard.getByLabel("Catatan keputusan", { exact: true }).fill(decisionNote);
  await page.frames()[1].evaluate(`(() => {
    window.__adminOriginalGalaxyRefresh = UM.galaksi.refresh;
    UM.galaksi.refresh = async () => { throw new Error('Penyegaran visual fixture gagal.'); };
  })()`);
  try {
    const decisionResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/v1/admin/moderation/${reviewMessage}/decision`) &&
        response.request().method() === "POST",
    );
    await reviewedCard.getByRole("button", { name: "Setujui", exact: true }).click();
    const decision = await decisionResponse;
    expect(decision.status()).toBe(200);
    expect(decision.request().postDataJSON()).toMatchObject({
      decision: "approve",
      reason: decisionNote,
    });
    await expect(reviewedCard).toHaveCount(0);
    await expect(
      frame
        .getByRole("tabpanel", { name: "Peninjauan konten" })
        .getByRole("status")
        .filter({ hasText: "Keputusan tersimpan" }),
    ).toBeVisible();
  } finally {
    await page.frames()[1].evaluate(`(() => {
      UM.galaksi.refresh = window.__adminOriginalGalaxyRefresh;
      delete window.__adminOriginalGalaxyRefresh;
    })()`);
  }

  const catalogResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/admin/prayers") && response.ok(),
  );
  await frame.getByRole("tab", { name: "Doa & audio", exact: true }).click();
  const entries = (await (await catalogResponse).json()) as CatalogEntry[];
  const source = JSON.parse(
    readFileSync(resolve("../backend/data/prayers-v1.json"), "utf8"),
  ) as CatalogTradition[];
  const expectedIds = source.flatMap((tradition) =>
    tradition.entri.map((entry) => `${tradition.id}/${entry.id}`),
  );
  expect(entries.map((entry) => entry.id).sort()).toEqual(expectedIds.sort());
  const traditions = (await (
    await page.request.get("/api/v1/prayers/traditions")
  ).json()) as CatalogTradition[];
  expect(traditions.map((tradition) => tradition.id).sort()).toEqual(
    source.map((tradition) => tradition.id).sort(),
  );
  expect(
    traditions
      .flatMap((tradition) => tradition.entri.map((entry) => `${tradition.id}/${entry.id}`))
      .sort(),
  ).toEqual(
    entries
      .filter((entry) => entry.publicly_available)
      .map((entry) => entry.id)
      .sort(),
  );
  const optionIds = await frame
    .locator("#prayer-catalog option")
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
    );
  expect(optionIds.sort()).toEqual(expectedIds.sort());
  for (const tradition of source) {
    await expect(frame.locator(`#prayer-tradition option[value="${tradition.id}"]`)).toHaveText(
      tradition.label.id,
    );
  }
  for (const entry of entries) {
    await frame.locator("#prayer-catalog").selectOption(entry.id);
    await expect(frame.getByLabel("ID katalog", { exact: true })).toHaveValue(entry.id);
    await expect(frame.getByLabel("Judul", { exact: true })).toHaveValue(entry.content.nama.id);
    await expect(frame.getByLabel("Teks doa", { exact: true })).toHaveValue(
      entry.content.teks?.id || "",
    );
    await expect(frame.getByLabel("Terjemahan", { exact: true })).toHaveValue(
      entry.content.arti?.id || "",
    );
  }
  await noHorizontalOverflow(page);
  await frame.getByLabel("ID katalog", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("admin-katalog-390.png") });

  // The real reported card is checked above. A controlled empty response also
  // exercises the empty layout without changing other tests' moderation queue.
  await page.route("**/api/v1/admin/moderation/queue?*", (route) => route.fulfill({ json: [] }));
  await page.reload();
  await frame.getByRole("tab", { name: "Peninjauan konten", exact: true }).click();
  await expect(
    frame.getByText("Tidak ada pesan yang menunggu peninjauan.", { exact: true }),
  ).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("admin-peninjauan-kosong-390.png") });
  expect(errors).toEqual([]);
});
