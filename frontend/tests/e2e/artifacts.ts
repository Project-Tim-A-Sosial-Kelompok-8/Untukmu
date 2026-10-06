import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

/** Keep generated screenshots in ignored test output. */
export async function uiScreenshotPath(device: "mobile" | "desktop", name: string) {
  const folder = resolve("test-results/screenshots", device);
  await mkdir(folder, { recursive: true });
  return resolve(folder, name);
}
