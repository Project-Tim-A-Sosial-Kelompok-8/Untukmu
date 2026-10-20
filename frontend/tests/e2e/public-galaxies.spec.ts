import { expect, test, type Page } from "@playwright/test";
import { register } from "./helpers";

interface GalaxySnapshot {
  id: string;
  own: boolean;
  messages: string[];
  attached: boolean;
  starsDrawn: boolean;
}

function galaxies(page: Page) {
  // API rows alone do not prove that a visitor can see the actual galaxy and
  // its message stars. Check the points attached to the live Three.js scene.
  return page.frames()[1].evaluate<GalaxySnapshot[]>(`(() =>
    UM.galaksi.state.daftar.map(item => {
      const points = item.lod?.pts;
      const entries = Object.entries(item.pesanDiTitik || {});
      return {
        id: item.g.id,
        own: item.g.sendiri !== false,
        messages: entries.map(([, message]) => message.id).sort(),
        attached: !!points && points.visible && points.parent === scene,
        starsDrawn: !!points && entries.every(([index]) =>
          Number(index) < points.geometry.drawRange.count &&
          Number(index) < points.geometry.attributes.position.count)
      };
    })
  )()`);
}

test("akun lain dan tamu melihat galaksi serta bintang publik tanpa pesan atau galaksi privat", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await register(page, "public-galaxy-owner", { startComposer: false });
  const texts = {
    public: "Terima kasih sudah hadir dan membawa kebaikan setiap hari.",
    private: "Catatan pribadi dalam galaksi yang juga berisi ucapan publik.",
    privateOnly: "Catatan pribadi untuk galaksi yang tidak pernah dipublikasikan.",
  };
  const saved = await page.frames()[1].evaluate(async (texts) => {
    const sharedGalaxy = await window.UM.store.saveGalaksi({
      nama: "Kenangan dengan ucapan publik dan privat",
      kategori: "sahabat",
    });
    const privateGalaxy = await window.UM.store.saveGalaksi({
      nama: "Kenangan khusus pemilik",
      kategori: "keluarga",
    });
    const publicMessage = await window.UM.store.simpanPesan({
      galaksiId: sharedGalaxy.id,
      teks: texts.public,
      privasi: "publik",
    });
    const privateMessage = await window.UM.store.simpanPesan({
      galaksiId: sharedGalaxy.id,
      teks: texts.private,
      privasi: "privat",
    });
    const privateOnlyMessage = await window.UM.store.simpanPesan({
      galaksiId: privateGalaxy.id,
      teks: texts.privateOnly,
      privasi: "privat",
    });
    await Promise.all([window.UM.galaksi.refresh(), window.UM.sky.refresh()]);
    return {
      sharedGalaxy: sharedGalaxy.id,
      privateGalaxy: privateGalaxy.id,
      publicMessage: publicMessage.id,
      privateMessage: privateMessage.id,
      privateOnlyMessage: privateOnlyMessage.id,
    };
  }, texts);

  // The owner's merged scene must keep their private stars and must not
  // duplicate their public star when the public feed includes it as well.
  const ownerGalaxies = (await galaxies(page)).filter((galaxy) => galaxy.own);
  expect(ownerGalaxies).toHaveLength(2);
  expect(ownerGalaxies.find((galaxy) => galaxy.id === saved.sharedGalaxy)).toMatchObject({
    messages: [saved.publicMessage, saved.privateMessage].sort(),
    attached: true,
    starsDrawn: true,
  });
  expect(ownerGalaxies.find((galaxy) => galaxy.id === saved.privateGalaxy)?.messages).toEqual([
    saved.privateOnlyMessage,
  ]);

  // Separate contexts prevent the owner's cookies, encryption key, and cache
  // from supplying data that a different account or a guest cannot access.
  for (const viewer of ["account", "guest"] as const) {
    const context = await browser.newContext({ baseURL: page.url() });
    try {
      const visitor = await context.newPage();
      visitor.on("pageerror", (error) => errors.push(error.message));
      const frame = visitor.frameLocator("iframe");
      if (viewer === "account") {
        await register(visitor, "public-galaxy-viewer", { startComposer: false });
      } else {
        await visitor.goto("/");
        await expect(frame.locator("html")).toHaveAttribute("data-renderer", "react-three-fiber");
      }
      await frame.locator("#um-entry.on").waitFor();
      await frame.locator("#um-entry [data-act=skip]").click();

      await expect
        .poll(async () =>
          (await galaxies(visitor)).find((galaxy) => galaxy.id === saved.sharedGalaxy),
        )
        .toMatchObject({
          own: false,
          messages: [saved.publicMessage],
          attached: true,
          starsDrawn: true,
        });
      const visible = await galaxies(visitor);
      expect(visible.some((galaxy) => galaxy.id === saved.privateGalaxy)).toBe(false);
      expect(visible.flatMap((galaxy) => galaxy.messages)).not.toContain(saved.privateMessage);
      expect(visible.flatMap((galaxy) => galaxy.messages)).not.toContain(saved.privateOnlyMessage);
      expect(await visitor.frames()[1].evaluate(() => window.UM.store.listGalaksi())).toEqual([]);
      expect(await visitor.frames()[1].evaluate(() => window.UM.store.listPesan())).toEqual([]);
      expect(await visitor.frames()[1].evaluate(() => window.UM.account.isLogged())).toBe(
        viewer === "account",
      );

      await visitor.frames()[1].evaluate(`(() => {
        UM.galaksi.terbangKe(UM.galaksi.state.peta[${JSON.stringify(saved.sharedGalaxy)}]);
      })()`);
      await expect.poll(() => visitor.frames()[1].evaluate("!!flyState")).toBe(false);
      await expect(frame.locator("#beacon-panel")).toHaveClass(/open/);
      await expect(frame.locator("#um-gk-tulis")).toHaveCount(0);
      await expect(frame.locator("[data-galaxy-count=pesan] .v")).toHaveText("1");
      await expect(frame.locator(`#um-gk-list [data-isi="${saved.publicMessage}"]`)).toHaveText(
        texts.public,
      );
      await expect(frame.locator(`#um-gk-list [data-isi="${saved.privateMessage}"]`)).toHaveCount(
        0,
      );
      await expect(
        frame.locator(`#um-gk-list [data-isi="${saved.privateOnlyMessage}"]`),
      ).toHaveCount(0);

      // Open the message through the rendered galaxy card, exercising the
      // same star navigation and readable card that a visitor uses.
      await frame
        .locator(`#um-gk-list li:has([data-isi="${saved.publicMessage}"]) [data-bintang]`)
        .click();
      await expect(frame.locator("#bp-desc .bp-text")).toHaveText(texts.public);
      await expect(frame.locator("body")).not.toContainText(texts.private);
      await expect(frame.locator("body")).not.toContainText(texts.privateOnly);
      await visitor.screenshot({ path: testInfo.outputPath(`galaksi-publik-${viewer}.png`) });

      if (viewer === "account") {
        // Writing while visiting someone else's galaxy starts an owned draft;
        // the public destination must never become the composer's target.
        await frame.locator(".um-dock [data-act=tulis]").click();
        await expect(frame.locator("#um-comp #um-nama")).toBeVisible();
        await expect(frame.locator("#um-comp #um-nama")).toHaveValue("");
        await expect(
          frame.locator(`#um-comp [data-act=pick-galaksi][data-id="${saved.sharedGalaxy}"]`),
        ).toHaveCount(0);
        await frame.locator("#um-comp .um-close[data-act=cancel]").click();
      }
    } finally {
      await context.close();
    }
  }
  expect(errors).toEqual([]);
});
