/* Untukmu — ruang (workspace).
 *
 * Ruang utama hanya berisi Bima Sakti. Setiap ruang milik akun adalah satu
 * butir cahaya yang tertanam di lengan spiralnya — bagian dari debu bintang
 * yang ikut mengorbit pusat galaksi. Masuk ke sebuah ruang berarti menyelam
 * ke butir itu; keluar berarti muncul kembali dari antara debu lalu mundur
 * sampai seluruh Bima Sakti terlihat.
 *
 *   ruangmu       → butir emas, selalu bisa dimasuki
 *   ruang publik  → butir biru-putih, bisa dimasuki siapa saja
 *                   (hanya pesan publik yang terlihat)
 *   ruang privat  → butir redup tanpa nama, terkunci
 *
 * Di ruang utama kamera tidak bisa mundur atau bergeser: fokusnya Bima Sakti.
 * Di dalam ruang, menggulir menjauh sampai batas zoom membawa keluar.
 */
window.UM = window.UM || {};

UM.ruang = (function () {
  var JARAK_RUANG = 1900; // pusat ruang yang dimasuki, searah butirnya
  var KABUT = 0.0012; // kabut adegan bawaan engine
  var JARI_PX = 22; // radius tunjuk butir di layar
  var DEKAT_BUTIR = 34; // jarak kamera ke butir saat menyelam / muncul
  var HUB_MIN = 300; // seberapa dekat kamera boleh mendekati Bima Sakti

  var state = {
    aktif: null, // id ruang yang dimasuki; null = Bima Sakti
    daftar: [], // Workspace dari store
    titik: null, // THREE.Points butir ruang (anak galaxyRoot, ikut berputar)
    lokal: [], // posisi lokal butir di piringan, per daftar[i]
    hover: -1,
    tiba: false, // kamera sudah selesai tiba di ruang
    pindah: false, // sedang transisi masuk/keluar
    gulirKeluar: 0,
    konfirmasi: false,
    ubahNama: false,
    pengguna: null, // akun yang sedang masuk, atau null untuk pengunjung
    selam: null, // lompatan cahaya yang sedang berjalan
  };
  var host = null,
    bar = null,
    tip = null,
    tirai = null,
    labelKu = null,
    warp = null,
    tmp = null,
    mulaiWaktu = 0;

  function three() {
    return typeof THREE !== "undefined" ? THREE : null;
  }

  function seed(id) {
    var h = 2166136261,
      s = String(id);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    var st = h >>> 0;
    return function () {
      st += 0x6d2b79f5;
      var v = st;
      v = Math.imul(v ^ (v >>> 15), v | 1);
      v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
      return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Posisi butir di piringan Bima Sakti (koordinat galaxyRoot): di salah satu
     lengan utama, dengan rumus lengan yang sama seperti debu dan lukisannya,
     jadi butir ruang benar-benar duduk di antara bintang lengan. */
  function posisiLokal(id) {
    var r = seed("ruang:" + id);
    var R = typeof DUST !== "undefined" ? DUST.radius : 360,
      lengan = typeof DUST !== "undefined" ? DUST.arms : 4,
      putar = typeof DUST !== "undefined" ? DUST.tight : 0.85;
    var rf = 0.36 + r() * 0.56;
    var idx = Math.floor(r() * (lengan / 2)) * 2;
    var sudut = idx * ((Math.PI * 2) / lengan) + rf * putar * Math.PI * 2 + (r() - 0.5) * 0.22;
    var jari = rf * R + (r() - 0.5) * 18;
    return new (three().Vector3)(Math.cos(sudut) * jari, (r() - 0.5) * 6, Math.sin(sudut) * jari);
  }

  function posisiDunia(i) {
    return galaxyRoot.localToWorld(state.lokal[i].clone());
  }

  /* Galaksi sebuah ruang dibangun di "kantong" jauh di luar piringan, searah
     butirnya; selama di dalam ruang Bima Sakti disembunyikan. */
  function pusatDari(id) {
    var w = posisiLokal(id);
    var datar = new (three().Vector3)(w.x, 0, w.z).normalize();
    return datar.multiplyScalar(JARAK_RUANG).setY(160 + seed("tinggi:" + id)() * 220);
  }

  function pusat() {
    return state.aktif && three() ? pusatDari(state.aktif) : null;
  }

  /* Dari dalam ruang, kamera memandang ke arah Bima Sakti. */
  function arahPandang() {
    var c = pusat();
    if (!c) return null;
    return c
      .clone()
      .normalize()
      .add(new (three().Vector3)(0, 0.75, 0));
  }

  function ruangIni() {
    for (var i = 0; i < state.daftar.length; i++)
      if (state.daftar[i].id === state.aktif) return state.daftar[i];
    return null;
  }

  function indeksDari(id) {
    for (var i = 0; i < state.daftar.length; i++) if (state.daftar[i].id === id) return i;
    return -1;
  }

  /* ── butir ruang ───────────────────────────────────────────────────────── */

  var VERT =
    "uniform float uTime; uniform float uPx;" +
    "attribute vec3 aCol; attribute float aSize; attribute float aPhase; attribute float aHover;" +
    "varying vec3 vCol; varying float vTw; varying float vHover;" +
    "void main(){" +
    "  vec4 mv = modelViewMatrix * vec4(position, 1.0);" +
    "  gl_Position = projectionMatrix * mv;" +
    "  vTw = 0.7 + 0.3 * sin(uTime * (0.7 + aPhase) + aPhase * 6.2831);" +
    "  vCol = aCol; vHover = aHover;" +
    "  gl_PointSize = clamp(aSize * (1.0 + aHover * 0.6) * uPx * (600.0 / -mv.z), 2.5, 48.0);" +
    "}";
  var FRAG =
    "varying vec3 vCol; varying float vTw; varying float vHover;" +
    "void main(){" +
    "  vec2 pc = gl_PointCoord - vec2(0.5); float d = length(pc);" +
    "  float core = exp(-d * d * 30.0) * 1.3;" +
    "  float glow = pow(max(0.0, 1.0 - d * 2.0), 2.2) * 0.7;" +
    "  float ax = abs(pc.x), ay = abs(pc.y);" +
    "  float spike = (max(0.0, 1.0 - ay / 0.03) * max(0.0, 1.0 - ax / 0.5) +" +
    "                 max(0.0, 1.0 - ax / 0.03) * max(0.0, 1.0 - ay / 0.5)) * 0.3 * (0.4 + vHover);" +
    "  float a = (core + glow + spike) * vTw * (1.0 + vHover * 0.5);" +
    "  if (a < 0.01) discard;" +
    "  gl_FragColor = vec4(vCol * a, 1.0);" +
    "}";

  function warna(w) {
    if (w.milikku) return [1.0, 0.8, 0.46]; // emas: ruangmu
    if (!w.terkunci) return [0.74, 0.9, 1.0]; // biru-putih: bisa dimasuki
    return [0.36, 0.38, 0.5]; // redup: privat
  }

  function bangunTitik() {
    var T = three();
    if (state.titik) {
      state.titik.parent.remove(state.titik);
      state.titik.geometry.dispose();
      state.titik.material.dispose();
      state.titik = null;
    }
    var n = state.daftar.length;
    state.lokal = [];
    if (!n) return;
    var pos = new Float32Array(n * 3),
      col = new Float32Array(n * 3),
      size = new Float32Array(n),
      phase = new Float32Array(n),
      hover = new Float32Array(n);
    state.daftar.forEach(function (w, i) {
      var p = posisiLokal(w.id);
      state.lokal.push(p);
      pos.set([p.x, p.y, p.z], i * 3);
      col.set(warna(w), i * 3);
      size[i] = w.milikku ? 9 : w.terkunci ? 4 : 6.5;
      phase[i] = seed("fase:" + w.id)();
    });
    var g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(pos, 3));
    g.setAttribute("aCol", new T.BufferAttribute(col, 3));
    g.setAttribute("aSize", new T.BufferAttribute(size, 1));
    g.setAttribute("aPhase", new T.BufferAttribute(phase, 1));
    g.setAttribute("aHover", new T.BufferAttribute(hover, 1));
    var mat = new T.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPx: { value: renderer.getPixelRatio() } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
    });
    state.titik = new T.Points(g, mat);
    state.titik.frustumCulled = false;
    state.titik.renderOrder = 8;
    state.titik.visible = !state.aktif;
    galaxyRoot.add(state.titik); // ikut berputar bersama piringan
  }

  function aturHover(i) {
    if (state.hover === i || !state.titik) return;
    var attr = state.titik.geometry.getAttribute("aHover");
    if (state.hover >= 0 && state.hover < attr.count) attr.array[state.hover] = 0;
    if (i >= 0) attr.array[i] = 1;
    attr.needsUpdate = true;
    state.hover = i;
    /* Hanya MENYALAKAN kursor di sini. Mematikannya diserahkan kepada pemilik
       kanvas lain (lapisan galaksi): keduanya berbagi kanvas yang sama, dan
       kalau modul ini ikut mematikan, sorotan bintang pesan dari modul galaksi
       akan langsung terhapus pada event yang sama. */
    if (i >= 0) renderer.domElement.style.cursor = "pointer";
    renderTip();
  }

  /* ── DOM: label ruangmu, tip, bilah ruang, tirai transisi ──────────────── */

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function pastikanDom() {
    if (host) return;
    host = el("div", "um-ruang-labels");
    host.setAttribute("aria-hidden", "true");
    labelKu = el("div", "um-ruang-label mine", "Ruangmu");
    labelKu.style.opacity = "0";
    host.appendChild(labelKu);
    document.body.appendChild(host);
    tip = el("div", "um-ruang-tip");
    tip.setAttribute("role", "status");
    document.body.appendChild(tip);
    tirai = el("div", "um-ruang-tirai");
    document.body.appendChild(tirai);
    bar = el("div", "um-ruangbar");
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Ruang");
    bar.addEventListener("click", klikBar);
    bar.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = bar.querySelector("#um-ruang-nama");
      var nama = input ? input.value.trim() : "";
      if (!nama) return;
      UM.store
        .aturRuang({ nama: nama })
        .then(function () {
          state.ubahNama = false;
          return muatDaftar();
        })
        .catch(function (err) {
          if (UM.ui && UM.ui.toast) UM.ui.toast((err && err.message) || "Nama belum tersimpan.");
        });
    });
    document.body.appendChild(bar);
  }

  function keteranganRuang(w) {
    if (w.terkunci) return "Ruang privat · terkunci";
    var bagian = [w.jumlahGalaksi + " galaksi"];
    if (w.jumlahPublik) bagian.push(w.jumlahPublik + " pesan publik");
    return bagian.join(" · ");
  }

  function renderTip() {
    if (!tip) return;
    var w = state.daftar[state.hover];
    if (!w || state.aktif) {
      tip.classList.remove("on");
      return;
    }
    tip.innerHTML =
      "<b>" +
      esc(w.terkunci ? "Ruang privat" : w.milikku ? "Ruangmu" : w.nama) +
      "</b><span>" +
      esc(keteranganRuang(w)) +
      "</span><em>" +
      (w.terkunci ? "Ruang ini masih privat." : "Klik untuk masuk") +
      "</em>";
    tip.classList.add("on");
  }

  function renderBar() {
    pastikanDom();
    var w = ruangIni();
    var html;
    if (!state.aktif) {
      var terbuka = state.daftar.filter(function (x) {
        return !x.terkunci && !x.milikku;
      }).length;
      html =
        '<div class="um-rb-title"><span class="um-rb-kicker">Bima Sakti</span>' +
        "<strong>" +
        state.daftar.length +
        " ruang mengorbit</strong></div>" +
        '<p class="um-rb-note">Tiap butir terang di lengan Bima Sakti adalah ruang seseorang' +
        (terbuka ? ". " + terbuka + " bisa kau kunjungi" : "") +
        ".</p>" +
        (state.pengguna ? '<button type="button" data-act="ruangku">Masuk ruangku</button>' : "");
    } else if (w && w.milikku) {
      html =
        '<div class="um-rb-title"><span class="um-rb-kicker">Ruangmu · ' +
        (w.publik ? "publik" : "privat") +
        "</span><strong>" +
        esc(w.nama) +
        "</strong></div>" +
        (state.ubahNama
          ? '<form class="um-rb-form" data-act="nama-simpan">' +
            '<label class="um-rb-kicker" for="um-ruang-nama">Nama ruang</label>' +
            '<input id="um-ruang-nama" maxlength="60" required value="' +
            esc(w.nama) +
            '" />' +
            '<button type="submit">Simpan</button><button type="button" class="ghost" data-act="nama-batal">Batal</button>' +
            "</form>"
          : state.konfirmasi
            ? '<p class="um-rb-note">Siapa pun bisa masuk dan melihat nama galaksi serta pesan publikmu. Pesan privat tetap terkunci.</p>' +
              '<button type="button" data-act="publik-ya">Buka ruang</button><button type="button" class="ghost" data-act="publik-batal">Batal</button>'
            : '<button type="button" class="ghost" data-act="' +
              (w.publik ? "privat" : "publik") +
              '">' +
              (w.publik ? "Jadikan privat" : "Buka untuk umum") +
              "</button>" +
              '<button type="button" class="ghost" data-act="nama">Ganti nama</button>' +
              '<button type="button" data-act="hub">Ke Bima Sakti</button>');
    } else {
      html =
        '<div class="um-rb-title"><span class="um-rb-kicker">Berkunjung</span><strong>' +
        esc((w && w.nama) || "Ruang") +
        "</strong></div>" +
        '<p class="um-rb-note">Hanya pesan publik yang terlihat di ruang orang lain.</p>' +
        '<button type="button" data-act="hub">Ke Bima Sakti</button>';
    }
    bar.innerHTML = html;
    bar.dataset.mode = state.aktif ? "ruang" : "hub";
  }

  function klikBar(e) {
    var btn = e.target.closest ? e.target.closest("button[data-act]") : null;
    if (!btn) return;
    var act = btn.getAttribute("data-act");
    if (act === "hub") keHub();
    else if (act === "ruangku") masukRuangku();
    else if (act === "nama" || act === "nama-batal") {
      state.ubahNama = act === "nama";
      renderBar();
      var input = bar.querySelector("#um-ruang-nama");
      if (input) input.focus();
    } else if (act === "publik") {
      state.konfirmasi = true;
      renderBar();
    } else if (act === "publik-batal") {
      state.konfirmasi = false;
      renderBar();
    } else if (act === "publik-ya" || act === "privat") {
      btn.disabled = true;
      UM.store
        .aturRuang({ publik: act === "publik-ya" })
        .then(function () {
          state.konfirmasi = false;
          return muatDaftar();
        })
        .catch(function (err) {
          if (UM.ui && UM.ui.toast) UM.ui.toast((err && err.message) || "Gagal menyimpan.");
        })
        .then(renderBar);
    }
  }

  /* ── kamera ruang utama: hanya Bima Sakti ──────────────────────────────── */

  function aturKontrolHub() {
    var jarak = typeof HUB_POS !== "undefined" ? HUB_POS.length() : 890;
    controls.maxDistance = jarak; // tidak bisa mundur melewati pemandangan Bima Sakti
    controls.minDistance = HUB_MIN;
    controls.enablePan = false; // fokus selalu di pusat galaksi
  }

  function aturKontrolRuang() {
    controls.minDistance = 5;
    controls.enablePan = true;
  }

  /* ── perpindahan ───────────────────────────────────────────────────────── */

  /* Di dalam ruang hanya galaksi pemiliknya yang tampil: piringan Bima Sakti
     (debu, lukisan, butir ruang), cahaya intinya, dan bintang-bintang langit
     tetap di sekitarnya disembunyikan. Perubahan ini selalu terjadi di balik
     tirai, jadi tidak terlihat berkedip.

     Langit tetap (bgStarField) dan medan galaksi jauh (GX.deepSky) tinggal di
     scene, bukan di galaxyRoot — tanpa disembunyikan sendiri, bintang-bintang
     milik ruang utama akan tetap muncul sebagai taburan titik di belakang
     galaksi ruang. */
  function tampilkanBimaSakti(tampil) {
    if (typeof galaxyRoot !== "undefined") galaxyRoot.visible = tampil;
    if (typeof bgStarField !== "undefined" && bgStarField) bgStarField.visible = tampil;
    if (window.GX) {
      if (GX.deepSky) GX.deepSky.visible = tampil;
      if (GX.deepCluster) GX.deepCluster.visible = tampil;
    }
    if (typeof coreBreath !== "undefined")
      coreBreath.forEach(function (core) {
        core.sp.visible = tampil;
      });
  }

  function sinkron(id) {
    state.aktif = id || null;
    state.tiba = false;
    state.gulirKeluar = 0;
    state.konfirmasi = false;
    state.ubahNama = false;
    if (state.titik) state.titik.visible = !state.aktif;
    tampilkanBimaSakti(!state.aktif);
    if (scene.fog) scene.fog.density = KABUT;
    if (state.aktif) aturKontrolRuang();
    aturHover(-1);
    renderBar();
  }

  function muatDaftar() {
    if (!UM.store || !UM.store.listRuang) return Promise.resolve([]);
    return UM.store
      .identitas()
      .then(function (user) {
        state.pengguna = user || null;
        return UM.store.listRuang();
      })
      .then(function (daftar) {
        state.daftar = daftar;
        pastikanDom();
        bangunTitik();
        renderBar();
        return daftar;
      });
  }

  function tutupTirai(gelap) {
    pastikanDom();
    tirai.classList.toggle("on", !!gelap);
    return new Promise(function (selesai) {
      setTimeout(selesai, reducedMotion() ? 0 : 320);
    });
  }

  /* Selesai saat kamera tiba — atau saat batas waktunya lewat, karena animasi
     lain (mis. membingkai galaksi) bisa menimpa penerbangan ini dan callback
     aslinya tidak akan pernah dipanggil. */
  function terbang(posisi, sasaran, durasi) {
    var lama = reducedMotion() ? 1 : durasi;
    return new Promise(function (selesai) {
      var sudah = false;
      function akhir() {
        if (!sudah) {
          sudah = true;
          selesai();
        }
      }
      flyTo(posisi, sasaran, lama, akhir);
      setTimeout(akhir, lama + 600);
    });
  }

  /* ── lompatan cahaya (port dari galaxy-explorer) ─────────────────────────── */

  /* Animasi ini diadaptasi dari `solarWarp` di zjoooooo/galaxy-explorer (MIT):
     kamera menyusuri kurva yang meliuk, pandangannya terkunci pada tujuan, dan
     420 serat cahaya melintas menuju kamera. Yang diambil hanya animasinya;
     tidak ada isi tata surya yang ikut. */
  var STREAK_N = 420;
  var STREAK_Z = 280;

  function buatStreak() {
    var T = three();
    if (!T) return null;
    var positions = new Float32Array(STREAK_N * 12),
      colors = new Float32Array(STREAK_N * 12),
      index = [],
      z0 = new Float32Array(STREAK_N),
      lengths = new Float32Array(STREAK_N);
    var st = 0x5eed;
    function rnd() {
      st = (st * 1664525 + 1013904223) >>> 0;
      return st / 4294967296;
    }
    for (var i = 0; i < STREAK_N; i++) {
      var ang = rnd() * Math.PI * 2,
        rad = 3 + Math.pow(rnd(), 0.6) * 42;
      var x = Math.cos(ang) * rad,
        y = Math.sin(ang) * rad;
      var width = 0.28 + rnd() * 0.5,
        tx = (-Math.sin(ang) * width) / 2,
        ty = (Math.cos(ang) * width) / 2;
      z0[i] = rnd() * STREAK_Z;
      lengths[i] = 12 + rnd() * 28;
      var o = i * 12;
      positions[o] = x - tx;
      positions[o + 1] = y - ty;
      positions[o + 3] = x + tx;
      positions[o + 4] = y + ty;
      positions[o + 6] = x - tx;
      positions[o + 7] = y - ty;
      positions[o + 9] = x + tx;
      positions[o + 10] = y + ty;
      var pick = rnd(),
        r = pick < 0.55 ? 0.75 : pick < 0.85 ? 1 : 0.8,
        g = pick < 0.55 ? 0.86 : pick < 0.85 ? 1 : 0.72,
        b = 1;
      for (var v = 0; v < 4; v++) {
        colors[o + v * 3] = r;
        colors[o + v * 3 + 1] = g;
        colors[o + v * 3 + 2] = b;
      }
      var q = i * 4;
      index.push(q, q + 1, q + 2, q + 2, q + 1, q + 3);
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(positions, 3));
    geo.setAttribute("color", new T.BufferAttribute(colors, 3));
    geo.setIndex(index);
    var mesh = new T.Mesh(
      geo,
      new T.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: T.DoubleSide,
        blending: T.AdditiveBlending,
        fog: false,
      }),
    );
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = 950; // selalu di depan pemandangan yang ditinggalkan
    scene.add(mesh);
    return { mesh: mesh, z0: z0, lengths: lengths };
  }

  function kurvaWormhole(awal, akhir) {
    var T = three();
    var axis = akhir.clone().sub(awal);
    var span = Math.max(axis.length(), 1e-3);
    var side = new T.Vector3().crossVectors(axis, new T.Vector3(0, 1, 0));
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    var lift = new T.Vector3().crossVectors(side, axis).normalize();
    function bend(t, s, l) {
      return awal
        .clone()
        .addScaledVector(axis, t)
        .addScaledVector(side, s * span)
        .addScaledVector(lift, l * span);
    }
    return new T.CatmullRomCurve3([
      awal.clone(),
      bend(0.2, 0.18, 0.09),
      bend(0.45, -0.16, -0.11),
      bend(0.68, 0.08, 0.09),
      bend(0.86, -0.012, -0.012),
      akhir.clone(),
    ]);
  }

  /* Menjalankan lorong cahaya dari `awal` ke `akhir`, dengan pandangan tetap
     terkunci pada `sasaran`. `balik` membalik arah serat cahaya untuk
     kepulangan: bintang-bintang tampak menjauh, bukan mendekat. */
  function mulaiSelam(awal, akhir, sasaran, dur, balik) {
    var T = three();
    if (!T || !awal || !akhir || !sasaran || reducedMotion()) return Promise.resolve();
    if (!warp) warp = buatStreak();
    if (!warp) return Promise.resolve();

    if (typeof flyState !== "undefined" && flyState) flyState = null;

    camera.position.copy(awal);
    controls.target.copy(sasaran);
    controls.enabled = false;
    controls.minDistance = 0.5;
    controls.maxDistance = Math.max(
      controls.maxDistance || 0,
      Math.max(awal.distanceTo(sasaran), akhir.distanceTo(sasaran)) * 1.4,
    );
    camera.lookAt(sasaran);
    document.body.classList.add("um-selam");

    warp.mesh.visible = true;
    warp.mesh.material.opacity = 0;

    return new Promise(function (selesai) {
      state.selam = {
        curve: kurvaWormhole(awal, akhir),
        sasaran: sasaran.clone(),
        t0: performance.now(),
        dur: dur || 2600,
        balik: !!balik,
        fov: camera.fov,
        e: 0,
        streak: warp,
        selesai: selesai,
        tuntas: false,
      };
    });
  }

  /* Satu langkah animasi; dipanggil tiap frame dari tick(). */
  function langkahSelam(nowMs) {
    var s = state.selam;
    if (!s || s.tuntas) return;
    var k = Math.min(1, (nowMs - s.t0) / s.dur);
    var e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // easeInOutCubic
    e = Math.min(e, s.e + 0.05); // penjaga kalau ada frame yang terlewat
    s.e = e;

    camera.position.copy(s.curve.getPoint(e));
    camera.up.set(Math.sin(e * Math.PI * 2) * 0.07, 1, 0).normalize();
    camera.lookAt(s.sasaran);
    controls.target.copy(s.sasaran);
    camera.fov = s.fov + 10 * Math.pow(Math.sin(e * Math.PI), 2);
    camera.updateProjectionMatrix();

    var st = s.streak,
      roll = (s.balik ? -1 : 1) * k * 2200,
      array = st.mesh.geometry.attributes.position.array;
    for (var i = 0; i < st.z0.length; i++) {
      var wrapped = (((st.z0[i] - roll) % STREAK_Z) + STREAK_Z) % STREAK_Z;
      var z = -(wrapped + 12),
        zFar = z - st.lengths[i];
      array[i * 12 + 2] = z;
      array[i * 12 + 5] = z;
      array[i * 12 + 8] = zFar;
      array[i * 12 + 11] = zFar;
    }
    st.mesh.geometry.attributes.position.needsUpdate = true;
    st.mesh.position.copy(camera.position);
    st.mesh.quaternion.copy(camera.quaternion);
    st.mesh.material.opacity = Math.sin(k * Math.PI);

    if (e >= 1) {
      s.tuntas = true;
      var selesai = s.selesai;
      s.selesai = null;
      if (selesai) selesai();
    }
  }

  /* Dipanggil setelah lorong selesai (atau tirai sudah tertutup): sembunyikan
     serat, kembalikan lensa dan izinkan kamera dipakai lagi. */
  function akhiriSelam() {
    var s = state.selam;
    state.selam = null;
    if (warp) {
      warp.mesh.visible = false;
      warp.mesh.material.opacity = 0;
    }
    camera.up.set(0, 1, 0);
    if (s) {
      camera.fov = s.fov;
      camera.updateProjectionMatrix();
    }
    document.body.classList.remove("um-selam");
    controls.enabled = typeof viewMode === "undefined" || viewMode === "galaxy";
  }
  /* Tiba di ruang tanpa melintasi ruang hampa: kamera langsung ditempatkan
     sedikit lebih jauh dari bingkai ruang, lalu meluncur masuk. */
  function tibaDiRuang() {
    var T = three(),
      g = UM.galaksi;
    var c = pusat(),
      arah = arahPandang().normalize(),
      sasaran = c.clone(),
      jarak = 900;
    if (g.state.daftar.length) {
      var batas = new T.Box3();
      g.state.daftar.forEach(function (item) {
        batas.expandByPoint(item.pos);
      });
      sasaran = batas.getCenter(new T.Vector3());
      var radius = 0;
      g.state.daftar.forEach(function (item) {
        radius = Math.max(
          radius,
          sasaran.distanceTo(item.pos) + ((item.g && item.g.radius) || 140),
        );
      });
      var setengahFov = (camera.fov * Math.PI) / 360;
      var sudut = Math.min(setengahFov, Math.atan(Math.tan(setengahFov) * camera.aspect));
      jarak = (radius * 1.2) / Math.sin(sudut);
    }
    g.state.jarakRuang = jarak;
    controls.maxDistance = Math.max(controls.maxDistance, jarak * 3.5);
    camera.far = Math.max(camera.far, jarak * 5);
    camera.updateProjectionMatrix();
    var akhir = sasaran.clone().addScaledVector(arah, jarak);
    var awal = sasaran.clone().addScaledVector(arah, jarak * 3);
    if (reducedMotion()) {
      camera.position.copy(akhir);
      controls.target.copy(sasaran);
      controls.update();
      return Promise.resolve();
    }
    camera.position.copy(awal);
    controls.target.copy(sasaran);
    controls.update();
    /* Kamera menyusuri lorong cahaya dari jauh ke bingkai ruang. Saat selesai,
       `masuk`/`mulai` memanggil akhiriSelam() untuk menampilkan kembali UI. */
    return mulaiSelam(awal, akhir, sasaran, 2600, false).then(function () {
      akhiriSelam();
    });
  }

  function masuk(id) {
    if (state.pindah) return Promise.resolve();
    state.pindah = true;
    var i = indeksDari(id);
    var selam = Promise.resolve();
    /* Fase pertama: kamera mendekati butir ruang dengan penerbangan biasa.
       Lorong cahaya baru dimainkan setelah ruang selesai dimuat — bukan sejak
       masih jauh di atas galaksi. */
    if (!state.aktif && i >= 0 && (typeof viewMode === "undefined" || viewMode === "galaxy")) {
      if (typeof clearSelection === "function") clearSelection();
      var butir = posisiDunia(i);
      var arahMasuk = camera.position.clone().sub(butir);
      if (arahMasuk.lengthSq() < 1) arahMasuk.set(0, 0.6, 1);
      arahMasuk.normalize();
      controls.minDistance = 1;
      selam = terbang(butir.clone().addScaledVector(arahMasuk, DEKAT_BUTIR * 2.4), butir, 1200);
    }
    return selam
      .then(function () {
        return tutupTirai(true);
      })
      .then(function () {
        akhiriSelam(); // layar sudah hitam; aman mengembalikan kamera
        return UM.store.masukRuang(id);
      })
      .then(function () {
        return UM.galaksi.refresh();
      })
      .then(function () {
        /* Selesaikan semua lukisan galaksi ruang selagi layar masih tertutup:
           saat tirai dibuka, tidak ada cakram yang masih setengah jadi. */
        if (typeof paintFlush === "function") paintFlush();
        if (UM.sky && UM.sky.refresh) UM.sky.refresh();
        if (typeof viewMode !== "undefined" && viewMode === "sky" && typeof exitSky === "function")
          exitSky();
        var tiba = tibaDiRuang();
        tutupTirai(false);
        if (UM.ui && UM.ui.renderSemua) UM.ui.renderSemua();
        return tiba.then(function () {
          akhiriSelam();
        });
      })
      .catch(function (err) {
        akhiriSelam();
        tutupTirai(false);
        if (UM.ui && UM.ui.toast) UM.ui.toast((err && err.message) || "Ruang tidak dapat dibuka.");
      })
      .then(function () {
        akhiriSelam();
        state.pindah = false;
      });
  }

  function masukRuangku() {
    return UM.store.workspaceSaya().then(function (w) {
      if (w) return masuk(w.id);
    });
  }

  /* Keluar: kamera mundur dulu — galaksi mengecil, ruang terasa ditinggalkan —
     lalu lorong cahaya menyala untuk lompatan jauh dari ruang itu. */
  function mulaiPulang() {
    var T = three(),
      c = pusat();
    if (!T || !c || reducedMotion()) return Promise.resolve();
    var awal = camera.position.clone();
    var arah = awal.clone().sub(c);
    if (arah.lengthSq() < 1) arah.set(0, 0.6, 1);
    arah.normalize();
    var akhir = awal.clone().addScaledVector(arah, Math.max(700, awal.distanceTo(c) * 2.6));
    return mulaiSelam(awal, akhir, c, 2000, true);
  }

  /* Keluar: muncul kembali di dekat butir ruang lalu mundur sampai seluruh
     Bima Sakti terlihat. */
  function keHub() {
    if (state.pindah) return Promise.resolve();
    state.pindah = true;
    var asal = state.aktif;
    return mulaiPulang()
      .then(function () {
        return tutupTirai(true);
      })
      .then(function () {
        akhiriSelam();
        return UM.store.masukRuang(null);
      })
      .then(function () {
        return UM.galaksi.refresh();
      })
      .then(function () {
        if (UM.sky && UM.sky.refresh) UM.sky.refresh();
        return muatDaftar();
      })
      .then(function () {
        if (typeof clearSelection === "function") clearSelection();
        if (typeof showReturnBtn === "function") showReturnBtn(false);
        var i = indeksDari(asal);
        if (i >= 0) {
          var butir = posisiDunia(i);
          var keluar = butir
            .clone()
            .setY(0)
            .normalize()
            .add(new (three().Vector3)(0, 0.6, 0));
          controls.minDistance = 1;
          camera.position.copy(butir).addScaledVector(keluar.normalize(), DEKAT_BUTIR);
          controls.target.copy(butir);
          controls.update();
        }
        tutupTirai(false);
        if (UM.ui && UM.ui.renderSemua) UM.ui.renderSemua();
        return terbang(HUB_POS.clone(), new (three().Vector3)(), 3200);
      })
      .catch(function (err) {
        akhiriSelam();
        tutupTirai(false);
        if (UM.ui && UM.ui.toast)
          UM.ui.toast((err && err.message) || "Gagal kembali ke Bima Sakti.");
      })
      .then(function () {
        akhiriSelam();
        state.pindah = false;
        aturKontrolHub();
      });
  }

  /* Dipanggil setelah data pertama dimuat, dan sesudah masuk akun. */
  function mulai() {
    return muatDaftar().then(function () {
      // Animasi tiba tidak ditunggu: pemanggil (mis. layar akun) tidak boleh tertahan.
      if (state.aktif) {
        tibaDiRuang();
        /* Masuk akun membangun galaksi ruang di balik layar akun. Selesaikan
           lukisannya sekarang supaya ruang pertama yang dilihat sudah utuh,
           bukan cakram setengah jadi. */
        if (typeof paintFlush === "function") paintFlush();
      } else {
        aturKontrolHub();
        if (typeof flyHome === "function") flyHome();
      }
    });
  }

  /* ── input: tunjuk, klik, gulir keluar ─────────────────────────────────── */

  function terdekat(clientX, clientY) {
    if (state.aktif || state.pindah || !state.titik) return -1;
    if (typeof viewMode !== "undefined" && viewMode !== "galaxy") return -1;
    var rect = renderer.domElement.getBoundingClientRect();
    var best = -1,
      bestD = JARI_PX;
    for (var i = 0; i < state.lokal.length; i++) {
      tmp.copy(state.lokal[i]);
      galaxyRoot.localToWorld(tmp).project(camera);
      if (tmp.z > 1) continue;
      var x = rect.left + ((tmp.x + 1) / 2) * rect.width,
        y = rect.top + ((1 - tmp.y) / 2) * rect.height;
      var d = Math.hypot(x - clientX, y - clientY);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  function pasangInput() {
    var kanvas = renderer.domElement;
    kanvas.addEventListener("pointermove", function (e) {
      aturHover(terdekat(e.clientX, e.clientY));
      if (tip) {
        tip.style.left = e.clientX + 16 + "px";
        tip.style.top = e.clientY + 16 + "px";
      }
    });
    kanvas.addEventListener("pointerleave", function () {
      aturHover(-1);
    });
    kanvas.addEventListener("click", function (e) {
      if (typeof clickWasDrag === "function" && clickWasDrag(e)) return;
      var i = terdekat(e.clientX, e.clientY);
      if (i < 0) return;
      var w = state.daftar[i];
      if (w.terkunci) {
        if (UM.ui && UM.ui.toast) UM.ui.toast("Ruang ini masih privat.");
        return;
      }
      aturHover(-1);
      masuk(w.id);
    });
    // Di dalam ruang, menggulir menjauh di batas zoom membawa kembali ke Bima Sakti.
    kanvas.addEventListener(
      "wheel",
      function (e) {
        if (!state.aktif || !state.tiba || state.pindah || e.deltaY <= 0) {
          state.gulirKeluar = 0;
          return;
        }
        if (UM.galaksi.state.aktif) return; // sedang memandang satu galaksi
        var jarak = camera.position.distanceTo(controls.target);
        if (jarak < controls.maxDistance * 0.97) return;
        state.gulirKeluar++;
        if (state.gulirKeluar === 2 && UM.ui && UM.ui.toast)
          UM.ui.toast("Gulir sekali lagi untuk keluar ke Bima Sakti.");
        if (state.gulirKeluar >= 3) {
          state.gulirKeluar = 0;
          keHub();
        }
      },
      { passive: true },
    );
  }

  /* ── per frame ─────────────────────────────────────────────────────────── */

  function tick() {
    requestAnimationFrame(tick);
    if (!tmp) return;
    langkahSelam(performance.now());
    var t = (performance.now() - mulaiWaktu) / 1000;
    if (state.titik) state.titik.material.uniforms.uTime.value = t;
    var terbangSekarang = typeof flyState !== "undefined" && flyState;
    // Setelah tiba di ruang, batas zoom-out menjadi pintu keluar.
    if (state.aktif && !state.tiba && !state.pindah && !terbangSekarang && !state.selam) {
      state.tiba = true;
      controls.maxDistance = (UM.galaksi.state.jarakRuang || 1200) * 1.35;
    }
    // Di ruang utama tidak ada zoom-out dan tidak ada geser.
    if (!state.aktif && !state.pindah && !terbangSekarang) aturKontrolHub();
    // Label hanya untuk ruangmu sendiri; ruang lain cukup lewat tip saat ditunjuk.
    var ku = -1;
    if (!state.aktif && !state.pindah && (typeof viewMode === "undefined" || viewMode === "galaxy"))
      for (var i = 0; i < state.daftar.length; i++) if (state.daftar[i].milikku) ku = i;
    if (!labelKu) return;
    if (ku < 0) {
      labelKu.style.opacity = "0";
      return;
    }
    var rect = renderer.domElement.getBoundingClientRect();
    tmp.copy(state.lokal[ku]);
    galaxyRoot.localToWorld(tmp).project(camera);
    if (tmp.z > 1) {
      labelKu.style.opacity = "0";
      return;
    }
    labelKu.style.opacity = "";
    labelKu.style.transform =
      "translate(" +
      (rect.left + ((tmp.x + 1) / 2) * rect.width) +
      "px," +
      (rect.top + ((1 - tmp.y) / 2) * rect.height + 10) +
      "px) translateX(-50%)";
  }

  function pasangKait() {
    if (!three() || typeof renderer === "undefined") return;
    tmp = new (three().Vector3)();
    mulaiWaktu = performance.now();
    pastikanDom();
    pasangInput();
    sinkron(null);
    aturKontrolHub();
    requestAnimationFrame(tick);
  }

  return {
    pasangKait: pasangKait,
    mulai: mulai,
    sinkron: sinkron,
    muatDaftar: muatDaftar,
    masuk: masuk,
    masukRuangku: masukRuangku,
    keHub: keHub,
    pusat: pusat,
    arahPandang: arahPandang,
    state: state,
    /* dipakai pengujian */
    _posisiLokal: posisiLokal,
    _pusatDari: pusatDari,
  };
})();
