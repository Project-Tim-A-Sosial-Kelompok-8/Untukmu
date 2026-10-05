/* Untukmu — ladang galaksi.
 *
 * Satu orang = satu galaksi. Di dalam tiap galaksi:
 *   bintang  = pesan yang ditujukan kepadanya
 *   batu     = doa dari orang lain, mengorbit
 *
 * Galaksi orang dibangun oleh generator yang sudah ada di engine
 * (GX.buildGalaxyStars — spiral / ellipsoid / irregular, lengkap dengan inti,
 * halo dan veil). Berkas ini tidak menyalin shader galaksi; ia menambahkan tiga
 * hal di atasnya: layer bintang pesan, layer batu doa, dan animasi perjalanan
 * benda yang dikirim.
 *
 * Kaitan ke engine:
 *   - GX.buildGalaxyStars / GX.galaxyLODs   (hook kecil di index.html)
 *   - flyTo / stepFly / showReturnBtn       (kamera; stepFly sudah otomatis)
 *   - makeAsteroidGeometries                (bentuk batu)
 *   - METEOR_TEX, GLOW_TEX                  (jejak dan kilatan)
 *   - updateBeacons                         (dibungkus: satu-satunya tempat
 *                                            kita mendapat panggilan per frame
 *                                            di mode galaksi)
 */
window.UM = window.UM || {};

