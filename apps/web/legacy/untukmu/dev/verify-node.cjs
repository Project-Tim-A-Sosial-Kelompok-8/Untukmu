/* Untukmu — verifikasi sisi Node (alat pengembangan, bukan bagian produk).
 *
 *   cd untukmu/dev && node verify-node.cjs
 *
 * Menjalankan logika murni Untukmu tanpa peramban: tabel bahasa, data doa,
 * lapisan kripto dengan Web Crypto sungguhan, lapisan data di atas stub
 * IndexedDB in-memory, dan fungsi murni ladang galaksi.
 *
 * Pemeriksaan yang paling sering menyelamatkan: setiap kunci bahasa yang
 * benar-benar dipakai kode harus ada di tabel — menangkap salah ketik nama
 * kunci tanpa perlu membuka peramban.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
global.window = global;

/* Jangan biarkan galat atau promise yang menggantung menghilang tanpa jejak:
   tanpa ini, satu promise yang tidak pernah selesai membuat Node keluar
   diam-diam dengan kode 0, dan hasil pengujian jadi menyesatkan. */
process.on('unhandledRejection', e => { console.error('\nGALAT: promise ditolak tanpa penanganan —', e); process.exit(1); });
process.on('uncaughtException', e => { console.error('\nGALAT: eksepsi tak tertangkap —', e); process.exit(1); });
process.on('beforeExit', code => {
  if (gagal === 0 && lulus > 0 && !selesai) {
    console.error('\nGALAT: pengujian berhenti di tengah — ada promise yang tidak pernah selesai.');
    process.exit(1);
  }
});

/* ── stub THREE secukupnya untuk fungsi murni ────────────────────────────── */
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new V3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  lengthSq() { return this.x ** 2 + this.y ** 2 + this.z ** 2; }
  length() { return Math.sqrt(this.lengthSq()); }
  normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  crossVectors(a, b) {
    const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x;
    return this.set(x, y, z);
  }
}
class Col {
  constructor(hex) {
    if (typeof hex === 'string') {
      this.r = parseInt(hex.slice(1, 3), 16) / 255;
      this.g = parseInt(hex.slice(3, 5), 16) / 255;
      this.b = parseInt(hex.slice(5, 7), 16) / 255;
    } else { this.r = this.g = this.b = 1; }
  }
  clone() { const c = new Col(); c.r = this.r; c.g = this.g; c.b = this.b; return c; }
  multiplyScalar(s) { this.r *= s; this.g *= s; this.b *= s; return this; }
  lerp(c, a) { this.r += (c.r - this.r) * a; this.g += (c.g - this.g) * a; this.b += (c.b - this.b) * a; return this; }
}
global.THREE = { Vector3: V3, Color: Col };

/* ── stub IndexedDB in-memory ────────────────────────────────────────────── */
global.indexedDB = (function () {
  const stores = {}; // nama → { keyPath, map }
  const later = fn => queueMicrotask(fn);
  function request(fn) {
    const r = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
    later(() => { try { r.result = fn(); if (r.onsuccess) r.onsuccess(); } catch (e) { r.error = e; if (r.onerror) r.onerror(); } });
    return r;
  }
  function makeDb() {
    return {
      objectStoreNames: { contains: n => !!stores[n] },
      createObjectStore(n, opts) { stores[n] = { keyPath: (opts && opts.keyPath) || 'id', map: new Map() }; return { createIndex() { } }; },
      deleteObjectStore(n) { delete stores[n]; },
      transaction() {
        const tx = {
          error: null, oncomplete: null, onerror: null, onabort: null,
          objectStore(name) {
            const st = stores[name];
            return {
              put(rec) { return request(() => { const c = structuredClone(rec); st.map.set(c[st.keyPath], c); return c[st.keyPath]; }); },
              get(k) { return request(() => { const v = st.map.get(k); return v === undefined ? undefined : structuredClone(v); }); },
              getAll() { return request(() => [...st.map.values()].map(v => structuredClone(v))); },
              delete(k) { return request(() => { st.map.delete(k); return undefined; }); },
              clear() { return request(() => { st.map.clear(); return undefined; }); },
              createIndex() { },
              // index harus menghormati nama field dan nilainya — index name = field name
              // di skema um-store.js (galaksiId / privasi / pesanId)
              index(name) {
                return {
                  getAll: value => request(() => [...st.map.values()]
                    .filter(r => r[name] === value).map(v => structuredClone(v)))
                };
              }
            };
          }
        };
        // WAJIB: tanpa ini withStore() di um-store.js tidak pernah resolve dan
        // seluruh rantai pengujian berhenti tanpa pesan
        later(() => { if (tx.oncomplete) tx.oncomplete(); });
        return tx;
      }
    };
  }
  return {
    open() {
      const r = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      later(() => {
        r.result = makeDb();
        if (r.onupgradeneeded) r.onupgradeneeded();
        if (r.onsuccess) r.onsuccess();
      });
      return r;
    }
  };
})();

