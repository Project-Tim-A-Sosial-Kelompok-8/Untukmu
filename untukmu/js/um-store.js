/* Untukmu — penyimpanan lokal (IndexedDB) untuk purwarupa tanpa backend.
 *
 * Menggantikan PostgreSQL pada PRD hanya untuk tahap antarmuka. Semua akses
 * lewat API berpromise, jadi penggantian ke REST API nanti cukup dilakukan di
 * berkas ini saja — UI tidak perlu tahu asal datanya.
 *
 * Skema (v2):
 *   galaksi { id, nama, kategori, kind:'spiral'|'ellipsoid'|'irregular',
 *             warna, radius, count, foto, rumah, dibuat, seed }
 *   pesan   { id, galaksiId, privasi, isi:{...}, tanggal, mood, tag[],
 *             dibuat, pendoa:{total,tradisi:{}}, dilaporkan, seed }
 *   doa     { id, galaksiId, pesanId, tradisi, doaId, dibuat }
 *   meta    { k, v }              // rekaman kunci enkripsi, identitas, pengaturan
 *
 * "galaksi" menggantikan "rasi" pada versi sebelumnya: satu orang = satu
 * galaksi, pesan = bintang di piringannya, doa = batu yang mengorbitnya.
 */
window.UM = window.UM || {};