UM.galaksi = (function () {
  var RADIUS_MIN = 700, RADIUS_MAKS = 1300; // jarak galaksi orang dari pusat (Milky Way)
  var MAKS_BATU = 900;                      // batas partikel doa yang digambar per galaksi
  var UKURAN_BINTANG = 2.6;                 // titik dasar partikel bintang pesan
  var UKURAN_DEBU = 2.4;                    // titik dasar partikel debu doa

  /* Angka-angka yang menentukan rasa pemilihan titik. Semuanya dalam piksel
     layar, bukan satuan dunia: titik di galaksi ini berukuran beberapa piksel
     ketika galaksi dibingkai dan puluhan piksel ketika kamera menempel
     padanya, jadi ambang dalam satuan dunia akan berarti berbeda di tiap
     tingkat zoom. */
  var JARI_KURSOR_PX = 10;      // sejauh apa kursor masih dianggap menunjuk sebuah titik
  var TOLERANSI_LAYAR = 0.75;   // beda jarak-layar yang dianggap "sama dekat"
  var PX_CINCIN = 46;           // garis tengah cincin penanda terpilih
  var JARAK_TIBA_REL = 0.7;     // jarak tiba ke sebuah titik = 0.7 × radius galaksinya
  
  // Fitur baru: semua partikel interaktif
  var SEMUA_PARTIKEL_INTERAKTIF = true; // membuat semua partikel bisa diklik
  var KURSOR_HOVER = 'pointer';        // cursor style saat hover
  var UKURAN_PARTIKEL_MIN = 0.8;       // ukuran minimum partikel untuk interaksi (dalam piksel)

  var state = {
    siap: false,
    daftar: [],          // { g, lod, pos, bintang, batu, el, terlihat }
    peta: {},            // id → item
    rumah: null,         // posisi Milky Way (pusat)
    aktif: null,         // id galaksi tujuan; null berarti Milky Way / seluruh ladang
    perjalanan: [],
    kilatan: [],
    sekarang: 0,
    galaksiBawaan: false, // galaksi latar bawaan engine: dimatikan secara baku
    /* Titik yang sedang diikuti kamera. Titik di lengan galaksi ikut berputar
       bersama galaksinya, jadi tanpa mengikuti, kamera akan ditinggal dalam
       beberapa detik saja. */
    ikut: null,
    tandaTerpilih: null, // { objek, induk } — cincin yang sedang tampil
    pilihan: null        // { item, index, jenis, jarak } — titik yang sedang dipilih
  };

  var host = null;       // #um-galaksilabels
  var raycaster = null;
  var tmpV = null;
  var tmpA = null, tmpB = null; // vektor kerja pemilihan (dibuat saat tiga.js siap)
  var asliUpdateBeacons = null;
  var bersihkanHover = null; // diisi oleh pasangKlik(); dipakai refresh() untuk melepas sorotan basi
  var refreshTerakhir = 0;

  function three() { return typeof THREE !== 'undefined' ? THREE : null; }
  function generatorAda() { return !!(window.GX && typeof GX.buildGalaxyStars === 'function'); }

  /* ── angka acak deterministik ────────────────────────────────────────────── */

  function seedFromId(id) {
    var h = 2166136261, s = String(id);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rngDariSeed(seed) {
    if (typeof mulberry32 === 'function') return mulberry32(seed);
    var st = seed >>> 0;
    return function () {
      st += 0x6d2b79f5;
      var v = st;
      v = Math.imul(v ^ (v >>> 15), v | 1);
      v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
      return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Posisi di ladang: stabil per id, jadi orang selalu muncul di tempat yang
     sama. Disebar pada bola yang dipipihkan supaya ladangnya terbaca sebagai
     pita, bukan bola penuh — dan supaya kamera awal tetap bisa membingkainya. */
  function posDariId(id) {
    var T = three();
    var r = rngDariSeed(seedFromId('pos:' + id));
    var u = r() * 2 - 1, phi = r() * Math.PI * 2, s = Math.sqrt(Math.max(0, 1 - u * u));
    var rad = RADIUS_MIN + r() * (RADIUS_MAKS - RADIUS_MIN);
    return new T.Vector3(s * Math.cos(phi) * rad, u * rad * 0.45, s * Math.sin(phi) * rad);
  }

  /* ── pembangunan galaksi ─────────────────────────────────────────────────── */

  function warnaAman(c) { return /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#ffd9a0'; }

  /* Bebaskan hanya galaksi milik orang dari kabut adegan.
     Partikel galaksi memakai ShaderMaterial yang memang tidak berkabut, tapi
     inti/halo/veil memakai SpriteMaterial yang berkabut — pada jarak 900 hanya
     31% yang tersisa, sehingga orangnya kehilangan wajahnya. Kabutnya sendiri
     dibiarkan, karena justru itulah "gelap" yang dilintasi batu. */
  function bebaskanKabut(objek) {
    objek.traverse(function (n) {
      if (n.material && n.material.fog) {
        n.material.fog = false;
        n.material.needsUpdate = true; // define kabut sudah ter-bake di program shader
      }
    });
  }

  function bangunGalaksi(item) {
    var g = item.g;
    var objekSebelum = scene.children.slice();
    var asli = Math.random;
    Math.random = rngDariSeed(seedFromId('gal:' + g.id)); // galaksi orang harus sama tiap kali dibuka
    try {
      GX.buildGalaxyStars(item.pos, {
        kind: g.kind || 'spiral',
        radius: galaksiRadius(g),
        count: Math.max(4000, Math.min(10000, g.count || 8000)),
        pointSize: 2.1,
        spin: 0.02,
        inc: 0.72,
        roll: rngDariSeed(seedFromId('roll:' + g.id))() * Math.PI,
        halo: warnaAman(g.warna),
        haloOpacity: 0.17,
        core: '#fff4e2',
        coreOpacity: 0.92,
        halo2: warnaAman(g.warna),
        halo2Size: 1.05,
        halo2Opacity: 0.05,
        nucleusSize: 0.1,
        hii: g.kind === 'spiral' ? 0.02 : 0
      });
    } finally {
      Math.random = asli; // jangan sampai ada satu frame pun memakai RNG yang di-swap
    }
    item.lod = GX.galaxyLODs[GX.galaxyLODs.length - 1];
    item.lod.userData = { umGalaksiId: g.id };
    item.lod.minGalaxyDrawCount = 1800;
    item.objek = scene.children.filter(function (objek) { return objekSebelum.indexOf(objek) < 0; });

    /* inti/halo tadi ditambahkan langsung ke scene, bukan sebagai anak pts,
       jadi perlu dikumpulkan sendiri untuk dilepas dari kabut */
    item.objek.forEach(bebaskanKabut);
  }

  /* Radius galaksi orang. Angka cadangannya yang lama (140) — ukuran yang memang
     dirancang engine: bintangnya ~1,5 piksel pada jarak bingkai. */
  function galaksiRadius(g) {
    var R = (g && g.radius) || 0;
    return R > 0 ? R : 140;
  }

  /* ── bintang pesan ───────────────────────────────────────────────────────── */

  var BINTANG_VERT =
    'uniform float uSize; uniform float uCap; uniform float uTime;' +
    'attribute float aScale; attribute float aPhase; attribute vec3 aCol; attribute float aFokus;' +
    'varying vec3 vCol; varying float vA; varying float vTw;' +
    'void main(){' +
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);' +
    '  gl_Position = projectionMatrix * mv;' +
    '  float tw = 0.62 + 0.38 * sin(uTime * (0.8 + aPhase) + aPhase * 6.2831);' +
    '  vTw = tw; vCol = aCol; vA = aFokus;' +
    '  gl_PointSize = min(uSize * aScale * (300.0 / -mv.z), uCap) * (0.8 + 0.25 * tw);' +
    '}';

  var BINTANG_FRAG =
    'varying vec3 vCol; varying float vA; varying float vTw;' +
    'void main(){' +
    '  vec2 pc = gl_PointCoord - vec2(0.5); float d = length(pc);' +
    '  float core = pow(max(0.0, 1.0 - d * 2.4), 1.7);' +
    '  float halo = pow(max(0.0, 1.0 - d * 2.0), 3.0) * 0.5;' +
    '  float ax = abs(pc.x), ay = abs(pc.y);' +
    '  float hor = max(0.0, 1.0 - ay / 0.05) * max(0.0, 1.0 - ax / 0.5);' +
    '  float ver = max(0.0, 1.0 - ax / 0.05) * max(0.0, 1.0 - ay / 0.5);' +
    '  float s = (core + halo + (hor + ver) * 0.45) * (0.55 + 0.55 * vTw) * vA;' +
    '  if (s < 0.012) discard;' +
    '  gl_FragColor = vec4(vCol * (0.8 + 0.5 * vA), s);' +
    '}';

  /* Warna bintang pesan menyandikan privasi — bisa dibaca sekilas dari jauh. */
  function warnaBintang(privasi, warnaGalaksi) {
    var T = three();
    var c = new T.Color(warnaGalaksi);
    if (privasi === 'privat') c.multiplyScalar(0.62);
    else if (privasi === 'publik') c.lerp(new T.Color('#ffd9a0'), 0.5);
    else c.lerp(new T.Color('#8fd8c8'), 0.5);
    return c;
  }

  /* Pesan yang kamu tulis ditandai PADA titik spiral galaksinya sendiri — bukan
     sebagai lapisan terpisah. Ini penting: yang diubah hanya `aScale` (ukuran)
     dan `aColor` (warna) milik titik yang sudah ada. Array `position` tidak
     disentuh sama sekali, jadi bentuk spiralnya tetap identik sampai bit
     terakhir.

     /* Indeksnya dipilih dari rentang bawah buffer, karena engine memangkas titik
     yang digambar menurut jarak dengan setDrawRange(0, max(400, …)) — hanya
     indeks rendah yang selalu tampil, bahkan saat galaksi dilihat dari jauh.

     Pesan yang LAHIR dari klik pada satu titik membawa `titik` — indeks aslinya.
     Itu dihormati: titik yang kamu klik tetap bintang yang sama sesudah halaman
     dimuat ulang, bukan berpindah ke tempat lain karena dia ikut dibariskan
     ulang bersama pesan lain. */
  function tandaiTitikPesan(item, pesanList) {
    var T = three();
    if (!item.lod || !item.lod.pts || !item.lod.pts.geometry) return;
    var geo = item.lod.pts.geometry;
    var attrWarna = geo.attributes.aColor, attrSkala = geo.attributes.aScale;
    if (!attrWarna || !attrSkala) return;

    // lepaskan tanda dari pemanggilan sebelumnya
    if (item.pesanDiTitik) {
      Object.keys(item.pesanDiTitik).forEach(function (idx) {
        var i = parseInt(idx, 10);
        if (item.skalaAsli && item.skalaAsli[i] != null) attrSkala.array[i] = item.skalaAsli[i];
        if (item.warnaAsli && item.warnaAsli[i]) {
          var w = item.warnaAsli[i];
          attrWarna.array[i * 3] = w[0]; attrWarna.array[i * 3 + 1] = w[1]; attrWarna.array[i * 3 + 2] = w[2];
        }
      });
    }

    item.pesanDiTitik = {};
    item.pesanSendiri = pesanList.slice();
    item.lod.minDrawCount = 0;
    item.skalaAsli = {}; item.warnaAsli = {};
    if (!pesanList.length) { attrSkala.needsUpdate = true; attrWarna.needsUpdate = true; return; }

    var jumlahTitik = attrSkala.array.length;
    var jendela = Math.min(400, jumlahTitik);
    var wg = warnaAman(item.g.warna);

    // 1. indeks tetap lebih dulu: pesan yang lahir dari klik pada satu titik
    var peta = {}, bebas = [];
    pesanList.slice().sort(function (a, b) {
      return (a.dibuat || 0) - (b.dibuat || 0) || String(a.id).localeCompare(String(b.id));
    }).forEach(function (p) {
      var t = (p && p.titik != null) ? parseInt(p.titik, 10) : -1;
      if (t >= 0 && t < jumlahTitik && !peta[t]) peta[t] = p;
      else bebas.push(p);
    });
    // Indeks pesan lama tetap sama saat pesan baru ditambahkan. Jika 400 slot
    // pertama penuh, lanjutkan ke titik lain tanpa menimpa bintang sebelumnya.
    bebas.forEach(function (p) {
      var idx = seedFromId(p.id) % jendela, diperiksa = 0;
      while (peta[idx] && diperiksa < jumlahTitik) { idx = (idx + 1) % jumlahTitik; diperiksa++; }
      if (diperiksa < jumlahTitik) peta[idx] = p;
    });

    Object.keys(peta).forEach(function (k) {
      var idx = parseInt(k, 10), p = peta[k];
      if (idx >= jumlahTitik) return;
      item.lod.minDrawCount = Math.max(item.lod.minDrawCount, idx + 1);
      item.pesanDiTitik[idx] = p;
      item.skalaAsli[idx] = attrSkala.array[idx];
      item.warnaAsli[idx] = [attrWarna.array[idx * 3], attrWarna.array[idx * 3 + 1], attrWarna.array[idx * 3 + 2]];
      var c = warnaBintang(p.privasi, wg);
      attrSkala.array[idx] = 3.4; // menonjol di antara ribuan bintang lain
      attrWarna.array[idx * 3] = c.r; attrWarna.array[idx * 3 + 1] = c.g; attrWarna.array[idx * 3 + 2] = c.b;
    });
    attrSkala.needsUpdate = true;
    attrWarna.needsUpdate = true;
  }

  /* ── debu doa ─────────────────────────────────────────────────────────────── */

  /* Partikel debu: bulat lembut, tanpa kilau — sengaja berbeda dari bintang
     pesan yang berkilau empat titik. Dua lapisan, dua makna: piringan berisi
     yang kau tulis, sabuk luar berisi yang orang lain doakan. */
  var DEBU_FRAG =
    'varying vec3 vCol; varying float vA; varying float vTw;' +
    'void main(){' +
    '  vec2 pc = gl_PointCoord - vec2(0.5); float d = length(pc) * 2.0;' +
    '  float s = pow(max(0.0, 1.0 - d), 2.2) * (0.55 + 0.45 * vTw) * vA;' +
    '  if (s < 0.012) discard;' +
    '  gl_FragColor = vec4(vCol, s);' +
    '}';

  /* Doa orang lain = partikel kecil yang mengorbit galaksi, bukan bongkahan batu.
     Satu batu besar per doa membuat sabuknya terbaca sebagai batu raksasa,
     padahal ini debu dari banyak orang. Batu tetap dipakai untuk benda yang
     KAMU kirim — benda itu menempuh perjalanan sebagai batu, lalu larut menjadi
     satu butir debu di sabuk ini. */
  function bangunBatu(item, daftar, doaPesan) {
    var T = three();
    if (item.batu) {
      if (item.batu.parent) item.batu.parent.remove(item.batu);
      if (item.batuPoints) { item.batuPoints.geometry.dispose(); item.batuPoints.material.dispose(); }
      item.batu = null; item.batuPoints = null;
    }
    // setiap butir membawa pesannya sendiri, plus doa yang menempel padanya
    item.batuList = daftar.map(function (p) {
      return { pesan: p, doa: (doaPesan && doaPesan[p.id]) || null };
    });
    var total = daftar.length;
    item.batuTotal = total;
    item.batuDigambar = 0;
    if (!total || !item.lod) return;
    var digambar = Math.min(total, MAKS_BATU);

    var R = galaksiRadius(item.g);
    var pos = new Float32Array(digambar * 3), scl = new Float32Array(digambar);
    var pha = new Float32Array(digambar), col = new Float32Array(digambar * 3), fokus = new Float32Array(digambar);
    /* Partikel doa diwarnai KEEMASAN — itu penandanya. Warna galaksi hanya
       dipakai sedikit sebagai sentuhan, supaya debunya tetap terbaca sebagai
       bagian dari galaksi itu tetapi jelas berbeda dari bintang pesan yang
       berwarna menurut privasi. */
    var dasar = new T.Color('#ffd9a0').lerp(new T.Color(warnaAman(item.g.warna)), 0.28);

    for (var i = 0; i < digambar; i++) {
      var p = daftar[i];
      var r = rngDariSeed(seedFromId('dust:' + p.id));
      // sebaran acak yang mengelilingi galaksi, bukan cincin rapi: makin jauh
      // makin renggang (sqrt), jadi terasa seperti awan debu yang mengorbit
      var rad = R * (1.02 + 1.65 * Math.sqrt(r()));
      var ang = r() * Math.PI * 2 + (rad / R) * 0.85; // puntiran lembut → ikut berputar seperti lengan
      pos[i * 3] = Math.cos(ang) * rad;
      pos[i * 3 + 1] = (r() - 0.5) * R * 0.6;         // tebal, supaya terbaca sebagai volume
      pos[i * 3 + 2] = Math.sin(ang) * rad;
      scl[i] = 1.0 + r() * 1.1;
      pha[i] = r();
      fokus[i] = 1;
      var c = dasar.clone().multiplyScalar(0.5 + r() * 0.7);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }

    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('aScale', new T.BufferAttribute(scl, 1));
    g.setAttribute('aPhase', new T.BufferAttribute(pha, 1));
    g.setAttribute('aCol', new T.BufferAttribute(col, 3));
    g.setAttribute('aFokus', new T.BufferAttribute(fokus, 1));
    var ratio = (typeof renderer !== 'undefined' && renderer.getPixelRatio) ? renderer.getPixelRatio() : 1;
    var m = new T.ShaderMaterial({
      uniforms: { uSize: { value: UKURAN_DEBU * ratio }, uCap: { value: 34 * ratio }, uTime: { value: 0 } },
      vertexShader: BINTANG_VERT, fragmentShader: DEBU_FRAG,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending
    });
    var pts = new T.Points(g, m);
    pts.frustumCulled = false;
    pts.renderOrder = 3;

    // grup terpisah supaya sabuknya bisa mengorbit sendiri di dalam piringan
    var grup = new T.Group();
    grup.rotation.x = 0.1;
    grup.add(pts);
    item.lod.pts.add(grup);
    item.batu = grup;
    item.batuPoints = pts;
    item.batuDigambar = digambar;
  }

  /* ── label galaksi (DOM, diproyeksikan tiap frame) ───────────────────────── */

  function pastikanHost() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'um-galaksilabels';
    host.style.display = 'none';
    document.body.appendChild(host);
  }

  function bangunLabel(item) {
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'um-glabel';
    el.style.display = 'none';
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      UM.galaksi.terbangKe(item);
    });
    host.appendChild(el);
    item.el = el;
    perbaruiTeksLabel(item);
  }

  // Written prayers and messages share clickable stars, but each entry must
  // increment only its own counter. Received prayer sessions remain prayers.
  function hitungCatatan(rows) {
    var jumlah = { pesan: 0, doaTertulis: 0, doaDiterima: 0 };
    (rows || []).forEach(function(p) {
      if (p.jenis === 'doa') jumlah.doaTertulis++;
      else jumlah.pesan++;
      jumlah.doaDiterima += (p.pendoa && p.pendoa.total) || 0;
    });
    jumlah.doa = jumlah.doaTertulis + jumlah.doaDiterima;
    return jumlah;
  }

  function perbaruiTeksLabel(item) {
    if (!item.el) return;
    var jumlah = hitungCatatan(item.pesanSendiri);
    item.el.innerHTML =
      '<b><span class="dot" style="background:' + warnaAman(item.g.warna) + '"></span>' +
      esc(item.g.nama) + (item.g.rumah ? ' ⌂' : '') + '</b>' +
      '<small><span data-count="pesan">' + jumlah.pesan + ' ' + esc(UM.i18n.t('commonPesan')) + '</span> · <span data-count="doa">' + jumlah.doa + ' ' + esc(UM.i18n.t('commonDoa')) + '</span></small>';
    item.el.title = item.g.nama;
    item.el.setAttribute('aria-label', 'Kunjungi galaksi ' + item.g.nama);
  }

  function segarkanTeks() { state.daftar.forEach(perbaruiTeksLabel); }

  function perbaruiLabel() {
    if (!host) return;
    var tampil = typeof viewMode !== 'undefined' && viewMode === 'galaxy';
    host.style.display = tampil ? '' : 'none';
    if (!tampil) return;
    camera.updateMatrixWorld();
    for (var i = 0; i < state.daftar.length; i++) {
      var item = state.daftar[i];
      tmpV.copy(item.pos).project(camera);
      var vis = tmpV.z > -1 && tmpV.z < 1 && Math.abs(tmpV.x) < 1 && Math.abs(tmpV.y) < 1;
      item.el.style.display = vis ? '' : 'none'; item.terlihat = vis;
      if (vis) {
        var margin = item.el.offsetWidth / 2 + 12;
        item.el.style.left = Math.max(margin, Math.min(window.innerWidth - margin, (tmpV.x * 0.5 + 0.5) * window.innerWidth)) + 'px';
        item.el.style.top = Math.max(item.el.offsetHeight / 2 + 12, Math.min(window.innerHeight - item.el.offsetHeight / 2 - 12, (-tmpV.y * 0.5 + 0.5) * window.innerHeight + 38)) + 'px';
        var dekat = camera.position.distanceTo(item.pos) < galaksiRadius(item.g) * 6;
        item.el.classList.toggle('dekat', dekat);
      }
    }
  }

  /* ── membangun / menyegarkan seluruh ladang ──────────────────────────────── */

  function refresh() {
    if (!three() || !generatorAda()) return Promise.resolve(false);
    var versi = ++refreshTerakhir;
    if (bersihkanHover) bersihkanHover(); // tanda hover lama bisa menunjuk titik yang sudah dibangun ulang
    
    // Validasi dan setup partikel interaktif
    if (SEMUA_PARTIKEL_INTERAKTIF) {
      validasiPartikelInteraktif();
    }
    return Promise.all([
      UM.store.listGalaksi(),
      UM.store.listPesan(),
      UM.store.listDoa()
    ]).then(function (r) {
      if (versi !== refreshTerakhir) return false;
      var galaksi = r[0], pesan = r[1], doa = r[2];
      pastikanHost();

      var pesanPer = {}, doaPer = {};
      pesan.forEach(function (p) {
        var tujuan = p.galaksiIds && p.galaksiIds.length ? p.galaksiIds : [p.galaksiId];
        tujuan.forEach(function (id) {
          if (id) (pesanPer[id] = pesanPer[id] || []).push(p);
        });
      });
      doa.forEach(function (d) { (doaPer[d.galaksiId] = doaPer[d.galaksiId] || []).push(d); });

      var idBaru = {};
      galaksi.forEach(function (g) {
        idBaru[g.id] = true;
        var item = state.peta[g.id];
        if (!item) {
          item = state.peta[g.id] = { g: g, pos: posDariId(g.id), lod: null };
          state.daftar.push(item);
          bangunGalaksi(item);
          bangunLabel(item);
        }
        item.g = g;

        /* Dua lapisan, dua asal:
             piringan → bintang: pesan yang kamu tulis sendiri, plus pesan yang
                        dipublikasikan pemilik galaksi orang lain yang kamu buka
             sabuk    → debu: pesan dari orang lain, masing-masing dengan doanya
           Pemisahan ini yang menjamin setiap partikel punya isi yang bisa dibaca. */
        var semua = pesanPer[g.id] || [];
        var punyaku = semua.filter(function (p) { return p.sendiri !== false || p.piringan === true; });
        var orangLain = semua.filter(function (p) { return p.sabuk === true; });
        var doaPesan = {};
        (doaPer[g.id] || []).forEach(function (d) {
          if (d.pesanId && !doaPesan[d.pesanId]) doaPesan[d.pesanId] = d; // satu doa per butir
        });

        tandaiTitikPesan(item, punyaku);
        bangunBatu(item, orangLain, doaPesan);
        perbaruiTeksLabel(item);
      });

      // galaksi yang sudah tidak ada di data ikut dibersihkan
      state.daftar = state.daftar.filter(function (item) {
        if (idBaru[item.g.id]) return true;
        hapusItem(item);
        return false;
      });

      /* Penanda titik yang sedang dipilih dipasang ULANG di sini: sabuk doa
         dibangun ulang setiap data berubah (mis. sesudah mengirim doa), jadi
         cincin yang menempel pada objek lama akan ikut terbuang bersama objek
         itu — dan pengguna kehilangan jejak titik yang barusan dia pilih. */
      if (state.pilihan && state.peta[state.pilihan.item.g.id] === state.pilihan.item) {
        tandaiTerpilih(state.pilihan.item, state.pilihan.index, state.pilihan.jenis, state.pilihan.jarak);
      } else {
        hapusTandaTerpilih();
      }

      state.rumah = new (three().Vector3)(0, 0, 0);
      state.siap = true;
      if (state.aktif && !state.peta[state.aktif]) kembaliKeRumah();
      return true;
    });
  }

  function hapusItem(item) {
    if (item.el && item.el.parentNode) item.el.parentNode.removeChild(item.el);
    if (item.batu) { if (item.batu.parent) item.batu.parent.remove(item.batu); item.batu.children.forEach(function (m) { m.geometry.dispose(); m.material.dispose(); }); }
    if (item.lod) { // Bersihkan juga halo/inti yang bukan anak dari objek partikel.
      (item.objek || [item.lod.pts]).forEach(function (objek) {
        if (objek.parent) objek.parent.remove(objek);
        objek.traverse(function (anak) {
          if (anak.geometry) anak.geometry.dispose();
          if (anak.material) anak.material.dispose();
        });
      });
      if (window.GX && GX.galaxyLODs) {
        var idx = GX.galaxyLODs.indexOf(item.lod);
        if (idx >= 0) GX.galaxyLODs.splice(idx, 1);
      }
    }
    delete state.peta[item.g.id];
  }

  /* ── kamera ──────────────────────────────────────────────────────────────── */

  function masukLadang() {
    if (typeof viewMode === 'undefined') return;
    if (viewMode === 'sky' && typeof exitSky === 'function') exitSky();
    // Peta yang dibuka dari Bumi kembali ke mode tata surya terlebih dahulu.
    if (viewMode === 'solar' && typeof exitSolar === 'function') exitSolar();
  }

  /* Overview hanya dibuka melalui tombol Galaksi; Home tetap Milky Way. */
  function bingkaiLadang() {
    if (!state.daftar.length || typeof camera === 'undefined' || typeof controls === 'undefined') { kembaliKeRumah(); return false; }
    masukLadang();
    batalkanPerjalanan();
    bersihkanPilihan();
    state.aktif = null;
    var T = three(), batas = new T.Box3();
    state.daftar.forEach(function (item) { batas.expandByPoint(item.pos); });
    var pusat = batas.getCenter(new T.Vector3()), radius = 0;
    state.daftar.forEach(function (item) {
      radius = Math.max(radius, pusat.distanceTo(item.pos) + galaksiRadius(item.g));
    });
    var setengahFov = camera.fov * Math.PI / 360;
    var sudut = Math.min(setengahFov, Math.atan(Math.tan(setengahFov) * camera.aspect));
    var jarak = radius * 1.2 / Math.sin(sudut);
    var arah = camera.position.clone().sub(controls.target).normalize();
    if (!arah.lengthSq()) arah.set(0, 0.6, 1).normalize();
    controls.maxDistance = Math.max(controls.maxDistance, jarak * 1.2);
    camera.far = Math.max(camera.far, jarak + radius * 2);
    camera.updateProjectionMatrix();
    flyTo(pusat.clone().addScaledVector(arah, jarak), pusat, 2600);
    if (typeof showReturnBtn === 'function') showReturnBtn(true);
    return true;
  }

  function jarakBingkai(item) {
    var setengahFov = camera.fov * Math.PI / 360;
    var sudut = Math.min(setengahFov, Math.atan(Math.tan(setengahFov) * camera.aspect));
    return Math.max(galaksiRadius(item.g) * 3.4, galaksiRadius(item.g) * 1.2 / Math.sin(sudut));
  }

  // On narrow screens the card occupies the bottom part of the viewport.
  // Keep the whole galaxy above it without moving the orbit target off-center.
  function offsetBingkai() {
    return state.aktif && window.innerWidth <= 640 ? window.innerHeight * 0.24 : 0;
  }

  function perbaruiBingkai() {
    if (typeof camera === 'undefined') return;
    var offset = offsetBingkai();
    if (typeof flyState !== 'undefined' && flyState) { flyState.offset1 = offset; return; }
    if (offset) camera.setViewOffset(window.innerWidth, window.innerHeight, 0, offset, window.innerWidth, window.innerHeight);
    else if (camera.view && camera.view.enabled) camera.clearViewOffset();
  }

  function bingkaiGalaksi(item, dur, onTiba) {
    var dir = item.lod && item.lod.axis ? item.lod.axis.clone() : camera.position.clone().sub(item.pos);
    if (dir.dot(camera.position.clone().sub(item.pos)) < 0) dir.negate();
    if (dir.lengthSq() < 1) dir.set(0, 0.4, 1);
    dir.normalize();
    var jarak = jarakBingkai(item);
    controls.maxDistance = Math.max(controls.maxDistance, jarak * 1.2);
    state.aktif = item.g.id;
    flyTo(item.pos.clone().addScaledVector(dir, jarak), item.pos.clone(), dur || 2600, function () {
      showReturnBtn(true);
      if (UM.ui && UM.ui.renderKartuGalaksi) UM.ui.renderKartuGalaksi(item);
      if (onTiba) onTiba();
    });
    showReturnBtn(true);
    if (typeof clearSelection === 'function') clearSelection();
  }

  function terbangKe(item, pesanId) {
    if (!item || typeof flyTo !== 'function') return false;
    masukLadang();
    batalkanPerjalanan();
    bersihkanPilihan();
    bingkaiGalaksi(item, 2600, function () {
      if (!pesanId) return;
      var titik = Object.keys(item.pesanDiTitik || {}).find(function (idx) { return item.pesanDiTitik[idx].id === pesanId; });
      if (titik != null) tandaiTerpilih(item, parseInt(titik, 10), 'titik', jarakBingkai(item));
    });
    return true;
  }

  /* Posisi dunia sebuah titik di lengan galaksi. Dipakai saat terbang ke titik
     maupun saat kamera mengikutinya — satu sumber, jadi keduanya tidak mungkin
     berbeda pendapat tentang di mana titik itu berada. */
  function posisiTitik(item, index, keluar) {
    var T = three();
    var geo = item.lod.pts.geometry.attributes.position;
    var v = keluar || new T.Vector3();
    v.set(geo.getX(index), geo.getY(index), geo.getZ(index));
    return v.applyMatrix4(item.lod.pts.matrixWorld);
  }

  /* Posisi dunia benda yang sedang diikuti kamera: titik di piringan, atau
     partikel doa di sabuk. */
  function posisiIkut(ikut, keluar) {
    var T = three();
    var v = keluar || new T.Vector3();
    if (!ikut || !ikut.item) return null;
    var sumber = ikut.jenis === 'doa' ? ikut.item.batuPoints : (ikut.item.lod && ikut.item.lod.pts);
    if (!sumber) return null;
    return posisiTitikDari(sumber, ikut.index, v);
  }

  /* Seberapa dekat kamera berhenti di depan sebuah titik.

     Bukan angka tetap, dan sengaja tidak sedekat mungkin. Ukuran titik di
     layar mengikuti gl_PointSize milik engine (≈ uSize × aScale × 300 / jarak),
     jadi kalau kamera menempel terlalu dekat, titik yang dipilih berubah menjadi
     gumpalan raksasa sementara ribuan bintang di sekelilingnya ikut membesar
     sampai layar penuh kabut — dan justru di situlah "titik yang dipilih"
     lenyap. 0.7 × radius galaksi menjaga bintang tetangga tetap berupa titik
     kecil, sehingga yang dipilih terbaca sebagai satu bintang yang ditunjuk
     cincin penanda. */
  function jarakTiba(item) {
    return Math.max(12, galaksiRadius(item.g) * JARAK_TIBA_REL);
  }

  /* Terbang ke satu titik di lengan spiral, lalu MENGIKUTINYA.
     Titik itu ikut berputar bersama galaksi, jadi tanpa mengikuti, kamera akan
     ditinggal dalam beberapa detik. Lihat state.ikut di tick(). */
  function terbangKeTitik(item, index, pesan) {
    if (!item.lod || !item.lod.pts) return false;
    batalkanPerjalanan();
    state.aktif = item.g.id;
    if (bersihkanHover) bersihkanHover(); // sorotan hover tidak lagi relevan begitu terbang
    var T = three();
    var dunia = posisiTitik(item, index, new T.Vector3());
    var dir = camera.position.clone().sub(dunia);
    if (dir.lengthSq() < 1) dir.set(0, 0.3, 1);
    dir.normalize();
    /* Jangan pernah MEMUNDURKAN kamera: kalau pengguna sudah lebih dekat dari
       jarak tiba, yang dilakukan hanya memusatkan titik itu di layar. */
    var jarak = Math.min(jarakTiba(item), Math.max(10, camera.position.distanceTo(dunia)));
    var ikut = { item: item, jenis: 'titik', index: index, lalu: dunia.clone() };
    tandaiTerpilih(item, index, 'titik', jarak);
    state.ikut = ikut;
    flyTo(dunia.clone().addScaledVector(dir, jarak), dunia.clone(), 1500, function () {
      luruskanIkut(ikut);
      if (UM.ui && UM.ui.renderKartuTitik) UM.ui.renderKartuTitik(item, pesan, index);
    });
    if (typeof clearSelection === 'function') clearSelection();
    return true;
  }

  /* ── penanda titik terpilih ──────────────────────────────────────────────── */

  var RING_TEX = null;
  function ringTexture() {
    if (RING_TEX) return RING_TEX;
    var T = three();
    var S = 128, c = document.createElement('canvas');
    c.width = c.height = S;
    var x = c.getContext('2d');
    x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 16;
    x.beginPath(); x.arc(S / 2, S / 2, S * 0.37, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,1)'; x.lineWidth = 5;
    x.beginPath(); x.arc(S / 2, S / 2, S * 0.37, 0, Math.PI * 2); x.stroke();
    RING_TEX = new T.CanvasTexture(c);
    return RING_TEX;
  }

  /* Cincin + pendar pada titik yang dipilih.

     Ditambahkan sebagai ANAK dari objek yang bergerak (galaksi atau sabuk),
     pada koordinat lokal titiknya. Jadi penanda ini otomatis ikut berputar
     bersama galaksinya tanpa perlu diperbarui tiap frame — dan yang penting:
     ia memperlihatkan dengan pasti titik mana yang sedang dipilih.

     Besarnya dihitung dari jarak tiba, supaya di layar selalu sekitar
     PX_CINCIN piksel. Kalau ukurannya dalam satuan dunia yang tetap, cincin di
     galaksi besar akan memenuhi layar dan di galaksi kecil menghilang. */
  function tandaiTerpilih(item, index, jenis, jarak) {
    hapusTandaTerpilih();
    if (!three() || !item) return;
    var T = three();
    var sumber = jenis === 'doa' ? item.batuPoints : (item.lod && item.lod.pts);
    if (!sumber) return;
    var geo = sumber.geometry.attributes.position;
    if (index < 0 || index >= geo.count) return;

    var grup = new T.Group();
    grup.position.set(geo.getX(index), geo.getY(index), geo.getZ(index));
    var ukuran = perPiksel(jarak || jarakTiba(item)) * PX_CINCIN;

    var cincin = new T.Sprite(new T.SpriteMaterial({
      map: ringTexture(), color: 0xfff2d8, transparent: true, opacity: 0.95,
      depthWrite: false, depthTest: false, blending: T.AdditiveBlending, fog: false
    }));
    cincin.scale.set(ukuran, ukuran, 1);
    cincin.renderOrder = 9;
    grup.add(cincin);

    /* pendar tipis supaya titiknya ikut terbaca, bukan hanya cincinnya */
    var pendar = new T.Sprite(new T.SpriteMaterial({
      map: typeof GLOW_TEX !== 'undefined' ? GLOW_TEX : null, color: 0xfff2d8,
      transparent: true, opacity: 0.35, depthWrite: false, depthTest: false,
      blending: T.AdditiveBlending, fog: false
    }));
    pendar.scale.set(ukuran * 0.5, ukuran * 0.5, 1);
    pendar.renderOrder = 8;
    grup.add(pendar);

    sumber.add(grup);
    state.tandaTerpilih = { objek: grup, induk: sumber };
    state.pilihan = { item: item, index: index, jenis: jenis, jarak: jarak || jarakTiba(item) };
  }

  function hapusTandaTerpilih() {
    var t = state.tandaTerpilih;
    if (!t) return;
    if (t.induk) t.induk.remove(t.objek);
    t.objek.children.forEach(function (c) { if (c.material) c.material.dispose(); });
    state.tandaTerpilih = null;
  }

  function posisiTitikDari(pointsObj, index, keluar) {
    var T = three();
    var geo = pointsObj.geometry.attributes.position;
    var v = keluar || new T.Vector3();
    v.set(geo.getX(index), geo.getY(index), geo.getZ(index));
    return v.applyMatrix4(pointsObj.matrixWorld);
  }

  /* Setelah mendarat, titik tujuan sudah bergeser sedikit: galaksinya berputar
     selama penerbangan (0.02 rad/s, jadi biasanya beberapa satuan). Kita geser
     kamera DAN target orbit sebesar pergeseran itu, supaya titik yang dipilih
     benar-benar berada di tengah layar — bukan meleset di pinggirnya. Inilah
     yang membuat perjalanan kamera terasa benar-benar menunjuk ke titik yang
     diklik. */
  function luruskanIkut(ikut) {
    if (!ikut || state.ikut !== ikut || !three()) return;
    var sumber = ikut.jenis === 'doa' ? ikut.item.batuPoints : (ikut.item.lod && ikut.item.lod.pts);
    if (!sumber) return;
    var kini = posisiTitikDari(sumber, ikut.index, new (three().Vector3)());
    var geser = kini.clone().sub(ikut.lalu);
    camera.position.add(geser);
    if (typeof controls !== 'undefined' && controls.target) controls.target.add(geser);
    ikut.lalu = kini;
  }

  function terbangKeBatu(item, index) {
    var d = (item.batuList || [])[index];
    if (!d || !item.batuPoints) return false;
    batalkanPerjalanan();
    state.aktif = item.g.id;
    if (bersihkanHover) bersihkanHover();
    var T = three();
    var geo = item.batuPoints.geometry.attributes.position;
    var dunia = new T.Vector3(geo.getX(index), geo.getY(index), geo.getZ(index))
      .applyMatrix4(item.batuPoints.matrixWorld);
    var dir = camera.position.clone().sub(dunia);
    if (dir.lengthSq() < 1) dir.set(0, 0.3, 1);
    dir.normalize();
    var jarak = Math.min(jarakTiba(item), Math.max(10, camera.position.distanceTo(dunia)));
    var ikut = { item: item, jenis: 'doa', index: index, lalu: dunia.clone() };
    tandaiTerpilih(item, index, 'doa', jarak);
    state.ikut = ikut;
    flyTo(dunia.clone().addScaledVector(dir, jarak), dunia.clone(), 1400, function () {
      luruskanIkut(ikut);
      if (UM.ui && UM.ui.renderKartuBatu) UM.ui.renderKartuBatu(item, d);
    });
    if (typeof clearSelection === 'function') clearSelection();
    return true;
  }

  /* ── galaksi latar bawaan engine ─────────────────────────────────────────── */

  /* Engine membawa galaksi bawaannya sendiri: satu batch langit jauh berisi
     puluhan galaksi kecil, plus tujuh galaksi luar bernama (M31, M87, ...)
     lengkap dengan kartu dan beacon-nya. Di produk ini semuanya dimatikan
     secara baku, karena sekarang setiap galaksi berarti satu orang — galaksi
     bawaan hanya mengaburkan makna itu.

     Kodenya tetap ada dan bisa dinyalakan lagi (Pengaturan, atau
     ?galaksiBawaan=1), persis seperti semula. */
  function setGalaksiBawaan(tampil) {
    state.galaksiBawaan = !!tampil;
    if (!three()) return state.galaksiBawaan;

    // 1. langit galaksi jauh (satu batch mesh + satu sprite kluster)
    if (window.GX) {
      if (GX.deepSky) GX.deepSky.visible = state.galaksiBawaan;
      if (GX.deepCluster) GX.deepCluster.visible = state.galaksiBawaan;
    }

    // 2. tujuh galaksi luar: objek partikelnya, plus halo/intinya
    if (window.GX && GX.galaxyLODs) {
      GX.galaxyLODs.forEach(function (lod) {
        if (!lod.cat) return; // galaksi orang tidak punya .cat, jadi tidak tersentuh
        lod.pts.visible = state.galaksiBawaan;
        scene.traverse(function (n) {
          if (!n.isSprite || !n.position) return;
          // inti/halo diletakkan tepat di pusat galaksi (jarak ≈ 0); veils ada di
          // dalam koordinat lokal pts, jadi tidak ikut tertangkap oleh ambang ini
          if (n.position.distanceTo(lod.center) < 5) n.visible = state.galaksiBawaan;
        });
      });
    }

    // 3. label beacon-nya; updateBeacons menimpa display tiap frame,
    //    jadi penyembunyian sesungguhnya dilakukan di tick()
    if (typeof BEACONS !== 'undefined') {
      BEACONS.forEach(function (b) { if (b.gal || b.child) b.shown = false; });
    }
    return state.galaksiBawaan;
  }

  function kembaliKeRumah() {
    masukLadang();
    batalkanPerjalanan();
    bersihkanPilihan();
    state.aktif = null;
    if (typeof clearSelection === 'function') clearSelection();
    if (typeof flyHome === 'function') flyHome();
    if (typeof showReturnBtn === 'function') showReturnBtn(false);
  }

  function bersihkanPilihan() {
    state.ikut = null; // lepaskan mode mengikuti
    state.pilihan = null;
    hapusTandaTerpilih();
    if (bersihkanHover) bersihkanHover();
    state.daftar.forEach(function (item) { if (item.el) item.el.classList.remove('on'); });
    if (UM.ui && UM.ui.tutupPanel) UM.ui.tutupPanel();
  }

  /* ── kilatan (kurva cahaya nova, sama seperti dipakai di peta) ───────────── */

  function kilat(pos, warna, ukuran) {
    var T = three();
    var sprite = new T.Sprite(new T.SpriteMaterial({
      map: typeof GLOW_TEX !== 'undefined' ? GLOW_TEX : null,
      color: new T.Color(warna || '#fff2d8'), transparent: true, opacity: 0, depthWrite: false,
      blending: T.AdditiveBlending, fog: false
    }));
    sprite.position.copy(pos);
    sprite.scale.set(1, 1, 1);
    scene.add(sprite);
    state.kilatan.push({ sprite: sprite, t0: state.sekarang, dur: 2100, base: ukuran || 90 });
  }

  function perbaruiKilatan(now) {
    if (!state.kilatan.length) return;
    var hidup = [];
    for (var i = 0; i < state.kilatan.length; i++) {
      var f = state.kilatan[i];
      var k = Math.min(1, (now - f.t0) / f.dur);
      // naik cepat, puncak membulat, turun dua lereng — kurva supernova engine
      var amp = k < 0.16 ? Math.pow(k / 0.16, 2.3) : (k < 0.4 ? 1 : Math.pow(1 - (k - 0.4) / 0.6, 1.7));
      var size = f.base * (0.4 + 2.4 * k);
      f.sprite.scale.set(size * 1.7, size, 1);
      f.sprite.material.opacity = 0.95 * amp;
      if (k >= 1) { scene.remove(f.sprite); f.sprite.material.dispose(); }
      else hidup.push(f);
    }
    state.kilatan = hidup;
  }

  /* ── perjalanan: benda terbang dari galaksi rumah ke galaksi tujuan ──────── */

  /* Tiga babak:
       1. kamera mundur sampai rumah dan arah tujuan masuk bingkai
       2. benda menyeberangi gelap TANPA kamera bergerak — supaya mata mengikuti
       3. kamera menyusul, mendarat bersamaan dengan bendanya
     Seluruh kemajuan dihitung di tick(), bukan setTimeout: kalau tab tidak
     aktif, jam animasi ikut berhenti dan tidak ada kedatangan yang tertinggal. */
  
  // Fitur baru: Animasi perjalanan yang lebih kaya
  var JENIS_PERJALANAN = {
    PESAN: 'pesan',
    DOA: 'doa',
    KUNJUNGAN: 'kunjungan'
  };
  
  // Parameter animasi yang bisa disesuaikan
  var PARAM_ANIMASI = {
    DURASI_MIN: 2000,
    DURASI_MAX: 8000,
    UKURAN_BATU: 6.5,
    ROTASI_SPEED_X: 0.02,
    ROTASI_SPEED_Y: 0.03,
    TRAIL_LENGTH: 15,
    GLOW_INTENSITY: 2.2
  };
  
  function kirimPerjalanan(itemTujuan, jenis, onTiba) {
    if (!three() || !itemTujuan || typeof flyTo !== 'function') return Promise.resolve(false);
    masukLadang();
    batalkanPerjalanan();
    bersihkanPilihan();
    state.aktif = itemTujuan.g.id;
    var T = three();

    // berangkat dari tepi piringan Milky Way, bukan dari intinya
    var arahKeluar = itemTujuan.pos.clone().normalize();
    var dari = arahKeluar.clone().multiplyScalar(300);
    var ke = itemTujuan.pos.clone();
    var jarak = dari.distanceTo(ke);

    var badan = buatBadan(jenis, itemTujuan);
    badan.visible = false;
    scene.add(badan);
    var jejak = buatJejak();
    jejak.visible = false;
    scene.add(jejak);

    // titik kontrol digeser tegak lurus supaya jalurnya melengkung, bukan garis lurus
    var poros = ke.clone().sub(dari);
    var tegak = new T.Vector3().crossVectors(poros, new T.Vector3(0, 1, 0));
    if (tegak.lengthSq() < 1e-4) tegak.set(1, 0, 0);
    tegak.normalize();
    var kontrol = dari.clone().add(ke).multiplyScalar(0.5)
      .addScaledVector(tegak, jarak * 0.16)
      .addScaledVector(new T.Vector3(0, 1, 0), jarak * 0.1);

    var jalan = {
      dari: dari, kontrol: kontrol, ke: ke, badan: badan, jejak: jejak,
      jenis: jenis, onTiba: onTiba, item: itemTujuan,
      fase: 'siap', t0: 0, babak3: false,
      dur: Math.max(2600, Math.min(5200, 2000 + jarak * 1.5)) // jarak harus terasa, tapi tidak membosankan
    };
    state.perjalanan.push(jalan);

    var tengah = dari.clone().add(ke).multiplyScalar(0.5);
    var posKamera = tengah.clone()
      .addScaledVector(tegak, jarak * 0.8)
      .addScaledVector(new T.Vector3(0, 1, 0), jarak * 0.28);

    flyTo(posKamera, tengah.clone(), 1700, function () {
      controls.enabled = false; // babak 2 harus tenang
      badan.visible = true;
      jejak.visible = true;
      jalan.t0 = typeof videoNow === 'function' ? videoNow() : performance.now();
      jalan.fase = 'terbang';
    });
    return Promise.resolve(true);
  }

  function buatBadan(jenis, item) {
    var T = three();
    if (jenis === 'doa') {
      /* Unlit: benda ini menyeberangi gelap tanpa sumber cahaya, jadi material
         berkutip akan hilang. Ukurannya sengaja kecil dibanding galaksi, supaya
         terasa seperti batu yang benar-benar menempuh jarak jauh. */
      var geo = makeAsteroidGeometries(rngDariSeed(seedFromId('kirim:' + item.g.id)))[0];
      var m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: 0xd8cdbd, fog: false }));
      m.scale.setScalar(6.5); // kecil dibanding galaksi — benda ini menempuh jarak jauh
      return m;
    }
    // pesan: mote cahaya
    var s = new T.Sprite(new T.SpriteMaterial({
      map: typeof GLOW_TEX !== 'undefined' ? GLOW_TEX : null,
      color: 0xfff2d8, transparent: true, opacity: 0.95, depthWrite: false,
      blending: T.AdditiveBlending, fog: false
    }));
    s.scale.set(26, 26, 1);
    return s;
  }

  function buatJejak() {
    var T = three();
    var mat = new T.MeshBasicMaterial({
      map: typeof METEOR_TEX !== 'undefined' ? METEOR_TEX : null,
      transparent: true, opacity: 0.85, depthWrite: false, side: T.DoubleSide,
      blending: T.AdditiveBlending, fog: false
    });
    var mesh = new T.Mesh(typeof METEOR_GEO !== 'undefined' ? METEOR_GEO : new T.PlaneGeometry(1, 1), mat);
    mesh.frustumCulled = false;
    return mesh;
  }

  /* Jejak diletakkan di belakang benda, memanjang searah geraknya, dan selalu
     menghadap kamera — pola yang sama dengan meteor engine. */
  function perbaruiJejak(jalan, posisi, arah, kecepatan) {
    if (!jalan.jejak.visible) return;
    var T = three();
    var panjang = 30 + kecepatan * 26;
    var viewDir = posisi.clone().sub(camera.position).normalize();
    var sisi = new T.Vector3().crossVectors(arah, viewDir);
    if (sisi.lengthSq() < 1e-4) sisi.copy(camera.up || new T.Vector3(0, 1, 0));
    sisi.normalize();
    var normal = new T.Vector3().crossVectors(arah, sisi);
    var basis = new T.Matrix4().makeBasis(arah, sisi, normal);
    jalan.jejak.quaternion.setFromRotationMatrix(basis);
    jalan.jejak.position.copy(posisi).addScaledVector(arah, -panjang * 0.42);
    jalan.jejak.scale.set(panjang, 11, 1);
  }

  function perbaruiPerjalanan(now) {
    if (!state.perjalanan.length) return;
    var hidup = [];
    for (var i = 0; i < state.perjalanan.length; i++) {
      var j = state.perjalanan[i];
      if (j.fase !== 'terbang') { hidup.push(j); continue; }

      var k = Math.min(1, (now - j.t0) / j.dur);
      var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // percepat lalu perlambat
      var a = new (three().Vector3)(), b = new (three().Vector3)();
      var p = kuadrik(j.dari, j.kontrol, j.ke, e, a, b);
      var arah = b.clone().normalize();
      j.badan.position.copy(p);
      if (j.jenis === 'doa') { j.badan.rotation.x += 0.02; j.badan.rotation.y += 0.03; }
      perbaruiJejak(j, p, arah, k < 0.5 ? k * 2 : (1 - k) * 2);

      // Babak 3 dimulai sedikit sebelum tiba, supaya kamera mendarat bersamaan.
      if (!j.babak3 && now - j.t0 > j.dur - 2200) {
        j.babak3 = true;
        bingkaiGalaksi(j.item, 2200);
      }

      if (k >= 1) { jalankanKedatangan(j); continue; } // jangan dimasukkan kembali ke daftar hidup
      hidup.push(j);
    }
    state.perjalanan = hidup;
  }

  function kuadrik(p0, p1, p2, t, outA, outB) {
    var T = three(), u = 1 - t;
    var p = outA || new T.Vector3();
    p.set(
      u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
      u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z
    );
    if (outB) outB.set(
      2 * u * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
      2 * u * (p1.y - p0.y) + 2 * t * (p2.y - p1.y),
      2 * u * (p1.z - p0.z) + 2 * t * (p2.z - p1.z)
    );
    return p;
  }

  function bersihkanBendaPerjalanan(jalan) {
    if (jalan.badan.parent) scene.remove(jalan.badan);
    if (jalan.jejak.parent) scene.remove(jalan.jejak);
    if (jalan.jenis === 'doa' && jalan.badan.geometry) jalan.badan.geometry.dispose();
    if (jalan.badan.material) jalan.badan.material.dispose();
    if (jalan.jejak.material) jalan.jejak.material.dispose();
  }

  function batalkanPerjalanan() {
    state.perjalanan.forEach(bersihkanBendaPerjalanan);
    state.perjalanan = [];
  }

  function jalankanKedatangan(jalan) {
    kilat(jalan.ke, '#fff2d8', galaksiRadius(jalan.item.g) * 2.2);
    bersihkanBendaPerjalanan(jalan);
    if (typeof jalan.onTiba === 'function') jalan.onTiba();
  }

  /* ── pemilihan lewat klik di kanvas ──────────────────────────────────────── */

  function elKanvas() {
    return (typeof renderer !== 'undefined' && renderer.domElement) ? renderer.domElement : null;
  }

  function titikSementara() {
    if (!tmpA) tmpA = new (three().Vector3)();
    return tmpA;
  }

  /* Ukuran satu piksel layar dalam satuan dunia pada jarak tertentu.
     Dipakai untuk menerjemahkan angka piksel yang stabil di layar (jari-jari
     tangkap klik, besar cincin) menjadi satuan dunia. Tinggi kanvas dan sudut
     pandang diambil dari keadaan kamera sekarang. */
  function perPiksel(jarak, tinggiPx, fovDerajat) {
    var h = tinggiPx || (elKanvas() ? elKanvas().clientHeight : 800);
    var f = fovDerajat || ((typeof camera !== 'undefined' && camera.fov) ? camera.fov : 55);
    return (2 * jarak * Math.tan(f * Math.PI / 360)) / Math.max(1, h);
  }

  /* Jarak sebuah titik dunia ke posisi kursor, dalam piksel CSS. Hasil null
     berarti titiknya ada di belakang kamera. */
  
  // Fungsi baru: Sistem camera tracking yang lebih presisi
  function aturCameraTracking(item, index, jenis, mode) {
    if (!item || !three()) return;
    var T = three();
    
    // Dapatkan posisi dunia partikel
    var dunia = posisiTitik(item, index, new T.Vector3());
    
    // Hitung jarak optimal berdasarkan ukuran partikel dan galaksi
    var R = galaksiRadius(item.g);
    var jarakOptimal = Math.max(10, R * 0.7); // 70% radius galaksi
    
    // Hitung arah kamera
    var dir = camera.position.clone().sub(dunia);
    if (dir.lengthSq() < 1) dir.set(0, 0.3, 1);
    dir.normalize();
    
    // Mode tracking: 'orbit' (mengikuti rotasi) atau 'fixed' (tetap)
    var ikut = { 
      item: item, 
      jenis: jenis, 
      index: index, 
      lalu: dunia.clone(),
      mode: mode || 'orbit',
      offset: dir.clone().multiplyScalar(jarakOptimal),
      jarakOptimal: jarakOptimal
    };
    
    // Tandai partikel yang dipilih
    tandaiTerpilih(item, index, jenis, jarakOptimal);
    
    // Set state tracking
    state.ikut = ikut;
    
    // Terbang ke posisi dengan smooth transition
    flyTo(
      dunia.clone().add(ikut.offset),
      dunia.clone(),
      1500, // Durasi animasi
      function () {
        // Callback setelah tiba: mulai mode orbit jika diperlukan
        if (ikut.mode === 'orbit') {
          mulaiOrbitTracking(item, dunia, jarakOptimal);
        }
      }
    );
  }
  
  // Fungsi baru: Mulai orbit tracking
  function mulaiOrbitTracking(item, pusat, jarak) {
    if (!item || !three()) return;
    var T = three();
    
    // Hitung posisi orbit yang mengikuti rotasi galaksi
    var posRelatif = camera.position.clone().sub(pusat);
    var orbitRadius = posRelatif.length();
    
    // Simpan data orbit
    if (!state.ikut) state.ikut = {};
    state.ikut.orbitData = {
      pusat: pusat.clone(),
      radius: orbitRadius,
      angleX: Math.atan2(posRelatif.y, Math.sqrt(posRelatif.x * posRelatif.x + posRelatif.z * posRelatif.z)),
      angleY: Math.atan2(posRelatif.x, posRelatif.z),
      lastTime: state.sekarang
    };
  }
  
  // Fungsi baru: Update orbit camera
  function perbaruiOrbitCamera() {
    if (!state.ikut || !state.ikut.orbitData || !three()) return;
    
    var T = three();
    var data = state.ikut.orbitData;
    var now = state.sekarang;
    var dt = (now - data.lastTime) * 0.001; // detik
    
    if (dt <= 0) return;
    
    // Update sudut orbit (mengikuti rotasi galaksi)
    var rotSpeed = 0.02; // radian per detik
    data.angleY += rotSpeed * dt;
    
    // Hitung posisi baru
    var newPos = new T.Vector3(
      data.pusat.x + data.radius * Math.sin(data.angleY) * Math.cos(data.angleX),
      data.pusat.y + data.radius * Math.sin(data.angleX),
      data.pusat.z + data.radius * Math.cos(data.angleY) * Math.cos(data.angleX)
    );
    
    // Update camera position dan target
    camera.position.copy(newPos);
    camera.lookAt(data.pusat);
    
    // Update orbit data
    data.lastTime = now;
  }
  
  function pikselDariKursor(dunia, ndcX, ndcY) {
    var T = three();
    if (!T || typeof camera === 'undefined') return null;
    if (!tmpB) tmpB = new T.Vector3();
    /* ke ruang kamera dulu: titik di belakang kamera harus dibuang SEBELUM
       dibagi w, karena setelah proyeksi ia muncul kembali di sisi sebaliknya */
    var v = tmpB.copy(dunia).applyMatrix4(camera.matrixWorldInverse);
    if (v.z >= -1e-4) return null;
    v.applyMatrix4(camera.projectionMatrix);
    var c = elKanvas();
    var w = c ? c.clientWidth : 800, h = c ? c.clientHeight : 600;
    var dx = (v.x - ndcX) * 0.5 * w, dy = (v.y - ndcY) * 0.5 * h;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* Aturan pemilihan: yang paling dekat dengan KURSOR di layar. Kalau dua
     kandidat hampir sama dekatnya (selisih di bawah TOLERANSI_LAYAR piksel),
     yang lebih dekat ke kamera yang menang — itu yang tampak "di depan". */
  function lebihBaik(a, b) {
    if (!b) return true;
    if (a.dpx < b.dpx - TOLERANSI_LAYAR) return true;
    if (b.dpx < a.dpx - TOLERANSI_LAYAR) return false;
    return a.jarak < b.jarak;
  }

  function galaksiTerdekat() {
    var terdekat = null, jd = Infinity;
    state.daftar.forEach(function (item) {
      var d = camera.position.distanceTo(item.pos);
      if (d < jd) { jd = d; terdekat = item; }
    });
    return { item: terdekat, jarak: jd };
  }

  /* Satu tempat untuk menentukan apa yang ada di bawah kursor: titik lengan
     (pesan) atau partikel doa. Dipakai bersama oleh klik dan sorotan hover,
     supaya keduanya tidak mungkin berbeda pendapat tentang apa yang sedang
     ditunjuk.

     Yang dipilih adalah kandidat yang PALING DEKAT DENGAN KURSOR DI LAYAR,
     bukan yang paling dekat dengan kamera. Ini bukan detail: three.js
     mengembalikan hasil raycast terurut menurut jarak ke kamera, dan di
     piringan galaksi yang miring titik-titiknya berlapis-lapis — titik terdepan
     di sepanjang berkas sinar bisa berada puluhan piksel dari tempat kursor
     berada. Dulu itulah sebabnya kamera terbang ke titik yang tidak ditunjuk
     pengguna, dan mengapa titik yang menyala saat hover bukan titik yang
     terpilih. */
  function pilihDi(ndcX, ndcY) {
    if (typeof camera === 'undefined') return null;
    /* Matriks kamera disegarkan DULU: dalam mode mengikuti, tick() menggeser
       kamera setelah render terakhir, jadi tanpa ini berkas sinarnya memakai
       posisi kamera satu frame yang lalu. */
    if (camera.updateMatrixWorld) camera.updateMatrixWorld();
    raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);

    var dekat = galaksiTerdekat();
    var item = dekat.item;
    if (!item) return null;
    var R = galaksiRadius(item.g);
    if (dekat.jarak > R * 9) return null; // terlalu jauh: klik tidak mungkin dimaksudkan untuk salah satunya

    /* Ambang hanya MENYARING kandidat, dan sengaja longgar: titik mana pun yang
       berada dalam JARI_KURSOR_PX piksel dari kursor harus ikut masuk, dari sisi
       mana pun ia dilihat. Karena itu ambangnya dihitung pada jarak sisi TERJAUH
       galaksi (pusat + 3 × radius, cukup untuk sabuk doa paling luar) — pada
       titik yang lebih jauh, satu piksel layar berarti perpindahan dunia yang
       lebih besar, jadi angka dari jarak terjauh selalu cukup. Yang menentukan
       pilihan akhir adalah jarak di layar di bawah ini. */
    raycaster.params.Points.threshold = Math.max(0.2, perPiksel(dekat.jarak + R * 3) * JARI_KURSOR_PX * 2);

    var terbaik = null;
    var calon = { jenis: '', item: item, index: -1, points: null, dpx: 0, jarak: 0 };

    function tawarkan(jenis, points, index) {
      var dunia = posisiTitikDari(points, index, titikSementara());
      var dpx = pikselDariKursor(dunia, ndcX, ndcY);
      if (dpx == null || dpx > JARI_KURSOR_PX) return;
      calon.jenis = jenis; calon.points = points; calon.index = index; calon.dpx = dpx;
      calon.jarak = camera.position.distanceTo(dunia);
      if (!lebihBaik(calon, terbaik)) return;
      terbaik = { jenis: jenis, item: item, index: index, points: points, dpx: dpx, jarak: calon.jarak };
    }

    if (item.batuPoints) {
      var hb = raycaster.intersectObject(item.batuPoints, false);
      for (var i = 0; i < hb.length; i++) {
        if (hb[i].index < (item.batuList || []).length) tawarkan('doa', item.batuPoints, hb[i].index);
      }
    }
    /* Titik-titik lengan spiral galaksi. intersectObject dipanggil dengan
       recursive=false, jadi partikel doa (anak dari pts) tidak ikut terhitung
       dua kali. */
    if (item.lod && item.lod.pts) {
      var ht = raycaster.intersectObject(item.lod.pts, false);
      for (var k = 0; k < ht.length; k++) tawarkan('titik', item.lod.pts, ht[k].index);
    }
    return terbaik;
  }

  function ndcDari(e) {
    var rect = renderer.domElement.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * 2 - 1, y: -((e.clientY - rect.top) / rect.height) * 2 + 1 };
  }

  function pasangKlik() {
    if (typeof renderer === 'undefined' || !renderer.domElement) return;
    var T = three();
    raycaster = new T.Raycaster();

    renderer.domElement.addEventListener('click', function (e) {
      if (typeof viewMode === 'undefined' || viewMode !== 'galaxy') return;
      if (typeof clickWasDrag === 'function' && clickWasDrag(e)) return;
      var ndc = ndcDari(e);
      var hit = pilihDi(ndc.x, ndc.y);
      if (hit) {
        if (hit.jenis === 'doa') {
          if (terbangKeBatu(hit.item, hit.index)) { e.stopPropagation(); return; }
        } else {
          /* Titik di lengan spiral. Pesannya sudah ada kalau titik ini memang
             ditandai untuk pesanmu; kalau bukan, pesannya dibuat saat ini juga
             sehingga tidak pernah ada titik yang diklik tanpa isi. */
          var item = hit.item, idx = hit.index;
          var sudahAda = item.pesanDiTitik ? item.pesanDiTitik[idx] : null;
          e.stopPropagation();
          if (sudahAda) { terbangKeTitik(item, idx, sudahAda); return; }
          UM.store.pesanTitik(item.g.id, idx).then(function (pesan) {
            UM.galaksi.terbangKeTitik(item, idx, pesan);
          });
          return;
        }
      }
      // klik di ruang kosong menutup kartu, dan biarkan event lewat ke engine
      bersihkanPilihan();
    }, false);

    /* Sorotan hover. Titiknya kecil dan berjumlah ribuan, jadi tanpa tanda
       "yang ini" pengguna tidak akan pernah yakin apa yang akan dia klik.

       Dua jenis lapisan perlu cara berbeda:
         - debu doa     → punya atribut aFokus sendiri (shader kami)
         - titik spiral → milik engine, TIDAK punya aFokus. Yang bisa diubah
                          hanya aScale dan aColor, dan keduanya wajib
                          dikembalikan persis seperti semula.

       Selain menyalakan titiknya, kursor juga diberi cincin penunjuk.
       Titik di galaksi ini bisa hanya beberapa piksel besarnya, jadi
       menerangkannya saja tidak cukup untuk meyakinkan pengguna titik MANA
       yang akan dia klik. */
    var hover = null, hoverT = 0, hoverItem = null;

    /* Satu cincin yang dipakai ulang untuk semua titik: ukurannya dihitung dari
       jarak kamera SEKARANG, jadi besarnya di layar tetap sama pada tingkat zoom
       mana pun tanpa perlu diperbarui tiap frame. */
    var cincinHover = null;
    function pastikanCincinHover() {
      if (cincinHover) return cincinHover;
      cincinHover = new T.Sprite(new T.SpriteMaterial({
        map: ringTexture(), color: 0xd6e6ff, transparent: true, opacity: 0.8,
        depthWrite: false, depthTest: false, blending: T.AdditiveBlending, fog: false
      }));
      cincinHover.renderOrder = 9;
      return cincinHover;
    }

    function pindahCincinHover(hit, faktor) {
      var c = pastikanCincinHover();
      var induk = hit.points;
      var geo = induk.geometry.attributes.position;
      if (hit.index < 0 || hit.index >= geo.count) { sembunyikanCincinHover(); return; }
      if (c.parent !== induk) {
        if (c.parent) c.parent.remove(c);
        induk.add(c); // koordinat lokal titik = koordinat lokal objek titiknya
      }
      c.position.set(geo.getX(hit.index), geo.getY(hit.index), geo.getZ(hit.index));
      var jarak = camera.position.distanceTo(posisiTitikDari(induk, hit.index, titikSementara()));
      var ukuran = perPiksel(Math.max(0.5, jarak)) * PX_CINCIN * (faktor || 0.55);
      c.scale.set(ukuran, ukuran, 1);
      c.visible = true;
    }

    function sembunyikanCincinHover() { if (cincinHover) cincinHover.visible = false; }

    function lepasSorot() {
      if (!hover) return;
      var geo = hover.points.geometry;
      if (geo.attributes.aFokus) {
        geo.attributes.aFokus.setX(hover.index, 1);
        geo.attributes.aFokus.needsUpdate = true;
      }
      if (hover.skalaAsli != null && geo.attributes.aScale) {
        geo.attributes.aScale.array[hover.index] = hover.skalaAsli;
        geo.attributes.aScale.needsUpdate = true;
      }
      if (hover.warnaAsli && geo.attributes.aColor) {
        var w = hover.warnaAsli;
        geo.attributes.aColor.array[hover.index * 3] = w[0];
        geo.attributes.aColor.array[hover.index * 3 + 1] = w[1];
        geo.attributes.aColor.array[hover.index * 3 + 2] = w[2];
        geo.attributes.aColor.needsUpdate = true;
      }
      hover = null;
    }

    function lepasLabelHover() {
      if (hoverItem && hoverItem.el) hoverItem.el.classList.remove('on');
      hoverItem = null;
    }

    // Fungsi baru: Update cursor style untuk semua partikel
    function perbaruiKursor(hit) {
      var canvas = renderer.domElement;
      if (!canvas) return;
    
      if (hit) {
        // Hit ditemukan, atur cursor menjadi pointer
        canvas.style.cursor = KURSOR_HOVER;
      
        // Tambah kelas hover untuk efek visual tambahan
        if (hit.points && hit.points.userData) {
          hit.points.userData.hoverIndex = hit.index;
        }
      } else {
        // Tidak ada hit, kembalikan ke default
        canvas.style.cursor = '';
      
        // Bersihkan semua hover data
        state.daftar.forEach(function(item) {
          if (item.batuPoints && item.batuPoints.userData) {
            delete item.batuPoints.userData.hoverIndex;
          }
          if (item.lod && item.lod.pts && item.lod.pts.userData) {
            delete item.lod.pts.userData.hoverIndex;
          }
        });
      }
    }

    // Fungsi baru: Validasi partikel interaktif
    function validasiPartikelInteraktif() {
      if (!SEMUA_PARTIKEL_INTERAKTIF) return;
    
      // Periksa dan pastikan semua partikel memiliki atribut yang diperlukan
      state.daftar.forEach(function(item) {
        if (item.batuPoints && item.batuPoints.geometry) {
          var geo = item.batuPoints.geometry;
          if (!geo.attributes.aFokus) {
            // Tambah atribut aFokus untuk partikel doa
            var count = geo.attributes.position.count;
            var fokus = new Float32Array(count);
            for (var i = 0; i < count; i++) fokus[i] = 1;
            geo.setAttribute('aFokus', new three().BufferAttribute(fokus, 1));
          }
        }
      });
    }

    bersihkanHover = function () { lepasSorot(); sembunyikanCincinHover(); lepasLabelHover(); perbaruiKursor(null); };

    function sorot(hit) {
      /* Label galaksi nyata ikut menyala: pada tingkat kawanan, nama adalah
         satu-satunya cara membedakan partikel yang bisa dimasuki dari laut
         partikel di sekelilingnya. */
      var itemBaru = (hit && hit.item) ? hit.item : null;
      if (hoverItem !== itemBaru) {
        if (hoverItem && hoverItem.el) hoverItem.el.classList.remove('on');
        hoverItem = itemBaru;
        if (hoverItem && hoverItem.el) hoverItem.el.classList.add('on');
      }
      perbaruiKursor(hit);

      if (hover && hit && hover.points && hover.points === hit.points && hover.index === hit.index) {
        pindahCincinHover(hit, hit.faktor); // kamera bisa saja sudah bergeser sejak sorotan terakhir
        return;
      }
      lepasSorot();
      if (hit && hit.points) {
        var geo = hit.points.geometry;
        pindahCincinHover(hit, hit.faktor);
        if (geo.attributes.aFokus) {
          geo.attributes.aFokus.setX(hit.index, 2.6);
          geo.attributes.aFokus.needsUpdate = true;
          hover = { points: hit.points, index: hit.index };
        } else if (geo.attributes.aScale && geo.attributes.aColor) {
          hover = {
            points: hit.points, index: hit.index,
            skalaAsli: geo.attributes.aScale.array[hit.index],
            warnaAsli: [geo.attributes.aColor.array[hit.index * 3],
                        geo.attributes.aColor.array[hit.index * 3 + 1],
                        geo.attributes.aColor.array[hit.index * 3 + 2]]
          };
          // diperbesar dan diputihkan — ukuran titik di shader engine dibatasi
          // uCap, jadi tidak akan pernah melebar memenuhi layar
          geo.attributes.aScale.array[hit.index] = Math.max(4, hover.skalaAsli * 2.6);
          geo.attributes.aColor.array[hit.index * 3] = 1.0;
          geo.attributes.aColor.array[hit.index * 3 + 1] = 0.97;
          geo.attributes.aColor.array[hit.index * 3 + 2] = 0.86;
          geo.attributes.aScale.needsUpdate = true;
          geo.attributes.aColor.needsUpdate = true;
        } else {
          hover = { points: hit.points, index: hit.index };
        }
      } else {
        sembunyikanCincinHover();
      }
    }

    renderer.domElement.addEventListener('pointermove', function (e) {
      if (typeof viewMode === 'undefined' || viewMode !== 'galaxy') { sorot(null); return; }
      // saat kamera sedang terbang, yang ada di bawah kursor bukan sasaran yang
      // tetap: menyorotnya justru menyesatkan
      if (typeof flyState !== 'undefined' && flyState) { sorot(null); return; }
      var now = typeof videoNow === 'function' ? videoNow() : performance.now();
      if (now - hoverT < 55) return; // cukup sering untuk terasa langsung, cukup jarang untuk tetap ringan
      hoverT = now;
      var ndc = ndcDari(e);
      var hit = pilihDi(ndc.x, ndc.y);
      sorot(hit ? { points: hit.points, index: hit.index } : null);
    }, false);

    // kursor keluar dari kanvas: lepaskan sorotan supaya tidak ada titik yang
    // tertinggal menyala
    renderer.domElement.addEventListener('pointerleave', function () { sorot(null); }, false);
  }

  /* ── per frame ───────────────────────────────────────────────────────────── */

  function tick(nowMs) {
    state.sekarang = nowMs;
    perbaruiPerjalanan(nowMs);
    perbaruiKilatan(nowMs);
    
    // Update orbit camera jika aktif
    perbaruiOrbitCamera();
    
    if (typeof viewMode === 'undefined' || viewMode !== 'galaxy') return;

    var t = nowMs * 0.001;

    /* Kamera mengikuti apa yang sedang dipilih. Titik pesan dan partikel doa ikut
       berputar bersama galaksinya, jadi tiap frame kita geser kamera dan target
       orbit sebesar pergeseran benda itu — hasilnya kamera seolah menempel
       padanya. */
    if (state.ikut && !state.ikut.orbitData) {
      // Mode tracking lama (backward compatibility)
      var it = state.ikut;
      var kini = posisiIkut(it, new (three().Vector3)());
      if (!kini) { state.ikut = null; }
      else {
        var sedangTerbang = typeof flyState !== 'undefined' && flyState;
        if (it.lalu && !sedangTerbang) {
          var geser = kini.clone().sub(it.lalu);
          camera.position.add(geser);
          if (typeof controls !== 'undefined' && controls.target) controls.target.add(geser);
        }
        it.lalu = kini;
      }
    }

    for (var i = 0; i < state.daftar.length; i++) {
      var item = state.daftar[i];
      if (item.batu) item.batu.rotation.y = t * 0.05; // sabuk debu doa mengorbit
      if (item.batuPoints) item.batuPoints.material.uniforms.uTime.value = t;
      if (item.el) item.el.classList.toggle('jauh', camera.position.distanceTo(item.pos) > galaksiRadius(item.g) * 14);
    }

    /* Label beacon galaksi bawaan disembunyikan SETELAH updateBeacons engine
       berjalan (kita membungkusnya), karena engine menulis style.display tiap
       frame. `shown` direset supaya saat fitur dinyalakan lagi engine
       menghitung ulang tampil/sembunyinya dengan benar. */
    if (!state.galaksiBawaan && typeof BEACONS !== 'undefined') {
      for (var bi = 0; bi < BEACONS.length; bi++) {
        var b = BEACONS[bi];
        if (b.gal || b.child) { if (b.el) b.el.style.display = 'none'; b.shown = false; }
      }
    }

    perbaruiLabel();
  }

  function pasangKait() {
    if (!three() || typeof updateBeacons !== 'function') return false;
    tmpV = new (three().Vector3)();
    pastikanHost();
    pasangKlik();

    asliUpdateBeacons = window.updateBeacons;
    window.updateBeacons = function () {
      if (typeof asliUpdateBeacons === 'function') asliUpdateBeacons.apply(this, arguments);
      tick(typeof videoNow === 'function' ? videoNow() : performance.now());
    };
    return true;
  }

  return {
    refresh: refresh, pasangKait: pasangKait, tick: tick, bingkaiLadang: bingkaiLadang, masukLadang: masukLadang,
    offsetBingkai: offsetBingkai, perbaruiBingkai: perbaruiBingkai,
    terbangKe: terbangKe, terbangKeTitik: terbangKeTitik, terbangKeBatu: terbangKeBatu,
    posisiTitikDari: posisiTitikDari, jarakTiba: jarakTiba,
    tandaiTerpilih: tandaiTerpilih, hapusTandaTerpilih: hapusTandaTerpilih,
    kembaliKeRumah: kembaliKeRumah, bersihkanPilihan: bersihkanPilihan,
    kirimPerjalanan: kirimPerjalanan, kilat: kilat,
    segarkanTeks: segarkanTeks, perbaruiLabel: perbaruiLabel,
    hitungCatatan: hitungCatatan,
    generatorAda: generatorAda,
    setGalaksiBawaan: setGalaksiBawaan,
    MAKS_BATU: MAKS_BATU,
    JARI_KURSOR_PX: JARI_KURSOR_PX,
    PX_CINCIN: PX_CINCIN,
    state: state,
    
    // Fungsi-fungsi baru untuk sistem interaksi yang lebih baik
    aturCameraTracking: aturCameraTracking,
    mulaiOrbitTracking: mulaiOrbitTracking,
    perbaruiOrbitCamera: perbaruiOrbitCamera,
    validasiPartikelInteraktif: validasiPartikelInteraktif,
    perbaruiKursor: perbaruiKursor,
    
    // Constants baru
    SEMUA_PARTIKEL_INTERAKTIF: SEMUA_PARTIKEL_INTERAKTIF,
    KURSOR_HOVER: KURSOR_HOVER,
    UKURAN_PARTIKEL_MIN: UKURAN_PARTIKEL_MIN,
    JENIS_PERJALANAN: JENIS_PERJALANAN,
    PARAM_ANIMASI: PARAM_ANIMASI,
    
    /* dipakai pengujian */
    _posDariId: posDariId, _seedFromId: seedFromId, _warnaBintang: warnaBintang, _kuadrik: kuadrik,
    _perPiksel: perPiksel, _lebihBaik: lebihBaik, _pilihDi: pilihDi
  };
})();
