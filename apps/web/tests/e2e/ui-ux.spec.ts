import { test, expect, type Locator } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { login } from './helpers';

type Screen = { id: string; title: string; group: string; entry: string; action: string; result: string; fixture?: string };
type Shot = { path: string; width: number; height: number; sha256: string; scroll: number };

for (const device of ["mobile", "desktop"] as const) {
  test(`ekspor UI/UX lengkap dari web sebenarnya (${device})`, async ({ page }) => {
    test.skip(process.env.UNTUKMU_EXPORT_UI_UX !== "1" || process.env.UNTUKMU_BROWSER_TEST !== "1", "Run npm run ui-ux:export with the isolated API.");
    test.setTimeout(600000);
    const viewport = { width: device === "mobile" ? 390 : 1366, height: 844 };
    await page.setViewportSize(viewport);
    const records: (Screen & { images: Shot[]; url: string })[] = [];
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const folder = resolve("../../docs/ui-ux", device, "layar");
    await mkdir(folder, { recursive: true });
    let frame = page.frameLocator("iframe");
    const email = `contoh-uiux-${device}@example.com`;
    const password = "kata-sandi-contoh-ui-ux-panjang";

    async function capture(screen: Screen, selector?: string, feed = false) {
      const groupFolder = screen.group.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      await mkdir(resolve(folder, groupFolder), { recursive: true });
      const scroller: Locator | undefined = selector ? frame.locator(selector) : undefined;
      if (scroller) await expect(scroller).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      let offsets = [0];
      if (scroller) {
        const size = await scroller.evaluate(node => ({ max: node.scrollHeight - node.clientHeight, step: Math.max(200, node.clientHeight - 100) }));
        if (size.max > 40) {
          offsets = feed ? [0, Math.min(size.step, size.max), size.max]
            : Array.from({ length: Math.ceil(size.max / size.step) + 1 }, (_, i) => Math.min(i * size.step, size.max));
        }
      }
      const images: Shot[] = [];
      for (const [index, offset] of [...new Set(offsets)].entries()) {
        if (scroller) await scroller.evaluate((node, value) => { node.scrollTop = value; }, offset);
        await page.waitForTimeout(180);
        const name = `${String(records.length + 1).padStart(2, "0")}-${screen.id}${index ? `-bagian-${index + 1}` : ""}.png`;
        const buffer = await page.screenshot({ path: resolve(folder, groupFolder, name), fullPage: !selector && !await page.locator("iframe").count(), animations: "disabled", caret: "hide" });
        images.push({ path: `${device}/layar/${groupFolder}/${name}`, width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), sha256: createHash("sha256").update(buffer).digest("hex"), scroll: offset });
      }
      if (scroller) await scroller.evaluate(node => { node.scrollTop = 0; });
      records.push({ ...screen, images, url: new URL(page.url()).pathname });
      console.log(`UI/UX ${device}: ${screen.id} (${images.length} gambar)`);
    }
    async function shot(id: string, title: string, group: string, entry: string, action: string, result: string, selector?: string, feed = false, fixture?: string) {
      await capture({ id, title, group, entry, action, result, fixture }, selector, feed);
    }
    const dock = (action: string) => frame.locator(`.um-dock [data-act=${action}]`);
    const close = (selector: string) => frame.locator(`${selector} .um-close`).click();

    await page.route('**/api/v1/explore?*', route => route.fulfill({ json: [] }));
    await page.goto("/");
    await expect(frame.locator("#um-entry.on")).toBeVisible();
    await shot("halaman-awal", "Login awal", "Mulai dan akun", "/", "Buka website", "Masuk atau daftar akun wajib sebelum membuka aplikasi.", "#um-react-account .um-screen.on");
    await expect(frame.locator("#um-account-title")).toHaveText("Masuk ke Untukmu");
    await shot("masuk", "Masuk ke akun", "Mulai dan akun", "Tulis → Masuk", "Buka fitur yang memerlukan akun", "Surel, kata sandi, daftar, dan pemulihan tersedia.", "#um-react-account .um-screen.on");
    await frame.getByRole("button", { name: "Pulihkan akun", exact: true }).click();
    await shot("pemulihan-tamu", "Pemulihan akun", "Mulai dan akun", "Masuk → Pulihkan akun", "Buka formulir pemulihan", "Kode pemulihan dan kata sandi baru diminta.", "#um-react-account .um-screen.on");
    await frame.getByRole("dialog", { name: "Pulihkan akun" }).getByRole("button", { name: "Tutup" }).click();
    await frame.getByRole("button", { name: "Daftar akun", exact: true }).click();
    await frame.locator("#um-email").fill(email);
    await frame.locator("#um-account-password").fill(password);
    await frame.locator("#um-repeat").fill("kata-sandi-berbeda-panjang");
    await shot("daftar", "Pendaftaran akun", "Mulai dan akun", "Masuk → Buat akun", "Isi formulir pendaftaran", "Surel dan pengulangan kata sandi ditampilkan.", "#um-react-account .um-screen.on");
    await frame.getByRole("button", { name: "Daftar", exact: true }).click();
    await expect(frame.locator("#um-react-account [role=alert]")).toContainText("belum cocok");
    await shot("daftar-validasi", "Validasi pendaftaran", "Mulai dan akun", "Buat akun", "Gunakan pengulangan kata sandi yang berbeda", "Pesan kesalahan muncul dan formulir dapat diperbaiki.", "#um-react-account .um-screen.on");
    await frame.locator("#um-repeat").fill(password);
    await frame.getByRole("button", { name: "Daftar", exact: true }).click();
    await expect(frame.getByText("Simpan kode pemulihan", { exact: true })).toBeVisible({ timeout: 60000 });
    await shot("kode-pemulihan", "Simpan kode pemulihan", "Mulai dan akun", "Setelah mendaftar", "Pendaftaran berhasil pada akun contoh", "Kode sekali tampil dan konfirmasi penyimpanan terlihat.", "#um-react-account .um-screen.on");
    await frame.getByRole("checkbox").check();
    await frame.getByRole("button", { name: "Lanjutkan", exact: true }).click();
    await frame.locator("#um-entry [data-act=skip]").click();
    await shot("rumah-milky-way", "Home / Milky Way", "Galaksi dan Peta", "Home / Rumah", "Masuk ke akun", "Galaksi utama dan delapan menu bawah terlihat.");
    await dock("jelajah").click();
    await expect(frame.locator("#um-exp .um-item")).toHaveCount(0);
    await shot("jelajah-kosong", "Jelajah tanpa ucapan", "Jelajah dan sosial", "Jelajah", "Buka daftar tanpa data publik", "Keadaan kosong dan alasan batas halaman terlihat.", "#um-exp");
    await close("#um-exp");
    await dock("doa").click();
    await expect(frame.locator("#um-doa [data-act=target]")).toHaveCount(0);
    await shot("doa-kosong", "Doa tanpa ucapan publik", "Doa", "Doa", "Buka Doa sebelum ada konten publik", "Akses tulis doa dan tujuh tradisi tetap tersedia.", "#um-doa");
    await close("#um-doa");
    await page.unroute('**/api/v1/explore?*');
    await dock("tulis").click();
    await expect(frame.locator("#um-nama")).toBeVisible();
    await close("#um-comp");
    await dock("dash").click();
    await shot("ruang-pribadi-kosong", "Ruang Pribadi kosong", "Ruang Pribadi", "Ruang Pribadi", "Buka akun yang baru dibuat", "Ringkasan kosong serta bagian pesan dan doa tersedia.", "#um-dash");
    await close("#um-dash");
    await dock("tulis").click();
    await frame.locator("#um-nama").fill("Ibu — kenangan contoh");
    await shot("tulis-tujuan-baru", "Tulis 1: tujuan baru", "Tulis pesan", "Tulis", "Isi nama dan hubungan", "Tujuan pesan dan pilihan kategori jelas.", "#um-comp");
    await frame.locator("#um-comp [data-act=next]").click();
    await shot("tulis-bentuk-galaksi", "Tulis 2: bentuk galaksi", "Tulis pesan", "Langkah 2", "Pilih bentuk, warna, ukuran, atau foto", "Representasi galaksi dan kontrol unggahan terlihat.", "#um-comp");
    await frame.locator("#um-comp [data-act=next]").click();
    await frame.locator("#um-isi").fill("Terima kasih, Ibu, untuk kasih sayang dan kenangan yang selalu menguatkanku. Ini hanya tulisan contoh untuk dokumentasi UI/UX.");
    await shot("tulis-isi-pesan", "Tulis 3: isi dan lampiran", "Tulis pesan", "Langkah 3", "Tulis isi, tanggal, suasana, tag, dan lampiran", "Atribut tulisan dan batas lampiran tersedia.", "#um-comp");
    await frame.locator("#um-comp [data-act=next]").click();
    for (const [id, title] of [["privat", "Privat"], ["publik", "Publik anonim"], ["unlisted", "Tautan terbatas"]]) {
      await frame.locator(`#um-comp [data-act=priv][data-id=${id}]`).click();
      await shot(`tulis-privasi-${id}`, `Tulis 4: ${title}`, "Tulis pesan", "Langkah 4", `Pilih ${title}`, "Pilihan aktif dan batas aksesnya dijelaskan.", "#um-comp");
    }
    await frame.locator('#um-comp [data-act=priv][data-id=privat]').click();
    await frame.locator('#um-comp [data-act=save]').click();
    await expect(frame.locator('#um-comp')).not.toHaveClass(/on/, { timeout: 60000 });
    const own = await page.frames()[1].evaluate(async () => {
      const galaxy = (await window.UM.store.listGalaksi())[0];
      const extra = await window.UM.store.saveGalaksi({ nama: "Sahabat — kenangan contoh", kategori: "sahabat", kind: "ellipsoid", warna: "#b9a7ff" });
      const pending = await window.UM.store.simpanPesan({ galaksiId: galaxy.id, teks: "Ucapan publik contoh yang menunggu peninjauan moderator.", privasi: "publik", mood: "syukur", tag: ["keluarga"] });
      const shared = await window.UM.store.simpanPesan({ galaksiId: galaxy.id, teks: "Tulisan contoh yang hanya dibaca melalui tautan terbatas.", privasi: "unlisted" });
      await Promise.all([window.UM.galaksi.refresh(), window.UM.sky.refresh()]);
      return { galaxy, extra, pendingId: pending.id, sharedId: shared.id };
    });
    await dock("tulis").click();
    await expect(frame.locator('#um-comp [data-act=pick-galaksi]')).toHaveCount(2);
    await frame.locator('#um-comp [data-act=pick-galaksi]').first().click();
    await frame.locator('#um-comp [data-act=extra-target]').first().click();
    await shot("tulis-tujuan-lama", "Tulis: tujuan lama dan beberapa galaksi", "Tulis pesan", "Tulis kembali", "Pilih tujuan lama dan tujuan tambahan", "Pesan dapat ditujukan ke beberapa galaksi.", "#um-comp");
    await close("#um-comp");
    await dock("doa").click();
    await frame.locator('#um-doa [data-act=write-prayer]').click();
    await expect(frame.locator('#um-written-target')).toBeEnabled();
    await frame.locator('#um-written-target').selectOption(own.galaxy.id);
    await frame.locator('#um-written-text').fill("Semoga Ibu selalu diberi ketenangan dan kasih. Ini doa tertulis contoh untuk dokumentasi antarmuka.");
    await shot("tulis-doa-tujuan-lama", "Tulis doa pada galaksi yang ada", "Doa", "Doa → Tulis doa", "Pilih galaksi milik akun", "Tujuan, tradisi, isi, dan privasi doa terlihat.", "#um-written-prayer");
    await frame.getByRole('button', { name: '+ Galaksi baru', exact: true }).click();
    await frame.locator('#um-written-name').fill("Keluarga — doa contoh");
    await frame.locator('#um-written-category').selectOption('keluarga');
    await shot("tulis-doa-galaksi-baru", "Tulis doa dan galaksi baru", "Doa", "+ Galaksi baru", "Isi tujuan, bentuk, warna, ukuran, dan doa", "Seluruh formulir galaksi baru tersedia.", "#um-written-prayer");
    await frame.getByRole('button', { name: 'Simpan doa', exact: true }).click();
    await expect(frame.locator('#um-written-prayer [role=status]')).toContainText('sudah tersimpan', { timeout: 60000 });
    await shot("doa-tertulis-tersimpan", "Doa tertulis tersimpan", "Doa", "Setelah Simpan doa", "Penyimpanan berhasil", "Akses tulis lagi, Ruang Pribadi, dan kembali ke Doa terlihat.", "#um-written-prayer");
    await frame.getByRole('button', { name: 'Lihat di Ruang Pribadi', exact: true }).click();
    await shot("ruang-pribadi-terisi", "Ruang Pribadi dengan pesan dan doa", "Ruang Pribadi", "Ruang Pribadi", "Buka ringkasan akun contoh", "Pesan, Doa tertulis, galaksi, dan riwayat dipisahkan.", "#um-dash");
    await frame.locator('#um-dash [data-act=manage]').filter({ hasText: 'Kelola doa' }).first().click();
    await expect(frame.locator('#manage-title')).toHaveText('Kelola doa');
    await shot("kelola-doa", "Kelola doa tertulis", "Ruang Pribadi", "Doa tertulis → Kelola doa", "Buka tulisan doa", "Edit, simpan perubahan, dan hapus doa tersedia.", "#um-react-account .um-screen.on");
    await frame.getByRole('dialog', { name: 'Kelola doa' }).getByRole('button', { name: 'Tutup' }).click();
    const privateMessage = await page.frames()[1].evaluate(async () => (await window.UM.store.listPesan()).find(row => row.jenis === 'pesan' && row.privasi === 'privat')!.id);
    await frame.locator(`#um-dash [data-act=manage][data-id="${privateMessage}"]`).click();
    await shot("kelola-pesan", "Kelola pesan privat", "Ruang Pribadi", "Pesan → Kelola pesan", "Buka pesan privat", "Kontrol edit dan hapus menggunakan jenis Pesan.", "#um-react-account .um-screen.on");
    await frame.getByRole('dialog', { name: 'Kelola pesan' }).getByRole('button', { name: 'Tutup' }).click();
    await frame.locator(`#um-dash [data-act=manage][data-id="${own.sharedId}"]`).click();
    await frame.getByRole('button', { name: 'Buat tautan baru', exact: true }).click();
    const shareStatus = frame.locator('#um-react-account [role=status]');
    await expect(shareStatus).toContainText('/bagi#');
    const sharedHash = new URL(await shareStatus.innerText()).hash;
    await shot("kelola-tautan-terbatas", "Kelola tautan terbatas", "Ruang Pribadi", "Kelola pesan tautan terbatas", "Buat tautan pada tulisan contoh", "Tautan, pencabutan, dan syarat moderasi ditampilkan.", "#um-react-account .um-screen.on");
    await frame.getByRole('dialog', { name: 'Kelola pesan' }).getByRole('button', { name: 'Tutup' }).click();
    await frame.locator(`#um-dash [data-act=terbang][data-id="${own.galaxy.id}"]`).click();
    await expect(frame.locator('#bp-name')).toHaveText(own.galaxy.nama);
    await page.waitForTimeout(900);
    await shot("kartu-galaksi", "Galaksi dan ringkasan tulisan", "Galaksi dan Peta", "Ruang Pribadi → galaksi", "Terbang ke galaksi tujuan", "Bentuk galaksi, hitungan, dan daftar tulisan terlihat.");
    await frame.locator('#um-gk-list [data-bintang]').first().click();
    await expect(frame.locator('#bp-desc')).not.toContainText('…');
    await shot("kartu-bintang-pesan", "Membaca tulisan dari bintang", "Galaksi dan Peta", "Galaksi → bintang", "Pilih bintang yang berisi tulisan", "Isi tulisan, privasi, metadata, dan kontrol terkait terlihat.");
    await frame.locator('#bp-close').click();

    const demo = JSON.parse(execFileSync(process.env.UNTUKMU_TEST_PYTHON || 'python', [resolve('../api/tests/seed_ui_ux.py'), email], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, encoding: 'utf8' })) as { public_id: string; public_galaxy: string };
    await dock('jelajah').click();
    await expect(frame.locator('#um-exp .um-item')).toHaveCount(30);
    await shot("jelajah-terbaru", "Jelajah: terbaru", "Jelajah dan sosial", "Jelajah", "Buka ucapan publik contoh", "Daftar, filter, urutan, tindakan sosial, dan pagination terlihat.", "#um-exp", true);
    await frame.locator('#um-exp [data-act=sort][data-id=doa]').click();
    await shot("jelajah-paling-didoakan", "Jelajah: paling didoakan", "Jelajah dan sosial", "Jelajah → Paling didoakan", "Ganti urutan", "Penjelasan urutan dan hitungan pendoa terlihat.", "#um-exp", true);
    await frame.locator('#um-exp [data-act=next-page]').click();
    await expect(frame.locator('#um-exp [data-act=prev-page]')).toBeEnabled();
    await shot("jelajah-halaman-kedua", "Jelajah: halaman berikutnya", "Jelajah dan sosial", "Jelajah → Berikutnya", "Buka halaman kedua", "Sebelumnya aktif dan batas halaman terakhir dijelaskan.", "#um-exp", true);
    await frame.locator('#um-filter-tag').fill('keluarga');
    await frame.locator('#um-filter-mood').selectOption('syukur');
    await frame.locator('#um-exp [data-act=filter]').click();
    await expect(frame.locator('#um-exp [data-filter-summary]')).toContainText('keluarga');
    await shot("jelajah-filter", "Jelajah: filter aktif", "Jelajah dan sosial", "Jelajah → Terapkan filter", "Pilih suasana dan tag", "Filter aktif serta daftar hasil ditampilkan.", "#um-exp", true);
    await frame.locator('#um-filter-tag').fill('contoh-tidak-ada');
    await frame.locator('#um-exp [data-act=filter]').click();
    await expect(frame.locator('#um-exp .um-item')).toHaveCount(0);
    await shot("jelajah-filter-kosong", "Jelajah: filter tanpa hasil", "Jelajah dan sosial", "Jelajah → filter", "Cari tag yang tidak ada", "Pesan kosong dan Hapus filter tersedia.", "#um-exp");
    await frame.locator('#um-exp [data-act=reset-filter]').click();
    await expect(frame.locator('#um-exp .um-item')).toHaveCount(30);
    await frame.locator('#um-exp [data-act=lapor]').first().click();
    await frame.locator('#um-report-reason').fill('Contoh alasan laporan untuk dokumentasi UI/UX.');
    await shot("laporkan-ucapan", "Laporkan ucapan", "Jelajah dan sosial", "Ucapan → Laporkan", "Isi alasan laporan", "Alasan, batal, dan kirim laporan tersedia.", "#um-react-account .um-screen.on");
    await frame.getByRole('button', { name: 'Kirim laporan', exact: true }).click();
    await expect(frame.locator('#um-report-reason')).toHaveCount(0);
    await page.frames()[1].evaluate(id => window.UM.openSocial('block', id), demo.public_id);
    await shot("konfirmasi-blokir", "Konfirmasi blokir pengirim", "Jelajah dan sosial", "Ucapan → Blokir", "Buka konfirmasi", "Dampak pemblokiran, batal, dan konfirmasi terlihat.", "#um-react-account .um-screen.on");
    await frame.getByRole('button', { name: 'Blokir', exact: true }).click();
    await expect(frame.locator('#um-social-title')).toHaveCount(0);
    await close('#um-exp');
    await page.frames()[1].evaluate(() => window.UM.openSocial('blocks'));
    await expect(frame.locator('#um-react-account .um-item')).toHaveCount(1);
    await shot("daftar-pemblokiran", "Daftar pemblokiran", "Akun dan pengaturan", "Pengaturan akun → pemblokiran", "Buka daftar pengirim yang diblokir", "Pengirim anonim dan tombol batalkan blokir terlihat.", "#um-react-account .um-screen.on");
    await frame.getByRole('button', { name: 'Batalkan blokir', exact: true }).click();
    await frame.getByRole('dialog', { name: 'Daftar pemblokiran' }).getByRole('button', { name: 'Tutup' }).click();
    await dock('doa').click();
    await expect(frame.locator('#um-doa [data-act=target]')).toHaveCount(30);
    await shot("doa-daftar-ucapan", "Doa: daftar ucapan tujuan", "Doa", "Doa", "Buka hub Doa", "Tujuan publik, tujuh tradisi, dan halaman tujuan tersedia.", "#um-doa", true);
    for (const [id, label] of [['islam', 'Islam'], ['kristen', 'Kristen'], ['katolik', 'Katolik'], ['hindu', 'Hindu'], ['buddha', 'Buddha'], ['konghucu', 'Konghucu'], ['umum', 'Umum']]) {
      await frame.locator(`#um-doa [data-act=hub-trad][data-id=${id}]`).click();
      await expect(frame.locator('#um-doa [aria-label="Jenis doa"]')).toBeVisible();
      await shot(`doa-tradisi-${id}`, `Pilihan doa ${label}`, "Doa", `Doa → ${label}`, "Pilih tradisi", "Jenis doa, rujukan, dan kesiapan teks/audio terlihat.", "#um-doa", true);
    }
    await frame.locator('#um-doa [data-act=target]').first().click();
    await frame.locator('#um-doa [data-act=trad][data-id=islam]').click();
    await frame.locator('#um-doa [data-act=entri]').first().click();
    await shot("doa-menunggu-kurasi", "Doa: materi menunggu kurasi", "Doa", "Ucapan → tradisi → jenis doa", "Pilih materi yang belum disetujui", "Status kurasi dijelaskan tanpa tombol mulai yang menyesatkan.", "#um-doa");
    await frame.locator('#um-doa [data-act=trad][data-id=umum]').click();
    await frame.locator('#um-doa [data-act=entri][data-id=hening]').click();
    await shot("doa-siap-hening", "Doa: siap memulai hening", "Doa", "Ucapan → Umum → Hening", "Pilih sesi hening", "Durasi dan aturan pencatatan tersedia.", "#um-doa");
    await frame.locator('#um-doa [data-act=start]').click();
    await expect(frame.locator('#um-doa .clock')).toBeVisible();
    await shot("doa-hening-berjalan", "Doa: sesi hening berjalan", "Doa", "Mulai berdoa / hening", "Mulai sesi nyata 30 detik", "Hitung mundur dan pembatalan terlihat.", "#um-doa");
    await expect(frame.locator('#um-doa [data-act=again]')).toBeVisible({ timeout: 65000 });
    await shot("doa-selesai", "Doa: sesi selesai", "Doa", "Sesi hening selesai", "Tunggu sesi selesai", "Konfirmasi pencatatan dan tindakan berikutnya tersedia.", "#um-doa");
    await close('#um-doa');

    // A clearly documented media fixture shows the real player controls without
    // approving any religious recording or recording an artificial prayer.
    const samples = 8000 * 60, wav = Buffer.alloc(44 + samples * 2);
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24);
    wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
    await page.route('**/ui-ux-audio.wav', route => route.fulfill({ body: wav, contentType: 'audio/wav' }));
    await page.frames()[1].evaluate(`(() => {
      window.uiUxOriginalStart = UM.store.startPrayer;
      UM.doaData.entri('umum','hening').audio = true;
      UM.store.startPrayer = async () => ({playback_token:'visual-only',seconds:60,audio_url:'/ui-ux-audio.wav',audio_attribution:'Media uji UI/UX tanpa rekaman agama'});
    })()`);
    await page.frames()[1].evaluate(demo => window.UM.ui.bukaDoa(demo.public_galaxy, demo.public_id), demo);
    await frame.locator('#um-doa [data-act=trad][data-id=umum]').click();
    await frame.locator('#um-doa [data-act=entri][data-id=hening]').click();
    await frame.locator('#um-doa [data-act=start]').click();
    await expect(frame.locator('#um-doa audio')).toBeVisible();
    await frame.locator('#um-doa audio').evaluate((audio: HTMLAudioElement) => audio.pause());
    await shot("doa-pemutar-audio", "Doa: kontrol pemutar audio", "Doa", "Audio tersedia → Mulai dengarkan doa", "Buka pemutar dengan media uji", "Pemutar asli menyediakan putar, jeda, progres, volume, dan pembatalan.", "#um-doa", false, "Media WAV hening khusus demonstrasi UI; tidak dikurasi sebagai doa agama dan tidak dicatat sebagai sesi selesai.");
    await frame.locator('#um-doa [data-act=cancel]').click();
    await close('#um-doa');
    await page.frames()[1].evaluate(`(() => { UM.store.startPrayer = window.uiUxOriginalStart; UM.doaData.entri('umum','hening').audio = false; })()`);
    await dock('set').click();
    await shot("pengaturan", "Pengaturan tampilan dan data", "Akun dan pengaturan", "Pengaturan", "Buka pengaturan", "Galaksi latar, akun, privasi, dan kontrol penghapusan terlihat.", "#um-set");
    await frame.locator('#um-set [data-act=account]').click();
    await expect(frame.locator('#um-account-title')).toHaveText('Pengaturan akun');
    await shot("akun-keamanan-sesi", "Akun, keamanan, ekspor, dan sesi", "Akun dan pengaturan", "Pengaturan → Akun dan keamanan", "Buka pengaturan akun", "Visibilitas, ekspor, pemulihan, sesi aktif, dan keluar terlihat.", "#um-react-account .um-screen.on");
    await frame.locator('#export-password').fill('kata-sandi-ekspor-contoh-panjang');
    const downloaded = page.waitForEvent('download');
    await frame.getByRole('button', { name: 'Unduh ekspor terenkripsi', exact: true }).click();
    const download = await downloaded;
    await frame.locator('#export-verify').setInputFiles((await download.path())!);
    await expect(frame.locator('#um-react-account section [role=status]')).toContainText('Berkas berhasil diverifikasi', { timeout: 60000 });
    await shot("ekspor-diverifikasi", "Ekspor terenkripsi berhasil", "Akun dan pengaturan", "Akun → Ekspor", "Unduh dan verifikasi berkas contoh", "Status ekspor dan verifikasi muncul tanpa mengubah data akun.", "#um-react-account .um-screen.on");
    await frame.getByRole('button', { name: 'Ganti kata sandi dengan kode pemulihan', exact: true }).click();
    await shot("pemulihan-akun-masuk", "Ganti kata sandi melalui pemulihan", "Akun dan pengaturan", "Akun → pemulihan", "Buka pemulihan akun yang sedang masuk", "Syarat dan formulir pemulihan ditampilkan.", "#um-react-account .um-screen.on");
    await frame.getByRole('dialog', { name: 'Pulihkan akun' }).getByRole('button', { name: 'Tutup' }).click();
    await frame.getByRole('dialog', { name: 'Pengaturan akun' }).getByRole('button', { name: 'Tutup' }).click();
    await close('#um-set');
    await dock('setup').click();
    await expect(frame.locator('#um-setup [data-act=lock]')).toBeVisible();
    await shot("kunci-terbuka", "Kunci enkripsi terbuka", "Akun dan pengaturan", "Kunci", "Buka pengelolaan kunci", "Status kunci, KDF, dan tombol kunci terlihat.", "#um-setup");
    await frame.locator('#um-setup [data-act=lock]').click();
    await expect(frame.locator('#um-pw')).toBeVisible();
    await shot("kunci-tertutup", "Membuka kunci tulisan privat", "Akun dan pengaturan", "Kunci → Kunci sekarang", "Tutup kunci", "Kata sandi dan kode pemulihan dapat digunakan.", "#um-setup");
    await frame.locator('#um-pw').fill('kata-sandi-salah-contoh');
    await frame.locator('#um-setup [data-act=unlock]').click();
    await expect(frame.locator('#um-setup .um-error')).not.toBeEmpty({ timeout: 60000 });
    await shot("kunci-kata-sandi-salah", "Kunci: kata sandi salah", "Akun dan pengaturan", "Kunci → Buka", "Masukkan kata sandi yang salah", "Kesalahan ditampilkan dan dapat dicoba ulang.", "#um-setup");
    await frame.locator('#um-pw').fill(password);
    await frame.locator('#um-setup [data-act=unlock]').click();
    await expect(frame.locator('#um-setup [data-act=lock]')).toBeVisible({ timeout: 60000 });
    await close('#um-setup');
    await dock('peta').click();
    await frame.locator('.um-skyctl [data-mode=kenangan]').click();
    await shot("peta-kenangan", "Peta Kenangan", "Galaksi dan Peta", "Peta → Kenangan", "Buka peta galaksi milik akun", "Bintang dan kontrol peta terlihat tanpa nama mengambang.");
    await frame.locator('.um-skyctl [data-mode=astronomi]').click();
    await shot("peta-konstelasi", "Peta Konstelasi", "Galaksi dan Peta", "Peta → Konstelasi", "Ganti mode Peta", "Bintang dan garis rasi ditampilkan.");
    const point = await page.frames()[1].evaluate(`(() => {
      const c=SKY_CONS[12],s=c.z.stars[0],d=raDecDir(s[0],s[1]);
      skyControls.autoRotate=false; skyControls.enableDamping=false; skyCamera.position.copy(d).multiplyScalar(-.1);
      skyControls.target.set(0,0,0);skyControls.update();skyCamera.updateMatrixWorld();
      const v=d.clone().multiplyScalar(SKY_R).project(skyCamera); return {x:(v.x*.5+.5)*innerWidth,y:(-v.y*.5+.5)*innerHeight};
    })()`) as { x: number; y: number };
    await page.mouse.click(point.x, point.y);
    await expect(frame.locator('#beacon-panel')).toHaveClass(/open/);
    await shot("peta-kartu-rasi", "Kartu informasi rasi", "Galaksi dan Peta", "Konstelasi → bintang rasi", "Klik langsung pada bintang rasi", "Nama, informasi, ilustrasi, dan tombol tutup terlihat.");
    await dock('rumah').click();
    await frame.locator('#galaxystrip button').first().click();
    await shot("astronomi-kartu-objek", "Kartu objek astronomi", "Galaksi dan Peta", "Strip astronomi", "Pilih objek dari strip", "Foto, informasi objek, dan tujuan perjalanan tersedia.");
    await frame.locator('#bp-solar-link').click();
    await expect.poll(() => page.frames()[1].evaluate(() => window.UM_ENGINE!.metrics().mode)).toBe('solar');
    await page.waitForTimeout(500);
    await shot("tata-surya", "Jelajah tata surya", "Galaksi dan Peta", "Kartu Matahari → tata surya", "Masuk ke tata surya", "Objek, strip, kecepatan waktu, dan menu bawah terlihat.");
    const planet = frame.locator('#solarstrip button').filter({ hasText: /Bumi|Earth/ }).first();
    await planet.click();
    await shot("tata-surya-kartu-planet", "Kartu planet", "Galaksi dan Peta", "Tata surya → Bumi", "Pilih planet", "Kartu foto dan informasi planet terlihat.");
    await dock('rumah').click();

    await page.goto('/admin');
    await login(page, email, password);
    frame = page.frameLocator('iframe');
    await expect(frame.getByText('Peninjauan konten', { exact: true })).toBeVisible();
    await expect(frame.getByRole('button', { name: 'Setujui', exact: true }).first()).toBeVisible();
    await shot("admin-moderasi", "Admin: antrean moderasi", "Admin", "/admin", "Buka akun admin contoh", "Konten, laporan, catatan, keputusan, dan pagination terlihat.", "#um-react-account .um-screen.on");
    for (const [id, label] of [['katolik/bapa-kami-katolik', 'Katolik'], ['hindu/gayatri', 'Hindu'], ['buddha/metta', 'Buddha']]) {
      await frame.locator('#prayer-catalog').selectOption(id);
      await shot(`admin-kurasi-${label.toLowerCase()}`, `Admin: kurasi ${label}`, "Admin", "Kurasi doa dan audio", "Pilih entri dengan rekaman kandidat", "Pratinjau, atribusi, sumber, naskah, terjemahan, durasi, lisensi, dan tinjauan terlihat.", "#um-react-account .um-screen.on");
    }
    await frame.locator('#prayer-catalog').selectOption('katolik/bapa-kami-katolik');
    await frame.getByRole('button', { name: 'Gunakan rekaman ini', exact: true }).click();
    await expect(frame.getByRole('status').filter({ hasText: 'Rekaman sudah dipasang sebagai draf' })).toBeVisible();
    await shot("admin-audio-draf", "Admin: rekaman dipasang sebagai draf", "Admin", "Kurasi → Gunakan rekaman ini", "Pasang rekaman kandidat tanpa menyetujuinya", "Status draf dan persetujuan yang tetap kosong terlihat.", "#um-react-account .um-screen.on");
    await frame.locator('#prayer-catalog').selectOption('');
    const approvals = frame.getByRole('button', { name: 'Setujui', exact: true });
    while (await approvals.count()) {
      await approvals.first().click();
      await page.waitForTimeout(300);
    }
    await expect(frame.getByText('Tidak ada pesan yang menunggu peninjauan.')).toBeVisible();
    await shot("admin-antrean-kosong", "Admin: antrean selesai", "Admin", "Moderasi", "Setujui tulisan contoh pada database sementara", "Keadaan kosong antrean dan tombol halaman terlihat.", "#um-react-account .um-screen.on");
    await page.goto('/bagi' + sharedHash);
    frame = page.frameLocator('iframe');
    await expect(frame.getByText('Tulisan contoh yang hanya dibaca melalui tautan terbatas.', { exact: true })).toBeVisible();
    await shot("tautan-pesan-valid", "Membaca tautan terbatas", "Halaman pendukung", "/bagi#token", "Buka tautan tulisan contoh yang disetujui", "Isi tulisan dan tombol kembali ke aplikasi ditampilkan.", '.um-screen.on.z-top[style*="100"]');
    await page.goto('/bagi');
    await expect(frame.getByText('Tautan tidak lengkap.', { exact: true })).toBeVisible();
    await shot("tautan-pesan-tidak-valid", "Tautan tidak lengkap", "Halaman pendukung", "/bagi", "Buka tanpa token", "Pesan kesalahan dan akses kembali tersedia.", '.um-screen.on.z-top[style*="100"]');
    await page.goto('/kebijakan-privasi');
    await shot("kebijakan-privasi", "Kebijakan privasi", "Halaman pendukung", "/kebijakan-privasi", "Buka kebijakan privasi", "Seluruh kebijakan dan tautan kembali dapat dibaca.");
    await page.goto('/offline.html');
    await shot("halaman-luring", "Halaman luring", "Halaman pendukung", "PWA ketika luring", "Buka tampilan luring bawaan", "Keterangan koneksi dan Coba kembali terlihat.");
    await page.goto('/halaman-contoh-tidak-ada');
    await shot("halaman-tidak-ditemukan", "Halaman tidak ditemukan", "Halaman pendukung", "Alamat yang tidak tersedia", "Buka URL tidak dikenal", "Halaman 404 bawaan website ditampilkan.");
    expect(errors).toEqual([]);
    expect(records.length).toBeGreaterThanOrEqual(55);
    const runtime = await readFile(resolve('public/engine/runtime.js'));
    await writeFile(resolve(folder, '../manifest.json'), JSON.stringify({ device, viewport, exportedAt: new Date().toISOString(),
      runtimeSha256: createHash('sha256').update(runtime).digest('hex'), demonstrationData: true,
      policy: 'Tampilan asli website dengan akun contoh. Panel panjang direkam per bagian; daftar berulang memakai awal, bagian berikutnya, dan akhir. Tidak ada data pengguna produksi.',
      screens: records }, null, 2) + '\n');
  });
}
