import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { register, login } from "./helpers";
import { uiScreenshotPath } from "./artifacts";

test("kurator memakai unggahan tim dan persetujuan memerlukan rekaman", async ({ page }) => {
  test.skip(process.env.UNTUKMU_BROWSER_TEST !== "1", "Requires an isolated admin fixture.");
  const { frame, email, password } = await register(page, "prayer-curator");
  await frame.locator("#um-comp .um-close").click();
  execFileSync(process.env.UNTUKMU_TEST_API_BIN!, ["make-admin", email], { env: process.env });
  await page.goto("/admin");
  await login(page, email, password);
  await frame.getByRole("tab", { name: "Doa & audio", exact: true }).click();
  await expect(frame.getByText("Kurasi doa dan audio", { exact: true })).toBeVisible();
  await frame.locator("#prayer-catalog").selectOption("katolik/bapa-kami-katolik");
  await expect(frame.getByRole("button", { name: "Gunakan rekaman ini", exact: true })).toHaveCount(
    0,
  );
  await expect(frame.locator("#prayer-audio")).toBeVisible();
  await frame.getByLabel("Judul", { exact: true }).fill("Draf kurator tim");
  await frame.getByLabel("Atribusi sumber", { exact: true }).fill("Naskah fixture pengujian");
  await frame
    .getByLabel("Tautan sumber HTTPS", { exact: true })
    .fill("https://example.invalid/fixture");
  await frame
    .getByLabel("Catatan peninjauan", { exact: true })
    .fill("Hanya fixture pengujian; belum merupakan materi doa produksi.");
  await frame.locator("[name=reviewed]").check();
  await frame.getByRole("button", { name: "Simpan kurasi", exact: true }).click();
  await expect(frame.getByRole("alert")).toContainText("Pasang rekaman doa");
  await frame.locator("[name=reviewed]").uncheck();
  await frame.getByRole("button", { name: "Simpan kurasi", exact: true }).click();
  await expect(frame.getByRole("status").filter({ hasText: "Kurasi tersimpan" })).toBeVisible();
});

test("admin membaca durasi audio asli dan menolak berkas yang rusak", async ({ page }) => {
  test.skip(process.env.UNTUKMU_BROWSER_TEST !== "1", "Requires an isolated admin fixture.");
  const { frame, email, password } = await register(page, "audio-preview-admin");
  await frame.locator("#um-comp .um-close").click();
  execFileSync(process.env.UNTUKMU_TEST_API_BIN!, ["make-admin", email], { env: process.env });
  await page.goto("/admin");
  await login(page, email, password);
  await frame.getByRole("tab", { name: "Doa & audio", exact: true }).click();
  await frame.locator("#prayer-catalog").selectOption("katolik/bapa-kami-latin");
  const audioInput = frame.locator("#prayer-audio");
  await audioInput.setInputFiles({
    name: "broken.mp3",
    mimeType: "audio/mpeg",
    buffer: Buffer.alloc(512),
  });
  await expect(frame.getByRole("alert")).toContainText("Berkas audio rusak");
  await expect(audioInput).toHaveValue("");
  await audioInput.setInputFiles(resolve("../backend/data/prayer-audio/pater-noster.ogg"));
  await expect(
    frame.getByRole("status").filter({ hasText: "Durasi terbaca 29 detik" }),
  ).toBeVisible();
  await expect(frame.getByLabel("Durasi (detik)", { exact: true })).toHaveValue("29");
  const localPreview = frame.locator('audio[aria-label="Pratinjau audio yang akan diunggah"]');
  await expect(localPreview).toBeVisible();
  await expect(frame.getByRole("button", { name: "Simpan kurasi", exact: true })).toBeEnabled();
  await page.screenshot({
    path: await uiScreenshotPath("desktop", "admin-pratinjau-audio.png"),
    fullPage: true,
  });
  await frame.locator("#prayer-catalog").selectOption("umum/doa-umum");
  await expect(localPreview).toHaveCount(0);
  await expect(frame.getByRole("button", { name: "Simpan kurasi", exact: true })).toBeEnabled();
});

