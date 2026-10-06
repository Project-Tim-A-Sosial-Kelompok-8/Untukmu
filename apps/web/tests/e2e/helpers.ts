import { expect, type Page } from "@playwright/test";
export async function register(page: Page, prefix: string, options: { path?: string; startComposer?: boolean } = {}) {
  await page.goto(options.path || "/");
  const frame = page.frameLocator("iframe");
  await expect(frame.locator("#um-account-title")).toHaveText("Masuk ke Untukmu", { timeout: 20000 });
  await expect(frame.locator("html")).toHaveAttribute("data-renderer", "react-three-fiber");
  await frame.getByRole("button", { name: "Daftar akun", exact: true }).click();
  const email = `${prefix}-${Date.now()}@example.com`, password = "kata-sandi-pengujian-yang-panjang";
  await frame.locator("#um-email").fill(email);
  await frame.locator("#um-account-password").fill(password);
  await frame.locator("#um-repeat").fill(password);
  const registered = page.waitForResponse(response => response.url().endsWith("/auth/register") && response.request().method() === "POST");
  await frame.getByRole("button", { name: "Daftar", exact: true }).click();
  let registration = await registered;
  let registrationConsoleError: string | null = null;
  if (registration.status() === 429) {
    // Keep the real registration limiter enabled in both browser environments.
    await expect(frame.getByRole("alert")).toBeVisible();
    await page.waitForTimeout(Number(registration.headers()["retry-after"] || "60") * 1000);
    const retried = page.waitForResponse(response => response.url().endsWith("/auth/register") && response.request().method() === "POST");
    await frame.getByRole("button", { name: "Daftar", exact: true }).click();
    const rateLimitURL = registration.url();
    registration = await retried;
    expect(registration.status()).toBe(201);
    registrationConsoleError = `Failed to load resource: the server responded with a status of 429 (Too Many Requests) ${rateLimitURL}`;
  }
  expect(registration.status()).toBe(201);
  await expect(frame.getByText("Simpan kode pemulihan", { exact: true })).toBeVisible({ timeout: 60000 });
  const recovery = await frame.locator("output").innerText();
  await frame.getByRole("checkbox").check();
  await frame.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  await expect(frame.locator("#um-account-title")).not.toBeVisible();
  if (options.startComposer !== false) await frame.locator("#um-entry [data-act=tulis]").click();
  return { frame, email, password, recovery, registrationConsoleError };
}
export async function login(page: Page, email: string, password: string) {
  const frame = page.frameLocator("iframe");
  await expect(frame.locator("#um-account-title")).toHaveText("Masuk ke Untukmu", { timeout: 20000 });
  await frame.locator("#um-email").fill(email);
  await frame.locator("#um-account-password").fill(password);
  await frame.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(frame.locator("#um-account-title")).not.toBeVisible({ timeout: 60000 });
  return frame;
}
