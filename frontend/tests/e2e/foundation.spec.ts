import { test, expect } from "@playwright/test";
import { register } from "./helpers";

test("akun → kunci → pesan privat → muat ulang → buka lagi", async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  const requests: { url: string; body: string }[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text() + " " + message.location().url);
  });
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/") && request.postData())
      requests.push({ url: request.url(), body: request.postData()! });
  });
  const { frame, password, recovery, registrationConsoleError } = await register(page, "browser");
  expect(recovery.length).toBe(43);
  await frame.locator("#um-nama").fill("Galaksi sahabat");
  await frame.locator("#um-comp [data-act=cat]").first().click();
  await expect(frame.locator("#um-nama")).toHaveValue("Galaksi sahabat");
  await frame.locator("#um-comp [data-act=next]").click();
  await frame.locator("#um-comp [data-act=next]").click();
  const secret = "Isi privat uji tidak boleh terlihat di server 🌌";
  await frame.locator("#um-isi").fill(secret);
  await frame.locator("#um-comp [data-act=next]").click();
  await frame.locator("#um-comp [data-act=save]").click();
  await expect(frame.locator("#um-comp")).not.toHaveClass(/on/);
  const write = requests.find((request) => request.url.endsWith("/messages"));
  expect(write).toBeDefined();
  expect(write!.body).not.toContain(secret);
  expect(requests.map((r) => r.body).join("\n")).not.toContain(password);
  expect(requests.map((r) => r.body).join("\n")).not.toContain(recovery);
  const data = JSON.parse(write!.body);
  expect(data.payload.alg).toBe("A256GCM");
  expect(data.payload.ct).toBeTruthy();
  await page.reload();
  await expect(frame.locator("html")).toHaveAttribute("data-renderer", "react-three-fiber");
  await page.frames()[1].evaluate(() => window.UM.store.ready());
  expect(await page.frames()[1].evaluate(() => window.UM.account.isLogged())).toBe(true);
  expect(await page.frames()[1].evaluate(() => window.UM.crypto.unlocked())).toBe(false);
  await expect(frame.locator("#um-account-title")).toHaveCount(0);
  await frame.locator(".um-dock [data-act=setup]").click();
  await frame.locator("#um-pw").fill(password);
  await frame.locator("#um-setup [data-act=unlock]").click();
  await expect(frame.locator("#um-setup [data-act=lock]")).toBeVisible({ timeout: 60000 });
  const content = await page.frames()[1].evaluate(async () => {
    const [item] = await window.UM.store.listPesan();
    return window.UM.store.bacaIsi(item);
  });
  expect(content).toBe(secret);
  const tampering = await page.frames()[1].evaluate(async () => {
    const [item] = await window.UM.store.listPesan();
    if (!item.isi) throw new Error("Pesan privat harus memiliki payload terenkripsi.");
    item.isi.aad += ":changed";
    try {
      await window.UM.crypto.decryptPesan(item.isi);
      return false;
    } catch {
      return true;
    }
  });
  expect(tampering).toBe(true);
  const recovered = await page.frames()[1].evaluate(
    async ({ recovery, payload }) => {
      window.UM.crypto.lock();
      const locked = await window.UM.crypto.decryptPesan(payload);
      await window.UM.crypto.unlockWithRecovery(recovery);
      const content = await window.UM.crypto.decryptPesan(payload);
      const file = new File(["berkas privat"], "kenangan.txt", { type: "text/plain" });
      const encrypted = await window.UM.crypto.encryptFile(file, crypto.randomUUID());
      const opened = await window.UM.crypto.decryptFile(
        await encrypted.blob.arrayBuffer(),
        encrypted,
      );
      return { locked, content, file: await opened.text(), name: opened.name };
    },
    { recovery, payload: data.payload },
  );
  expect(recovered).toEqual({
    locked: null,
    content: secret,
    file: "berkas privat",
    name: "kenangan.txt",
  });
  // Only the exact registration-limit response followed by a successful retry is expected.
  expect(errors.filter((error) => error !== registrationConsoleError)).toEqual([]);
});

test("tamu tidak mendapat data contoh atau akses komposer tanpa akun", async ({ page }) => {
  await page.goto("/");
  const frame = page.frameLocator("iframe");
  await frame.locator("#um-entry.on").waitFor();
  const state = await page.frames()[1].evaluate(async () => ({
    galaxies: await window.UM.store.listGalaksi(),
    messages: await window.UM.store.listPesan(),
    // Next's dev server opens its own debug channel; it is not app data.
    databases: (await indexedDB.databases()).filter((db) => db.name !== "__next_debug_channel"),
  }));
  expect(state.galaxies).toEqual([]);
  expect(state.messages).toEqual([]);
  expect(state.databases).toEqual([]);
  await page.keyboard.press("Escape");
  await frame.locator(".um-dock [data-act=tulis]").click();
  await expect(frame.locator("#um-account-title")).toHaveText("Masuk ke Untukmu");
  await expect(frame.getByRole("dialog")).toBeVisible();
  await expect(frame.locator("#um-comp")).not.toHaveClass(/on/);
});
