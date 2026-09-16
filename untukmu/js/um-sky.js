/* Untukmu — Peta.
 *
 * Kubah langit milik engine dipakai sebagai layar navigasi. Dua lapisan:
 *
 *   Astronomi  → 25 rasi bintang asli (SKY_CONS), tidak diubah sama sekali
 *   Kenangan   → satu penanda per galaksi orang, berlabel nama + jumlah
 *
 * Mengklik penanda tidak membuka kartu di sini, melainkan menutup Peta dan
 * menerbangkan kamera ke galaksi itu di ladang 3D (UM.galaksi). Jadi Peta
 * benar-benar berfungsi sebagai navigasi, bukan sekadar hiasan.
 *
 * Catatan nama: engine memakai "constellation" untuk rasi astronomi. Produk
 * memakai "galaksi" untuk orang. Keduanya sengaja tidak dicampur.
 */
window.UM = window.UM || {};

UM.sky = (function () {
  var state = {
    mode: 'kenangan',   // 'kenangan' | 'astronomi'
    pendingMode: null,
    daftar: [],         // { g, dir, el, terlihat }
    siap: false
  };

  var host = null;
  var tmpV = null;

  function three() { return typeof THREE !== 'undefined' ? THREE : null; }
  function engineSiap() {
    return three() && typeof skyScene !== 'undefined' && skyScene && typeof SKY_R === 'number' &&
      typeof skyCamera !== 'undefined' && skyCamera;
  }

  /* ── arah penanda: stabil per id, sama seperti posisi di ladang 3D ───────── */

  /* RNG lokal, bukan milik engine: kalau bergantung pada fungsi global dan
     fungsi itu tidak ada, modul ini diam-diam jatuh ke Math.random dan penanda
     berpindah setiap kali Peta dibuka. Algoritmanya sama dengan engine. */
  function rngDariSeed(seed) {
    var st = seed >>> 0;
    return function () {
      st += 0x6d2b79f5;
      var v = st;
      v = Math.imul(v ^ (v >>> 15), v | 1);
      v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
      return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
    };
  }

  function arahDariId(id) {
    var h = 2166136261, s = String(id);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    var r = rngDariSeed(h >>> 0);
    var u = r() * 2 - 1, phi = r() * Math.PI * 2, k = Math.sqrt(Math.max(0, 1 - u * u));
    return new (three().Vector3)(k * Math.cos(phi), u * 0.7, k * Math.sin(phi)).normalize();
  }

  /* ── penanda DOM ─────────────────────────────────────────────────────────── */

  function pastikanHost() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'um-petalabels';
    host.style.display = 'none';
    document.body.appendChild(host);
  }

  function warnaAman(c) { return /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#ffd9a0'; }

  function bangunPenanda(item) {
    var el = document.createElement('div');
    el.className = 'um-plabel';
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      terbangKeGalaksi(item.g.id);
    });
    host.appendChild(el);
    item.el = el;
    tulisPenanda(item);
  }

  function tulisPenanda(item) {
    if (!item.el) return;
    item.el.innerHTML =
      '<b><span class="dot" style="background:' + warnaAman(item.g.warna) + '"></span>' + esc(item.g.nama) + '</b>' +
      '<small>' + item.nPesan + ' ' + esc(UM.i18n.t('commonPesan')) + ' · ' + item.nBatu + ' ' + esc(UM.i18n.t('commonDoa')) + '</small>';
    item.el.title = item.g.nama;
  }

  function segarkanTeks() { state.daftar.forEach(tulisPenanda); }

  function perbaruiLabel() {
    if (!host) return;
    var tampil = typeof viewMode !== 'undefined' && viewMode === 'sky' && state.mode === 'kenangan';
    host.style.display = tampil ? '' : 'none';
    if (!tampil) return;
    for (var i = 0; i < state.daftar.length; i++) {
      var item = state.daftar[i];
      tmpV.copy(item.dir).multiplyScalar(SKY_R * 0.96).project(skyCamera);
      var vis = tmpV.z < 1 && tmpV.x > -1.1 && tmpV.x < 1.1 && tmpV.y > -1.1 && tmpV.y < 1.1;
      if (vis !== item.terlihat) { item.el.style.display = vis ? '' : 'none'; item.terlihat = vis; }
      if (vis) {
        item.el.style.left = ((tmpV.x * 0.5 + 0.5) * window.innerWidth) + 'px';
        item.el.style.top = ((-tmpV.y * 0.5 + 0.5) * window.innerHeight) + 'px';
      }
    }
  }

  /* ── membangun ulang dari data ───────────────────────────────────────────── */

  function refresh() {
    if (!engineSiap()) return Promise.resolve(false);
    return Promise.all([UM.store.listGalaksi(), UM.store.listPesan()]).then(function (r) {
      var galaksi = r[0], pesan = r[1];
      pastikanHost();

      /* Dihitung dengan pembagian yang sama seperti di ladang galaksi:
           piringan → pesan yang kamu tulis sendiri
           sabuk    → pesan dari orang lain
         Tanpa ini, label Peta akan menampilkan 38 pesan untuk Ibu (termasuk
         butir sabuk) sementara kartu galaksinya menampilkan 4. */
      var nPesan = {}, nBatu = {};
      pesan.forEach(function (p) {
        if (p.sendiri === false) nBatu[p.galaksiId] = (nBatu[p.galaksiId] || 0) + 1;
        else nPesan[p.galaksiId] = (nPesan[p.galaksiId] || 0) + 1;
      });

      // penanda lama dibuang; jumlah galaksi sedikit sehingga membangun ulang
      // seluruhnya lebih sederhana daripada mencocokkan satu per satu
      state.daftar.forEach(function (item) { if (item.el && item.el.parentNode) item.el.parentNode.removeChild(item.el); });
      state.daftar = [];

      galaksi.forEach(function (g) {
        var item = {
          g: g, dir: arahDariId(g.id), terlihat: false,
          nPesan: nPesan[g.id] || 0, nBatu: nBatu[g.id] || 0
        };
        state.daftar.push(item);
        bangunPenanda(item);
      });

      state.siap = true;
      terapkanMode();
      perbaruiLabel();
      return true;
    });
  }

  /* ── mode: astronomi ↔ kenangan ──────────────────────────────────────────── */

  function setMode(mode) {
    state.mode = (mode === 'astronomi') ? 'astronomi' : 'kenangan';
    terapkanMode();
    perbaruiLabel();
    return state.mode;
  }
  function getMode() { return state.mode; }

  function terapkanMode() {
    if (!engineSiap()) return;
    var kenangan = state.mode === 'kenangan';

    if (typeof SKY_CONS !== 'undefined') {
      SKY_CONS.forEach(function (c) {
        c.lineMat.visible = !kenangan;
        c.starMat.visible = !kenangan;
        // label engine memakai cache `shown`; dipaksa salah supaya frame
        // berikutnya menghitung ulang tampil/sembunyi dengan benar
        c.shown = false;
      });
    }
    if (typeof SKY_GAL !== 'undefined') SKY_GAL.forEach(function (g) { g.sprite.visible = !kenangan; g.shown = false; });
    if (host) host.style.display = (typeof viewMode !== 'undefined' && viewMode === 'sky' && kenangan) ? '' : 'none';
    if (document.body) document.body.classList.toggle('um-sky', typeof viewMode !== 'undefined' && viewMode === 'sky');
  }

  /* ── navigasi: keluar dari Peta, terbang ke galaksi ──────────────────────── */

  function terbangKeGalaksi(galaksiId) {
    if (typeof exitSky === 'function' && typeof viewMode !== 'undefined' && viewMode === 'sky') exitSky();
    var item = null;
    for (var i = 0; i < UM.galaksi.state.daftar.length; i++) {
      if (UM.galaksi.state.daftar[i].g.id === galaksiId) { item = UM.galaksi.state.daftar[i]; break; }
    }
    if (item) UM.galaksi.terbangKe(item);
    return !!item;
  }

  /* ── kaitan ke siklus hidup engine ───────────────────────────────────────── */

  function onEnter() {
    if (document.body) document.body.classList.add('um-sky');
    if (state.pendingMode) { state.mode = state.pendingMode; state.pendingMode = null; }
    terapkanMode();
    perbaruiLabel();
  }
  function onExit() {
    if (document.body) document.body.classList.remove('um-sky');
    if (host) host.style.display = 'none';
  }

  function pasangKait() {
    var T = three();
    if (!T || typeof skyScene === 'undefined' || !skyScene) return false;
    tmpV = new T.Vector3();
    pastikanHost();

    // label engine tetap dijalankan; kita menambahkan penanda Peta di atasnya,
    // sekaligus memakai panggilan per frame ini untuk memproyeksikan penanda
    var asliLabels = window.updateSkyLabels;
    window.updateSkyLabels = function () {
      if (typeof asliLabels === 'function') asliLabels.apply(this, arguments);
      perbaruiLabel();
    };

    // tombol Back langit menyimpan referensi fungsi asli, jadi perlu kait sendiri
    var back = document.getElementById('skyback');
    if (back) back.addEventListener('click', function () { onExit(); }, true);

    return true;
  }

  return {
    refresh: refresh, setMode: setMode, getMode: getMode,
    pasangKait: pasangKait, onEnter: onEnter, onExit: onExit,
    segarkanTeks: segarkanTeks, perbaruiLabel: perbaruiLabel,
    terbangKeGalaksi: terbangKeGalaksi,
    state: state,
    _arahDariId: arahDariId
  };
})();