UM.store = (function () {
  var DB_NAME = 'untukmu', DB_VERSION = 2;
  var STORES = ['galaksi', 'pesan', 'doa', 'meta'];
  var KEYPATH = { galaksi: 'id', pesan: 'id', doa: 'id', meta: 'k' };
  var dbp = null;

  function openDb() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') { reject(new Error('no-indexeddb')); return; }
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        var db = request.result;
        STORES.forEach(function (name) {
          if (!db.objectStoreNames.contains(name)) {
            var store = db.createObjectStore(name, { keyPath: KEYPATH[name] });
            if (name === 'pesan') { store.createIndex('galaksiId', 'galaksiId', { unique: false }); store.createIndex('privasi', 'privasi', { unique: false }); }
            if (name === 'doa') { store.createIndex('galaksiId', 'galaksiId', { unique: false }); store.createIndex('pesanId', 'pesanId', { unique: false }); }
          }
        });
        if (db.objectStoreNames.contains('rasi')) db.deleteObjectStore('rasi'); // skema v1, sudah tidak dipakai
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
    return dbp;
  }

  function req(r) {
    return new Promise(function (resolve, reject) {
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }

  function withStore(names, mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(names, mode), out = [];
        tx.oncomplete = function () { resolve(out.length === 1 ? out[0] : out); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
        fn(tx, function (result) { out.push(result); });
      });
    });
  }

  function put(name, obj) {
    return withStore([name], 'readwrite', function (tx, push) {
      push(req(tx.objectStore(name).put(obj)));
    }).then(function () { return obj; });
  }

  /* Menulis banyak record dalam SATU transaksi. Data mockup berisi ribuan
     catatan; satu transaksi per record membuat pemuatan pertama terasa lambat. */
  function putBanyak(name, arr) {
    if (!arr || !arr.length) return Promise.resolve(0);
    return withStore([name], 'readwrite', function (tx, push) {
      var store = tx.objectStore(name), terakhir = null;
      for (var i = 0; i < arr.length; i++) terakhir = req(store.put(arr[i]));
      push(terakhir);
    }).then(function () { return arr.length; });
  }
  function get(name, key) {
    return withStore([name], 'readonly', function (tx, push) { push(req(tx.objectStore(name).get(key))); });
  }
  function all(name) {
    return withStore([name], 'readonly', function (tx, push) { push(req(tx.objectStore(name).getAll())); });
  }
  function del(name, key) {
    return withStore([name], 'readwrite', function (tx, push) { push(req(tx.objectStore(name).delete(key))); });
  }
  function clear(name) {
    return withStore([name], 'readwrite', function (tx, push) { push(req(tx.objectStore(name).clear())); });
  }
  function byIndex(name, indexName, value) {
    return withStore([name], 'readonly', function (tx, push) {
      push(req(tx.objectStore(name).index(indexName).getAll(value)));
    });
  }

  /* ── id ──────────────────────────────────────────────────────────────────── */

  var seq = 0;
  function newId(prefix) {
    seq++;
    return prefix + Date.now().toString(36) + '-' + seq.toString(36) + '-' + Math.floor(Math.random() * 46656).toString(36);
  }

  /* ── meta ────────────────────────────────────────────────────────────────── */

  function getMeta(k) {
    return get('meta', k).then(function (row) { return row ? row.v : null; });
  }
  function setMeta(k, v) { return put('meta', { k: k, v: v }); }

  /* ── identitas (pengganti "login" pada purwarupa) ────────────────────────── */

  /* Tidak ada autentikasi: begitu aplikasi dibuka, pengguna dianggap sudah
     masuk sebagai anonim. Identitas disimpan lokal supaya konsisten. */
  function identitas() {
    return getMeta('aku').then(function (me) {
      if (me) return me;
      var baru = { id: newId('aku_'), nama: 'Anonim', dibuat: Date.now() };
      return setMeta('aku', baru).then(function () { return baru; });
    });
  }

  /* ── galaksi ─────────────────────────────────────────────────────────────── */

  function listGalaksi() {
    return all('galaksi').then(function (rows) {
      rows.sort(function (a, b) { return (b.dibuat || 0) - (a.dibuat || 0); });
      return rows;
    });
  }
  function getGalaksi(id) { return get('galaksi', id); }
  function saveGalaksi(g) {
    if (!g.id) g.id = newId('g_');
    if (!g.dibuat) g.dibuat = Date.now();
    if (!g.kind) g.kind = 'spiral';
    if (!g.radius) g.radius = 140;
    if (!g.count) g.count = 8000;
    if (!g.warna) g.warna = '#ffd9a0';
    return put('galaksi', g);
  }

  /* Galaksi yang baru dibuat langsung diberi doa contoh, supaya sabuknya tidak
     kosong saat pertama dibuka. Tanpa ini, galaksi buatan pengguna tampil sebagai
     piringan telanjang tanpa apa pun yang mengelilinginya. */
  function saveGalaksiBaru(g, jumlahDoa) {
    return saveGalaksi(g).then(function (tersimpan) {
      var s = starterUntukGalaksi(tersimpan.id, jumlahDoa || DOA_AWAL_GALAKSI_BARU, Date.now());
      return putBanyak('pesan', s.pesan)
        .then(function () { return putBanyak('doa', s.doa); })
        .then(function () { return tersimpan; });
    });
  }

  /* ── pesan ───────────────────────────────────────────────────────────────── */

  function listPesan(galaksiId) {
    var p = galaksiId ? byIndex('pesan', 'galaksiId', galaksiId) : all('pesan');
    return p.then(function (rows) {
      rows.sort(function (a, b) { return (a.dibuat || 0) - (b.dibuat || 0); });
      return rows;
    });
  }
  function getPesan(id) { return get('pesan', id); }

  /* Menyimpan pesan: teks dienkripsi sesuai tingkat privasi sebelum masuk basis data. */
  function simpanPesan(input) {
    var privasi = input.privasi || 'privat';
    return UM.crypto.encryptPesan(input.teks, privasi).then(function (isi) {
      return put('pesan', {
        id: input.id || newId('p_'),
        galaksiId: input.galaksiId,
        privasi: privasi,
        isi: isi,
        tanggal: input.tanggal || null,
        mood: input.mood || null,
        tag: input.tag || [],
        dibuat: input.dibuat || Date.now(),
        pendoa: input.pendoa || { total: 0, tradisi: {} },
        dilaporkan: input.dilaporkan || 0,
        seed: !!input.seed,
        // pesan yang ditulis pengguna selalu miliknya sendiri; lapisan sabuk
        // hanya untuk pesan dari orang lain (lihat sendiri: false pada data contoh)
        sendiri: input.sendiri !== false
      });
    });
  }

  /* Membaca isi pesan. null = tidak bisa dibuka (privat & kunci belum dibuka). */
  function bacaIsi(pesan) {
    if (!pesan) return Promise.resolve(null);
    return UM.crypto.decryptPesan(pesan.isi);
  }

  /* Setelah pengguna membuat kunci, pesan privat bawaan ikut dienkripsi sungguhan
     sehingga perilaku "terkunci" bisa didemokan, bukan sekadar dijelaskan. */
  function reEnkripsiPrivat() {
    if (!UM.crypto.available() || !UM.crypto.unlocked()) return Promise.resolve(0);
    return all('pesan').then(function (rows) {
      var targets = rows.filter(function (p) { return p.privasi === 'privat' && p.isi && p.isi.plain != null; });
      return targets.reduce(function (chain, p) {
        return chain.then(function (n) {
          return UM.crypto.encryptPesan(p.isi.plain, 'privat').then(function (isi) {
            p.isi = isi; p.seed = false;
            return put('pesan', p).then(function () { return n + 1; });
          });
        });
      }, Promise.resolve(0));
    });
  }

  /* ── doa ─────────────────────────────────────────────────────────────────── */

  function listDoa(galaksiId) {
    var p = galaksiId ? byIndex('doa', 'galaksiId', galaksiId) : all('doa');
    return p.then(function (rows) {
      rows.sort(function (a, b) { return (b.dibuat || 0) - (a.dibuat || 0); });
      return rows;
    });
  }

  /* Mencatat doa: riwayat + penghitung pada pesan yang didoakan. */
  function addDoa(galaksiId, pesanId, tradisi, doaId) {
    var entry = { id: newId('d_'), galaksiId: galaksiId, pesanId: pesanId || null, tradisi: tradisi, doaId: doaId, dibuat: Date.now() };
    return put('doa', entry).then(function () {
      if (!pesanId) return entry;
      return getPesan(pesanId).then(function (pesan) {
        if (!pesan) return entry;
        pesan.pendoa = pesan.pendoa || { total: 0, tradisi: {} };
        pesan.pendoa.total = (pesan.pendoa.total || 0) + 1;
        pesan.pendoa.tradisi = pesan.pendoa.tradisi || {};
        pesan.pendoa.tradisi[tradisi] = (pesan.pendoa.tradisi[tradisi] || 0) + 1;
        return put('pesan', pesan).then(function () { return entry; });
      });
    });
  }

  /* Jumlah doa per galaksi — menentukan berapa batu yang mengorbit di sana. */
  function doaPerGalaksi() {
    return all('doa').then(function (rows) {
      var map = {};
      rows.forEach(function (d) { map[d.galaksiId] = (map[d.galaksiId] || 0) + 1; });
      return map;
    });
  }

  /* ── statistik dashboard (PRD §9.6) ──────────────────────────────────────── */

  function stats() {
    return Promise.all([all('galaksi'), all('pesan'), all('doa')]).then(function (r) {
      var galaksi = r[0], pesan = r[1], doa = r[2];
      /* Pelapisan sama dengan yang dipakai um-galaksi.js menentukan apa yang
         digambar: piringan = pesan ber-`sendiri`/`piringan`, sabuk = `sabuk`.
         Kalau penyaringnya berbeda, angka di dashboard tidak akan sama dengan
         yang terlihat di galaksinya. */
      var punyaku = pesan.filter(function (p) { return p.sendiri !== false; });
      var masuk = pesan.filter(function (p) { return p.sabuk === true; });
      /* Doa yang DITERIMA adalah doa pada pesanku sendiri. Sebelumnya angka ini
         menjumlahkan pendoa dari semua pesan — termasuk sabuk yang tiap butirnya
         bernilai 1 doa — jadi angkanya membengkak jadi ribuan. */
      var diterima = 0;
      punyaku.forEach(function (p) { diterima += (p.pendoa && p.pendoa.total) || 0; });
      var publik = punyaku.filter(function (p) { return p.privasi === 'publik'; }).length;
      var privat = punyaku.filter(function (p) { return p.privasi === 'privat'; }).length;
      var unlisted = punyaku.filter(function (p) { return p.privasi === 'unlisted'; }).length;
      return {
        galaksi: galaksi.length,
        pesan: punyaku.length,        // yang kamu tulis sendiri
        pesanMasuk: masuk.length,     // dari orang lain → satu butir debu masing-masing
        doaDiterima: diterima, doaDiberikan: doa.length,
        privat: privat, publik: publik, unlisted: unlisted
      };
    });
  }

  /* ── reset ───────────────────────────────────────────────────────────────── */

  function reset() {
    return Promise.all(STORES.map(clear)).then(function () {
      UM.crypto.lock();
      return true;
    });
  }

  /* ── data contoh ─────────────────────────────────────────────────────────── */

  function seedIfEmpty() {
    return all('galaksi').then(function (rows) {
      if (rows.length) return false;
      return isiSeed().then(function () { return true; });
    });
  }

  function isiSeed() {
    var now = Date.now(), hari = 86400000;

    /* Enam galaksi: tiga bentuk berbeda supaya tiap orang punya "rupa" yang bisa
       dikenali, dan tiap galaksi langsung punya bintang (pesan) serta batu (doa). */
    var galaksi = [
      { id: 'g_ibu', nama: 'Ibu', kategori: 'orang-tua', kind: 'spiral', warna: '#ffd9a0', radius: 150, count: 9000, foto: null, dibuat: now - 60 * hari, seed: true },
      { id: 'g_rani', nama: 'Rani', kategori: 'sahabat', kind: 'spiral', warna: '#9cc0ff', radius: 130, count: 8000, foto: null, dibuat: now - 44 * hari, seed: true },
      { id: 'g_kakek', nama: 'Kakek', kategori: 'almarhum', kind: 'ellipsoid', warna: '#f0a5b8', radius: 170, count: 10000, foto: null, dibuat: now - 30 * hari, seed: true },
      { id: 'g_aku', nama: 'Diriku, lima tahun lagi', kategori: 'diri-sendiri', kind: 'irregular', warna: '#8fd8c8', radius: 120, count: 7000, foto: null, dibuat: now - 21 * hari, seed: true },
      { id: 'g_bayu', nama: 'Mas Bayu', kategori: 'saudara', kind: 'spiral', warna: '#c4b5fd', radius: 140, count: 8000, foto: null, dibuat: now - 12 * hari, seed: true },
      { id: 'g_ratih', nama: 'Bu Ratih', kategori: 'lain-lain', kind: 'ellipsoid', warna: '#fca5a5', radius: 160, count: 9000, foto: null, dibuat: now - 4 * hari, seed: true }
    ];

    /* pesan → bintang di piringan galaksi */
    var pesan = [
      { id: 'p_1', galaksiId: 'g_ibu', privasi: 'privat', teks: 'Bu, aku belum pernah bilang terima kasih untuk semua pagi yang kau siapkan sebelum aku bangun. Aku baru sadar itu bukan hal kecil.', tanggal: '2026-07-02', mood: 'syukur', tag: ['terima kasih'], dibuat: now - 55 * hari },
      { id: 'p_2', galaksiId: 'g_ibu', privasi: 'privat', teks: 'Maaf kalau aku jarang menelepon. Bukan karena tidak ingin, tapi karena selalu merasa belum ada kabar baik yang layak diceritakan.', tanggal: '2026-07-19', mood: 'sesal', tag: ['maaf'], dibuat: now - 41 * hari },
      { id: 'p_3', galaksiId: 'g_ibu', privasi: 'privat', teks: 'Resep sambalmu tidak pernah bisa aku tiru. Aku sudah menyerah dan itu ternyata menghibur.', tanggal: '2026-08-03', mood: 'haru', tag: [], dibuat: now - 19 * hari },
      { id: 'p_4', galaksiId: 'g_ibu', privasi: 'publik', teks: 'Untuk semua yang masih punya ibu: teleponlah hari ini. Tidak perlu ada alasan.', tanggal: '2026-08-01', mood: 'rindu', tag: [], dibuat: now - 22 * hari, pendoa: { total: 27, tradisi: { islam: 11, kristen: 8, katolik: 4, hindu: 2, buddha: 1, umum: 1 } } },

      { id: 'p_5', galaksiId: 'g_rani', privasi: 'privat', teks: 'Ran, aku masih menyimpan tiket bioskop yang tidak jadi kita pakai. Aku tidak tahu kenapa belum kubuang.', tanggal: '2026-06-21', mood: 'kehilangan', tag: ['sahabat'], dibuat: now - 38 * hari },
      { id: 'p_6', galaksiId: 'g_rani', privasi: 'unlisted', teks: 'Kita tidak bertengkar, kita hanya berhenti saling menulis. Aku tidak tahu mana yang lebih menyakitkan.', tanggal: '2026-07-28', mood: 'haru', tag: [], dibuat: now - 26 * hari },
      { id: 'p_7', galaksiId: 'g_rani', privasi: 'publik', teks: 'Kehilangan sahabat tidak selalu karena perpisahan besar. Kadang hanya karena dua orang sama-sama sibuk dan sama-sama menunggu.', tanggal: '2026-08-04', mood: 'sesal', tag: [], dibuat: now - 15 * hari, pendoa: { total: 14, tradisi: { islam: 6, kristen: 4, katolik: 2, buddha: 1, umum: 1 } } },

      { id: 'p_8', galaksiId: 'g_kakek', privasi: 'privat', teks: 'Kek, aku lulus. Kau bilang kau mau datang, dan aku tahu kau benar-benar mau. Terima kasih sudah menunggu sampai aku bisa.', tanggal: '2026-06-30', mood: 'bangga', tag: ['wisuda'], dibuat: now - 33 * hari },
      { id: 'p_9', galaksiId: 'g_kakek', privasi: 'privat', teks: 'Aku masih memakai jam tangan pemberianmu. Baterainya sudah kuganti dua kali.', tanggal: '2026-07-22', mood: 'rindu', tag: [], dibuat: now - 24 * hari },
      { id: 'p_10', galaksiId: 'g_kakek', privasi: 'publik', teks: 'Untuk yang baru saja kehilangan: sedihnya tidak akan hilang, tapi lambat laun ia berubah menjadi sesuatu yang bisa kau bawa jalan-jalan.', tanggal: '2026-08-09', mood: 'tenang', tag: [], dibuat: now - 10 * hari, pendoa: { total: 41, tradisi: { islam: 15, kristen: 12, katolik: 7, hindu: 3, buddha: 2, konghucu: 1, umum: 1 } } },

      { id: 'p_11', galaksiId: 'g_aku', privasi: 'privat', teks: 'Aku berharap kau sudah berhenti meminta maaf untuk hal-hal yang bukan salahmu.', tanggal: '2026-08-11', mood: 'tenang', tag: ['diri sendiri'], dibuat: now - 8 * hari },
      { id: 'p_12', galaksiId: 'g_aku', privasi: 'publik', teks: 'Kalau kau membaca ini dan masih ragu: kamu sudah jauh lebih baik daripada yang kamu kira.', tanggal: '2026-08-14', mood: 'syukur', tag: [], dibuat: now - 6 * hari, pendoa: { total: 9, tradisi: { islam: 4, umum: 5 } } },

      { id: 'p_13', galaksiId: 'g_bayu', privasi: 'privat', teks: 'Mas, aku menyesal tidak datang waktu itu. Aku tidak punya alasan yang cukup baik, dan itu yang paling mengganggu.', tanggal: '2026-07-15', mood: 'sesal', tag: ['maaf'], dibuat: now - 28 * hari },
      { id: 'p_14', galaksiId: 'g_bayu', privasi: 'publik', teks: 'Kakak beradik tidak harus akur setiap hari. Yang penting tidak ada yang benar-benar pergi.', tanggal: '2026-08-06', mood: 'tenang', tag: [], dibuat: now - 13 * hari, pendoa: { total: 11, tradisi: { islam: 5, kristen: 3, katolik: 2, umum: 1 } } },

      { id: 'p_15', galaksiId: 'g_ratih', privasi: 'privat', teks: 'Bu, cara Ibu menjelaskan pecahan dua puluh tahun lalu masih saya pakai waktu mengajari anak saya. Terima kasih.', tanggal: '2026-06-18', mood: 'syukur', tag: ['guru'], dibuat: now - 36 * hari },
      { id: 'p_16', galaksiId: 'g_ratih', privasi: 'publik', teks: 'Guru yang baik tidak pernah benar-benar tahu seberapa jauh ajarannya sampai.', tanggal: '2026-08-10', mood: 'bangga', tag: [], dibuat: now - 7 * hari, pendoa: { total: 18, tradisi: { islam: 6, kristen: 5, katolik: 3, hindu: 2, buddha: 1, umum: 1 } } }
    ];

    /* Doa orang lain → partikel debu yang mengelilingi galaksi.
       Ditulis bertahap dengan transaksi sekali jalan: jumlahnya ribuan. */
    var pesanArr = pesan.map(function (p) {
      // data contoh disimpan apa adanya agar tetap bisa dibaca sebelum kunci dibuat;
      // setelah kunci dibuat, yang privat ikut dienkripsi lewat reEnkripsiPrivat()
      return {
        id: p.id, galaksiId: p.galaksiId, privasi: p.privasi,
        isi: { v: 1, plain: p.teks },
        tanggal: p.tanggal, mood: p.mood, tag: p.tag, dibuat: p.dibuat,
        pendoa: p.pendoa || { total: 0, tradisi: {} }, dilaporkan: 0, seed: true,
        sendiri: true // pesan contoh yang ditulis "olehku" → bintang di piringan
      };
    });
    var doaArr = buatDoaPesanku(now);
    var masuk = buatOrangLain(now);

    return putBanyak('galaksi', galaksi)
      .then(function () { return putBanyak('pesan', pesanArr.concat(masuk.pesan)); })
      .then(function () { return putBanyak('doa', doaArr.concat(masuk.doa)); });
  }

  /* Isi pesan contoh untuk sabuk galaksi. Dua puluh enam kalimat pendek, satu
     per huruf, supaya variasi teksnya terasa dan mudah ditelusuri. */
  var MOCK_PESAN = [
    'Aku tidak pernah bilang ini langsung, jadi aku tulis di sini.',
    'Terima kasih untuk hal-hal kecil yang tidak sempat kusebut.',
    'Kadang aku masih ingin mengulang hari itu sekali lagi.',
    'Maaf kalau aku dulu terlalu sibuk untuk mendengar.',
    'Aku menyimpan fotonya sampai sekarang, tidak pernah kubuang.',
    'Kita tidak pernah berdebat, kita hanya berhenti bicara.',
    'Semoga tahun ini lebih ringan untukmu.',
    'Ada banyak hal yang ingin kutanyakan tapi sudah tidak bisa.',
    'Aku belajar banyak hal darimu tanpa pernah mengatakannya.',
    'Kabar baik: aku sudah bisa tersenyum waktu mengingatmu.',
    'Tempat itu masih sama, hanya orangnya yang berubah.',
    'Aku berharap kamu tahu bahwa kamu tidak sendirian.',
    'Kalau kamu membaca ini, aku ingin kamu beristirahat sebentar.',
    'Sesuatu yang dulu terasa besar sekarang hanya jadi cerita.',
    'Aku belum sempat minta maaf, dan itu masih mengganggu.',
    'Terima kasih sudah bertahan waktu aku belum bisa diandalkan.',
    'Kita tumbuh ke arah yang berbeda, dan itu tidak apa-apa.',
    'Aku masih menyimpan kebiasaan yang aku dapat darimu.',
    'Semoga kamu menemukan tempat yang membuatmu tenang.',
    'Aku menulis ini supaya tidak terus tinggal di kepalaku.',
    'Ada lagu yang selalu mengingatkanku padamu.',
    'Aku tidak tahu kamu di mana, tapi aku berharap kamu baik.',
    'Hal yang paling kusesali adalah tidak mengucapkan selamat tinggal.',
    'Kamu pernah bilang aku bisa, dan aku masih memegang itu.',
    'Kalau ada kesempatan kedua, aku tidak akan menunda.',
    'Terima kasih sudah pernah ada di hidupku.'
  ];

  /* Label a, b, c, … z, aa, ab, … — sama seperti penomoran kolom lembar kerja.
     Ditaruh di dalam teks supaya jelas mana data mockup dan mudah dihitung. */
  function labelKolom(i) {
    var s = '', n = i;
    do { s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return s;
  }

  /* Doa yang diterima PESAN MILIKKU: dibangkitkan dari rincian tradisi yang sama
     dengan penghitung `pendoa` pada pesan, supaya angka di kartu pesan, statistik
     dashboard, dan riwayat doa tidak pernah saling bertentangan. */
  function buatDoaPesanku(now) {
    var perPesan = {
      p_4: { galaksiId: 'g_ibu', tradisi: { islam: 11, kristen: 8, katolik: 4, hindu: 2, buddha: 1, umum: 1 } },
      p_7: { galaksiId: 'g_rani', tradisi: { islam: 6, kristen: 4, katolik: 2, buddha: 1, umum: 1 } },
      p_10: { galaksiId: 'g_kakek', tradisi: { islam: 15, kristen: 12, katolik: 7, hindu: 3, buddha: 2, konghucu: 1, umum: 1 } },
      p_12: { galaksiId: 'g_aku', tradisi: { islam: 4, umum: 5 } },
      p_14: { galaksiId: 'g_bayu', tradisi: { islam: 5, kristen: 3, katolik: 2, umum: 1 } },
      p_16: { galaksiId: 'g_ratih', tradisi: { islam: 6, kristen: 5, katolik: 3, hindu: 2, buddha: 1, umum: 1 } }
    };
    var arr = [], n = 0, jam = 3600000;
    Object.keys(perPesan).forEach(function (pesanId) {
      var d = perPesan[pesanId];
      Object.keys(d.tradisi).forEach(function (tradisi) {
        for (var i = 0; i < d.tradisi[tradisi]; i++) {
          arr.push({
            id: 'd_mine_' + pesanId + '_' + tradisi + '_' + i, galaksiId: d.galaksiId, pesanId: pesanId,
            tradisi: tradisi, doaId: 'seed', dibuat: now - (++n) * jam * 11
          });
        }
      });
    });
    return arr;
  }

  /* Berapa doa yang mengelilingi tiap galaksi contoh. Sengaja banyak: sabuk yang
     hanya berisi belasan butir tidak terbaca sebagai "banyak orang mendoakan",
     padahal itu justru yang ingin disampaikan.

     Angka-angka ini juga dipakai sebagai jumlah awal untuk galaksi yang baru
     dibuat pengguna (lihat saveGalaksiBaru), jadi galaksi baru tidak pernah
     tampil kosong. */
  var DOA_AWAL = {
    g_ibu: 260, g_rani: 180, g_kakek: 420, g_aku: 120, g_bayu: 200, g_ratih: 230
  };
  var DOA_AWAL_GALAKSI_BARU = 160;

  /* Satu butir sabuk = satu pesan dari orang lain + satu doa yang menempel
     padanya. Karena itu setiap butir selalu bisa dibuka isinya. */
  function starterUntukGalaksi(galaksiId, jumlah, now) {
    var tradisiPool = ['umum', 'islam', 'kristen', 'katolik', 'hindu', 'buddha', 'konghucu'];
    var pesanArr = [], doaArr = [];
    for (var i = 0; i < jumlah; i++) {
      var label = labelKolom(i);
      var tradisi = tradisiPool[(i + galaksiId.length) % tradisiPool.length];
      var pesanId = 'p_mock_' + galaksiId + '_' + label;
      var rincian = {}; rincian[tradisi] = 1;
      var kapan = now - i * 1800000; // tersebar beberapa bulan ke belakang
      pesanArr.push({
        id: pesanId, galaksiId: galaksiId, privasi: 'publik', sendiri: false,
        isi: { v: 1, plain: 'Pesan contoh (' + label + ') — ' + MOCK_PESAN[i % MOCK_PESAN.length] },
        tanggal: null, mood: null, tag: [], dibuat: kapan,
        pendoa: { total: 1, tradisi: rincian }, dilaporkan: 0, seed: true, mock: true,
        sabuk: true // penanda: butir ini tampil di sabuk keemasan yang mengelilingi galaksi
      });
      doaArr.push({
        id: 'd_mock_' + galaksiId + '_' + label, galaksiId: galaksiId, pesanId: pesanId,
        tradisi: tradisi, doaId: 'seed', dibuat: kapan
      });
    }
    return { pesan: pesanArr, doa: doaArr };
  }

  function buatOrangLain(now) {
    var pesanArr = [], doaArr = [];
    Object.keys(DOA_AWAL).forEach(function (galaksiId) {
      var s = starterUntukGalaksi(galaksiId, DOA_AWAL[galaksiId], now);
      pesanArr = pesanArr.concat(s.pesan);
      doaArr = doaArr.concat(s.doa);
    });
    return { pesan: pesanArr, doa: doaArr };
  }

  /* ── pesan untuk satu titik di lengan spiral ──────────────────────────────── */

  /* Setiap titik di piringan galaksi bisa diklik. Pesannya dibuat SAAT DIKLIK,
     bukan disiapkan di muka: satu galaksi digambar dengan ribuan titik, dan
     menyiapkan satu catatan untuk tiap titik berarti puluhan ribu baris untuk
     enam galaksi saja.

     Ini tetap stabil karena posisi tiap titik deterministik — generator galaksi
     dijalankan dengan RNG ber-seed — jadi indeks titik selalu menunjuk tempat
     yang sama, dan pesannya pun tidak berpindah saat dibuka lain kali. */
  function pesanTitik(galaksiId, index) {
    var id = 'p_star_' + galaksiId + '_' + index;
    return get('pesan', id).then(function (ada) {
      if (ada) return ada;
      var label = labelKolom(index);
      var rec = {
        id: id, galaksiId: galaksiId, privasi: 'publik', sendiri: false, piringan: true,
        isi: { v: 1, plain: 'Pesan contoh (' + label + ') — ' + MOCK_PESAN[index % MOCK_PESAN.length] },
        tanggal: null, mood: null, tag: [], dibuat: Date.now(),
        pendoa: { total: 1, tradisi: { umum: 1 } }, dilaporkan: 0,
        seed: true, mock: true, titik: index
      };
      return put('pesan', rec);
    });
  }

  /* Semua pesan yang tampil di SABUK, untuk satu galaksi. Dipakai lapisan sabuk
     dan penghitung di kartu — sengaja tidak menyentuh pesan-titik. */
  function listPesanSabuk(galaksiId) {
    return listPesan(galaksiId).then(function (rows) {
      return rows.filter(function (p) { return p.sabuk === true; });
    });
  }

  return {
    ready: openDb, newId: newId,
    identitas: identitas,
    listGalaksi: listGalaksi, getGalaksi: getGalaksi, saveGalaksi: saveGalaksi,
    saveGalaksiBaru: saveGalaksiBaru, putBanyak: putBanyak,
    listPesan: listPesan, getPesan: getPesan, simpanPesan: simpanPesan, bacaIsi: bacaIsi,
    pesanTitik: pesanTitik, listPesanSabuk: listPesanSabuk,
    reEnkripsiPrivat: reEnkripsiPrivat,
    listDoa: listDoa, addDoa: addDoa, doaPerGalaksi: doaPerGalaksi,
    stats: stats, getMeta: getMeta, setMeta: setMeta,
    reset: reset, seedIfEmpty: seedIfEmpty, isiSeed: isiSeed,
    _put: put, _del: del
  };
})();
