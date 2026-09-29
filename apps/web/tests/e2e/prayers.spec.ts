import { expect, test } from "@playwright/test";

for (const width of [320, 390, 1280]) {
  test(`doa: tujuan, pilihan agama, batal, dan retry tetap sinkron (${width}px)`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const frame = page.frameLocator("iframe");
    await frame.locator("#um-entry [data-act=skip]").click();
    await frame.locator('.um-dock [data-act=doa]').click();
    await expect(frame.locator('#um-exp')).toContainText('pilih agama atau tradisi');
    const engine = page.frames()[1];
    // Isolate slow/retried responses here; social.spec exercises a complete
    // prayer with the real API, moderation, duration, and anonymous identity.
    await engine.evaluate(`(() => {
      const candidates = ['Pertama', 'Kedua'].map((name, i) => ({
        id: 'prayer-target-' + i, galaksiId: 'prayer-galaxy',
        privasi: 'publik', moderationStatus: 'approved', publicBody: 'Ucapan ' + name
      }));
      UM.store.listPesan = async () => candidates;
      UM.store.preparePrayer = async (gid, id) => id;
      UM.store.getPesan = async id => candidates.find(p => p.id === id);
      UM.galaksi.refresh = async () => {};
      window.prayerStarts = []; window.prayerFinishes = [];
      UM.store.startPrayer = async (id, catalog) => {
        window.prayerStarts.push({id, catalog});
        await new Promise(resolve => setTimeout(resolve, 600));
        return {playback_token:'test-session',seconds:0,audio_url:null};
      };
      UM.store.addDoa = async (id, token) => {
        window.prayerFinishes.push({id, token});
        if (window.prayerFinishes.length === 1) throw new Error('Koneksi terputus, coba kembali.');
        return {added:true};
      };
      UM.ui.bukaDoa('prayer-galaxy');
    })()`);
    await expect(frame.locator('#um-doa [data-act=target]')).toHaveCount(2);
    await frame.locator('#um-doa [data-act=target]').nth(1).click();
    await expect(frame.locator('#um-doa blockquote')).toHaveText('Ucapan Kedua');
    await expect(frame.locator('#um-doa [data-act=trad]')).toHaveCount(7);
    await frame.locator('#um-doa [data-act=trad][data-id=islam]').click();
    await frame.locator('#um-doa [data-act=entri]').first().click();
    await expect(frame.locator('#um-doa .um-prayer')).toContainText('menunggu tinjauan kurator');
    await expect(frame.locator('#um-doa [data-act=start]')).toHaveCount(0);

    const layout = await engine.evaluate(() => {
      const screen = document.querySelector<HTMLElement>('#um-doa')!;
      const buttons = Array.from(screen.querySelectorAll('button')).map(b => b.getBoundingClientRect());
      let overlaps = 0;
      for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) {
        const a = buttons[i], b = buttons[j];
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlaps++;
      }
      return { overlaps, overflow: screen.scrollWidth > screen.clientWidth };
    });
    expect(layout).toEqual({ overlaps: 0, overflow: false });
    await frame.locator('#um-doa [data-act=silence]').click();
    await frame.locator('#um-doa [data-act=start]').click();
    await frame.locator('#um-doa [data-act=cancel]').click();
    await expect(frame.locator('#um-doa [data-act=start]')).toBeVisible();
    await page.waitForTimeout(850); // The canceled response must have arrived.
    expect(await engine.evaluate('window.prayerFinishes.length')).toBe(0);
    await frame.locator('#um-doa [data-act=start]').click();
    await frame.locator('#um-doa [data-act=retry-finish]').click();
    await expect(frame.locator('#um-doa')).toContainText('Doamu sudah tercatat untuk ucapan ini');
    expect(await engine.evaluate('window.prayerFinishes')).toEqual([
      { id: 'prayer-target-1', token: 'test-session' },
      { id: 'prayer-target-1', token: 'test-session' },
    ]);
    expect(await engine.evaluate('window.prayerStarts')).toEqual([
      { id: 'prayer-target-1', catalog: 'umum/hening' },
      { id: 'prayer-target-1', catalog: 'umum/hening' },
    ]);
    await frame.locator('#um-doa [data-act=close]').last().click();
    await expect(frame.locator('#um-doa')).not.toHaveClass(/on/);
    expect(errors).toEqual([]);
  });
}