const SRC = path.join(__dirname, '..', 'js');
const load = f => vm.runInThisContext(fs.readFileSync(path.join(SRC, f), 'utf8'), { filename: f });

/* urutan sama seperti di index.html */
['um-i18n.js', 'um-doa.js', 'um-crypto.js', 'um-store.js', 'um-sky.js', 'um-galaksi.js'].forEach(load);

/* ── pelari ──────────────────────────────────────────────────────────────── */
let lulus = 0, gagal = 0, selesai = false;
const catatan = [];
async function check(nama, fn) {
  try {
    const r = await fn();
    if (r === true) { lulus++; console.log('  ok   ' + nama); }
    else { gagal++; console.log('  FAIL ' + nama + ' :: ' + r); }
  } catch (e) { gagal++; console.log('  FAIL ' + nama + ' :: ' + (e && e.message || e)); }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const pts = s => (s ? new Date(s).getTime() : 0);

(async function () {
  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.js')).sort();

  console.log('\n— berkas & sintaks —');
  await check('9 berkas ada', () => (files.length === 9 ? true : 'dapat ' + files.length + ': ' + files.join(',')));
  for (const f of files) {
    await check('sintaks ' + f, () => {
      new vm.Script(fs.readFileSync(path.join(SRC, f), 'utf8'), { filename: f });
      return true;
    });
  }

  console.log('\n— i18n —');
  const id = Object.keys(UM.i18n.table('id')), en = Object.keys(UM.i18n.table('en'));
  await check('kunci id dan en seimbang', () => {
    const a = id.filter(k => en.indexOf(k) < 0), b = en.filter(k => id.indexOf(k) < 0);
    return (!a.length && !b.length) ? true : 'id-only: ' + a.join(',') + ' | en-only: ' + b.join(',');
  });
  for (const L of ['id', 'en']) {
    await check('tidak ada nilai kosong (' + L + ')', () => {
      const tb = UM.i18n.table(L);
      const kosong = Object.keys(tb).filter(k => typeof tb[k] !== 'string' || !tb[k].length);
      return kosong.length ? 'kosong: ' + kosong.join(',') : true;
    });
  }
  const dipakai = new Set();
  files.forEach(f => {
    const src = fs.readFileSync(path.join(SRC, f), 'utf8');
    for (const m of src.matchAll(/(?:[^A-Za-z0-9_.]T|UM\.i18n\.t)\(\s*'([A-Za-z0-9_]+)'\s*\)/g)) dipakai.add(m[1]);
  });
  await check('semua kunci yang dipakai kode ada di tabel (' + dipakai.size + ' kunci)', () => {
    const hilang = [...dipakai].filter(k => id.indexOf(k) < 0);
    if (hilang.length) catatan.push('kunci hilang: ' + hilang.join(', '));
    return hilang.length ? 'TIDAK ADA DI TABEL: ' + hilang.join(', ') : true;
  });
  await check('kategori & mood punya terjemahan lengkap', () => {
    const kurang = [];
    UM.i18n.kategoriIds().forEach(k => ['id', 'en'].forEach(L => { UM.i18n.setLang(L); if (UM.i18n.kategori(k) === k) kurang.push('kat ' + L + ' ' + k); }));
    UM.i18n.moodIds().forEach(k => ['id', 'en'].forEach(L => { UM.i18n.setLang(L); if (UM.i18n.mood(k) === k) kurang.push('mood ' + L + ' ' + k); }));
    UM.i18n.setLang('id');
    return kurang.length ? kurang.join(', ') : true;
  });

  console.log('\n— data doa —');
  await check('7 tradisi', () => (UM.doaData.tradisi.length === 7 ? true : 'dapat ' + UM.doaData.tradisi.length));
  await check('setiap entri punya sumber & tanda kurasi', () => {
    const buruk = [];
    UM.doaData.tradisi.forEach(tr => tr.entri.forEach(e => {
      if (!e.sumber || e.sumber.length < 6) buruk.push(tr.id + '/' + e.id + ' tanpa sumber');
      if (typeof e.reviewed !== 'boolean') buruk.push(tr.id + '/' + e.id + ' tanpa reviewed');
      if (e.reviewed && !(e.teks && e.teks.id)) buruk.push(tr.id + '/' + e.id + ' reviewed tapi tanpa teks');
    }));
    return buruk.length ? buruk.join('; ') : true;
  });
  await check('ada placeholder jujur (teks tidak dikarang)', () => {
    const kosong = UM.doaData.tradisi.flatMap(tr => tr.entri).filter(e => !e.teks);
    return kosong.length >= 1 ? true : 'tidak ada placeholder';
  });

  console.log('\n— kripto (Web Crypto sungguhan) —');
  await check('crypto tersedia', () => (UM.crypto.available() ? true : 'tidak tersedia'));
  await check('publik: bolak-balik utuh', async () => {
    const teks = 'Pesan uji — tanda baca, 日本語, emoji 🌌, dan baris\nbaru.';
    const p = await UM.crypto.encryptPesan(teks, 'publik');
    ok(p.sh === 1, 'tidak memakai kunci bersama');
    ok(p.ct.indexOf('Pesan uji') < 0, 'teks bocor ke ciphertext');
    ok(await UM.crypto.decryptPesan(p) === teks, 'hasil dekripsi berbeda');
    return true;
  });
  await check('teks sama → ciphertext berbeda (IV acak)', async () => {
    const a = await UM.crypto.encryptPesan('sama', 'publik');
    const b = await UM.crypto.encryptPesan('sama', 'publik');
    ok(a.iv !== b.iv && a.ct !== b.ct, 'IV dipakai ulang — cacat keamanan');
    return true;
  });
  await check('privat tanpa kunci ditolak', async () => {
    UM.crypto.lock();
    await UM.crypto.encryptPesan('rahasia', 'privat').then(
      () => { throw new Error('seharusnya gagal'); },
      e => ok(e.message === 'locked', 'galat salah: ' + e.message));
    return true;
  });
  await check('payload privat terkunci dibaca sebagai null', async () => {
    ok(await UM.crypto.decryptPesan({ v: 1, zk: 1, iv: 'AAAAAAAAAAAAAAAA', ct: 'AAAA' }) === null, 'bukan null');
    return true;
  });

  let recovery = null;
  await check('setup: kode pemulihan & rekaman kunci berbentuk benar', async () => {
    const out = await UM.crypto.setup('kata-sandi-uji-123');
    recovery = out.recoveryCode;
    ok(/^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(recovery), 'format kode salah: ' + recovery);
    ok(out.record.wrapped.ct && out.record.wrappedRecovery.ct, 'bungkusan tidak lengkap');
    ok(!/kata-sandi/.test(JSON.stringify(out.record)), 'kata sandi bocor ke rekaman');
    ok(out.record.iter >= 100000, 'iterasi KDF terlalu rendah');
    await UM.store.setMeta('kunci', out.record);
    return true;
  });
  await check('sandi salah ditolak', async () => {
    UM.crypto.lock();
    await UM.crypto.unlock('sandi-salah-sekali').then(
      () => { throw new Error('seharusnya ditolak'); },
      e => ok(e.message === 'wrong-password', 'galat salah: ' + e.message));
    return true;
  });
  await check('sandi benar membuka', async () => {
    await UM.crypto.unlock('kata-sandi-uji-123');
    ok(UM.crypto.unlocked(), 'tidak terbuka');
    return true;
  });
  await check('privat: bolak-balik setelah dibuka', async () => {
    const p = await UM.crypto.encryptPesan('isi privat', 'privat');
    ok(p.zk === 1 && p.sh === undefined, 'penanda payload salah');
    ok(await UM.crypto.decryptPesan(p) === 'isi privat', 'isi tidak kembali');
    return true;
  });
  await check('kode pemulihan membuka kunci (toleran spasi & huruf kecil)', async () => {
    UM.crypto.lock();
    await UM.crypto.unlockWithRecovery(recovery.toLowerCase().replace(/-/g, ' '));
    ok(UM.crypto.unlocked(), 'kode pemulihan tidak membuka');
    return true;
  });
  await check('kode pemulihan salah ditolak', async () => {
    UM.crypto.lock();
    await UM.crypto.unlockWithRecovery('AAAAA-BBBBB-CCCCC-DDDDD').then(
      () => { throw new Error('seharusnya ditolak'); },
      e => ok(e.message === 'wrong-password', 'galat salah: ' + e.message));
    return true;
  });

  console.log('\n— basis data (stub IndexedDB) —');
  await check('seedIfEmpty mengisi contoh, dan tidak mengisi dua kali', async () => {
    ok(await UM.store.seedIfEmpty() === true, 'seed pertama tidak mengisi');
    ok(await UM.store.seedIfEmpty() === false, 'seed kedua mengisi ulang — data akan ganda');
    return true;
  });
  await check('data contoh lengkap, dan setiap galaksi punya dua lapisan', async () => {
    const galaksi = await UM.store.listGalaksi(), semua = await UM.store.listPesan();
    const punyaku = semua.filter(p => p.sendiri !== false);
    const masuk = semua.filter(p => p.sendiri === false);
    ok(galaksi.length === 6, 'galaksi: ' + galaksi.length);
    ok(punyaku.length === 16, 'pesan milikku: ' + punyaku.length);
    ok(masuk.length === 1410, 'pesan dari orang lain: ' + masuk.length);
    ok(punyaku.filter(p => p.privasi === 'publik').length === 6, 'pesan publik milikku tidak 6');
    ok(punyaku.filter(p => p.privasi === 'privat').length === 9, 'pesan privat milikku tidak 9');
    ok(punyaku.filter(p => p.privasi === 'unlisted').length === 1, 'pesan unlisted milikku tidak 1');
    ok(masuk.every(p => p.privasi === 'publik'), 'pesan dari orang lain harus publik agar bisa dibaca');
    const kinds = new Set(galaksi.map(g => g.kind));
    ok(kinds.size === 3, 'bentuk galaksi tidak beragam: ' + [...kinds].join(','));
    ok(galaksi.every(g => g.radius > 0 && g.count > 0 && /^#[0-9a-f]{6}$/i.test(g.warna)), 'ada galaksi tanpa rupa yang sah');
    ok(semua.every(p => pts(p.dibuat) <= Date.now()), 'ada waktu dibuat di masa depan');
    return true;
  });
  await check('setiap galaksi punya bintang dan sabuk yang tidak kosong', async () => {
    const galaksi = await UM.store.listGalaksi();
    for (const g of galaksi) {
      const pesan = await UM.store.listPesan(g.id);
      ok(pesan.filter(p => p.sendiri !== false).length >= 1, g.nama + ' tidak punya pesan milik sendiri');
      ok(pesan.filter(p => p.sendiri === false).length >= 1, g.nama + ' tidak punya pesan dari orang lain');
    }
    return true;
  });
  await check('SETIAP pesan dari orang lain punya doa — tidak ada butir buntu', async () => {
    const semua = await UM.store.listPesan(), doa = await UM.store.listDoa();
    // penanda eksplisit: yang digambar sebagai butir sabuk adalah pesan ber-`sabuk: true`
    const masuk = semua.filter(p => p.sabuk === true);
    const pesanBerdoa = new Set(doa.filter(d => d.pesanId).map(d => d.pesanId));
    const buntu = masuk.filter(p => !pesanBerdoa.has(p.id));
    ok(!buntu.length, buntu.length + ' butir sabuk tanpa doa: ' + buntu.slice(0, 3).map(p => p.id).join(', '));
    // dan sebaliknya: setiap pesan dari orang lain bisa dibaca tanpa kunci
    for (const p of masuk.slice(0, 5)) {
      const isi = await UM.store.bacaIsi(p);
      ok(typeof isi === 'string' && isi.length > 10, p.id + ' tidak bisa dibaca: ' + isi);
    }
    return true;
  });
  await check('sabuk tiap galaksi berisi banyak butir, bukan belasan', async () => {
    const galaksi = await UM.store.listGalaksi();
    for (const g of galaksi) {
      const masuk = (await UM.store.listPesan(g.id)).filter(p => p.sabuk === true);
      ok(masuk.length >= 120, g.nama + ' hanya punya ' + masuk.length + ' butir sabuk — terlalu sedikit untuk terbaca sebagai "banyak orang berdoa"');
      ok(masuk.length <= UM.galaksi.MAKS_BATU, g.nama + ' melebihi batas gambar ' + UM.galaksi.MAKS_BATU);
    }
    const total = (await UM.store.listPesan()).filter(p => p.sabuk === true).length;
    ok(total >= 1000, 'total butir sabuk hanya ' + total);
    return true;
  });
  await check('label mockup a sampai z ada dan berurutan', async () => {
    const semua = await UM.store.listPesan();
    const masuk = semua.filter(p => p.sendiri === false && p.galaksiId === 'g_ibu');
    ok(masuk.length === 260, 'butir sabuk g_ibu: ' + masuk.length);
    // listPesan mengurutkan menurut waktu (terlama dulu), jadi urutannya terbalik
    // dari urutan label — yang diperiksa himpunannya, bukan urutannya
    const label = masuk.map(p => p.id.slice('p_mock_g_ibu_'.length));
    ok(new Set(label).size === label.length, 'ada label kembar');
    ['a', 'z', 'aa', 'ah'].forEach(l => {
      ok(label.indexOf(l) >= 0, 'label ' + l + ' tidak ada (34 butir = a..z lalu aa..ah)');
    });
    ok(label.filter(l => l.length === 1).length === 26, 'label satu huruf tidak 26');
    // dan teksnya benar-benar memuat labelnya, supaya jelas ini data mockup
    const isi = await UM.store.bacaIsi(masuk[0]);
    ok(isi.indexOf('Pesan contoh (') === 0, 'teks mockup tidak memakai penanda label: ' + isi.slice(0, 40));
    return true;
  });
  await check('angka doa koheren di tiga tempat', async () => {
    const pesan = await UM.store.listPesan(), doa = await UM.store.listDoa();
    const totalPesan = pesan.reduce((s, p) => s + ((p.pendoa && p.pendoa.total) || 0), 0);
    const tertaut = doa.filter(d => d.pesanId).length;
    ok(totalPesan === tertaut, 'penghitung di pesan (' + totalPesan + ') != doa tertaut (' + tertaut + ')');
    ok(doa.every(d => d.pesanId), 'ada doa tanpa pesan — ia tidak akan punya butir di sabuk');
    const perGalaksi = await UM.store.doaPerGalaksi();
    const jumlah = Object.values(perGalaksi).reduce((a, b) => a + b, 0);
    ok(jumlah === doa.length, 'rincian per galaksi (' + jumlah + ') != total doa (' + doa.length + ')');
    return true;
  });
  await check('listPesan(galaksiId) tersaring benar', async () => {
    const ibu = await UM.store.listPesan('g_ibu');
    ok(ibu.length === 264, 'pesan Ibu: ' + ibu.length);
    ok(ibu.every(p => p.galaksiId === 'g_ibu'), 'ada pesan galaksi lain ikut terbawa');
    ok(ibu.filter(p => p.sendiri !== false).length === 4, 'pesan milikku di g_ibu tidak 4');
    return true;
  });
  await check('urutan pesan menaik menurut waktu dibuat', async () => {
    const p = await UM.store.listPesan();
    for (let i = 1; i < p.length; i++) ok(p[i - 1].dibuat <= p[i].dibuat, 'urutan tidak menaik di indeks ' + i);
    return true;
  });
  await check('data contoh bisa dibaca sebelum kunci dibuat', async () => {
    const isi = await UM.store.bacaIsi(await UM.store.getPesan('p_1'));
    ok(typeof isi === 'string' && isi.length > 20, 'isi contoh tidak terbaca');
    return true;
  });
  await check('simpanPesan privat ditolak saat terkunci', async () => {
    await UM.store.simpanPesan({ galaksiId: 'g_ibu', teks: 'x', privasi: 'privat' }).then(
      () => { throw new Error('seharusnya ditolak'); },
      e => ok(e.message === 'locked', 'galat salah: ' + e.message));
    return true;
  });
  await check('reEnkripsiPrivat menyandikan pesan privat contoh', async () => {
    await UM.crypto.unlock('kata-sandi-uji-123');
    const n = await UM.store.reEnkripsiPrivat();
    ok(n === 9, 'yang dienkripsi: ' + n);
    const p = await UM.store.getPesan('p_1');
    ok(p.isi.zk === 1 && p.isi.plain === undefined, 'isi masih teks biasa');
    return true;
  });
  await check('terbaca saat terbuka, tidak terbaca saat terkunci', async () => {
    const isi = await UM.store.bacaIsi(await UM.store.getPesan('p_1'));
    ok(typeof isi === 'string' && isi.indexOf('terima kasih') >= 0, 'isi privat tidak kembali utuh');
    UM.crypto.lock();
    ok(await UM.store.bacaIsi(await UM.store.getPesan('p_1')) === null, 'pesan privat masih terbaca saat terkunci');
    ok(typeof await UM.store.bacaIsi(await UM.store.getPesan('p_4')) === 'string', 'pesan publik ikut terkunci');
    return true;
  });
  await check('simpan pesan publik baru tetap terbaca saat terkunci', async () => {
    const rec = await UM.store.simpanPesan({ galaksiId: 'g_aku', teks: 'pesan publik baru', privasi: 'publik' });
    ok(rec.isi.sh === 1, 'tidak memakai kunci bersama');
    ok(await UM.store.bacaIsi(rec) === 'pesan publik baru', 'tidak terbaca');
    await UM.store._del('pesan', rec.id);
    return true;
  });
  await check('addDoa menaikkan penghitung pesan dan riwayat doa', async () => {
    const galaksiId = 'g_kakek', pesanId = 'p_10';
    const sebelum = await UM.store.getPesan(pesanId);
    const doaSebelum = (await UM.store.listDoa()).length;
    await UM.store.addDoa(galaksiId, pesanId, 'umum', 'hening');
    await UM.store.addDoa(galaksiId, pesanId, 'umum', 'hening');
    await UM.store.addDoa(galaksiId, pesanId, 'islam', 'rabbana-atina');
    const sesudah = await UM.store.getPesan(pesanId);
    ok(sesudah.pendoa.total === sebelum.pendoa.total + 3, 'total tidak naik 3');
    ok(sesudah.pendoa.tradisi.umum === sebelum.pendoa.tradisi.umum + 2, 'rincian umum salah');
    ok(sesudah.pendoa.tradisi.islam === sebelum.pendoa.tradisi.islam + 1, 'rincian islam salah');
    ok((await UM.store.listDoa()).length === doaSebelum + 3, 'riwayat doa tidak bertambah 3');
    return true;
  });
  await check('doa tanpa pesan tertentu tetap tercatat, tanpa membuat butir sabuk', async () => {
    const pesanSebelum = (await UM.store.listPesan()).length;
    await UM.store.addDoa('g_rani', null, 'umum', 'hening');
    ok((await UM.store.listPesan()).length === pesanSebelum, 'doa tanpa pesan malah membuat pesan baru');
    const s = await UM.store.stats();
    ok(s.doaDiberikan > 0, 'doa yang kauberikan tidak tercatat');
    return true;
  });
  await check('statistik konsisten', async () => {
    const s = await UM.store.stats();
    ok(s.privat + s.publik + s.unlisted === s.pesan, 'privat + publik + unlisted != total pesan milikku');
    ok(s.galaksi === 6, 'hitungan galaksi salah: ' + s.galaksi);
    ok(s.pesanMasuk === 1410, 'pesan masuk: ' + s.pesanMasuk);
    ok(s.doaDiterima > 0, 'doa diterima kosong');
    ok(s.doaDiberikan >= 4, 'doa diberikan: ' + s.doaDiberikan);
    return true;
  });
  await check('identitas anonim dibuat sekali (pengganti login)', async () => {
    const a = await UM.store.identitas();
    ok(a && a.id && a.nama === 'Anonim', 'identitas tidak terbentuk');
    const b = await UM.store.identitas();
    ok(a.id === b.id, 'identitas berubah antar panggilan');
    return true;
  });
  await check('reset membersihkan semuanya dan mengunci', async () => {
    await UM.store.reset();
    ok((await UM.store.listGalaksi()).length === 0, 'galaksi belum bersih');
    ok((await UM.store.listPesan()).length === 0, 'pesan belum bersih');
    ok((await UM.store.listDoa()).length === 0, 'doa belum bersih');
    ok(!UM.crypto.unlocked(), 'kunci belum ditutup');
    ok(await UM.store.getMeta('kunci') === null, 'rekaman kunci belum terhapus');
    return true;
  });
  await check('setelah reset, seed bisa diisi ulang', async () => {
    ok(await UM.store.seedIfEmpty() === true, 'seed ulang gagal');
    ok((await UM.store.listGalaksi()).length === 6, 'jumlah galaksi setelah seed ulang salah');
    ok((await UM.store.listPesan()).length === 1426, 'jumlah pesan setelah seed ulang salah');
    return true;
  });

  await check('galaksi baru langsung dapat doa contoh — sabuknya tidak kosong', async () => {
    const g = await UM.store.saveGalaksiBaru({ nama: 'Uji Baru', kind: 'spiral', radius: 130, warna: '#9cc0ff' }, 40);
    const masuk = (await UM.store.listPesan(g.id)).filter(p => p.sabuk === true);
    ok(masuk.length === 40, 'galaksi baru dapat ' + masuk.length + ' butir sabuk, harusnya 40');
    const berdoa = {};
    (await UM.store.listDoa()).forEach(d => { if (d.pesanId) berdoa[d.pesanId] = true; });
    ok(masuk.every(p => berdoa[p.id]), 'ada butir sabuk galaksi baru yang tanpa doa');
    ok(typeof await UM.store.bacaIsi(masuk[0]) === 'string', 'butir sabuk galaksi baru tidak bisa dibaca');
    return true;
  });

  console.log('\n— Peta (fungsi murni) —');
  await check('arah penanda satuan, stabil, dan berbeda antar id', () => {
    const a1 = UM.sky._arahDariId('g_ibu'), a2 = UM.sky._arahDariId('g_ibu');
    ok(Math.abs(a1.length() - 1) < 1e-6, 'bukan vektor satuan: ' + a1.length());
    ok(a1.x === a2.x && a1.y === a2.y && a1.z === a2.z, 'tidak stabil');
    ok(a1.distanceTo(UM.sky._arahDariId('g_rani')) > 0.05, 'dua penanda hampir berimpit');
    return true;
  });

  console.log('\n— ladang galaksi (fungsi murni) —');
  await check('posisi galaksi berada di rentang bidang dan stabil', () => {
    const ids = ['g_ibu', 'g_rani', 'g_kakek', 'g_aku', 'g_bayu', 'g_ratih'];
    const pos = ids.map(UM.galaksi._posDariId);
    ids.forEach((id, i) => {
      const r = Math.hypot(pos[i].x, pos[i].y, pos[i].z);
      ok(r >= 690 && r <= 1400, id + ' di luar rentang bidang: ' + r.toFixed(0));
      ok(Math.abs(pos[i].y) <= 1300 * 0.46, id + ' terlalu jauh dari pita bidang');
      const ulang = UM.galaksi._posDariId(id);
      ok(ulang.x === pos[i].x && ulang.y === pos[i].y, id + ' tidak stabil antar pemanggilan');
    });
    for (let i = 0; i < pos.length; i++)
      for (let j = i + 1; j < pos.length; j++)
        ok(pos[i].distanceTo(pos[j]) > 200, ids[i] + ' dan ' + ids[j] + ' terlalu berdekatan');
    return true;
  });
  await check('semua galaksi contoh berada di luar piringan Milky Way', () => {
    const ids = ['g_ibu', 'g_rani', 'g_kakek', 'g_aku', 'g_bayu', 'g_ratih'];
    ids.forEach(id => {
      const p = UM.galaksi._posDariId(id);
      ok(Math.hypot(p.x, p.z) > 360, id + ' berada di dalam piringan Milky Way (radius 360)');
    });
    return true;
  });
  await check('kurva jalur: mulai di asal, berakhir di tujuan', () => {
    const p0 = new V3(300, 0, 0), p1 = new V3(600, 200, 0), p2 = new V3(900, 0, 400);
    const a = new V3();
    UM.galaksi._kuadrik(p0, p1, p2, 0, a);
    ok(a.distanceTo(p0) < 1e-6, 'tidak mulai di asal');
    UM.galaksi._kuadrik(p0, p1, p2, 1, a);
    ok(a.distanceTo(p2) < 1e-6, 'tidak berakhir di tujuan');
    UM.galaksi._kuadrik(p0, p1, p2, 0.5, a);
    const lurus = new V3((p0.x + p2.x) / 2, (p0.y + p2.y) / 2, (p0.z + p2.z) / 2);
    ok(a.distanceTo(lurus) > 1, 'jalur tidak melengkung — titik kontrol diabaikan');
    return true;
  });
  await check('warna bintang membedakan privasi', () => {
    const pr = UM.galaksi._warnaBintang('privat', '#9cc0ff');
    const pu = UM.galaksi._warnaBintang('publik', '#9cc0ff');
    const un = UM.galaksi._warnaBintang('unlisted', '#9cc0ff');
    ok(Math.abs(pr.r - pu.r) > 0.05, 'privat vs publik terlalu mirip');
    ok(Math.abs(pu.b - un.b) > 0.05, 'publik vs unlisted terlalu mirip');
    ok(pu.r > pr.r, 'publik seharusnya lebih hangat');
    return true;
  });
  await check('perPiksel: satu piksel layar sebanding dengan jarak', () => {
    const dekat = UM.galaksi._perPiksel(100, 800, 55), jauh = UM.galaksi._perPiksel(200, 800, 55);
    ok(Math.abs(jauh - 2 * dekat) < 1e-9, 'tidak sebanding lurus dengan jarak kamera');
    // tinggi kanvas 800 px pada fov 55° berarti seluas 2·d·tan(27.5°) satuan dunia
    const tinggiDunia = 2 * 100 * Math.tan(55 * Math.PI / 360);
    ok(Math.abs(dekat * 800 - tinggiDunia) < 1e-6, 'tinggi kanvas dalam satuan dunia salah: ' + (dekat * 800).toFixed(3));
    ok(UM.galaksi._perPiksel(100, 1600, 55) < dekat, 'kanvas lebih tinggi harus berarti satuan dunia per piksel lebih kecil');
    ok(UM.galaksi._perPiksel(100, 800, 110) > dekat, 'sudut pandang lebih lebar harus berarti satuan dunia per piksel lebih besar');
    // tanpa argumen: memakai kanvas & kamera sungguhan; di Node tidak ada keduanya,
    // jadi harus jatuh ke nilai cadangan dan tetap menghasilkan angka yang masuk akal
    const cadangan = UM.galaksi._perPiksel(100);
    ok(isFinite(cadangan) && cadangan > 0, 'nilai cadangan tidak masuk akal: ' + cadangan);
    return true;
  });
  await check('pemilihan titik: jarak ke kursor menang atas kedekatan kamera', () => {
    const jauhDariKursor = { dpx: 30, jarak: 10 };  // persis di depan kamera, tapi jauh dari kursor
    const diKursor = { dpx: 1, jarak: 900 };        // jauh dari kamera, tapi TEPAT di bawah kursor
    ok(UM.galaksi._lebihBaik(diKursor, jauhDariKursor), 'titik yang lebih dekat kursor tidak dipilih');
    ok(!UM.galaksi._lebihBaik(jauhDariKursor, diKursor), 'titik yang jauh dari kursor malah dipilih');
    ok(UM.galaksi._lebihBaik(diKursor, null), 'kandidat pertama justru ditolak');
    // hampir sama dekat di layar → yang menang adalah yang tampak di depan
    const belakang = { dpx: 5, jarak: 900 }, depan = { dpx: 5.4, jarak: 20 };
    ok(UM.galaksi._lebihBaik(depan, belakang), 'seri di layar seharusnya dimenangkan oleh yang lebih dekat ke kamera');
    ok(!UM.galaksi._lebihBaik(belakang, depan), 'seri di layar memilih yang di belakang');
    return true;
  });
  await check('jari-jari tangkap klik tetap sama besar di layar', () => {
    const J = UM.galaksi.JARI_KURSOR_PX;
    ok(J >= 4 && J <= 24, 'jari-jari tangkap tidak masuk akal untuk sebuah titik: ' + J);
    const dunia100 = UM.galaksi._perPiksel(100) * J, dunia400 = UM.galaksi._perPiksel(400) * J;
    ok(Math.abs(dunia400 - 4 * dunia100) < 1e-9, 'jari-jari tangkap dalam satuan dunia tidak mengikuti jarak — sudut tangkapnya akan berubah saat kamera mendekat');
    return true;
  });
  await check('jarak tiba dekat, tapi tidak sampai titik jadi gumpalan', () => {
    const R140 = UM.galaksi.jarakTiba({ g: { radius: 140 } });
    ok(R140 < 140 * 3, 'jarak tiba tidak lebih dekat daripada saat galaksi dibingkai (3 × radius)');
    ok(R140 > 12, 'jarak tiba terlalu dekat');
    ok(UM.galaksi.jarakTiba({ g: { radius: 600 } }) > R140 * 3, 'jarak tiba tidak mengikuti ukuran galaksi');
    /* Titik pesan punya aScale 3.4 dan pointSize bawaan engine 2,1; pada jarak
       tiba ukurannya di layar harus tetap di bawah uCap (34 px) — kalau tidak,
       ia jadi gumpalan yang menutupi bintang tetangganya dan "titik yang
       dipilih" tidak lagi terbaca. */
    const pxTitikPesan = 1.68 * 3.4 * 300 / R140;
    ok(pxTitikPesan < 34, 'titik pesan menyentuh batas 34 px — jadi gumpalan: ' + pxTitikPesan.toFixed(1) + ' px');
    ok(pxTitikPesan > 6, 'titik pesan terlalu kecil untuk dilihat: ' + pxTitikPesan.toFixed(1) + ' px');
    return true;
  });
  await check('generator galaksi engine dipakai, bukan disalin', () => {
    // modul produk harus memanggil hook engine, bukan membawa generator sendiri
    const src = fs.readFileSync(path.join(SRC, 'um-galaksi.js'), 'utf8');
    ok(src.indexOf('GX.buildGalaxyStars') >= 0, 'tidak memanggil GX.buildGalaxyStars');
    ok(src.indexOf('makeAsteroidGeometries') >= 0, 'benda yang dikirim tidak memakai geometri engine');
    ok(src.indexOf('flyTo') >= 0, 'tidak memakai flyTo engine');
    return true;
  });
  await check('doa digambar sebagai partikel kecil, bukan bongkahan batu', () => {
    const src = fs.readFileSync(path.join(SRC, 'um-galaksi.js'), 'utf8');
    ok(src.indexOf('item.batuPoints') >= 0, 'tidak ada layer partikel doa');
    ok(src.indexOf('new T.InstancedMesh') < 0, 'masih membuat InstancedMesh batu yang besar');
    ok(src.indexOf('DEBU_FRAG') >= 0, 'tidak ada shader debu yang terpisah dari bintang');
    return true;
  });
  await check('galaksi bawaan engine bisa dimatikan dan dinyalakan lagi', () => {
    const src = fs.readFileSync(path.join(SRC, 'um-galaksi.js'), 'utf8');
    ok(src.indexOf('function setGalaksiBawaan') >= 0, 'tidak ada pengalih galaksi bawaan');
    ok(src.indexOf('GX.deepSky') >= 0, 'langit galaksi jauh bawaan tidak ditangani');
    ok(src.indexOf("if (!lod.cat) return") >= 0, 'galaksi orang bisa ikut tersembunyi — penyaring .cat hilang');
    const eng = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
    ok(eng.indexOf('GX.deepSky') >= 0, 'hook GX.deepSky tidak ada di index.html');
    ok(eng.indexOf('GX.deepCluster') >= 0, 'hook GX.deepCluster tidak ada di index.html');
    return true;
  });

  if (catatan.length) { console.log('\ncatatan:'); catatan.forEach(c => console.log('  · ' + c)); }
  selesai = true;
  console.log('\n' + (gagal ? '✗ ' + gagal + ' GAGAL' : '✓ semua lulus') + '  (' + lulus + ' lulus, ' + gagal + ' gagal)\n');
  process.exit(gagal ? 1 : 0);
})();