test("kurator menyaring antrean, mencoba ulang tanpa unggah ulang, lalu lanjut tanpa persetujuan otomatis", async ({
  page,
}) => {
  test.skip(process.env.UNTUKMU_BROWSER_TEST !== "1", "Requires an isolated admin fixture.");
  const { frame, email, password } = await register(page, "audio-curation-retry");
  await frame.locator("#um-comp .um-close").click();
  execFileSync(process.env.UNTUKMU_TEST_API_BIN!, ["make-admin", email], { env: process.env });
  const entries = [
    { id: "fixture/first", has_audio: false, reviewed: false, publicly_available: false },
    { id: "fixture/next", has_audio: true, reviewed: false, publicly_available: false },
    { id: "fixture/ready", has_audio: true, reviewed: true, publicly_available: true },
  ].map((entry, index) => ({
    ...entry,
    tradition: "fixture",
    tradition_label: "Tradisi fixture pengujian",
    catalog_title: `Entri fixture ${index + 1}`,
    content: {
      nama: { id: `Entri fixture ${index + 1}` },
      teks: { id: "Teks fixture pengujian, bukan materi doa produksi." },
      sumber: "Sumber fixture pengujian",
      source_url: "https://example.invalid/fixture",
      review_note: "Belum disetujui; hanya pengujian alur admin.",
      detik: 29,
    },
    audio_meta: { license: "Lisensi fixture", attribution: "Atribusi fixture" },
    audio_preview_url: entry.has_audio ? "/api/v1/prayers/audio/pater-noster" : null,
  }));
  let presigns = 0;
  let uploads = 0;
  let completions = 0;
  const saves: { reviewed: boolean; title: string }[] = [];
  await page.route("**/fixture-recording-upload", async (route) => {
    uploads++;
    await route.fulfill({ status: 204 });
  });
  await page.route(/\/api\/v1\/admin\/prayers(?:\/.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/audio/presign")) {
      presigns++;
      await route.fulfill({
        json: { upload: { url: `${url.origin}/fixture-recording-upload`, fields: {} } },
      });
    } else if (url.pathname.endsWith("/audio/complete")) {
      completions++;
      await route.fulfill({ json: { ok: true } });
    } else if (route.request().method() === "PUT") {
      saves.push(route.request().postDataJSON());
      if (saves.length === 1) {
        await route.fulfill({ status: 503, json: { detail: "Penyimpanan fixture terputus." } });
      } else {
        entries[0].has_audio = true;
        await route.fulfill({ json: { ok: true } });
      }
    } else {
      await route.fulfill({ json: entries });
    }
  });
  await page.goto("/admin");
  await login(page, email, password);
  await frame.getByRole("tab", { name: "Doa & audio", exact: true }).click();
  await frame.getByLabel("Status kurasi", { exact: true }).selectOption("needs-audio");
  await expect(frame.locator(".um-admin-catalog-item")).toHaveCount(1);
  await frame.getByLabel("Status kurasi", { exact: true }).selectOption("needs-review");
  await expect(frame.locator(".um-admin-catalog-item")).toHaveCount(1);
  await expect(frame.locator(".um-admin-catalog-item")).toContainText("Entri fixture 2");
  await frame.getByLabel("Status kurasi", { exact: true }).selectOption("");
  await frame.locator("#prayer-catalog").selectOption("fixture/first");
  await frame
    .locator("#prayer-audio")
    .setInputFiles(resolve("../backend/data/prayer-audio/pater-noster.ogg"));
  await expect(
    frame.getByRole("status").filter({ hasText: "Durasi terbaca 29 detik" }),
  ).toBeVisible();
  await frame.getByLabel("Judul", { exact: true }).fill("Judul draf yang harus dipertahankan");
  await expect(frame.locator("[name=reviewed]")).not.toBeChecked();
  await frame.getByRole("button", { name: "Simpan dan lanjut", exact: true }).click();
  await expect(frame.getByRole("alert")).toContainText("Penyimpanan fixture terputus.");
  await expect(
    frame.getByRole("status").filter({ hasText: "Audio sudah tersimpan" }),
  ).toBeVisible();
  await expect(frame.getByLabel("Judul", { exact: true })).toHaveValue(
    "Judul draf yang harus dipertahankan",
  );
  expect({ presigns, uploads, completions }).toEqual({ presigns: 1, uploads: 1, completions: 1 });
  await frame.getByRole("button", { name: "Simpan dan lanjut", exact: true }).click();
  await expect(frame.getByLabel("ID katalog", { exact: true })).toHaveValue("fixture/next");
  await expect(frame.getByRole("heading", { name: "Entri fixture 2", exact: true })).toBeFocused();
  await expect(frame.locator("[name=reviewed]")).not.toBeChecked();
  expect({ presigns, uploads, completions }).toEqual({ presigns: 1, uploads: 1, completions: 1 });
  expect(saves).toEqual([
    expect.objectContaining({ reviewed: false, title: "Judul draf yang harus dipertahankan" }),
    expect.objectContaining({ reviewed: false, title: "Judul draf yang harus dipertahankan" }),
  ]);
});
