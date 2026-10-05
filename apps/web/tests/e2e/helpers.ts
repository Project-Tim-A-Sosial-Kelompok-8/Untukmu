import { expect, type Page } from "@playwright/test";
export async function register(page: Page, prefix: string) {
  await page.goto("/");
  const frame = page.frameLocator("iframe");
  await frame.locator("#um-entry.on").waitFor({timeout:20000});
  await expect(frame.locator("html")).toHaveAttribute("data-renderer", "react-three-fiber");
  await frame.locator("#um-entry [data-act=tulis]").click();
  await frame.getByRole("button", { name: "Buat akun", exact: true }).click();
  const email = `${prefix}-${Date.now()}@example.com`, password = "kata-sandi-pengujian-yang-panjang";
  await frame.locator("#um-email").fill(email);
  await frame.locator("#um-account-password").fill(password);
  await frame.locator("#um-repeat").fill(password);
  await frame.getByRole("button", { name: "Daftar", exact: true }).click();
  await expect(frame.getByText("Simpan kode pemulihan", { exact: true })).toBeVisible({ timeout: 60000 });
  const recovery = await frame.locator("output").innerText();
  await frame.getByRole("checkbox").check();
  await frame.getByRole("button", { name: "Lanjutkan", exact: true }).click();
  return { frame, email, password, recovery };
}
