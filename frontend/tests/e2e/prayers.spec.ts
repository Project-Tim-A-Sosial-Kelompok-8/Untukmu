import { expect, test } from "@playwright/test";
import { register } from './helpers';

test('halaman Doa dapat dibuka langsung tanpa melewati layar pembuka', async ({ page }) => {
  const { frame } = await register(page, 'prayer-direct', { path: '/doa', startComposer: false });
  await expect(frame.locator('#um-doa')).toHaveClass(/on/);
  await expect(frame.locator('#um-entry')).not.toHaveClass(/on/);
  await expect(frame.locator('#um-doa [data-act=hub-trad]')).toHaveCount(7);
});

for (const width of [320, 390, 1280]) {
  test(`doa: tujuan, pilihan agama, batal, dan retry tetap sinkron (${width}px)`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 844 });
    const { frame } = await register(page, `prayer-${width}`, { startComposer: false });
    await expect(frame.locator('#um-entry .acts button').nth(1)).toHaveAttribute('data-act', 'doa');
    await frame.locator('#um-entry [data-act=doa]').click();
    await expect(frame.locator('#um-doa')).toHaveClass(/on/);
    await expect(frame.locator('#um-doa [data-act=hub-trad]')).toHaveCount(7);
    await expect(frame.locator('#um-exp')).not.toHaveClass(/on/);
    await frame.locator('#um-doa [data-act=hub-trad][data-id=umum]').click();
    await expect(frame.locator('#um-doa [aria-label="Jenis doa"]')).toContainText('Sesi hening tersedia');
    await frame.locator('#um-doa [data-act=close]').click();
    await frame.locator('.um-dock [data-act=doa]').click();
    await expect(frame.locator('#um-doa')).toHaveClass(/on/);
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
        if (window.prayerStarts.length === 1) await new Promise(resolve => { window.releasePrayerStart = resolve; });
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
    await engine.evaluate(`(() => {
      const entry = UM.doaData.byId('islam').entri[0];
      entry.reviewed = true; entry.audio = false;
    })()`);
    await frame.locator('#um-doa [data-act=entri]').first().click();
    await expect(frame.locator('#um-doa .um-prayer')).toContainText('Audio belum tersedia');
    await expect(frame.locator('#um-doa [data-act=start]')).toHaveCount(0);
    await expect(frame.locator('#um-doa [data-act=silence]')).toBeVisible();

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
    // Deliver the response only after cancellation. A short wall-clock delay
    // can finish before Playwright clicks Cancel on a busy software renderer.
    await engine.evaluate('(async () => { window.releasePrayerStart(); await new Promise(resolve => setTimeout(resolve, 0)); })()');
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

test('pemutar audio dapat dijeda, dibatalkan, dan mencatat hanya setelah berakhir', async ({ page }) => {
  // A silent WAV is only a media fixture, never shipped as religious content.
  const samples = 8000 * 2, wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  await page.route('**/test-prayer.wav', route => route.fulfill({ body: wav, contentType: 'audio/wav' }));
  const { frame } = await register(page, 'prayer-audio', { startComposer: false });
  await frame.locator('#um-entry [data-act=skip]').click();
  const engine = page.frames()[1];
  await engine.evaluate(`(() => {
    const target = {id:'audio-target',galaksiId:'audio-galaxy',publicBody:'Ucapan tujuan audio',privasi:'publik',moderationStatus:'approved'};
    UM.store.preparePrayer = async () => target.id;
    UM.store.getPesan = async () => target;
    UM.doaData.entri('umum','hening').audio = true;
    UM.store.startPrayer = async () => ({playback_token:'audio-session',seconds:2,audio_url:'/test-prayer.wav',audio_attribution:'Audio pengujian'});
    window.audioFinishes = 0;
    UM.store.addDoa = async () => { window.audioFinishes++; return {added:true}; };
    UM.galaksi.refresh = async () => {};
    UM.ui.bukaDoa(target.galaksiId,target.id);
  })()`);
  await frame.locator('#um-doa [data-act=trad][data-id=umum]').click();
  await frame.locator('#um-doa [data-act=entri][data-id=hening]').click();
  await frame.locator('#um-doa [data-act=start]').click();
  const audio = frame.locator('#um-doa audio');
  await expect(audio).toBeVisible();
  await audio.evaluate((node: HTMLAudioElement) => node.pause());
  await page.waitForTimeout(2300);
  expect(await engine.evaluate('window.audioFinishes')).toBe(0);
  await frame.locator('#um-doa [data-act=cancel]').click();
  await expect(audio).toHaveCount(0);
  await frame.locator('#um-doa [data-act=start]').click();
  await expect(audio).toBeVisible();
  await audio.evaluate((node: HTMLAudioElement) => node.play());
  await expect(frame.locator('#um-doa [data-act=again]')).toBeVisible({timeout:10000});
  expect(await engine.evaluate('window.audioFinishes')).toBe(1);
});
