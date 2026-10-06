import { expect, test, type FrameLocator, type Page } from "@playwright/test";
import { register, login } from "./helpers";

interface GalaxySnapshot {
  mode: string;
  selected: string | null;
  active: string | null;
  target: number[];
  flying: boolean;
  galaxies: { id: string; messages: string[]; visible: boolean; inFrame: boolean; particles: number }[];
}

// Read the classic-script engine as well as the API: saved data alone does not
// prove that its particles are attached to the scene or inside the camera view.
function scene(page: Page) {
  return page.frames()[1].evaluate<GalaxySnapshot>(`(() => ({
    mode: viewMode,
    selected: UM.galaksi.state.pilihan?.item.g.id || null,
    active: UM.galaksi.state.aktif,
    target: controls.target.toArray(),
    flying: !!flyState,
    galaxies: UM.galaksi.state.daftar.filter(item => item.g.sendiri !== false).map(item => {
      const screen = item.pos.clone().project(camera);
      const points = item.lod?.pts;
      return {
        id: item.g.id,
        messages: Object.values(item.pesanDiTitik || {}).map(p => p.id).sort(),
        visible: !!points && points.visible && points.parent === scene,
        particles: points?.geometry.attributes.position.count || 0,
        inFrame: screen.z > -1 && screen.z < 1 && Math.abs(screen.x) < 1 && Math.abs(screen.y) < 1
      };
    })
  }))()`);
}

async function saveNewGalaxy(frame: FrameLocator, name: string) {
  await expect(frame.locator("#um-comp [data-act=next]")).toBeVisible();
  if (await frame.locator("#um-comp [data-act=baru]").count()) {
    await frame.locator("#um-comp [data-act=baru]").click();
  }
  await frame.locator("#um-nama").fill(name);
  await frame.locator("#um-comp [data-act=next]").click();
  await frame.locator("#um-comp [data-act=next]").click();
  await frame.locator("#um-isi").fill(`Pesan untuk ${name}`);
  await frame.locator("#um-comp [data-act=next]").click();
  await frame.locator("#um-comp [data-act=save]").click();
  await expect(frame.locator("#um-comp")).not.toHaveClass(/on/);
}

test("simpan membuka galaksi dari Peta; galaksi dan bintang lama tetap tampil setelah muat ulang", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const { frame, email, password } = await register(page, "galaxy-render");
  await saveNewGalaxy(frame, "Kenangan pertama");
  await expect.poll(async () => (await scene(page)).selected, { timeout: 20000 }).not.toBeNull();
  const first = (await scene(page)).galaxies[0];
  expect(first.visible && first.inFrame).toBe(true);
  expect(first.messages).toHaveLength(1);
  expect(first.particles).toBeGreaterThanOrEqual(4000);

  await frame.locator(".um-dock [data-act=rumah]").click();
  await expect.poll(async () => (await scene(page)).flying).toBe(false);
  expect((await scene(page)).target).toEqual([0, 0, 0]);
  expect((await scene(page)).active).toBeNull();
  await expect(frame.locator("#return-home")).not.toBeVisible();

  await frame.locator(".um-dock [data-act=peta]").click();
  await expect.poll(async () => (await scene(page)).mode).toBe("sky");
  await frame.locator(".um-dock [data-act=tulis]").click();
  await saveNewGalaxy(frame, "Kenangan kedua");
  await expect.poll(async () => (await scene(page)).mode).toBe("galaxy");
  await expect.poll(async () => (await scene(page)).selected, { timeout: 20000 }).not.toBe(first.id);
  await expect.poll(async () => (await scene(page)).selected, { timeout: 20000 }).not.toBeNull();
  let saved = await scene(page);
  expect(saved.galaxies).toHaveLength(2);
  expect(saved.galaxies.find(item => item.id === first.id)?.messages).toEqual(first.messages);
  expect(saved.galaxies.find(item => item.id === saved.selected)?.inFrame).toBe(true);

  // Writing from an active galaxy preselects it, and choosing another galaxy
  // must attach the new message to that explicit destination alone.
  const secondId = saved.selected!;
  await frame.locator(".um-dock [data-act=tulis]").click();
  await expect(frame.locator(`#um-comp [data-act=pick-galaksi][data-id="${secondId}"]`)).toHaveClass(/on/);
  await frame.locator(`#um-comp [data-act=pick-galaksi][data-id="${first.id}"]`).click();
  await frame.locator("#um-comp [data-act=next]").click();
  await frame.locator("#um-isi").fill("Ucapan tambahan khusus untuk galaksi pertama");
  await frame.locator("#um-comp [data-act=next]").click();
  await frame.locator("#um-comp [data-act=save]").click();
  await expect(frame.locator("#um-comp")).not.toHaveClass(/on/);
  await expect.poll(async () => (await scene(page)).selected, { timeout: 20000 }).toBe(first.id);
  saved = await scene(page);
  expect(saved.galaxies.find(item => item.id === first.id)?.messages).toHaveLength(2);
  expect(saved.galaxies.find(item => item.id === secondId)?.messages).toHaveLength(1);

  // Reload starts at Milky Way. Saved galaxies remain rendered and can
  // still be visited on desktop and narrow screens while the key is locked.
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.reload();
    await login(page, email, password);
    await page.frames()[1].evaluate(() => window.UM.crypto.lock());
    await frame.locator("#um-entry.on").waitFor();
    const loaded = await scene(page);
    expect(loaded.target).toEqual([0, 0, 0]);
    expect(loaded.active).toBeNull();
    expect(loaded.galaxies).toHaveLength(2);
    for (const galaxy of saved.galaxies) {
      expect(loaded.galaxies.find(item => item.id === galaxy.id)).toMatchObject({
        id: galaxy.id, messages: galaxy.messages, visible: true, particles: galaxy.particles
      });
    }
    expect(await page.frames()[1].evaluate(() => window.UM.crypto.unlocked())).toBe(false);
    await page.frames()[1].evaluate(`(() => {
      UM.ui.closeAllScreens();
      UM.galaksi.terbangKe(UM.galaksi.state.daftar[0]);
    })()`);
    await expect.poll(async () => (await scene(page)).flying).toBe(false);
    expect((await scene(page)).galaxies[0].inFrame).toBe(true);
    await expect(frame.locator('#beacon-panel')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: testInfo.outputPath(`galaksi-${viewport.width}.png`) });
  }
  expect(errors).toEqual([]);
});

