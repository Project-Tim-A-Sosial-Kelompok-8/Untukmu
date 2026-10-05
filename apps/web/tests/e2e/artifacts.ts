import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

/** Keep UI evidence with the guide for its viewport. */
export async function uiScreenshotPath(device: "mobile" | "desktop", name: string) {
  const folder = resolve("../../docs/ui-ux", device);
  await mkdir(folder, { recursive: true });
  return resolve(folder, name);
}
