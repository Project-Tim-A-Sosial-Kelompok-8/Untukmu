import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { uiScreenshotPath } from "./artifacts";

test("pembanding visual halaman masuk pada desktop dan ponsel", async ({ browser, baseURL }) => {
  const root = resolve("legacy");
  const server = createServer(async (request, response) => {
    const path = resolve(root, "." + new URL(request.url || "/", "http://localhost").pathname.replace(/\/$/, "/index.html"));
    if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    try {
      const data = await readFile(path);
      const types: Record<string, string> = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg" };
      response.writeHead(200, { "Content-Type": types[extname(path)] || "application/octet-stream" }).end(data);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server acuan belum tersedia.");
  const metrics = (selector: string) => {
    const node = document.querySelector(selector)!;
    const css = getComputedStyle(node), box = node.getBoundingClientRect();
    return { font: css.font, color: css.color, padding: css.padding, borderRadius: css.borderRadius,
      width: box.width, height: box.height, x: box.x, y: box.y };
  };
  try {
    for (const [name, viewport] of [["desktop", { width: 1280, height: 800 }], ["mobile", { width: 390, height: 844 }]] as const) {
      const migrated = await browser.newPage({ viewport });
      await migrated.goto(baseURL || "http://localhost:3000/");
      await migrated.frameLocator("iframe").locator("#um-entry.on").waitFor();
      const frameBox = await migrated.locator('iframe').boundingBox();
      // Compare the preserved engine at its actual full-screen viewport.
      const reference = await browser.newPage({ viewport: { width: viewport.width, height: Math.round(frameBox!.height) } });
      await reference.addInitScript(() => localStorage.setItem("gx-lang", "id"));
      await reference.goto(`http://127.0.0.1:${address.port}/index.html`);
      await reference.locator("#um-entry.on").waitFor();
      for (const selector of [".um-enter", ".um-enter h1", ".um-enter .lead", ".um-enter .um-btn.primary"]) {
        expect(await migrated.frames()[1].evaluate(metrics, selector)).toEqual(await reference.evaluate(metrics, selector));
      }
      await reference.screenshot({ path: await uiScreenshotPath(name, "entry-asli.png") });
      await migrated.screenshot({ path: await uiScreenshotPath(name, "entry-sekarang.png") });
      await reference.close(); await migrated.close();
    }
  } finally { await new Promise<void>(done => server.close(() => done())); }
});
