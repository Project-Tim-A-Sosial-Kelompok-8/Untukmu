import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";
import { expect, it } from "vitest";

it("katalog asli JS dan backend menyediakan tujuh pilihan yang sama", async () => {
  const UM = {};
  const context = vm.createContext({ window: { UM }, UM });
  vm.runInContext(await readFile(resolve("visual/prayers.js"), "utf8"), context);
  const original = vm.runInContext("JSON.stringify(window.UM.doaData.tradisi)", context);
  expect(JSON.parse(original)).toEqual(JSON.parse(await readFile(resolve("../backend/data/prayers-v1.json"), "utf8")));
});

it("visual produksi tidak memuat katalog astronomi atau doa manual", async () => {
  for (const name of ["index.html", "scene.js", "map.js", "galaxy.js", "ui.js", "runtime.js"]) {
    const content = await readFile(resolve("public/visual", name), "utf8");
    expect(content).not.toMatch(/SKY_CONS|SKY_GAL|enterSolar|setGalaksiBawaan|write-prayer|um-written-prayer|images\/solar-system/);
  }
});

it("runtime memakai kripto produksi dan mempertahankan atribusi kode visual", async () => {
  const runtime = await readFile(resolve("public/visual/runtime.js"), "utf8");
  expect(runtime).not.toMatch(/indexedDB\.open|untukmu\.share\.v1|PBKDF2/);
  const index = await readFile(resolve("public/visual/index.html"), "utf8");
  expect(index).toContain("Justin Zhang Jun");
  expect(index).toContain("PolyForm Noncommercial");
});
