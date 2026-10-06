/* Untukmu — Peta.
 *
 * Kubah langit milik engine dipakai sebagai layar navigasi. Dua lapisan:
 *
 *   Astronomi  → 25 rasi bintang asli (SKY_CONS), tidak diubah sama sekali
 *   Kenangan   → satu bintang yang dapat dipilih per galaksi orang
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
  var kaitTerpasang = false;
  var pointer = null, dragging = false;
  var refreshVersion = 0;

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
    var T = three(), geometry = new T.BufferGeometry();
    var position = item.dir.clone().multiplyScalar(SKY_R * 0.96);
    geometry.setAttribute('position', new T.Float32BufferAttribute([position.x, position.y, position.z], 3));
    item.marker = new T.Points(geometry, new T.PointsMaterial({
      color: warnaAman(item.g.warna), size: 22, sizeAttenuation: false,
      map: GLOW_TEX, transparent: true, depthWrite: false, blending: T.AdditiveBlending
    }));
    item.marker.name = 'kenangan-' + item.g.id;
    skyScene.add(item.marker);
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'um-memory-star';
    el.style.display = 'none';
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
      '<span class="um-memory-tooltip" role="tooltip"><b><span class="dot" style="background:' + warnaAman(item.g.warna) + '"></span>' + esc(item.g.nama) + '</b>' +
      '<small>' + item.nPesan + ' ' + esc(UM.i18n.t('commonPesan')) + ' · ' + (item.nDoaTertulis + item.nBatu) + ' ' + esc(UM.i18n.t('commonDoa')) + '</small></span>';
    item.el.setAttribute('aria-label', 'Kunjungi kenangan ' + item.g.nama + ', ' + item.nPesan + ' pesan dan ' + (item.nDoaTertulis + item.nBatu) + ' doa');
  }

  function segarkanTeks() { state.daftar.forEach(tulisPenanda); }

  function perbaruiLabel() {
    if (!host) return;
    var tampil = typeof viewMode !== 'undefined' && viewMode === 'sky' && state.mode === 'kenangan';
    host.style.display = tampil ? 'block' : 'none';
    if (!tampil) return;
    var rect = renderer.domElement.getBoundingClientRect(), hovered = null, distance = 22 * 22;
    skyCamera.updateMatrixWorld();
    for (var i = 0; i < state.daftar.length; i++) {
      var item = state.daftar[i];
      tmpV.copy(item.dir).multiplyScalar(SKY_R * 0.96).project(skyCamera);
      var vis = tmpV.z > -1 && tmpV.z < 1 && Math.abs(tmpV.x) < 1 && Math.abs(tmpV.y) < 1;
      item.el.style.display = vis ? 'block' : 'none'; item.terlihat = vis;
      if (!vis) { item.el.classList.remove('is-hovered'); continue; }
      var x = rect.left + (tmpV.x * 0.5 + 0.5) * rect.width;
      var y = rect.top + (-tmpV.y * 0.5 + 0.5) * rect.height;
      item.el.style.left = x + 'px'; item.el.style.top = y + 'px';
      var tip = item.el.firstChild, width = tip.offsetWidth;
      var shift = Math.max(12 - x + width / 2, Math.min(0, innerWidth - 12 - x - width / 2));
      item.el.style.setProperty('--um-tip-shift', shift + 'px');
      item.el.classList.toggle('tip-above', y + tip.offsetHeight + 38 > innerHeight - 100);
      if (pointer && !dragging) {
        var d = Math.pow(x - pointer.x, 2) + Math.pow(y - pointer.y, 2);
        if (d < distance) { distance = d; hovered = item; }
      }
    }
    state.daftar.forEach(function(item) { item.el.classList.toggle('is-hovered', item === hovered); });
  }

  /* ── membangun ulang dari data ───────────────────────────────────────────── */

  function refresh() {
    if (!engineSiap()) return Promise.resolve(false);
    var version = ++refreshVersion;
    return Promise.all([(UM.store.listGalaksiLadang || UM.store.listGalaksi)(), (UM.store.listPesanLadang || UM.store.listPesan)()]).then(function (r) {
      if (version !== refreshVersion) return false;
      var galaksi = r[0], pesan = r[1];
      pastikanHost();

      // Use the same entry types and all destinations as the galaxy labels.
      var catatanPer = {};
      pesan.forEach(function (p) {
        if (p.sendiri === false && !p.piringan) return;
        var tujuan = p.galaksiIds && p.galaksiIds.length ? p.galaksiIds : [p.galaksiId];
        tujuan.forEach(function(id) { if (id) (catatanPer[id] = catatanPer[id] || []).push(p); });
      });

      // penanda lama dibuang; jumlah galaksi sedikit sehingga membangun ulang
      // seluruhnya lebih sederhana daripada mencocokkan satu per satu
      var focusedId = null;
      state.daftar.forEach(function (item) {
        if (document.activeElement === item.el) focusedId = item.g.id;
        if (item.el && item.el.parentNode) item.el.parentNode.removeChild(item.el);
        if (item.marker) { skyScene.remove(item.marker); item.marker.geometry.dispose(); item.marker.material.dispose(); }
      });
      state.daftar = [];

      galaksi.forEach(function (g) {
        var jumlah = UM.galaksi.hitungCatatan(catatanPer[g.id]);
        var item = {
          g: g, dir: arahDariId(g.id), terlihat: false,
          nPesan: jumlah.pesan, nDoaTertulis: jumlah.doaTertulis, nBatu: jumlah.doaDiterima
        };
        state.daftar.push(item);
        bangunPenanda(item);
      });

      state.siap = true;
      terapkanMode();
      perbaruiLabel();
      if (focusedId) {
        var focused = state.daftar.find(function(item) { return item.g.id === focusedId; });
        if (focused && focused.terlihat) focused.el.focus({ preventScroll: true });
      }
      return true;
    });
  }

  /* ── mode: astronomi ↔ kenangan ──────────────────────────────────────────── */

  function setMode(mode) {
    if (typeof clearSkySelection === 'function') clearSkySelection();
    state.mode = (mode === 'astronomi') ? 'astronomi' : 'kenangan';
    document.body.setAttribute('data-sky-mode', state.mode);
    terapkanMode();
    perbaruiLabel();
    return state.mode;
  }
  function getMode() { return state.mode; }

  function terapkanMode() {
    if (!engineSiap()) return;
    var kenangan = state.mode === 'kenangan';
    document.body.setAttribute('data-sky-mode', state.mode);

    if (typeof SKY_CONS !== 'undefined') {
      SKY_CONS.forEach(function (c) {
        c.lineMat.visible = !kenangan;
        // Keep the original stars in both layers; only constellation lines
        // and deep-sky galaxy markers belong to the astronomy layer.
        c.starMat.visible = true;
        // label engine memakai cache `shown`; dipaksa salah supaya frame
        // berikutnya menghitung ulang tampil/sembunyi dengan benar
        c.shown = false;
      });
    }
    if (typeof SKY_GAL !== 'undefined') SKY_GAL.forEach(function (g) { g.sprite.visible = !kenangan; g.shown = false; });
    state.daftar.forEach(function(item) { item.marker.visible = kenangan; });
    if (host) host.style.display = 'none';
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
    pointer = null;
    if (document.body) document.body.classList.remove('um-sky');
    if (host) host.style.display = 'none';
  }

  // Pick stars/lines at their projected world positions. Hidden DOM labels
  // are never used as hit targets, so orbiting the camera moves each target
  // together with the geometry, rather than clamping a name to the edge.
  function pilihDiKanvas(e) {
    if (typeof viewMode === 'undefined' || viewMode !== 'sky' || clickWasDrag(e)) return;
    var rect = renderer.domElement.getBoundingClientRect(), best = null, distance = 18 * 18;
    skyCamera.updateMatrixWorld();
    function project(dir, radius) {
      var v = dir.clone().multiplyScalar(radius).project(skyCamera);
      if (v.z < -1 || v.z > 1) return null;
      return { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height };
    }
    function candidate(point, target) {
      if (!point) return;
      var d = Math.pow(point.x - e.clientX, 2) + Math.pow(point.y - e.clientY, 2);
      if (d < distance) { distance = d; best = target; }
    }
    if (state.mode === 'kenangan') {
      state.daftar.forEach(function(item) { candidate(project(item.dir, SKY_R * 0.96), { galaxy: item.g.id }); });
    } else {
      SKY_CONS.forEach(function(c, index) {
        var stars = c.z.stars.map(function(s) { return project(raDecDir(s[0], s[1]), SKY_R); });
        stars.forEach(function(p) { candidate(p, { constellation: index }); });
        c.z.lines.forEach(function(line) {
          var a = stars[line[0]], b = stars[line[1]];
          if (!a || !b) return;
          var dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
          var t = length ? Math.max(0, Math.min(1, ((e.clientX - a.x) * dx + (e.clientY - a.y) * dy) / length)) : 0;
          candidate({ x: a.x + t * dx, y: a.y + t * dy }, { constellation: index });
        });
      });
      SKY_GAL.forEach(function(g, index) { candidate(project(g.dir, SKY_R), { deepSky: index }); });
    }
    if (!best) return;
    e.stopPropagation();
    if (best.galaxy) terbangKeGalaksi(best.galaxy);
    else if (best.constellation != null) selectSky(best.constellation);
    else selectSkyGal(best.deepSky);
  }

  function pasangKait() {
    if (kaitTerpasang) return true;
    var T = three();
    if (!T || typeof skyScene === 'undefined' || !skyScene) return false;
    tmpV = new T.Vector3();
    pastikanHost();
    renderer.domElement.addEventListener('click', pilihDiKanvas);
    renderer.domElement.addEventListener('pointermove', function(e) { pointer = { x: e.clientX, y: e.clientY }; perbaruiLabel(); });
    renderer.domElement.addEventListener('pointerleave', function() { pointer = null; perbaruiLabel(); });
    renderer.domElement.addEventListener('pointerdown', function() { dragging = true; pointer = null; perbaruiLabel(); });
    window.addEventListener('pointerup', function() { dragging = false; pointer = null; perbaruiLabel(); });
    kaitTerpasang = true;

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
