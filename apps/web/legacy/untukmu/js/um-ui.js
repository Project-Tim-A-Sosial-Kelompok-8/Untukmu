/* Untukmu — seluruh antarmuka produk.
 *
 * Layar: pembuka, penulis pesan (4 langkah, termasuk pemilih bentuk galaksi),
 * ruang pribadi, jelajah, modal doa, modal kunci enkripsi, pengaturan, dock,
 * dan kartu galaksi / bintang / batu.
 *
 * Kartu sengaja ditulis ke #beacon-panel milik engine supaya mendapat panel
 * kanan di desktop, bottom drawer di mobile, dan gaya tipografi yang konsisten.
 *
 * Setiap layar memakai event delegation pada elemen akarnya, sehingga penggantian
 * bahasa cukup membangun ulang innerHTML tanpa memasang ulang listener.
 */
window.UM = window.UM || {};

UM.ui = (function () {
  function T(k) { return UM.i18n.t(k); }

  /* ── pembantu DOM ────────────────────────────────────────────────────────── */

  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function escAttr(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function teks(s) { return escAttr(s).replace(/\n/g, '<br>'); }
  function warnaAman(c) { return /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#ffd9a0'; }
  function ntah(ms) { return UM.i18n.tanggal(ms); }

  function badge(privasi) {
    var map = { privat: ['privat', 'stPrivat', '🔒'], publik: ['publik', 'stPublik', '✦'], unlisted: ['unlisted', 'stUnlisted', '🔗'] };
    var m = map[privasi] || map.privat;
    return '<span class="um-badge ' + m[0] + '">' + m[2] + ' ' + teks(T(m[1])) + '</span>';
  }

  /* ── elemen tetap ────────────────────────────────────────────────────────── */

  var entryEl, compEl, dashEl, expEl, doaEl, setupEl, setEl, dockEl, brandEl, skyCtlEl, toastEl, fotoInput;
  var mounted = false;
  var kartuRequest = 0;

  /* ── keadaan ─────────────────────────────────────────────────────────────── */

  var comp = {
    step: 0, steps: ['tujuan'], galaksiId: null, baru: true,
    newNama: '', newKategori: '', newKind: 'spiral', newWarna: '#ffd9a0', newRadius: 140, newFoto: null,
    isi: '', tanggal: '', mood: '', tag: '', privasi: 'privat', err: ''
  };
  var expSort = 'baru';
  var dilaporkanLokal = {};
  var doaState = { galaksiId: null, pesanId: null, tradisi: null, entriId: null, fase: 'pick', sisa: 0, timer: null, audio: null, audioAktif: false };
  var setupErr = '';
  var recoveryTampil = null;

  /* ── lapisan layar ───────────────────────────────────────────────────────── */

  function open(s) { if (s) s.classList.add('on'); }
  function close(s) { if (s) s.classList.remove('on'); }
  function closeAllScreens() { [entryEl, compEl, dashEl, expEl, doaEl, setupEl, setEl].forEach(close); }
  function anyScreenOpen() {
    return [entryEl, compEl, dashEl, expEl, doaEl, setupEl, setEl].some(function (s) { return s && s.classList.contains('on'); });
  }
  function stopDoaTimer() {
    if (doaState.timer) { clearInterval(doaState.timer); doaState.timer = null; }
    if (doaState.audio) { try { doaState.audio.pause(); } catch (e) {} doaState.audio = null; }
  }

  var toastTimer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, 3000);
  }

  /* ── layar pembuka (PRD §9.1) ────────────────────────────────────────────── */

  function renderEntry() {
    var aman = UM.crypto.available();
    entryEl.querySelector('.um-enter').innerHTML =
      '<h1>' + teks(T('entryH1')) + '</h1>' +
      '<p class="lead">' + teks(T('entryLead')) + '</p>' +
      '<div class="acts">' +
        '<button class="um-btn primary" data-act="tulis">✎ ' + teks(T('entryActsTulis')) + '</button>' +
        '<button class="um-btn" data-act="galaksi">✦ ' + teks(T('entryActsGalaksi')) + '</button>' +
      '</div>' +
      '<p class="fine">' + (aman ? '🔒 ' : '⚠ — ') + teks(aman ? T('entryFine') : T('entryFineWarn')) + '</p>' +
      '<div class="um-btn-row" style="justify-content:center;margin-top:18px">' +
        '<button class="um-btn ghost small" data-act="skip">' + teks(T('entrySkip')) + '</button>' +
      '</div>';
  }

  function buildEntry() {
    entryEl = el('div', 'um-screen');
    entryEl.id = 'um-entry';
    entryEl.appendChild(el('div', 'um-enter'));
    entryEl.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-act]') : null;
      var act = btn && btn.getAttribute('data-act');
      if (!act) return;
      if (act === 'tulis') { close(entryEl); bukaKomposer(); }
      else if (act === 'galaksi') { close(entryEl); keLadang(); }
      else if (act === 'skip') close(entryEl);
    });
    document.body.appendChild(entryEl);
  }

  /* ── dock ────────────────────────────────────────────────────────────────── */

  function renderDock() {
    var diPeta = typeof viewMode !== 'undefined' && viewMode === 'sky';
    dockEl.innerHTML =
      '<button data-act="tulis"><span class="i">✎</span>' + teks(T('dockTulis')) + '</button>' +
      '<button data-act="doa"><span class="i">♡</span>Doa</button>' +
      '<button data-act="rumah"><span class="i">⌂</span>' + teks(T('dockRumah')) + '</button>' +
      '<button data-act="peta"' + (diPeta ? ' class="on"' : '') + '><span class="i">✧</span>' + teks(T('dockPeta')) + '</button>' +
      '<button data-act="jelajah"><span class="i">☰</span>' + teks(T('dockJelajah')) + '</button>' +
      '<button data-act="dash"><span class="i">◈</span>' + teks(T('dockDash')) + '</button>' +
      '<button data-act="setup"><span class="i">🔑</span>' + teks(T('dockSetup')) + '</button>' +
      '<button data-act="set"><span class="i">⚙</span>' + teks(T('dockSet')) + '</button>';
  }

  function buildDock() {
    dockEl = el('div', 'um-dock');
    dockEl.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('button[data-act]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'tulis') bukaKomposer();
      else if (act === 'rumah') { UM.galaksi.kembaliKeRumah(); renderDock(); renderSkyCtl(); }
      else if (act === 'peta') {
        if (typeof viewMode !== 'undefined' && viewMode === 'sky') { if (typeof exitSky === 'function') exitSky(); }
        else kePeta();
      }
      else if (act === 'jelajah') bukaJelajah();
      else if (act === 'doa') bukaJelajah();
      else if (act === 'dash') bukaDash();
      else if (act === 'setup') bukaSetup();
      else if (act === 'set') bukaSet();
    });
    document.body.appendChild(dockEl);

    brandEl = el('div', 'um-brand',
      '<b>' + teks(T('brand')) + '</b><span>' + teks(T('brandSub')) + '</span><em>' + teks(T('brandHint')) + '</em>');
    document.body.appendChild(brandEl);

    skyCtlEl = el('div', 'um-skyctl');
    skyCtlEl.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('button[data-mode]') : null;
      if (!btn) return;
      UM.sky.setMode(btn.getAttribute('data-mode'));
      UM.sky.segarkanTeks();
      renderSkyCtl();
    });
    document.body.appendChild(skyCtlEl);

    toastEl = el('div', 'um-toast');
    document.body.appendChild(toastEl);

    fotoInput = el('input');
    fotoInput.type = 'file';
    fotoInput.accept = 'image/*';
    fotoInput.style.display = 'none';
    fotoInput.addEventListener('change', function () {
      var file = fotoInput.files && fotoInput.files[0];
      fotoInput.value = '';
      if (!file) return;
      bacaGambar(file).then(function (dataUrl) {
        comp.newFoto = dataUrl; renderKomposer();
      }).catch(function (err) {
        comp.err = (err && err.message === 'too-big') ? T('compTooBig') : '';
        renderKomposer();
      });
    });
    document.body.appendChild(fotoInput);
  }

  function renderSkyCtl() {
    if (!skyCtlEl) return;
    var mode = UM.sky.getMode();
    var diPeta = typeof viewMode !== 'undefined' && viewMode === 'sky';
    skyCtlEl.innerHTML =
      '<div class="um-chips">' +
        '<button class="um-chip' + (mode === 'astronomi' ? ' on' : '') + '" data-mode="astronomi">' + teks(T('skyAstro')) + '</button>' +
        '<button class="um-chip' + (mode === 'kenangan' ? ' on' : '') + '" data-mode="kenangan">' + teks(T('skyKenangan')) + '</button>' +
      '</div>' +
      (diPeta && mode === 'kenangan' && UM.sky.state.daftar.length
        ? '<div class="um-hint">' + teks(T('petaHint')) + '</div>' : '');
  }

  /* ── masuk ke ladang galaksi / Peta ──────────────────────────────────────── */

  function keLadang() {
    UM.galaksi.masukLadang();
    return UM.galaksi.refresh().then(function () {
      UM.galaksi.bingkaiLadang();
      renderDock();
      if (!UM.galaksi.state.daftar.length) toast(T('galaksiKosong'));
      else if (!UM.galaksi.generatorAda()) toast(T('genHilang'));
    });
  }

  function kePeta() {
    UM.galaksi.masukLadang();
    UM.sky.setMode('kenangan');
    return UM.galaksi.refresh().then(function () {
      return UM.sky.refresh();
    }).then(function () {
      UM.sky.state.pendingMode = 'kenangan';
      var masuk = typeof enterSky === 'function' && enterSky('galaxy');
      if (!masuk) UM.sky.state.pendingMode = null;
      renderDock(); renderSkyCtl();
      if (masuk && !UM.sky.state.daftar.length) toast(T('galaksiKosong'));
    });
  }

  /* ── komposer (PRD §9.2) ─────────────────────────────────────────────────── */

  function hitungLangkah() {
    comp.steps = ['tujuan'].concat(comp.baru ? ['bentuk'] : []).concat(['isi', 'privasi']);
    if (comp.step >= comp.steps.length) comp.step = comp.steps.length - 1;
  }

  function bukaKomposer(galaksiId) {
    if (comp.saving) return;
    galaksiId = galaksiId || UM.galaksi.state.aktif || null;
    comp.step = 0; comp.err = ''; comp.isi = ''; comp.mood = ''; comp.tag = '';
    comp.tanggal = new Date().toISOString().slice(0, 10);
    comp.privasi = 'privat'; comp.newFoto = null;
    comp.newNama = ''; comp.newKategori = ''; comp.newKind = 'spiral'; comp.newWarna = '#ffd9a0'; comp.newRadius = 140;
    comp.galaksiId = galaksiId || null;
    comp.baru = !galaksiId;
    hitungLangkah();
    closeAllScreens(); open(compEl); renderKomposer();
  }

  function renderKomposer() {
    var request = comp.renderRequest = (comp.renderRequest || 0) + 1;
    hitungLangkah();
    var step = comp.steps[comp.step];
    var bar = comp.steps.map(function (s, i) {
      return '<div class="um-step' + (i === comp.step ? ' on' : (i < comp.step ? ' done' : '')) + '"></div>';
    }).join('');

    var petakan = function (body) {
      if (request !== comp.renderRequest || !compEl.classList.contains('on')) return;
      compEl.querySelector('.um-wrap').innerHTML =
        '<div class="um-head">' +
          '<div><div class="um-h1">' + teks(T('compTitle')) + '</div>' +
          '<div class="um-muted">' + (comp.step + 1) + ' / ' + comp.steps.length + '</div></div>' +
          '<button class="um-close" data-act="cancel" aria-label="' + escAttr(T('btnCancel')) + '">×</button>' +
        '</div>' +
        '<div class="um-steps">' + bar + '</div>' +
        '<div class="um-card">' + body + '</div>';
    };
    if (step === 'tujuan') {
      petakan('<p class="um-muted" role="status">Memuat pilihan kenangan…</p>');
      stepTujuan().then(petakan).catch(function (err) { petakan('<div class="um-error" role="alert">' + escAttr(err.message || 'Tujuan gagal dimuat.') + '</div><div class="um-btn-row"><button class="um-btn" data-act="retry">Coba lagi</button><button class="um-btn" data-act="cancel">Tutup</button></div>'); }); return;
    }
    petakan(step === 'bentuk' ? stepBentuk() : step === 'isi' ? stepIsi() : stepPrivasi());
  }

  function stepTujuan() {
    return UM.store.listGalaksi().then(function (rows) {
      var chips = rows.map(function (g) {
        return '<button class="um-chip' + (!comp.baru && comp.galaksiId === g.id ? ' on' : '') + '" data-act="pick-galaksi" data-id="' + escAttr(g.id) + '">' +
          '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + warnaAman(g.warna) + '"></span>' +
          escAttr(g.nama) + '</button>';
      }).join('');
      var kat = UM.i18n.kategoriIds().map(function (k) {
        return '<button class="um-chip' + (comp.newKategori === k ? ' on' : '') + '" data-act="cat" data-id="' + escAttr(k) + '">' + escAttr(UM.i18n.kategori(k)) + '</button>';
      }).join('');

      var isi = '<div class="um-h2">' + teks(T('c1Title')) + '</div>';
      if (chips) {
        isi += '<div class="um-chips" style="margin-bottom:12px">' + chips +
          '<button class="um-chip' + (comp.baru ? ' on' : '') + '" data-act="baru">' + teks(T('c1Baru')) + '</button></div>';
      }
      if (comp.baru) {
        isi += '<div class="um-field">' +
            '<label class="um-label" for="um-nama">' + teks(T('c1Label')) + '</label>' +
            '<input class="um-input" id="um-nama" data-field="nama" value="' + escAttr(comp.newNama) + '" placeholder="' + escAttr(T('c1Ph')) + '">' +
          '</div>' +
          '<div class="um-field">' +
            '<div class="um-label">' + teks(T('c1Cat')) + '</div>' +
            '<div class="um-chips">' + kat + '</div>' +
          '</div>';
      } else {
        var tujuan = rows.find(function (g) { return g.id === comp.galaksiId; });
        isi += '<div class="um-note" role="status">Ucapan akan disimpan di galaksi <strong>' + escAttr(tujuan ? tujuan.nama : '') + '</strong>. Pilih galaksi lain di atas untuk mengganti tujuan.</div>';
      }
      return isi +
        '<div class="um-error">' + escAttr(comp.err) + '</div>' +
        '<div class="um-btn-row end">' +
          '<button class="um-btn ghost" data-act="cancel">' + teks(T('btnCancel')) + '</button>' +
          '<button class="um-btn primary" data-act="next">' + teks(T('btnNext')) + ' →</button>' +
        '</div>';
    });
  }

  /* Pratinjau bentuk galaksi: SVG kecil, warna mengikuti pilihan pengguna. */
  function svgBentuk(kind, warna) {
    var w = warnaAman(warna);
    if (kind === 'spiral') {
      return '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">' +
        '<circle cx="32" cy="32" r="4" fill="' + w + '"/>' +
        '<path d="M32 32 C46 30 52 40 44 48 C36 56 22 50 20 38" fill="none" stroke="' + w + '" stroke-width="2.4" stroke-linecap="round" opacity=".85"/>' +
        '<path d="M32 32 C18 34 12 24 20 16 C28 8 42 14 44 26" fill="none" stroke="' + w + '" stroke-width="2.4" stroke-linecap="round" opacity=".85"/>' +
        '</svg>';
    }
    if (kind === 'ellipsoid') {
      return '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">' +
        '<defs><radialGradient id="um-el"><stop offset="0%" stop-color="#fff6e6"/><stop offset="55%" stop-color="' + w + '"/><stop offset="100%" stop-color="' + w + '" stop-opacity="0"/></radialGradient></defs>' +
        '<ellipse cx="32" cy="32" rx="26" ry="18" fill="url(#um-el)" opacity=".9"/></svg>';
    }
    return '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">' +
      '<ellipse cx="27" cy="34" rx="17" ry="10" fill="' + w + '" opacity=".8" transform="rotate(-18 27 34)"/>' +
      '<ellipse cx="42" cy="26" rx="9" ry="7" fill="' + w + '" opacity=".6"/>' +
      '<circle cx="47" cy="38" r="3.4" fill="#fff0d8" opacity=".9"/></svg>';
  }

  function stepBentuk() {
    var bentuk = [
      { kind: 'spiral', kunci: 'bentukSpiral', ket: 'bentukSpiralD' },
      { kind: 'ellipsoid', kunci: 'bentukEllipsoid', ket: 'bentukEllipsoidD' },
      { kind: 'irregular', kunci: 'bentukIrregular', ket: 'bentukIrregularD' }
    ];
    var warna = ['#ffd9a0', '#9cc0ff', '#f0a5b8', '#8fd8c8', '#c4b5fd', '#fca5a5'];
    var ukuran = [{ r: 110, k: 'ukuranKecil' }, { r: 140, k: 'ukuranSedang' }, { r: 175, k: 'ukuranBesar' }];

    return '<div class="um-h2">' + teks(T('bentukTitle')) + '</div>' +
      '<div class="um-bentuk">' + bentuk.map(function (b) {
        return '<button class="um-bentuk-opt' + (comp.newKind === b.kind ? ' on' : '') + '" data-act="kind" data-id="' + b.kind + '">' +
          svgBentuk(b.kind, comp.newWarna) +
          '<span class="t">' + teks(T(b.kunci)) + '</span>' +
          '<span class="d">' + teks(T(b.ket)) + '</span></button>';
      }).join('') + '</div>' +
      '<div class="um-field" style="margin-top:16px">' +
        '<div class="um-label">' + teks(T('bentukWarna')) + '</div>' +
        '<div class="um-chips">' + warna.map(function (c) {
          return '<button class="um-chip' + (comp.newWarna === c ? ' on' : '') + '" data-act="warna" data-id="' + c + '" style="border-color:' + c + '">' +
            '<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:' + c + '"></span></button>';
        }).join('') + '</div>' +
      '</div>' +
      '<div class="um-field">' +
        '<div class="um-label">' + teks(T('bentukUkuran')) + '</div>' +
        '<div class="um-chips">' + ukuran.map(function (u) {
          return '<button class="um-chip' + (comp.newRadius === u.r ? ' on' : '') + '" data-act="ukuran" data-id="' + u.r + '">' + teks(T(u.k)) + '</button>';
        }).join('') + '</div>' +
        '<div class="um-hint">' + teks(T('bentukHint')) + '</div>' +
      '</div>' +
      '<div class="um-error">' + escAttr(comp.err) + '</div>' +
      '<div class="um-btn-row between">' +
        '<button class="um-btn ghost" data-act="back">← ' + teks(T('btnBack')) + '</button>' +
        '<button class="um-btn primary" data-act="next">' + teks(T('btnNext')) + ' →</button>' +
      '</div>';
  }

  function stepIsi() {
    var moods = UM.i18n.moodIds().map(function (m) {
      return '<button class="um-chip' + (comp.mood === m ? ' on' : '') + '" data-act="mood" data-id="' + escAttr(m) + '">' + escAttr(UM.i18n.mood(m)) + '</button>';
    }).join('');
    return '<div class="um-h2">' + teks(T('c3Title')) + '</div>' +
      '<div class="um-field">' +
        '<label class="um-label" for="um-isi">' + teks(T('c3Isi')) + '</label>' +
        '<textarea class="um-textarea" id="um-isi" data-field="isi" placeholder="' + escAttr(T('c3IsiPh')) + '">' + escAttr(comp.isi) + '</textarea>' +
      '</div>' +
      '<div class="um-grid2">' +
        '<div class="um-field"><label class="um-label" for="um-tanggal">' + teks(T('c3Tanggal')) + '</label>' +
        '<input class="um-input" id="um-tanggal" type="date" data-field="tanggal" value="' + escAttr(comp.tanggal) + '"></div>' +
        '<div class="um-field"><label class="um-label" for="um-tag">' + teks(T('c3Tag')) + '</label>' +
        '<input class="um-input" id="um-tag" data-field="tag" value="' + escAttr(comp.tag) + '" placeholder="' + escAttr(T('c3TagPh')) + '">' +
        '<div class="um-hint">' + teks(T('c3TagHint')) + '</div></div>' +
      '</div>' +
      '<div class="um-field"><div class="um-label">' + teks(T('c3Mood')) + '</div>' +
      '<div class="um-chips">' + moods + '</div></div>' +
      '<div class="um-error">' + escAttr(comp.err) + '</div>' +
      '<div class="um-btn-row between">' +
        '<button class="um-btn ghost" data-act="back">← ' + teks(T('btnBack')) + '</button>' +
        '<button class="um-btn primary" data-act="next">' + teks(T('btnNext')) + ' →</button>' +
      '</div>';
  }

  function stepPrivasi() {
    var opts = [['privat', 'privPrivat', 'privPrivatD'], ['publik', 'privPublik', 'privPublikD'], ['unlisted', 'privUnlisted', 'privUnlistedD']];
    return '<div class="um-h2">' + teks(T('c4Title')) + '</div>' +
      '<div class="um-priv">' + opts.map(function (o) {
        return '<button class="um-priv-opt' + (comp.privasi === o[0] ? ' on' : '') + '" data-act="priv" data-id="' + o[0] + '">' +
          '<span class="mark"></span><span><span class="t">' + teks(T(o[1])) + '</span><span class="d">' + teks(T(o[2])) + '</span></span></button>';
      }).join('') + '</div>' +
      '<div class="um-note">' + teks(T('c4Note')) + '</div>' +
      '<div class="um-error">' + escAttr(comp.err) + '</div>' +
      '<div class="um-btn-row between">' +
        '<button class="um-btn ghost" data-act="back">← ' + teks(T('btnBack')) + '</button>' +
        '<button class="um-btn primary" data-act="save">✦ ' + teks(T('btnSave')) + '</button>' +
      '</div>';
  }

  function serapInput() {
    var w = compEl.querySelector('.um-wrap');
    if (!w) return;
    var n = w.querySelector('[data-field="nama"]'); if (n) comp.newNama = n.value;
    var i = w.querySelector('[data-field="isi"]'); if (i) comp.isi = i.value;
    var t = w.querySelector('[data-field="tanggal"]'); if (t) comp.tanggal = t.value;
    var g = w.querySelector('[data-field="tag"]'); if (g) comp.tag = g.value;
  }

  function validasiLangkah() {
    var step = comp.steps[comp.step];
    comp.err = '';
    if (step === 'tujuan' && comp.baru && !comp.newNama.trim()) { comp.err = T('errNama'); return false; }
    if (step === 'isi' && !comp.isi.trim()) { comp.err = T('errIsi'); return false; }
    if (step === 'privasi' && comp.privasi === 'privat' && !UM.crypto.unlocked()) { comp.err = T('errPrivatLocked'); return false; }
    return true;
  }

  /* Menyimpan pesan beserta identitas bintangnya untuk ditampilkan di tujuan. */
  function simpanPesan() {
    var galaksiBaru = comp.baru ? UM.store.saveGalaksiBaru({
      nama: comp.newNama.trim(),
      kategori: comp.newKategori || 'lain-lain',
      kind: comp.newKind,
      warna: comp.newWarna,
      radius: comp.newRadius,
      count: comp.newRadius >= 160 ? 10000 : (comp.newRadius <= 120 ? 7000 : 8500),
      foto: comp.newFoto,
      seed: false
    }) : Promise.resolve({ id: comp.galaksiId });

    var tagList = String(comp.tag || '').split(',').map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length; }).slice(0, 5);

    return galaksiBaru.then(function (g) {
      return UM.store.simpanPesan({
        galaksiId: g.id, teks: comp.isi, privasi: comp.privasi,
        tanggal: comp.tanggal || null, mood: comp.mood || null,
        tag: tagList, dibuat: Date.now()
      }).then(function (pesan) { return { galaksiId: g.id, pesanId: pesan.id }; });
    });
  }

  function buildKomposer() {
    compEl = el('div', 'um-screen z-top');
    compEl.id = 'um-comp';
    compEl.appendChild(el('div', 'um-wrap narrow'));
    compEl.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (comp.saving) return;
      if (act === 'retry') { renderKomposer(); return; }
      if (act === 'cancel') { close(compEl); return; }
      if (act === 'baru') { comp.baru = true; comp.galaksiId = null; comp.err = ''; renderKomposer(); return; }
      if (act === 'pick-galaksi') { comp.baru = false; comp.galaksiId = btn.getAttribute('data-id'); comp.err = ''; renderKomposer(); return; }
      if (act === 'cat') { comp.newKategori = btn.getAttribute('data-id'); renderKomposer(); return; }
      if (act === 'kind') { comp.newKind = btn.getAttribute('data-id'); renderKomposer(); return; }
      if (act === 'warna') { comp.newWarna = btn.getAttribute('data-id'); renderKomposer(); return; }
      if (act === 'ukuran') { comp.newRadius = parseInt(btn.getAttribute('data-id'), 10); renderKomposer(); return; }
      if (act === 'upload') { fotoInput.click(); return; }
      if (act === 'mood') { comp.mood = (comp.mood === btn.getAttribute('data-id')) ? '' : btn.getAttribute('data-id'); serapInput(); renderKomposer(); return; }
      if (act === 'priv') { comp.privasi = btn.getAttribute('data-id'); comp.err = ''; renderKomposer(); return; }
      if (act === 'back') { serapInput(); comp.step = Math.max(0, comp.step - 1); comp.err = ''; renderKomposer(); return; }
      if (act === 'next') {
        serapInput();
        if (!validasiLangkah()) { renderKomposer(); return; }
        comp.step = Math.min(comp.steps.length - 1, comp.step + 1);
        renderKomposer(); return;
      }
      if (act === 'save') {
        if (!validasiLangkah()) { renderKomposer(); return; }
        comp.saving = true;
        compEl.querySelectorAll('button').forEach(function (button) { button.disabled = true; });
        simpanPesan().then(function (tersimpan) {
          comp.saving = false;
          compEl.querySelectorAll('button').forEach(function (button) { button.disabled = false; });
          close(compEl);
          return kirimKeGalaksi(tersimpan.galaksiId, 'pesan', T('kirimPesan'), tersimpan.pesanId).catch(function () { toast('Ucapan tersimpan. Buka Ruang Pribadi untuk menuju galaksinya.'); });
        }).catch(function (err) {
          comp.saving = false;
          compEl.querySelectorAll('button').forEach(function (button) { button.disabled = false; });
          comp.err = (err && err.message === 'locked') ? T('errPrivatLocked') : String((err && err.message) || err);
          comp.step = comp.steps.length - 1;
          renderKomposer();
        });
        return;
      }
    });
    document.body.appendChild(compEl);
  }

  /* ── animasi terkirim ────────────────────────────────────────────────────── */

  /* Segarkan data dan langsung bingkai galaksi pesan yang baru disimpan.
     Perjalanan benda tetap dipakai untuk kiriman selain pesan. */
  function kirimKeGalaksi(galaksiId, jenis, pesanSukses, pesanId) {
    return UM.galaksi.refresh().then(function () {
      var item = null;
      for (var i = 0; i < UM.galaksi.state.daftar.length; i++) {
        if (UM.galaksi.state.daftar[i].g.id === galaksiId) { item = UM.galaksi.state.daftar[i]; break; }
      }
      if (item && jenis === 'pesan') {
        UM.galaksi.terbangKe(item, pesanId);
        renderDock(); renderSkyCtl();
        toast(pesanSukses);
        return true;
      }
      if (!item || typeof viewMode === 'undefined' || viewMode !== 'galaxy') {
        toast(pesanSukses);
        return null;
      }
      toast(T('kirimJalan'));
      return UM.galaksi.kirimPerjalanan(item, jenis, function () {
        toast(pesanSukses);
        UM.galaksi.refresh().then(function () {
          if (UM.ui && UM.ui.renderKartuGalaksi) UM.ui.renderKartuGalaksi(item);
        });
      });
    });
  }

  /* ── kartu: galaksi, bintang (pesan), batu (doa) ─────────────────────────── */
  function kartuGalaksi(item) {
    var g = item.g;
    var requestId = ++kartuRequest;
    var panelBefore = bpBody.firstChild;
    Promise.all([UM.store.listPesan(g.id), UM.store.listDoa(g.id)]).then(function (r) {
      if (requestId !== kartuRequest || bpBody.firstChild !== panelBefore) return;
      var semua = r[0], doa = r[1];
      /* Sama seperti pelapis di um-galaksi.js: piringan = bintang, sabuk = debu.
         Kalau penyaringnya berbeda, angka di kartu tidak akan sama dengan yang
         benar-benar tergambar di galaksinya. */
      var punyaku = semua.filter(function (p) { return p.sendiri !== false || p.piringan === true; });
      var orangLain = semua.filter(function (p) { return p.sabuk === true; });
      var doaDiterima = 0;
      semua.forEach(function (p) { doaDiterima += (p.pendoa && p.pendoa.total) || 0; });
      bpBody.innerHTML =
        '<div id="bp-name" style="color:' + warnaAman(g.warna) + '">' + escAttr(g.nama) + '</div>' +
        '<span id="bp-type">' + escAttr(UM.i18n.kategori(g.kategori)) + ' · ' + escAttr(T('jenis' + (g.kind === 'spiral' ? 'Spiral' : g.kind === 'ellipsoid' ? 'Ellipsoid' : 'Irregular'))) + '</span>' +
        (g.foto ? '<img id="bp-img" src="' + escAttr(g.foto) + '" alt="' + escAttr(g.nama) + '" loading="lazy">' : '') +
        '<div class="bp-row"><span class="k">' + escAttr(T('gkBintang')) + '</span><span class="v">' + punyaku.length + '</span></div>' +
        '<div class="bp-row"><span class="k">' + escAttr(T('gkBatu')) + '</span><span class="v">' + orangLain.length + '</span></div>' +
        '<div class="bp-row"><span class="k">' + escAttr(T('gkDoa')) + '</span><span class="v">' + doaDiterima + '</span></div>' +
        '<div id="bp-desc"><div class="um-muted">' + teks(T('gkHint')) + '</div></div>' +
        '<div class="um-muted" style="margin-top:8px">' + teks(T('legenda')) + '</div>' +
        '<div id="um-gk-list" style="margin-top:10px"></div>' +
        '<button class="um-btn primary" id="um-gk-tulis" type="button" style="width:100%;margin-top:10px">' + teks(T('gkKirim')) + '</button>' +
        '<button class="um-btn" id="um-gk-doa" type="button" style="width:100%;margin-top:8px">' + teks(T('gkDoakan')) + '</button>';
      bpEl.classList.add('open');

      // daftar ringkas berisi pesan MILIKMU saja — pesan dari orang lain sudah
      // bisa dibaca satu per satu dengan mengklik butir debunya di sabuk
      var lb = document.getElementById('um-gk-list');
      if (lb) {
        var tampil = punyaku.slice().reverse().slice(0, 6);
        lb.innerHTML = tampil.length
          ? '<ul class="um-mini">' + tampil.map(function (p) {
              var idx = -1;
              if (item.pesanDiTitik) {
                var kunci = Object.keys(item.pesanDiTitik);
                for (var ki = 0; ki < kunci.length; ki++) {
                  if (item.pesanDiTitik[kunci[ki]].id === p.id) { idx = parseInt(kunci[ki], 10); break; }
                }
              }
              return '<li><span class="t" data-isi="' + escAttr(p.id) + '">…</span>' +
                (idx >= 0 ? '<button class="um-mini-btn" data-bintang="' + idx + '">' + teks(T('gkLihat')) + '</button>' : '') + '</li>';
            }).join('') + '</ul>'
          : '<div class="um-dim" style="font-size:12px">' + teks(T('pcEmpty')) + '</div>';
        tampil.forEach(function (p) {
          UM.store.bacaIsi(p).then(function (txt) {
            var node = lb.querySelector('[data-isi="' + p.id + '"]');
            if (!node) return;
            if (txt == null) { node.classList.add('locked'); node.textContent = '🔒 ' + T('lockedShort'); }
            else node.textContent = txt.length > 70 ? txt.slice(0, 70) + '…' : txt;
          });
        });
        lb.onclick = function (e) {
          var b = e.target.closest ? e.target.closest('[data-bintang]') : null;
          if (!b) return;
          var iTitik = parseInt(b.getAttribute('data-bintang'), 10);
          var pesanTitik = item.pesanDiTitik ? item.pesanDiTitik[iTitik] : null;
          UM.galaksi.terbangKeTitik(item, iTitik, pesanTitik);
        };
      }

      var tb = document.getElementById('um-gk-tulis');
      if (tb) tb.onclick = function () { bukaKomposer(g.id); };
      var db = document.getElementById('um-gk-doa');
      if (db) db.onclick = function () { bukaDoa(g.id, null); };
    });
  }

  /* Kartu untuk satu titik di lengan spiral. SEMUA titik bisa diklik: yang
     ditandai berisi pesan yang kamu tulis, yang lain berisi pesan dari orang
     lain yang dibuat saat titik itu diklik. Keduanya tampil sama di sini,
     supaya tidak ada titik yang terasa buntu. */
  function kartuTitik(item, p, index) {
    var requestId = ++kartuRequest;
    var milikSendiri = p.sendiri !== false;
    var baris = [];
    if (p.tanggal) baris.push('<div class="bp-row"><span class="k">' + escAttr(T('pcTanggal')) + '</span><span class="v">' + escAttr(ntah(new Date(p.tanggal + 'T12:00:00').getTime())) + '</span></div>');
    if (p.mood) baris.push('<div class="bp-row"><span class="k">' + escAttr(T('pcMood')) + '</span><span class="v">' + escAttr(UM.i18n.mood(p.mood)) + '</span></div>');
    if (p.tag && p.tag.length) baris.push('<div class="bp-row"><span class="k">' + escAttr(T('pcTag')) + '</span><span class="v">' + escAttr(p.tag.join(', ')) + '</span></div>');
    var total = (p.pendoa && p.pendoa.total) || 0;

    bpBody.innerHTML =
      '<div id="bp-name" style="color:' + warnaAman(item.g.warna) + '">' + escAttr(item.g.nama) + '</div>' +
      '<span id="bp-type">✦ ' + escAttr(T('titikLabel')) + ' ' + badge(p.privasi) + '</span>' +
      baris.join('') +
      '<div id="bp-desc"><span class="um-dim">…</span></div>' +
      (total ? '<div class="um-muted" style="margin-top:10px">✦ ' + total + ' ' + escAttr(T('pcPendoa')) + '</div>' : '') +
      '<div class="um-muted" style="margin-top:10px">' + teks(T(milikSendiri ? 'titikSendiri' : 'titikOrangLain')) + '</div>' +
      (p.privasi !== 'privat'
        ? '<button class="um-btn primary" id="um-b-doakan" type="button" style="width:100%;margin-top:10px">' + teks(T('pcDoakan')) + '</button>' +
          '<button class="um-btn" id="um-b-empati" type="button" style="width:100%;margin-top:8px">' + teks(T('pcEmpati')) + '</button>'
        : '');
    bpEl.classList.add('open');

    var description = document.getElementById('bp-desc');
    UM.store.bacaIsi(p).then(function (txt) {
      if (requestId !== kartuRequest) return;
      var d = document.getElementById('bp-desc');
      if (!d || d !== description) return;
      d.innerHTML = txt != null
        ? '<div class="bp-text">' + teks(txt) + '</div>'
        : '<div class="um-muted">🔒 ' + teks(T('lockedShort')) + '</div>';
    });
    var dk = document.getElementById('um-b-doakan');
    if (dk) dk.onclick = function () { bukaDoa(item.g.id, p.id); };
    var em = document.getElementById('um-b-empati');
    if (em) em.onclick = function () { toast(T('empathiToast')); em.disabled = true; };
  }

  /* Butir debu di sabuk = pesan dari orang lain, plus doa yang menempel padanya.
     Karena setiap butir membawa pesannya sendiri, tidak ada lagi partikel yang
     buntu saat diklik. */
  function kartuBatu(item, entri) {
    var requestId = ++kartuRequest;
    var p = entri.pesan, d = entri.doa;
    var tr = d ? UM.doaData.byId(d.tradisi) : null;
    var doaEntri = (d && d.doaId && d.doaId !== 'seed') ? UM.doaData.entri(d.tradisi, d.doaId) : null;
    var L = UM.i18n.getLang();
    var total = (p.pendoa && p.pendoa.total) || 0;

    bpBody.innerHTML =
      '<div id="bp-name" style="color:' + warnaAman(item.g.warna) + '">' + escAttr(item.g.nama) + '</div>' +
      '<span id="bp-type">✦ ' + escAttr(T('batuLabel')) + '</span>' +
      (d ? '<div class="bp-row"><span class="k">' + escAttr(T('batuTradisi')) + '</span><span class="v">' +
        escAttr(tr ? (tr.simbol + ' ' + (tr.label[L] || tr.label.id)) : d.tradisi) + '</span></div>' : '') +
      (doaEntri ? '<div class="bp-row"><span class="k">' + escAttr(T('batuDoa')) + '</span><span class="v">' + escAttr(doaEntri.nama[L] || doaEntri.nama.id) + '</span></div>' : '') +
      (total ? '<div class="bp-row"><span class="k">' + escAttr(T('pcPendoa')) + '</span><span class="v">' + total + '</span></div>' : '') +
      (d ? '<div class="bp-row"><span class="k">' + escAttr(T('batuKapan')) + '</span><span class="v">' + escAttr(ntah(d.dibuat)) + '</span></div>' : '') +
      '<div id="bp-desc"><span class="um-dim">…</span></div>' +
      '<div class="um-muted" style="margin-top:10px">' + teks(T('batuDari')) + '</div>';
    bpEl.classList.add('open');

    var description = document.getElementById('bp-desc');
    UM.store.bacaIsi(p).then(function (txt) {
      if (requestId !== kartuRequest) return;
      var desc = document.getElementById('bp-desc');
      if (!desc || desc !== description) return;
      desc.innerHTML = txt != null
        ? '<div class="bp-text">' + teks(txt) + '</div>'
        : '<div class="um-muted">🔒 ' + teks(T('lockedShort')) + '</div>';
    });
  }

  function tutupPanel() { ++kartuRequest; if (bpEl) bpEl.classList.remove('open'); }

  /* ── ruang pribadi (PRD §9.6) ────────────────────────────────────────────── */

  function bukaDash() { closeAllScreens(); open(dashEl); renderDash(); }

  function renderDash() {
    Promise.all([UM.store.stats(), UM.store.listGalaksi()]).then(function (r) {
      var s = r[0], galaksi = r[1];
      dashEl.querySelector('.um-wrap').innerHTML =
        '<div class="um-head"><div class="um-h1">' + teks(T('dashTitle')) + '</div>' +
        '<button class="um-close" data-act="close" aria-label="' + escAttr(T('commonClose')) + '">×</button></div>' +
        '<div class="um-stats">' +
          '<div class="um-stat"><b>' + s.pesan + '</b><span>' + teks(T('dashStatPesan')) + '</span></div>' +
          '<div class="um-stat"><b>' + s.galaksi + '</b><span>' + teks(T('dashStatGalaksi')) + '</span></div>' +
          '<div class="um-stat"><b>' + s.doaDiterima + '</b><span>' + teks(T('dashStatDoa')) + '</span></div>' +
          '<div class="um-stat"><b>' + s.doaDiberikan + '</b><span>' + teks(T('dashStatPendoa')) + '</span></div>' +
        '</div>' +
        (s.pesanMasuk ? '<div class="um-muted" style="margin-top:10px">✦ ' + s.pesanMasuk + ' ' + teks(T('dashMasuk')) + '</div>' : '') +
        '<div class="um-card" style="margin-top:14px">' +
          '<div class="um-h3">' + teks(T('dashGalaksi')) + '</div>' +
          (galaksi.length ? '<ul class="um-list">' + galaksi.map(function (g) {
            return '<li class="um-item"><div class="um-item-top">' +
              '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + warnaAman(g.warna) + '"></span>' +
              '<span class="who">' + escAttr(g.nama) + '</span>' +
              '<span class="when">' + escAttr(UM.i18n.kategori(g.kategori)) + '</span></div>' +
              '<div class="um-item-acts">' +
                '<button class="um-btn small" data-act="terbang" data-id="' + escAttr(g.id) + '">' + teks(T('gkTerbang')) + '</button>' +
                '<button class="um-btn small" data-act="tulis-untuk" data-id="' + escAttr(g.id) + '">' + teks(T('dockTulis')) + '</button>' +
              '</div></li>';
          }).join('') + '</ul>' : '<div class="um-empty">' + teks(T('dashEmptyGalaksi')) + '</div>') +
        '</div>' +
        '<div class="um-card"><div class="um-h3">' + teks(T('dashPesan')) + '</div>' +
        '<div id="um-dash-pesan"><div class="um-empty">…</div></div></div>' +
        '<div class="um-btn-row">' +
          '<button class="um-btn primary" data-act="tulis">✎ ' + teks(T('dockTulis')) + '</button>' +
          '<button class="um-btn" data-act="peta">✧ ' + teks(T('dockPeta')) + '</button>' +
        '</div>';
      renderDashPesan();
    });
  }

  function renderDashPesan() {
    Promise.all([UM.store.listPesan(), UM.store.listGalaksi()]).then(function (r) {
      // hanya pesan milikmu: pesan dari orang lain jumlahnya ratusan dan sudah
      // bisa dibaca satu per satu lewat butir debu di sabuk tiap galaksi
      var pesan = r[0].filter(function (p) { return p.sendiri !== false; });
      var galaksi = r[1], nama = {};
      galaksi.forEach(function (g) { nama[g.id] = g; });
      var box = document.getElementById('um-dash-pesan');
      if (!box) return;
      if (!pesan.length) { box.innerHTML = '<div class="um-empty">' + teks(T('dashEmptyPesan')) + '</div>'; return; }
      box.innerHTML = '<ul class="um-list">' + pesan.slice().reverse().map(function (p) {
        var g = nama[p.galaksiId] || { nama: '—' };
        return '<li class="um-item"><div class="um-item-top">' +
          '<span class="who">' + escAttr(g.nama) + '</span>' + badge(p.privasi) +
          '<span class="when">' + escAttr(ntah(p.dibuat)) + '</span></div>' +
          '<div class="txt um-dim" data-isi="' + escAttr(p.id) + '">…</div>' +
          ((p.pendoa && p.pendoa.total) ? '<div class="um-muted" style="margin-top:6px">✦ ' + p.pendoa.total + ' ' + escAttr(T('pcPendoa')) + '</div>' : '') +
          '</li>';
      }).join('') + '</ul>';
      pesan.forEach(function (p) {
        UM.store.bacaIsi(p).then(function (txt) {
          var node = box.querySelector('[data-isi="' + p.id + '"]');
          if (!node) return;
          if (txt == null) { node.classList.add('locked'); node.textContent = '🔒 ' + T('lockedShort'); }
          else { node.classList.remove('um-dim'); node.textContent = txt.length > 150 ? txt.slice(0, 150) + '…' : txt; }
        });
      });
    });
  }

  function buildDash() {
    dashEl = el('div', 'um-screen');
    dashEl.id = 'um-dash';
    dashEl.appendChild(el('div', 'um-wrap wide'));
    dashEl.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-act'), id = btn.getAttribute('data-id');
      if (act === 'close') close(dashEl);
      else if (act === 'tulis') bukaKomposer();
      else if (act === 'peta') { close(dashEl); kePeta(); }
      else if (act === 'tulis-untuk') { close(dashEl); bukaKomposer(id); }
      else if (act === 'terbang') {
        close(dashEl);
        keLadang().then(function () {
          for (var i = 0; i < UM.galaksi.state.daftar.length; i++) {
            if (UM.galaksi.state.daftar[i].g.id === id) { UM.galaksi.terbangKe(UM.galaksi.state.daftar[i]); break; }
          }
        }).catch(function (err) { toast(err.message || T('genHilang')); });
      }
    });
    document.body.appendChild(dashEl);
  }

  /* ── jelajah (PRD §9.4) ──────────────────────────────────────────────────── */

  function bukaJelajah() { closeAllScreens(); open(expEl); renderJelajah(); }

  function renderJelajah() {
    UM.store.listPesan().then(function (rows) {
      var publik = rows.filter(function (p) { return p.privasi === 'publik' && !dilaporkanLokal[p.id]; });
      publik.sort(function (a, b) {
        if (expSort === 'doa') return ((b.pendoa && b.pendoa.total) || 0) - ((a.pendoa && a.pendoa.total) || 0);
        return (b.dibuat || 0) - (a.dibuat || 0);
      });
      // dibatasi: data mockup berisi ratusan pesan, dan merender semuanya
      // sekaligus hanya memperlambat tanpa menambah pemahaman
      var ditampilkan = publik.slice(0, 60);
      expEl.querySelector('.um-wrap').innerHTML =
        '<div class="um-head"><div><div class="um-h1">' + teks(T('expTitle')) + '</div>' +
        '<div class="um-muted">' + teks(T('expLead')) + '</div></div>' +
        '<button class="um-close" data-act="close" aria-label="' + escAttr(T('commonClose')) + '">×</button></div>' +
        '<div class="um-chips" style="margin-bottom:14px">' +
          '<button class="um-chip' + (expSort === 'baru' ? ' on' : '') + '" data-act="sort" data-id="baru">' + teks(T('expSortNew')) + '</button>' +
          '<button class="um-chip' + (expSort === 'doa' ? ' on' : '') + '" data-act="sort" data-id="doa">' + teks(T('expSortDoa')) + '</button>' +
        '</div>' +
        (ditampilkan.length ? '<ul class="um-list">' + ditampilkan.map(function (p) {
          var dari = p.seed ? T('expAnon') : T('expMine');
          var total = (p.pendoa && p.pendoa.total) || 0;
          return '<li class="um-item"><div class="um-item-top"><span class="who">' + escAttr(dari) + '</span>' +
            '<span class="um-badge publik">✦ ' + total + ' ' + escAttr(T('pcPendoa')) + '</span>' +
            '<span class="when">' + escAttr(ntah(p.dibuat)) + '</span></div>' +
            '<div class="txt" data-isi="' + escAttr(p.id) + '">…</div>' +
            '<div class="um-item-acts">' +
              '<button class="um-btn small primary" data-act="doa" data-id="' + escAttr(p.id) + '" data-g="' + escAttr(p.galaksiId) + '">' + teks(T('pcDoakan')) + '</button>' +
              '<button class="um-btn small" data-act="empati">' + teks(T('pcEmpati')) + '</button>' +
              '<button class="um-btn small ghost" data-act="lapor" data-id="' + escAttr(p.id) + '">' + teks(T('expReport')) + '</button>' +
            '</div></li>';
        }).join('') + '</ul>' : '<div class="um-empty">' + teks(T('expEmpty')) + '</div>');
      ditampilkan.forEach(function (p) {
        UM.store.bacaIsi(p).then(function (txt) {
          var node = expEl.querySelector('[data-isi="' + p.id + '"]');
          if (node) node.textContent = txt != null ? txt : '🔒 ' + T('lockedShort');
        });
      });
    });
  }

  function buildJelajah() {
    expEl = el('div', 'um-screen');
    expEl.id = 'um-exp';
    expEl.appendChild(el('div', 'um-wrap'));
    expEl.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-act'), id = btn.getAttribute('data-id');
      if (act === 'close') close(expEl);
      else if (act === 'sort') { expSort = id; renderJelajah(); }
      else if (act === 'doa') bukaDoa(btn.getAttribute('data-g'), id);
      else if (act === 'empati') { toast(T('empathiToast')); btn.disabled = true; }
      else if (act === 'lapor') {
        dilaporkanLokal[id] = true;
        UM.store.getPesan(id).then(function (p) {
          if (!p) return;
          p.dilaporkan = (p.dilaporkan || 0) + 1;
          return UM.store._put('pesan', p);
        }).then(function () { toast(T('expReportToast')); renderJelajah(); });
      }
    });
    document.body.appendChild(expEl);
  }

  /* ── modal doa (PRD §9.5) ────────────────────────────────────────────────── */

  function bukaDoa(galaksiId, pesanId) {
    stopDoaTimer();
    doaState = { galaksiId: galaksiId, pesanId: pesanId || null, tradisi: null, entriId: null, fase: 'pick', sisa: 0, timer: null, audio: null, audioAktif: false };
    closeAllScreens(); open(doaEl); renderDoa();
  }

  function renderDoa() {
    var L = UM.i18n.getLang();
    var chips = UM.doaData.tradisi.map(function (tr) {
      return '<button class="um-chip' + (doaState.tradisi === tr.id ? ' on' : '') + '" data-act="trad" data-id="' + escAttr(tr.id) + '">' +
        (tr.simbol ? tr.simbol + ' ' : '') + escAttr(tr.label[L] || tr.label.id) + '</button>';
    }).join('');

    var isi = '';
    if (doaState.tradisi) {
      var tr = UM.doaData.byId(doaState.tradisi);
      isi += '<div class="um-h3" style="margin-top:6px">' + teks(T('doaPick')) + '</div>' +
        '<div class="um-chips" style="margin-bottom:14px">' + tr.entri.map(function (e) {
          return '<button class="um-chip' + (doaState.entriId === e.id ? ' on' : '') + '" data-act="entri" data-id="' + escAttr(e.id) + '">' + escAttr(e.nama[L] || e.nama.id) + '</button>';
        }).join('') + '</div>';
    }

    if (doaState.fase === 'hening') {
      isi += '<div class="um-prayer"><div class="um-hening">' +
        (doaState.audioAktif
          ? '<div style="font-size:30px">♪</div><div class="lbl" style="margin-top:12px">' + teks(T('doaPlaying')) + '</div>'
          : '<div class="clock">' + doaState.sisa + '</div><div class="lbl">' + teks(T('doaHening')) + ' · ' + teks(T('doaSecond')) + '</div>') +
        '</div></div>';
    } else if (doaState.fase === 'done') {
      isi += '<div class="um-prayer"><div class="um-hening"><div style="font-size:30px">✦</div>' +
        '<div class="lbl" style="margin-top:12px">' + teks(T('doaDone')) + '</div></div></div>' +
        '<div class="um-btn-row end"><button class="um-btn primary" data-act="again">' + teks(T('doaAgain')) + '</button>' +
        '<button class="um-btn" data-act="close">' + teks(T('btnClose')) + '</button></div>';
    } else if (doaState.entriId) {
      var e0 = UM.doaData.entri(doaState.tradisi, doaState.entriId);
      var isiDoa = e0.teks ? (e0.teks[L] || e0.teks.id) : null;
      isi += '<div class="um-prayer">' +
        '<div class="nm">' + escAttr(e0.nama[L] || e0.nama.id) + '</div>' +
        '<div class="src">' + escAttr(e0.sumber) + (e0.reviewed ? '' : ' · ' + escAttr(T('doaUncurated'))) + '</div>' +
        '<div class="tx' + (isiDoa ? '' : ' missing') + '">' + teks(isiDoa || T('doaEmpty')) + '</div>' +
        (e0.arti ? '<div class="tx" style="opacity:.75;font-size:12px">' + teks(e0.arti[L] || e0.arti.id) + '</div>' : '') +
        '</div>' +
        (e0.reviewed ? '' : '<div class="um-note warn">' + teks(T('doaUncuratedNote')) + '</div>') +
        '<div class="um-btn-row end">' +
          '<button class="um-btn primary" data-act="start"' + (isiDoa ? '' : ' disabled') + '>' + teks(T('doaStart')) + '</button>' +
          '<button class="um-btn" data-act="close">' + teks(T('btnClose')) + '</button>' +
        '</div>';
    } else if (doaState.tradisi) {
      isi += '<div class="um-empty">' + teks(T('doaPick')) + '</div>';
    }

    doaEl.querySelector('.um-wrap').innerHTML =
      '<div class="um-head"><div class="um-h1">' + teks(T('doaTitle')) + '</div>' +
      '<button class="um-close" data-act="close" aria-label="' + escAttr(T('commonClose')) + '">×</button></div>' +
      '<div class="um-card"><div class="um-h3">' + teks(T('doaTrad')) + '</div>' +
      '<div class="um-trad">' + chips + '</div>' + isi + '</div>';
  }

  function mulaiDoa() {
    var e0 = UM.doaData.entri(doaState.tradisi, doaState.entriId);
    if (!e0) return;
    var selesai = function () { selesaikanDoa(); };
    if (e0.audio) {
      var audio = new Audio('untukmu/audio/' + e0.audio);
      doaState.audio = audio;
      doaState.audioAktif = true;
      doaState.fase = 'hening';
      audio.onended = selesai;
      audio.onerror = function () { doaState.audioAktif = false; jalankanHitung(e0.detik || 20, selesai); };
      audio.play().catch(function () { doaState.audioAktif = false; jalankanHitung(e0.detik || 20, selesai); });
      renderDoa();
      return;
    }
    doaState.audioAktif = false;
    jalankanHitung(e0.detik || 20, selesai);
  }

  function jalankanHitung(detik, selesai) {
    doaState.fase = 'hening';
    doaState.sisa = detik;
    renderDoa();
    doaState.timer = setInterval(function () {
      doaState.sisa--;
      if (doaState.sisa <= 0) { clearInterval(doaState.timer); doaState.timer = null; selesai(); }
      else renderDoa();
    }, 1000);
  }

  function selesaikanDoa() {
    stopDoaTimer();
    var galaksiId = doaState.galaksiId, pesanId = doaState.pesanId;
    UM.store.addDoa(galaksiId, pesanId, doaState.tradisi, doaState.entriId).then(function () {
      doaState.fase = 'done';
      renderDoa();
      return UM.galaksi.refresh();
    }).then(function () {
      var item = null;
      for (var i = 0; i < UM.galaksi.state.daftar.length; i++) {
        if (UM.galaksi.state.daftar[i].g.id === galaksiId) { item = UM.galaksi.state.daftar[i]; break; }
      }
      if (item && typeof viewMode !== 'undefined' && viewMode === 'galaxy') {
        // doa juga menempuh perjalanan yang sama, lalu menambah satu batu di orbit
        UM.galaksi.kirimPerjalanan(item, 'doa', function () {
          UM.galaksi.refresh();
          if (UM.ui.renderKartuGalaksi) UM.ui.renderKartuGalaksi(item);
        });
      }
      if (expEl.classList.contains('on')) renderJelajah();
      if (dashEl.classList.contains('on')) renderDash();
    });
  }

  function buildDoa() {
    doaEl = el('div', 'um-screen z-top');
    doaEl.id = 'um-doa';
    doaEl.appendChild(el('div', 'um-wrap narrow'));
    doaEl.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-act'), id = btn.getAttribute('data-id');
      if (act === 'close') { stopDoaTimer(); close(doaEl); return; }
      if (act === 'trad') { doaState.tradisi = id; doaState.entriId = null; doaState.fase = 'pick'; renderDoa(); return; }
      if (act === 'entri') { doaState.entriId = id; doaState.fase = 'pick'; renderDoa(); return; }
      if (act === 'start') { if (!doaState.entriId) { toast(T('doaNeedPick')); return; } mulaiDoa(); return; }
      if (act === 'again') { doaState.fase = 'pick'; renderDoa(); return; }
    });
    document.body.appendChild(doaEl);
  }

  /* ── modal kunci enkripsi (PRD §9.7) ─────────────────────────────────────── */

  function bukaSetup() { closeAllScreens(); open(setupEl); setupErr = ''; renderSetup(); }

  function renderSetup() {
    if (!UM.crypto.available()) {
      setupEl.querySelector('.um-wrap').innerHTML =
        '<div class="um-head"><div class="um-h1">' + teks(T('setupTitle')) + '</div>' +
        '<button class="um-close" data-act="close" aria-label="' + escAttr(T('commonClose')) + '">×</button></div>' +
        '<div class="um-card"><div class="um-note warn">' + teks(T('setupUnsupported')) + '</div></div>';
      return;
    }
    UM.store.getMeta('kunci').then(function (rec) {
      var html;
      if (!rec) {
        html = '<p class="um-p">' + teks(T('setupIntro')) + '</p>' +
          '<div class="um-field"><label class="um-label" for="um-pw">' + teks(T('setupPw')) + '</label>' +
          '<input class="um-input" id="um-pw" type="password" autocomplete="new-password"></div>' +
          '<div class="um-field"><label class="um-label" for="um-pw2">' + teks(T('setupPw2')) + '</label>' +
          '<input class="um-input" id="um-pw2" type="password" autocomplete="new-password">' +
          '<div class="um-hint">' + teks(T('setupPwHint')) + '</div></div>' +
          '<div class="um-error">' + escAttr(setupErr) + '</div>' +
          '<div class="um-btn-row end"><button class="um-btn primary" data-act="create">' + teks(T('setupCreate')) + '</button></div>';
      } else if (!UM.crypto.unlocked()) {
        html = '<p class="um-p">' + teks(T('lockedText')) + '</p>' +
          '<div class="um-field"><label class="um-label" for="um-pw">' + teks(T('setupPw')) + '</label>' +
          '<input class="um-input" id="um-pw" type="password" autocomplete="current-password"></div>' +
          '<div class="um-error">' + escAttr(setupErr) + '</div>' +
          '<div class="um-btn-row end"><button class="um-btn primary" data-act="unlock">' + teks(T('setupUnlock')) + '</button></div>' +
          '<div class="um-field" style="margin-top:18px"><label class="um-label" for="um-rec">' + teks(T('setupRecovery')) + '</label>' +
          '<input class="um-input" id="um-rec" placeholder="XXXXX-XXXXX-XXXXX-XXXXX"></div>' +
          '<div class="um-btn-row end"><button class="um-btn" data-act="unlock-rec">' + teks(T('setupUnlock')) + '</button></div>';
      } else {
        html = '<p class="um-p">' + teks(T('setupUnlocked')) + '</p>' +
          '<div class="bp-row"><span class="k">KDF</span><span class="v">' + escAttr(UM.crypto.kdfId()) + '</span></div>' +
          '<div class="bp-row"><span class="k">Iterasi</span><span class="v">' + UM.crypto.iterations() + '</span></div>' +
          '<div class="um-btn-row end"><button class="um-btn" data-act="lock">' + teks(T('setupLock')) + '</button></div>';
      }
      if (recoveryTampil) {
        html += '<div class="um-card" style="margin-top:14px"><div class="um-h3">' + teks(T('setupRecovery')) + '</div>' +
          '<div style="font-size:16px;letter-spacing:.12em;color:#fff;word-break:break-all;line-height:1.6">' + escAttr(recoveryTampil) + '</div>' +
          '<div class="um-note warn">' + teks(T('setupRecoveryNote')) + '</div>' +
          '<div class="um-btn-row"><button class="um-btn small" data-act="copy">' + teks(T('setupRecoveryCopy')) + '</button></div></div>';
      }
      setupEl.querySelector('.um-wrap').innerHTML =
        '<div class="um-head"><div class="um-h1">' + teks(T('setupTitle')) + '</div>' +
        '<button class="um-close" data-act="close" aria-label="' + escAttr(T('commonClose')) + '">×</button></div>' +
        '<div class="um-card">' + html + '</div>';
    });
  }

  function buildSetup() {
    setupEl = el('div', 'um-screen z-top');
    setupEl.id = 'um-setup';
    setupEl.appendChild(el('div', 'um-wrap narrow'));
    setupEl.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      var pw = function (id) { var n = document.getElementById(id); return n ? n.value : ''; };
      if (act === 'close') { close(setupEl); return; }
      if (act === 'create') {
        var a = pw('um-pw'), b = pw('um-pw2');
        if (a.length < 8) { setupErr = T('setupShort'); renderSetup(); return; }
        if (a !== b) { setupErr = T('setupMismatch'); renderSetup(); return; }
        btn.disabled = true;
        UM.crypto.setup(a).then(function (out) {
          return UM.store.setMeta('kunci', out.record).then(function () {
            recoveryTampil = out.recoveryCode;
            return UM.store.reEnkripsiPrivat();
          });
        }).then(function () {
          setupErr = ''; renderSetup(); UM.galaksi.refresh();
        }).catch(function (err) { btn.disabled = false; setupErr = String((err && err.message) || err); renderSetup(); });
        return;
      }
      if (act === 'unlock') { btn.disabled = true; UM.crypto.unlock(pw('um-pw')).then(function () { setupErr = ''; renderSetup(); UM.galaksi.refresh(); }).catch(function () { btn.disabled = false; setupErr = T('setupWrong'); renderSetup(); }); return; }
      if (act === 'unlock-rec') { btn.disabled = true; UM.crypto.unlockWithRecovery(pw('um-rec')).then(function () { setupErr = ''; renderSetup(); UM.galaksi.refresh(); }).catch(function () { btn.disabled = false; setupErr = T('setupWrong'); renderSetup(); }); return; }
      if (act === 'lock') { UM.crypto.lock(); renderSetup(); UM.galaksi.refresh(); return; }
      if (act === 'copy') {
        if (navigator.clipboard && recoveryTampil) navigator.clipboard.writeText(recoveryTampil).then(function () { toast(T('setupCopied')); });
        return;
      }
    });
    document.body.appendChild(setupEl);
  }

  /* ── pengaturan ──────────────────────────────────────────────────────────── */

  function bukaSet() { closeAllScreens(); open(setEl); renderSet(); }

  function renderSet() {
    var langs = [['id', 'Bahasa Indonesia'], ['en', 'English'], ['hans', '简体中文'], ['hant', '繁體中文'], ['ja', '日本語'], ['ko', '한국어']];
    var gbOn = UM.galaksi.state.galaksiBawaan;
    setEl.querySelector('.um-wrap').innerHTML =
      '<div class="um-head"><div class="um-h1">' + teks(T('setTitle')) + '</div>' +
      '<button class="um-close" data-act="close" aria-label="' + escAttr(T('commonClose')) + '">×</button></div>' +
      '<div class="um-card">' +
        '<div class="um-field"><label class="um-label" for="um-lang">' + teks(T('setLang')) + '</label>' +
        '<select class="um-select" id="um-lang">' + langs.map(function (l) {
          return '<option value="' + l[0] + '"' + (UM.i18n.getLang() === l[0] ? ' selected' : '') + '>' + escAttr(l[1]) + '</option>';
        }).join('') + '</select></div>' +
        '<div class="um-h3" style="margin-top:18px">' + teks(T('setAbout')) + '</div>' +
        '<p class="um-muted">' + teks(T('setAboutText')) + '</p>' +
      '</div>' +
      '<div class="um-card">' +
        '<div class="um-h3">' + teks(T('setGalaksiBawaan')) + '</div>' +
        '<p class="um-muted">' + teks(T('setGalaksiBawaanD')) + '</p>' +
        '<div class="um-chips">' +
          '<button class="um-chip' + (gbOn ? ' on' : '') + '" data-act="gb" data-id="1">' + teks(T('setAktif')) + '</button>' +
          '<button class="um-chip' + (gbOn ? '' : ' on') + '" data-act="gb" data-id="0">' + teks(T('setMati')) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="um-card">' +
        '<div class="um-h3">' + teks(T('setReset')) + '</div>' +
        '<p class="um-muted">' + teks(T('setResetNote')) + '</p>' +
        '<div class="um-btn-row"><button class="um-btn danger" data-act="reset">' + teks(T('setResetDo')) + '</button>' +
        '<button class="um-btn" data-act="close">' + teks(T('btnCancel')) + '</button></div>' +
      '</div>';
  }

  function buildSet() {
    setEl = el('div', 'um-screen z-top');
    setEl.id = 'um-set';
    setEl.appendChild(el('div', 'um-wrap narrow'));
    setEl.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'close') close(setEl);
      else if (act === 'gb') {
        var nyala = btn.getAttribute('data-id') === '1';
        btn.disabled = true;
        UM.store.getMeta('setelan').then(function (s) {
          s = s || {}; s.galaksiBawaan = nyala;
          return UM.store.setMeta('setelan', s);
        }).then(function () { UM.galaksi.setGalaksiBawaan(nyala); renderSet(); }).catch(function (err) { renderSet(); toast(err.message || 'Pengaturan belum tersimpan.'); });
      }
      else if (act === 'reset') {
        UM.store.reset().then(function () {
          recoveryTampil = null; dilaporkanLokal = {};
          return UM.store.seedIfEmpty();
        }).then(function () {
          return UM.galaksi.refresh();
        }).then(function () {
          return UM.sky.refresh();
        }).then(function () {
          toast(T('setResetDone')); close(setEl); renderSemua();
        });
      }
    });
    setEl.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'um-lang') setBahasa(e.target.value);
    });
    document.body.appendChild(setEl);
  }

  /* ── bahasa ──────────────────────────────────────────────────────────────── */

  function setBahasa(lang) {
    UM.i18n.setLang(lang);
    if (typeof setBeaconLang === 'function') setBeaconLang(lang);
    renderSemua();
    UM.galaksi.segarkanTeks();
    UM.sky.segarkanTeks();
    if (typeof viewMode !== 'undefined' && viewMode === 'sky') UM.sky.perbaruiLabel();
  }

  /* ── berkas gambar ───────────────────────────────────────────────────────── */

  function bacaGambar(file) {
    return new Promise(function (resolve, reject) {
      if (file.size > 4 * 1024 * 1024) { reject(new Error('too-big')); return; }
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('read-failed')); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('bad-image')); };
        img.onload = function () {
          var max = 320, k = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * k));
          c.height = Math.max(1, Math.round(img.height * k));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.82));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  function renderSemua() {
    if (!mounted) return;
    renderEntry(); renderDock(); renderSkyCtl();
    if (compEl.classList.contains('on')) renderKomposer();
    if (dashEl.classList.contains('on')) renderDash();
    if (expEl.classList.contains('on')) renderJelajah();
    if (doaEl.classList.contains('on')) renderDoa();
    if (setupEl.classList.contains('on')) renderSetup();
    if (setEl.classList.contains('on')) renderSet();
  }

  function mount() {
    if (mounted) return false;
    var panelClose = document.getElementById('bp-close');
    if (panelClose) panelClose.addEventListener('click', function () { ++kartuRequest; });
    buildEntry(); buildDock(); buildKomposer(); buildDash();
    buildJelajah(); buildDoa(); buildSetup(); buildSet();
    mounted = true;
    renderSemua();
    return true;
  }

  function bukaEntry() { open(entryEl); renderEntry(); }

  return {
    mount: mount, bukaEntry: bukaEntry, toast: toast,
    renderSemua: renderSemua, setBahasa: setBahasa,
    renderKartuGalaksi: kartuGalaksi, renderKartuTitik: kartuTitik, renderKartuBatu: kartuBatu,
    tutupPanel: tutupPanel,
    bukaKomposer: bukaKomposer, bukaDash: bukaDash, bukaJelajah: bukaJelajah,
    bukaDoa: bukaDoa, bukaSetup: bukaSetup, bukaSet: bukaSet,
    keLadang: keLadang, kePeta: kePeta,
    closeAllScreens: closeAllScreens, anyScreenOpen: anyScreenOpen,
    _bacaGambar: bacaGambar
  };
})();
