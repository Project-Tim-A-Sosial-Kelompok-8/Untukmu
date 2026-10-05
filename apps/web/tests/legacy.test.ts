import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { beforeAll, afterAll, expect, it } from "vitest";

let server: Server;
let browser: Browser;
let page: Page;
let results: { nama: string; ok: boolean; pesan: string }[];
const source = await readFile(resolve("legacy/untukmu/js/um-tests.js"), "utf8");
const names = Array.from(source.matchAll(/nama: '([^']+)'/g), match => match[1]);
// Float32Array stores 3.4 as 3.4000000953674316. Preserve the intended assertion,
// using its representation rather than impossible double-precision equality.
const portedAssertions = source.replace("attrSkala.array[i] === 3.4", "attrSkala.array[i] === Math.fround(3.4)");

beforeAll(async () => {
  const root = resolve("legacy");
  server = createServer(async (request, response) => {
    const path = resolve(root, "." + decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname).replace(/\/$/, "/index.html"));
    if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    try {
      const type: Record<string, string> = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg" };
      const bytes = path === resolve(root, "untukmu/js/um-tests.js") ? Buffer.from(portedAssertions)
        : await readFile(path);
      response.writeHead(200, { "Content-Type": type[extname(path)] || "application/octet-stream" });
      response.end(bytes);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Alamat pengujian tidak valid.");
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--disable-dev-shm-usage"] });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`http://127.0.0.1:${address.port}/index.html?umTest=1`);
  // Read the result exposed by a test-only wrapper; original assertions are left intact.
  await page.waitForFunction(() => document.querySelector("#um-test-close"), null, { timeout: 150000 });
  const lines = await page.locator(".um-screen.z-top .um-list .um-item").allTextContents();
  results = names.map((name, i) => ({ nama: name, ok: lines[i]?.trim().startsWith("✓") || false, pesan: lines[i] || "hasil tidak tersedia" }));
});
afterAll(async () => { await browser?.close(); if (server) await new Promise<void>(done => server.close(() => done())); });

for (const name of names) it(`Assertion prototipe: ${name}`, () => {
  const result = results.find(row => row.nama === name);
  expect(result?.ok, result?.pesan || name).toBe(true);
});

it("interaksi partikel tetap tersedia setelah refresh dan membersihkan hover", async () => {
  const interaction = await page.evaluate(`(async () => {
    await UM.galaksi.refresh();
    const item = UM.galaksi.state.daftar.find(g => g.batuPoints);
    if (!item) throw new Error('Galaksi uji dengan partikel doa belum tersedia.');
    const points = item.batuPoints;
    points.geometry.deleteAttribute('aFokus');
    UM.galaksi.validasiPartikelInteraktif();
    const focus = points.geometry.getAttribute('aFokus');
    UM.galaksi.perbaruiKursor({points, index: 0});
    const hovered = {cursor: renderer.domElement.style.cursor, index: points.userData.hoverIndex};
    UM.galaksi.perbaruiKursor(null);
    return {count: focus.count, particles: points.geometry.getAttribute('position').count,
      focus: Array.from(focus.array).every(value => value === 1), hovered,
      cleared: renderer.domElement.style.cursor === '' && !('hoverIndex' in points.userData)};
  })()`) as { count: number; particles: number; focus: boolean; hovered: { cursor: string; index: number }; cleared: boolean };
  expect(interaction.count).toBe(interaction.particles);
  expect(interaction).toMatchObject({ focus: true, hovered: { cursor: "pointer", index: 0 }, cleared: true });
});
