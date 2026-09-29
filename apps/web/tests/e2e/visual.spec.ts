import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

test("pembanding visual halaman masuk pada desktop dan ponsel", async ({ browser, baseURL }) => {
  const root = resolve("legacy");
  const output = resolve("../../docs/visual");
  await mkdir(output, { recursive: true });
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
      const reference = await browser.newPage({ viewport });
      const migrated = await browser.newPage({ viewport });
      await reference.addInitScript(() => localStorage.setItem("gx-lang", "id"));
      await reference.goto(`http://127.0.0.1:${address.port}/index.html`);
      await reference.locator("#um-entry.on").waitFor();
      await migrated.goto(baseURL || "http://localhost:3000/");
      await migrated.frameLocator("iframe").locator("#um-entry.on").waitFor();
      for (const selector of [".um-enter", ".um-enter h1", ".um-enter .lead", ".um-enter .um-btn.primary"]) {
        expect(await migrated.frames()[1].evaluate(metrics, selector)).toEqual(await reference.evaluate(metrics, selector));
      }
      await reference.screenshot({ path: resolve(output, `${name}-asli.png`) });
      await migrated.screenshot({ path: resolve(output, `${name}-migrasi.png`) });
      await reference.close(); await migrated.close();
    }
    await writeFile(resolve(output, "perbandingan.html"), `<!doctype html><html lang="id"><meta charset="utf-8"><title>Perbandingan tampilan Untukmu</title><style>body{background:#0b1018;color:#e5e7eb;font:16px system-ui;margin:32px}section{display:grid;grid-template-columns:1fr 1fr;gap:20px}img{width:100%;border:1px solid #243049}h1{font-size:24px}p{max-width:950px;line-height:1.6}figure{margin:0}figcaption{margin-bottom:8px}</style><h1>Perbandingan halaman masuk</h1><p>Pengukuran posisi, dimensi, font, warna, padding, dan radius empat elemen utama cocok pada kedua ukuran layar. Latar galaksi bersifat dinamis; sumber asli juga memuat data contoh, sedangkan hasil migrasi tidak. Ini bukan bukti kesamaan seluruh layar 100%.</p>${["desktop", "mobile"].map(name => `<h2>${name}</h2><section><figure><figcaption>Prototipe asli</figcaption><img src="${name}-asli.png"></figure><figure><figcaption>Migrasi Next.js</figcaption><img src="${name}-migrasi.png"></figure></section>`).join("")}</html>`);
  } finally { await new Promise<void>(done => server.close(() => done())); }
});
