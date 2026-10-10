import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const original = resolve(root, "visual");
const output = resolve(root, "public/visual");
if (!output.startsWith(resolve(root, "public") + "/") && !output.startsWith(resolve(root, "public") + "\\")) throw new Error("Invalid visual output path");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(original, "vendor"), resolve(output, "vendor"), { recursive: true });
await cp(resolve(original, "images"), resolve(output, "images"), { recursive: true });
for (const name of ["styles.css", "scene.js", "background.js", "language.js", "map.js", "app.js"]) await cp(resolve(original, name), resolve(output, name));
function replaceOnce(source, before, after) {
  if (!source.includes(before)) throw new Error(`Source anchor missing: ${before.slice(0, 100)}`);
  return source.replace(before, after);
}
let index = await readFile(resolve(original, "index.html"), "utf8");
const storageOrigin = new URL(process.env.S3_PUBLIC_ENDPOINT || "http://localhost:9000").origin;
const csp = `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ${storageOrigin} https://challenges.cloudflare.com; media-src 'self' blob: ${storageOrigin}; worker-src 'self'; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'`;
index = replaceOnce(index, '<meta charset="utf-8">', '<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + csp + '">');
await writeFile(resolve(output, "index.html"), index);
for (const name of ["galaxy.js", "ui.js"]) await cp(resolve(original, name), resolve(output, name));
const catalog = await readFile(resolve(root, "../backend/data/prayers-v1.json"), "utf8");
const registry = await readFile(resolve(original, "prayers.js"), "utf8");
await writeFile(resolve(output, "prayers.js"), "window.UM_PRAYER_CATALOG = " + JSON.stringify(JSON.parse(catalog)) + ";\n" + registry);

await build({ entryPoints: [resolve(root, "src/runtime/bootstrap.tsx")], outfile: resolve(output, "runtime.js"), bundle: true,
  format: "iife", platform: "browser", target: "es2022", minify: true, sourcemap: false,
  define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY": JSON.stringify(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "") } });
await build({ entryPoints: [resolve(root, "src/lib/crypto/argon2.worker.ts")], outfile: resolve(output, "argon2.worker.js"), bundle: true, format: "iife", platform: "browser", target: "es2022", minify: true });

const fingerprint = createHash("sha256");
for (const name of ["index.html", "styles.css", "scene.js", "background.js", "language.js", "prayers.js", "map.js", "app.js", "galaxy.js", "ui.js", "runtime.js", "argon2.worker.js"]) fingerprint.update(await readFile(resolve(output, name)));
const swPath = resolve(root, "public/sw.js");
await writeFile(swPath, (await readFile(swPath, "utf8")).replace(/const CACHE = "untukmu-static-[^"]+";/, 'const CACHE = "untukmu-static-' + fingerprint.digest("hex").slice(0, 16) + '";'));
console.log("Visual Milky Way dan Kenangan disiapkan tanpa nama atau mode astronomi.");