test("Home membatalkan perjalanan doa dan galaksi dibuka dengan transisi utuh", async ({ page }) => {
  const { frame } = await register(page, "smooth-navigation", { startComposer: false });
  await frame.locator("#um-entry.on").waitFor();
  const engine = page.frames()[1];
  const result = await engine.evaluate<{ unchanged: boolean; flight: boolean; centered: boolean; particles: number }>(`(async () => {
    UM.ui.closeAllScreens();
    const g = {id:'smooth-navigation',nama:'Galaksi tujuan',radius:140,count:8500,kind:'spiral',warna:'#ffd9a0'};
    UM.store.listGalaksi = async () => [g];
    UM.store.listPesan = async () => [];
    UM.store.listGalaksiLadang = (...args) => UM.store.listGalaksi(...args);
    UM.store.listPesanLadang = (...args) => UM.store.listPesan(...args);
    UM.store.listDoa = async () => [];
    await UM.galaksi.refresh();
    const item = UM.galaksi.state.daftar[0];
    const initial = camera.position.clone();
    UM.galaksi.terbangKe(item);
    return {
      unchanged:camera.position.distanceTo(initial)<0.001,
      flight:!!flyState && flyState.dur>=2000,
      centered:flyState.t1.distanceTo(item.pos)<0.001,
      particles:item.lod.pts.geometry.attributes.position.count
    };
  })()`);
  expect(result).toEqual({ unchanged: true, flight: true, centered: true, particles: 8500 });
  await expect.poll(async () => (await scene(page)).flying).toBe(false);
  await expect(frame.locator("#return-home")).toHaveText("← Kembali ke Milky Way");
  await engine.evaluate(`UM.galaksi.kirimPerjalanan(UM.galaksi.state.daftar[0], 'doa')`);
  await frame.locator(".um-dock [data-act=rumah]").click();
  await expect.poll(async () => (await scene(page)).flying).toBe(false);
  expect((await scene(page)).target).toEqual([0, 0, 0]);
  expect(await engine.evaluate(`UM.galaksi.state.perjalanan.length`)).toBe(0);
  expect((await scene(page)).active).toBeNull();
});

test("bintang lama tidak tertimpa oleh pesan baru atau hasil refresh yang terlambat", async ({ page }) => {
  await register(page, "stars-regression", { startComposer: false });
  await page.frameLocator("iframe").locator("#um-entry.on").waitFor();
  const result = await page.frames()[1].evaluate<{
    before: number; after: number; stable: boolean; galaxies: number; drawn: boolean;
  }>(`(async () => {
    UM.ui.closeAllScreens();
    const galaxies = [{id:'galaxy-regression',nama:'Bintang tersimpan',radius:140,count:8000,kind:'spiral',warna:'#ffd9a0'}];
    const messages = Array.from({length:450}, (_, i) => ({id:'message-'+i,galaksiId:galaxies[0].id,privasi:'privat',dibuat:i+1}));
    UM.store.listGalaksi = async () => galaxies;
    UM.store.listPesan = async () => messages;
    UM.store.listGalaksiLadang = (...args) => UM.store.listGalaksi(...args);
    UM.store.listPesanLadang = (...args) => UM.store.listPesan(...args);
    UM.store.listDoa = async () => [];
    await UM.galaksi.refresh();
    const item = UM.galaksi.state.daftar[0];
    const previous = {...item.pesanDiTitik};
    messages.push({id:'message-new',galaksiId:galaxies[0].id,privasi:'privat',dibuat:1000});
    await UM.galaksi.refresh();
    let release;
    UM.store.listGalaksi = () => new Promise(resolve => {release=resolve;});
    const stale = UM.galaksi.refresh();
    UM.store.listGalaksi = async () => galaxies;
    await UM.galaksi.refresh();
    release([]);
    await stale;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      before:Object.keys(previous).length,
      after:Object.keys(item.pesanDiTitik).length,
      stable:Object.entries(previous).every(([idx,p]) => item.pesanDiTitik[idx]?.id === p.id),
      galaxies:UM.galaksi.state.daftar.length,
      drawn:item.lod.pts.visible && item.lod.pts.parent === scene && Object.keys(item.pesanDiTitik).every(idx => Number(idx)<item.lod.pts.geometry.drawRange.count)
    };
  })()`);
  expect(result).toEqual({ before: 450, after: 451, stable: true, galaxies: 1, drawn: true });
});
