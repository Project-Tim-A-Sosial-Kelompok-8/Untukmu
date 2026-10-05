import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const original = resolve("legacy");
const built = resolve("public/engine");
describe("Batas migrasi tampilan", () => {
  it("mempertahankan seluruh CSS, vendor Three.js, dan kamus bahasa byte-for-byte", async () => {
    for (const file of ["untukmu/untukmu.css", "vendor/three.min.js", "untukmu/js/um-i18n.js", "untukmu/js/um-sky.js"]) {
      expect(await readFile(resolve(built, file))).toEqual(await readFile(resolve(original, file)));
    }
  });
  it("mempertahankan konstanta kamera dan pemilihan titik", async () => {
    const before = await readFile(resolve(original, "untukmu/js/um-galaksi.js"), "utf8");
    const after = await readFile(resolve(built, "untukmu/js/um-galaksi.js"), "utf8");
    for (const name of ["JARI_KURSOR_PX", "TOLERANSI_LAYAR", "PX_CINCIN", "JARAK_TIBA_REL"]) {
      const expression = new RegExp(`${name}\\s*=\\s*[^;,\\n]+`);
      expect(after.match(expression)?.[0]).toBe(before.match(expression)?.[0]);
      expect(before.match(expression)).not.toBeNull();
    }
  });
  it("tidak memasukkan IndexedDB, seed, PBKDF2, dan shared secret prototipe ke runtime produksi", async () => {
    const index = await readFile(resolve(built, "index.html"), "utf8");
    const runtime = await readFile(resolve(built, "runtime.js"), "utf8");
    expect(index).not.toContain('src="untukmu/js/um-store.js"');
    expect(index).not.toContain('src="untukmu/js/um-crypto.js"');
    expect(index).not.toContain('src="untukmu/js/um-tests.js"');
    expect(runtime).not.toMatch(/indexedDB\.open|untukmu\.share\.v1|PBKDF2/);
    expect(await readFile(resolve(built, "untukmu/js/um-app.js"), "utf8")).not.toContain("UM.store.seedIfEmpty()");
  });
  it("mempertahankan atribusi lisensi engine", async () => {
    expect(await readFile(resolve(built, "index.html"), "utf8")).toContain("Justin Zhang Jun");
    expect(await readFile(resolve(built, "index.html"), "utf8")).toContain("PolyForm Noncommercial");
  });
});
