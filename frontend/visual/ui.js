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
UM.ui = function () {
  function T(k) {
    return UM.i18n.t(k);
  }

  /* ── pembantu DOM ────────────────────────────────────────────────────────── */

  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) UM.renderScreen(d, html);
    return d;
  }
  function escAttr(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[c];
    });
  }
  function teks(s) {
    return escAttr(s).replace(/\n/g, '<br>');
  }
  function warnaAman(c) {
    return /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#ffd9a0';
  }
  function ntah(ms) {
    return UM.i18n.tanggal(ms);
  }
  function lampiran(p) {
    return (p.sendiri ? '<button class="um-btn small" data-act="manage" data-id="' + escAttr(p.originMessageId || p.id) + '">Kelola pesan</button>' : '') + (p.attachmentIds || []).map(function (id, i) {
      return '<button class="um-btn small" data-act="download" data-id="' + escAttr(id) + '">Unduh lampiran ' + (i + 1) + '</button>';
    }).join('');
  }
  function badge(privasi) {
    var map = {
      privat: ['privat', 'stPrivat', '🔒'],
      publik: ['publik', 'stPublik', '✦'],
      unlisted: ['unlisted', 'stUnlisted', '🔗']
    };
    var m = map[privasi] || map.privat;
    return '<span class="um-badge ' + m[0] + '">' + m[2] + ' ' + teks(T(m[1])) + '</span>';
  }

  /* ── elemen tetap ────────────────────────────────────────────────────────── */

  var entryEl, compEl, dashEl, expEl, doaEl, setupEl, setEl, dockEl, brandEl, skyCtlEl, toastEl, fotoInput;
  var mounted = false;
  var kartuRequest = 0;

  /* ── keadaan ─────────────────────────────────────────────────────────────── */

  var comp = {
    step: 0,
    steps: ['tujuan'],
    galaksiId: null,
    baru: true,
    newNama: '',
    newKategori: '',
    newKind: 'spiral',
    newWarna: '#ffd9a0',
    newRadius: 140,
    newFoto: null,
    isi: '',
    tanggal: '',
    mood: '',
    tag: '',
    privasi: 'privat',
    err: ''
  };
  var expSort = 'baru',
    expOffset = 0,
    expMood = '',
    expTag = '',
    dashMood = '',
    dashTag = '',
    dashRequest = 0,
    expRequest = 0,
    expRows = [],
    expMore = false,
    expBusy = false,
    expError = '';
  var dilaporkanLokal = {};
  var doaState = {
    galaksiId: null,
    pesanId: null,
    tradisi: null,
    entriId: null,
    fase: 'pick',
    sisa: 0,
    timer: null,
    audio: null,
    audioAktif: false
  };
  var setupErr = '';

  /* ── lapisan layar ───────────────────────────────────────────────────────── */

  function open(s) {
    if (s) s.classList.add('on');
    UM.trackScreen(s, true);
  }
  function close(s) {
    if (s) s.classList.remove('on');
    UM.trackScreen(s, false);
  }
  function closeAllScreens() {
    stopDoaTimer();
    [entryEl, compEl, dashEl, expEl, doaEl, setupEl, setEl].forEach(close);
  }
  function anyScreenOpen() {
    return [entryEl, compEl, dashEl, expEl, doaEl, setupEl, setEl].some(function (s) {
      return s && s.classList.contains('on');
    });
  }
  function stopDoaTimer() {
    stopDoaPreview();
    doaState.sequence = (doaState.sequence || 0) + 1;
    if (doaState.audio) {
      doaState.audio.onended = null;
      doaState.audio.onerror = null;
    }
    if (doaState.timer) {
      clearInterval(doaState.timer);
      doaState.timer = null;
    }
    if (doaState.audio) {
      try {
        doaState.audio.pause();
      } catch (e) {}
      doaState.audio = null;
    }
  }

  function stopDoaPreview() {
    if (!doaEl) return;
    doaEl.querySelectorAll('audio[data-prayer-preview]').forEach(function (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    });
  }
  var toastTimer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('on');
    }, 3000);
  }

  /* ── layar pembuka (PRD §9.1) ────────────────────────────────────────────── */

  function renderEntry() {
    var aman = UM.crypto.available();
    UM.renderScreen(entryEl.querySelector('.um-enter'), '<h1>' + teks(T('entryH1')) + '</h1>' + '<p class="lead">' + teks(T('entryLead')) + '</p>' + '<div class="acts">' + '<button class="um-btn primary" data-act="tulis">✎ ' + teks(T('entryActsTulis')) + '</button>' + '<button class="um-btn primary" data-act="doa">♡ Doa untuk seseorang</button>' + '<button class="um-btn" data-act="jelajah">Jelajahi pesan publik</button>' + '<button class="um-btn" data-act="galaksi">✦ ' + teks(T('entryActsGalaksi')) + '</button>' + '</div>' + '<p class="fine">' + (aman ? '🔒 ' : '⚠ — ') + '<a href="/kebijakan-privasi" target="_top" style="color:inherit;text-decoration:none">' + teks(aman ? T('entryFine') : T('entryFineWarn')) + '</a>' + '</p>' + '<div class="um-btn-row" style="justify-content:center;margin-top:18px">' + '<button class="um-btn ghost small" data-act="skip">' + teks(T('entrySkip')) + '</button>' + '</div>');
  }
  function buildEntry() {
    entryEl = el('div', 'um-screen');
    entryEl.id = 'um-entry';
    entryEl.appendChild(el('div', 'um-enter'));
    entryEl.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-act]') : null;
      var act = btn && btn.getAttribute('data-act');
      if (!act) return;
      if (act === 'tulis') {
        close(entryEl);
        bukaKomposer();
      } else if (act === 'doa') {
        close(entryEl);
        bukaDoa();
      } else if (act === 'jelajah') {
        close(entryEl);
        bukaJelajah();
      } else if (act === 'galaksi') {
        close(entryEl);
        keLadang();
      } else if (act === 'skip') close(entryEl);
    });
    document.body.appendChild(entryEl);
  }

  /* ── dock ────────────────────────────────────────────────────────────────── */

  function renderDock() {
    var diPeta = typeof viewMode !== 'undefined' && viewMode === 'sky';
    UM.renderScreen(dockEl, '<button data-act="tulis"><span class="i">✎</span>' + teks(T('dockTulis')) + '</button>' + '<button data-act="doa"><span class="i">♡</span>Doa</button>' + '<button data-act="rumah"><span class="i">⌂</span>' + teks(T('dockRumah')) + '</button>' + '<button data-act="peta"' + (diPeta ? ' class="on"' : '') + '><span class="i">✧</span>' + teks(T('dockPeta')) + '</button>' + '<button data-act="jelajah"><span class="i">☰</span>' + teks(T('dockJelajah')) + '</button>' + '<button data-act="dash"><span class="i">◈</span>' + teks(T('dockDash')) + '</button>' + '<button data-act="setup"><span class="i">🔑</span>' + teks(T('dockSetup')) + '</button>' + '<button data-act="set"><span class="i">⚙</span>' + teks(T('dockSet')) + '</button>');
  }
  function buildDock() {
    dockEl = el('div', 'um-dock');
    dockEl.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('button[data-act]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'tulis') bukaKomposer();else if (act === 'rumah') {
        UM.galaksi.kembaliKeRumah();
        renderDock();
        renderSkyCtl();
      } else if (act === 'peta') {
        if (typeof viewMode !== 'undefined' && viewMode === 'sky') {
          if (typeof exitSky === 'function') exitSky();
        } else kePeta();
      } else if (act === 'jelajah') bukaJelajah();else if (act === 'doa') bukaDoa();else if (act === 'dash') bukaDash();else if (act === 'setup') bukaSetup();else if (act === 'set') bukaSet();
    });
    document.body.appendChild(dockEl);
    brandEl = el('div', 'um-brand', '<b>' + teks(T('brand')) + '</b><span>' + teks(T('brandSub')) + '</span><em>' + teks(T('brandHint')) + '</em>');
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
        comp.newFoto = dataUrl;
        renderKomposer();
      }).catch(function (err) {
        comp.err = err && err.message === 'too-big' ? T('compTooBig') : '';
        renderKomposer();
      });
    });
    document.body.appendChild(fotoInput);
  }
  function renderSkyCtl() {
    if (!skyCtlEl) return;
    UM.renderScreen(skyCtlEl, '<div class="um-chips"><button class="um-chip on" data-mode="kenangan">' + teks(T('skyKenangan')) + '</button></div>' + '<div class="um-hint">Bintang berwarna menandai galaksi kenanganmu. Klik bintangnya untuk mengunjungi galaksi. Geser untuk melihat langit.</div>');
  }

  /* ── masuk ke ladang galaksi / Peta ──────────────────────────────────────── */

  function keLadang() {
    UM.galaksi.masukLadang();
    return UM.galaksi.refresh().then(function () {
      UM.galaksi.bingkaiLadang();
      renderDock();
      if (!UM.galaksi.state.daftar.length) toast(T('galaksiKosong'));else if (!UM.galaksi.generatorAda()) toast(T('genHilang'));
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
      renderDock();
      renderSkyCtl();
      if (masuk && !UM.sky.state.daftar.length) toast(T('galaksiKosong'));
    });
  }

  /* ── komposer (PRD §9.2) ─────────────────────────────────────────────────── */

  function hitungLangkah() {
    comp.steps = ['tujuan'].concat(comp.baru ? ['bentuk'] : []).concat(['isi', 'privasi']);
    if (comp.step >= comp.steps.length) comp.step = comp.steps.length - 1;
  }
  function bukaKomposer(galaksiId) {
    if (!UM.account.isLogged()) {
      UM.account.require().then(function (ok) {
        if (ok) bukaKomposer(galaksiId);
      });
      return;
    }
    if (comp.saving) return;
    galaksiId = galaksiId || UM.galaksi.state.aktif || null;
    if (galaksiId === 'publik-bersama') galaksiId = null;
    comp.step = 0;
    comp.err = '';
    comp.isi = '';
    comp.mood = '';
    comp.tag = '';
    comp.tanggal = new Date().toISOString().slice(0, 10);
    comp.privasi = UM.store.defaultPrivacy();
    comp.newFoto = null;
    comp.files = [];
    comp.customCategory = '';
    comp.newNama = '';
    comp.newKategori = '';
    comp.newKind = 'spiral';
    comp.newWarna = '#ffd9a0';
    comp.newRadius = 140;
    comp.galaksiId = galaksiId || null;
    comp.targets = [];
    comp.releaseAt = '';
    comp.galaksiDibuatId = null;
    comp.baru = !galaksiId;
    hitungLangkah();
    closeAllScreens();
    open(compEl);
    renderKomposer();
  }
  function renderKomposer() {
    var renderId = (comp.renderId || 0) + 1;
    comp.renderId = renderId;
    var request = comp.renderRequest = (comp.renderRequest || 0) + 1;
    hitungLangkah();
    var step = comp.steps[comp.step];
    var bar = comp.steps.map(function (s, i) {
      return '<div class="um-step' + (i === comp.step ? ' on' : i < comp.step ? ' done' : '') + '"></div>';
    }).join('');
    var petakan = function (body) {
      if (comp.renderId !== renderId) return;
      if (request !== comp.renderRequest || !compEl.classList.contains('on')) return;
      UM.renderScreen(compEl.querySelector('.um-wrap'), '<div class="um-head">' + '<div><div class="um-h1">' + teks(T('compTitle')) + '</div>' + '<div class="um-muted">' + (comp.step + 1) + ' / ' + comp.steps.length + '</div></div>' + '<button class="um-close" data-act="cancel" aria-label="' + escAttr(T('btnCancel')) + '">×</button>' + '</div>' + '<div class="um-steps">' + bar + '</div>' + '<div class="um-card">' + body + '</div>');
    };
    if (step === 'tujuan') {
      petakan('<p class="um-muted" role="status">Memuat pilihan kenangan…</p>');
      stepTujuan().then(petakan).catch(function (err) {
        petakan('<div class="um-error" role="alert">' + escAttr(err.message || 'Tujuan gagal dimuat.') + '</div><div class="um-btn-row"><button class="um-btn" data-act="retry">Coba lagi</button><button class="um-btn" data-act="cancel">Tutup</button></div>');
      });
      return;
    }
    petakan(step === 'bentuk' ? stepBentuk() : step === 'isi' ? stepIsi() : stepPrivasi());
  }
  function stepTujuan() {
    return UM.store.listGalaksi().then(function (rows) {
      var chips = rows.map(function (g) {
        return '<button class="um-chip' + (!comp.baru && comp.galaksiId === g.id ? ' on' : '') + '" data-act="pick-galaksi" data-id="' + escAttr(g.id) + '">' + '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + warnaAman(g.warna) + '"></span>' + escAttr(g.nama) + '</button>';
      }).join('');
      var kat = UM.i18n.kategoriIds().map(function (k) {
        return '<button class="um-chip' + (comp.newKategori === k ? ' on' : '') + '" data-act="cat" data-id="' + escAttr(k) + '">' + escAttr(UM.i18n.kategori(k)) + '</button>';
      }).join('');
      var isi = '<div class="um-h2">' + teks(T('c1Title')) + '</div>';
      if (chips) {
        isi += '<div class="um-chips" style="margin-bottom:12px">' + chips + '<button class="um-chip' + (comp.baru ? ' on' : '') + '" data-act="baru">' + teks(T('c1Baru')) + '</button></div>';
      }
      if (comp.baru) {
        isi += '<div class="um-field">' + '<label class="um-label" for="um-nama">' + teks(T('c1Label')) + '</label>' + '<input class="um-input" id="um-nama" data-field="nama" value="' + escAttr(comp.newNama) + '" placeholder="' + escAttr(T('c1Ph')) + '">' + '</div>' + '<div class="um-field">' + '<div class="um-label">' + teks(T('c1Cat')) + '</div>' + '<div class="um-chips">' + kat + '</div>' + '<input class="um-input" data-field="custom-category" aria-label="Kategori khusus" placeholder="Kategori khusus (opsional)" value="' + escAttr(comp.customCategory || '') + '">' + '</div>';
      } else {
        var tujuan = rows.find(function (g) {
          return g.id === comp.galaksiId;
        });
        isi += '<div class="um-note" role="status">Ucapan akan disimpan di galaksi <strong>' + escAttr(tujuan ? tujuan.nama : '') + '</strong>. Pilih galaksi lain di atas untuk mengganti tujuan.</div>';
      }
      isi += '<div class="um-field"><div class="um-label">Tujuan tambahan (opsional, maksimal 9)</div><div class="um-chips">' + rows.filter(function (g) {
        return g.id !== comp.galaksiId;
      }).map(function (g) {
        return '<button class="um-chip' + ((comp.targets || []).indexOf(g.id) >= 0 ? ' on' : '') + '" data-act="extra-target" data-id="' + escAttr(g.id) + '">' + escAttr(g.nama) + '</button>';
      }).join('') + '</div></div>';
      return isi + '<div class="um-error">' + escAttr(comp.err) + '</div>' + '<div class="um-btn-row end">' + '<button class="um-btn ghost" data-act="cancel">' + teks(T('btnCancel')) + '</button>' + '<button class="um-btn primary" data-act="next">' + teks(T('btnNext')) + ' →</button>' + '</div>';
    });
  }

  /* Pratinjau bentuk galaksi: SVG kecil, warna mengikuti pilihan pengguna. */
  function svgBentuk(kind, warna) {
    var w = warnaAman(warna);
    if (kind === 'spiral') {
      return '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">' + '<circle cx="32" cy="32" r="4" fill="' + w + '"/>' + '<path d="M32 32 C46 30 52 40 44 48 C36 56 22 50 20 38" fill="none" stroke="' + w + '" stroke-width="2.4" stroke-linecap="round" opacity=".85"/>' + '<path d="M32 32 C18 34 12 24 20 16 C28 8 42 14 44 26" fill="none" stroke="' + w + '" stroke-width="2.4" stroke-linecap="round" opacity=".85"/>' + '</svg>';
    }
    if (kind === 'ellipsoid') {
      return '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">' + '<defs><radialGradient id="um-el"><stop offset="0%" stop-color="#fff6e6"/><stop offset="55%" stop-color="' + w + '"/><stop offset="100%" stop-color="' + w + '" stop-opacity="0"/></radialGradient></defs>' + '<ellipse cx="32" cy="32" rx="26" ry="18" fill="url(#um-el)" opacity=".9"/></svg>';
    }
    return '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">' + '<ellipse cx="27" cy="34" rx="17" ry="10" fill="' + w + '" opacity=".8" transform="rotate(-18 27 34)"/>' + '<ellipse cx="42" cy="26" rx="9" ry="7" fill="' + w + '" opacity=".6"/>' + '<circle cx="47" cy="38" r="3.4" fill="#fff0d8" opacity=".9"/></svg>';
  }
  function stepBentuk() {
    var bentuk = [{
      kind: 'spiral',
      kunci: 'bentukSpiral',
      ket: 'bentukSpiralD'
    }, {
      kind: 'ellipsoid',
      kunci: 'bentukEllipsoid',
      ket: 'bentukEllipsoidD'
    }, {
      kind: 'irregular',
      kunci: 'bentukIrregular',
      ket: 'bentukIrregularD'
    }];
    var warna = ['#ffd9a0', '#9cc0ff', '#f0a5b8', '#8fd8c8', '#c4b5fd', '#fca5a5'];
    var ukuran = [{
      r: 110,
      k: 'ukuranKecil'
    }, {
      r: 140,
      k: 'ukuranSedang'
    }, {
      r: 175,
      k: 'ukuranBesar'
    }];
    return '<div class="um-h2">' + teks(T('bentukTitle')) + '</div>' + '<div class="um-btn-row" style="margin-bottom:14px"><button class="um-btn small" data-act="upload">' + (comp.newFoto ? 'Ganti foto' : 'Unggah foto (opsional)') + '</button>' + (comp.newFoto ? '<span class="um-muted">Foto dipilih</span>' : '') + '</div>' + '<div class="um-bentuk">' + bentuk.map(function (b) {
      return '<button class="um-bentuk-opt' + (comp.newKind === b.kind ? ' on' : '') + '" data-act="kind" data-id="' + b.kind + '">' + svgBentuk(b.kind, comp.newWarna) + '<span class="t">' + teks(T(b.kunci)) + '</span>' + '<span class="d">' + teks(T(b.ket)) + '</span></button>';
    }).join('') + '</div>' + '<div class="um-field" style="margin-top:16px">' + '<div class="um-label">' + teks(T('bentukWarna')) + '</div>' + '<div class="um-chips">' + warna.map(function (c) {
      return '<button class="um-chip' + (comp.newWarna === c ? ' on' : '') + '" data-act="warna" data-id="' + c + '" style="border-color:' + c + '">' + '<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:' + c + '"></span></button>';
    }).join('') + '</div>' + '</div>' + '<div class="um-field">' + '<div class="um-label">' + teks(T('bentukUkuran')) + '</div>' + '<div class="um-chips">' + ukuran.map(function (u) {
      return '<button class="um-chip' + (comp.newRadius === u.r ? ' on' : '') + '" data-act="ukuran" data-id="' + u.r + '">' + teks(T(u.k)) + '</button>';
    }).join('') + '</div>' + '<div class="um-hint">' + teks(T('bentukHint')) + '</div>' + '</div>' + '<div class="um-error">' + escAttr(comp.err) + '</div>' + '<div class="um-btn-row between">' + '<button class="um-btn ghost" data-act="back">← ' + teks(T('btnBack')) + '</button>' + '<button class="um-btn primary" data-act="next">' + teks(T('btnNext')) + ' →</button>' + '</div>';
  }
  function stepIsi() {
    var moods = UM.i18n.moodIds().map(function (m) {
      return '<button class="um-chip' + (comp.mood === m ? ' on' : '') + '" data-act="mood" data-id="' + escAttr(m) + '">' + escAttr(UM.i18n.mood(m)) + '</button>';
    }).join('');
    return '<div class="um-h2">' + teks(T('c3Title')) + '</div>' + '<div class="um-field">' + '<label class="um-label" for="um-isi">' + teks(T('c3Isi')) + '</label>' + '<textarea class="um-textarea" id="um-isi" data-field="isi" placeholder="' + escAttr(T('c3IsiPh')) + '">' + escAttr(comp.isi) + '</textarea>' + '</div>' + '<div class="um-grid2">' + '<div class="um-field"><label class="um-label" for="um-tanggal">' + teks(T('c3Tanggal')) + '</label>' + '<input class="um-input" id="um-tanggal" type="date" data-field="tanggal" value="' + escAttr(comp.tanggal) + '"></div>' + '<div class="um-field"><label class="um-label" for="um-tag">' + teks(T('c3Tag')) + '</label>' + '<input class="um-input" id="um-tag" data-field="tag" value="' + escAttr(comp.tag) + '" placeholder="' + escAttr(T('c3TagPh')) + '">' + '<div class="um-hint">' + teks(T('c3TagHint')) + '</div></div>' + '</div>' + '<div class="um-field"><div class="um-label">' + teks(T('c3Mood')) + '</div>' + '<div class="um-chips">' + moods + '</div></div>' + '<div class="um-field"><label class="um-label" for="um-files">Lampiran terenkripsi (opsional)</label><input id="um-files" class="um-input" type="file" multiple><div class="um-hint">' + (comp.files || []).length + ' berkas dipilih · maksimal 5</div></div>' + '<div class="um-error">' + escAttr(comp.err) + '</div>' + '<div class="um-btn-row between">' + '<button class="um-btn ghost" data-act="back">← ' + teks(T('btnBack')) + '</button>' + '<button class="um-btn primary" data-act="next">' + teks(T('btnNext')) + ' →</button>' + '</div>';
  }
  function stepPrivasi() {
    var opts = [['privat', 'privPrivat', 'privPrivatD'], ['publik', 'privPublik', 'privPublikD'], ['unlisted', 'privUnlisted', 'privUnlistedD']];
    return '<div class="um-h2">' + teks(T('c4Title')) + '</div>' + '<div class="um-priv">' + opts.map(function (o) {
      return '<button class="um-priv-opt' + (comp.privasi === o[0] ? ' on' : '') + '" data-act="priv" data-id="' + o[0] + '">' + '<span class="mark"></span><span><span class="t">' + teks(T(o[1])) + '</span><span class="d">' + teks(T(o[2])) + '</span></span></button>';
    }).join('') + '</div>' + '<div class="um-note">' + teks(T('c4Note')) + '</div>' + '<div class="um-field"><label class="um-label" for="um-release-at">Buka pada waktu tertentu (opsional)</label><input id="um-release-at" class="um-input" type="datetime-local" data-field="release-at" value="' + escAttr(comp.releaseAt || '') + '"><p class="um-hint">Waktu mengikuti perangkatmu. Pesan publik terjadwal terbit setelah waktu ini jika lolos pemeriksaan awal. Pesan privat menjadi kapsul waktu; pemilik tetap dapat mengelolanya.</p></div>' + (comp.privasi === 'publik' ? '<div class="um-note">Pesan publik anonim tampil setelah lolos pemeriksaan awal. Jika ditandai, pesan menunggu tinjauan moderator. Foto serta lampiran tetap privat milik akun.</div>' : comp.privasi === 'unlisted' ? '<div class="um-note">Isi tautan terbatas dienkripsi di perangkat. Hanya penerima dengan tautan lengkap dapat membukanya. Buat tautan melalui Kelola pesan setelah menyimpan.</div>' : '') + '<div class="um-error">' + escAttr(comp.err) + '</div>' + '<div class="um-btn-row between">' + '<button class="um-btn ghost" data-act="back">← ' + teks(T('btnBack')) + '</button>' + '<button class="um-btn primary" data-act="save">✦ ' + teks(T('btnSave')) + '</button>' + '</div>';
  }
  function serapInput() {
    var w = compEl.querySelector('.um-wrap');
    if (!w) return;
    var n = w.querySelector('[data-field="nama"]');
    if (n) comp.newNama = n.value;
    var custom = w.querySelector('[data-field="custom-category"]');
    if (custom) comp.customCategory = custom.value;
    var release = w.querySelector('[data-field="release-at"]');
    if (release) comp.releaseAt = release.value;
    var i = w.querySelector('[data-field="isi"]');
    if (i) comp.isi = i.value;
    var t = w.querySelector('[data-field="tanggal"]');
    if (t) comp.tanggal = t.value;
    var g = w.querySelector('[data-field="tag"]');
    if (g) comp.tag = g.value;
  }
  function validasiLangkah() {
    var step = comp.steps[comp.step];
    comp.err = '';
    if (step === 'tujuan' && comp.baru && !comp.newNama.trim()) {
      comp.err = T('errNama');
      return false;
    }
    if (step === 'isi' && !comp.isi.trim()) {
      comp.err = T('errIsi');
      return false;
    }
    if (step === 'privasi' && comp.privasi !== 'publik' && !UM.crypto.unlocked()) {
      comp.err = T('errPrivatLocked');
      return false;
    }
    return true;
  }

  /* Menyimpan pesan beserta identitas bintangnya untuk ditampilkan di tujuan. */
  function simpanPesan() {
    var membuatGalaksi = comp.baru || comp.galaksiDibuatId === comp.galaksiId;
    var galaksiBaru = comp.baru ? UM.store.saveGalaksiBaru({
      nama: comp.newNama.trim(),
      kategori: (comp.customCategory || '').trim() || comp.newKategori || 'seseorang',
      kind: comp.newKind,
      warna: comp.newWarna,
      radius: comp.newRadius,
      count: comp.newRadius >= 160 ? 10000 : comp.newRadius <= 120 ? 7000 : 8500,
      foto: comp.newFoto,
      seed: false
    }) : Promise.resolve({
      id: comp.galaksiId
    });
    var tagList = String(comp.tag || '').split(',').map(function (s) {
      return s.trim();
    }).filter(function (s) {
      return s.length;
    }).slice(0, 5);
    return galaksiBaru.then(function (g) {
      if (membuatGalaksi) comp.galaksiDibuatId = g.id;
      comp.baru = false;
      comp.galaksiId = g.id;
      return UM.store.simpanPesan({
        galaksiId: g.id,
        galaksiIds: [g.id].concat(comp.targets || []),
        teks: comp.isi,
        privasi: comp.privasi,
        tanggal: comp.tanggal || null,
        mood: comp.mood || null,
        tag: tagList,
        dibuat: Date.now(),
        attachments: comp.files || [],
        releaseAt: comp.releaseAt ? new Date(comp.releaseAt).toISOString() : undefined
      }).then(function (pesan) {
        return {
          galaksiId: g.id,
          pesanId: pesan.id,
          galaksiBaru: membuatGalaksi
        };
      });
    });
  }
  function buildKomposer() {
    compEl = el('div', 'um-screen z-top');
    compEl.id = 'um-comp';
    compEl.addEventListener('input', serapInput, true);
    compEl.appendChild(el('div', 'um-wrap narrow'));
    compEl.addEventListener('change', function (e) {
      if (e.target.id === 'um-files') {
        comp.files = Array.from(e.target.files).slice(0, 5);
        serapInput();
        renderKomposer();
      }
    });
    compEl.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (comp.saving) return;
      if (act === 'retry') {
        renderKomposer();
        return;
      }
      serapInput();
      if (act === 'cancel') {
        close(compEl);
        comp.files = [];
        return;
      }
      if (act === 'baru') {
        comp.baru = true;
        comp.galaksiId = null;
        comp.err = '';
        renderKomposer();
        return;
      }
      if (act === 'extra-target') {
        var tid = btn.getAttribute('data-id'),
          pos = comp.targets.indexOf(tid);
        if (pos >= 0) comp.targets.splice(pos, 1);else if (comp.targets.length < 9) comp.targets.push(tid);else toast('Maksimal 10 tujuan per pesan.');
        renderKomposer();
        return;
      }
      if (act === 'pick-galaksi') {
        comp.baru = false;
        comp.galaksiId = btn.getAttribute('data-id');
        comp.targets = comp.targets.filter(function (id) {
          return id !== comp.galaksiId;
        });
        comp.err = '';
        renderKomposer();
        return;
      }
      if (act === 'cat') {
        comp.newKategori = btn.getAttribute('data-id');
        renderKomposer();
        return;
      }
      if (act === 'kind') {
        comp.newKind = btn.getAttribute('data-id');
        renderKomposer();
        return;
      }
      if (act === 'warna') {
        comp.newWarna = btn.getAttribute('data-id');
        renderKomposer();
        return;
      }
      if (act === 'ukuran') {
        comp.newRadius = parseInt(btn.getAttribute('data-id'), 10);
        renderKomposer();
        return;
      }
      if (act === 'upload') {
        fotoInput.click();
        return;
      }
      if (act === 'mood') {
        comp.mood = comp.mood === btn.getAttribute('data-id') ? '' : btn.getAttribute('data-id');
        serapInput();
        renderKomposer();
        return;
      }
      if (act === 'priv') {
        comp.privasi = btn.getAttribute('data-id');
        comp.err = '';
        renderKomposer();
        return;
      }
      if (act === 'back') {
        serapInput();
        comp.step = Math.max(0, comp.step - 1);
        comp.err = '';
        renderKomposer();
        return;
      }
      if (act === 'next') {
        serapInput();
        if (!validasiLangkah()) {
          renderKomposer();
          return;
        }
        comp.step = Math.min(comp.steps.length - 1, comp.step + 1);
        renderKomposer();
        return;
      }
      if (act === 'save') {
        if (!validasiLangkah()) {
          renderKomposer();
          return;
        }
        comp.saving = true;
        compEl.querySelectorAll('button').forEach(function (button) {
          button.disabled = true;
        });
        simpanPesan().then(function (tersimpan) {
          comp.saving = false;
          compEl.querySelectorAll('button').forEach(function (button) {
            button.disabled = false;
          });
          close(compEl);
          return kirimKeGalaksi(tersimpan.galaksiId, 'pesan', T('kirimPesan'), tersimpan.pesanId, tersimpan.galaksiBaru).catch(function () {
            toast('Ucapan tersimpan. Buka Ruang Pribadi untuk menuju galaksinya.');
          });
        }).catch(function (err) {
          comp.saving = false;
          compEl.querySelectorAll('button').forEach(function (button) {
            button.disabled = false;
          });
          comp.err = err && err.message === 'locked' ? T('errPrivatLocked') : String(err && err.message || err);
          comp.step = comp.steps.length - 1;
          renderKomposer();
        });
        return;
      }
    });
    document.body.appendChild(compEl);
  }

  /* ── animasi terkirim ────────────────────────────────────────────────────── */

  /* Galaksi terbentuk sekali. Pesan berikutnya tiba sebagai bintang jatuh. */
  function kirimKeGalaksi(galaksiId, jenis, pesanSukses, pesanId, galaksiBaru) {
    return Promise.all([UM.galaksi.refresh(), UM.sky.refresh()]).then(function () {
      var item = null;
      for (var i = 0; i < UM.galaksi.state.daftar.length; i++) {
        if (UM.galaksi.state.daftar[i].g.id === galaksiId) {
          item = UM.galaksi.state.daftar[i];
          break;
        }
      }
      if (item && jenis === 'pesan') {
        renderDock();
        renderSkyCtl();
        var selesai = function () {
          UM.galaksi.terbangKe(item, pesanId);
          toast(pesanSukses);
        };
        toast(galaksiBaru ? 'Galaksi kenanganmu sedang terbentuk…' : 'Bintang pesanmu menuju galaksi…');
        return galaksiBaru ? UM.galaksi.bentukGalaksi(item, selesai) : UM.galaksi.kirimPerjalanan(item, jenis, selesai);
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
    Promise.all([(UM.store.listPesanLadang || UM.store.listPesan)(g.id), UM.store.listDoa(g.id)]).then(function (r) {
      if (requestId !== kartuRequest || bpBody.firstChild !== panelBefore) return;
      var semua = r[0],
        doa = r[1];
      /* Sama seperti pelapis di um-galaksi.js: piringan = bintang, sabuk = debu.
         Kalau penyaringnya berbeda, angka di kartu tidak akan sama dengan yang
         benar-benar tergambar di galaksinya. */
      var punyaku = semua.filter(function (p) {
        return p.sendiri !== false || p.piringan === true;
      });
      var orangLain = item.batuList || [];
      var jumlah = UM.galaksi.hitungCatatan(punyaku);
      UM.renderScreen(bpBody, '<div id="bp-name" style="color:' + warnaAman(g.warna) + '">' + escAttr(g.nama) + '</div>' + '<span id="bp-type">' + escAttr(UM.i18n.kategori(g.kategori)) + ' · ' + escAttr(T('jenis' + (g.kind === 'spiral' ? 'Spiral' : g.kind === 'ellipsoid' ? 'Ellipsoid' : 'Irregular'))) + '</span>' + (g.foto ? '<img id="bp-img" src="' + escAttr(g.foto) + '" alt="' + escAttr(g.nama) + '" loading="lazy">' : '') + '<div class="bp-row" data-galaxy-count="pesan"><span class="k">' + escAttr(T('gkBintang')) + '</span><span class="v">' + jumlah.pesan + '</span></div>' + '<div class="bp-row"><span class="k">' + escAttr(T('gkBatu')) + '</span><span class="v">' + orangLain.length + '</span></div>' + '<div class="bp-row" data-galaxy-count="doa-diterima"><span class="k">' + escAttr(T('gkDoa')) + '</span><span class="v">' + jumlah.doaDiterima + '</span></div>' + '<div id="bp-desc"><div class="um-muted">' + teks(T('gkHint')) + '</div></div>' + '<div class="um-muted" style="margin-top:8px">' + teks(T('legenda')) + '</div>' + '<div id="um-gk-list" style="margin-top:10px"></div>' + '<button class="um-btn primary" id="um-gk-tulis" type="button" style="width:100%;margin-top:10px">' + teks(T('gkKirim')) + '</button>' + '<button class="um-btn" id="um-gk-doa" type="button" style="width:100%;margin-top:8px">' + teks(T('gkDoakan')) + '</button>');
      bpEl.classList.add('open');

      // daftar ringkas berisi pesan MILIKMU saja — pesan dari orang lain sudah
      // bisa dibaca satu per satu dengan mengklik butir debunya di sabuk
      var lb = document.getElementById('um-gk-list');
      if (lb) {
        var tampil = punyaku.slice().reverse().slice(0, 6);
        UM.renderScreen(lb, tampil.length ? '<ul class="um-mini">' + tampil.map(function (p) {
          var idx = -1;
          if (item.pesanDiTitik) {
            var kunci = Object.keys(item.pesanDiTitik);
            for (var ki = 0; ki < kunci.length; ki++) {
              if (item.pesanDiTitik[kunci[ki]].id === p.id) {
                idx = parseInt(kunci[ki], 10);
                break;
              }
            }
          }
          return '<li><span class="t" data-isi="' + escAttr(p.id) + '">…</span>' + (idx >= 0 ? '<button class="um-mini-btn" data-bintang="' + idx + '">' + teks(T('gkLihat')) + '</button>' : '') + '</li>';
        }).join('') + '</ul>' : '<div class="um-dim" style="font-size:12px">' + teks(T('pcEmpty')) + '</div>');
        tampil.forEach(function (p) {
          UM.store.bacaIsi(p).then(function (txt) {
            var node = lb.querySelector('[data-isi="' + p.id + '"]');
            if (!node) return;
            if (txt == null) {
              node.classList.add('locked');
              node.textContent = '🔒 ' + T('lockedShort');
            } else node.textContent = txt.length > 70 ? txt.slice(0, 70) + '…' : txt;
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
      if (tb) tb.onclick = function () {
        bukaKomposer(g.id);
      };
      var db = document.getElementById('um-gk-doa');
      if (db) db.onclick = function () {
        bukaDoa(g.id, null);
      };
    });
  }

  /* Kartu untuk satu titik di lengan spiral. SEMUA titik bisa diklik: yang
     ditandai berisi pesan yang kamu tulis, yang lain berisi pesan dari orang
     lain yang dibuat saat titik itu diklik. Keduanya tampil sama di sini,
     supaya tidak ada titik yang terasa buntu. */
  function kartuTitik(item, p, index) {
    var requestId = ++kartuRequest;
    var milikSendiri = p.sendiri !== false;
    var support = UM.store.supportStatus(p);
    var baris = [];
    if (p.tanggal) baris.push('<div class="bp-row"><span class="k">' + escAttr(T('pcTanggal')) + '</span><span class="v">' + escAttr(ntah(new Date(p.tanggal + 'T12:00:00').getTime())) + '</span></div>');
    if (p.mood) baris.push('<div class="bp-row"><span class="k">' + escAttr(T('pcMood')) + '</span><span class="v">' + escAttr(UM.i18n.mood(p.mood)) + '</span></div>');
    if (p.tag && p.tag.length) baris.push('<div class="bp-row"><span class="k">' + escAttr(T('pcTag')) + '</span><span class="v">' + escAttr(p.tag.join(', ')) + '</span></div>');
    var total = p.pendoa && p.pendoa.total || 0;
    UM.renderScreen(bpBody, '<div id="bp-name" style="color:' + warnaAman(item.g.warna) + '">' + escAttr(item.g.nama) + '</div>' + '<span id="bp-type">✦ ' + escAttr(T('titikLabel')) + ' ' + badge(p.privasi) + '</span>' + baris.join('') + '<div id="bp-desc"><span class="um-dim">…</span></div>' + lampiran(p) + (total ? '<div class="um-muted" style="margin-top:10px">✦ ' + total + ' ' + escAttr(T('pcPendoa')) + '</div>' : '') + '<div class="um-muted" style="margin-top:10px">' + teks(T(milikSendiri ? 'titikSendiri' : 'titikOrangLain')) + '</div>' + (support.available ? '<button class="um-btn primary" id="um-b-doakan" type="button" style="width:100%;margin-top:10px">' + 'Doakan ucapan ini' + '</button>' + '<button class="um-btn" id="um-b-empati" type="button" style="width:100%;margin-top:8px">' + teks(T('pcEmpati')) + '</button>' : '<p class="um-note" role="status">' + teks(support.reason) + '</p>'));
    bpEl.classList.add('open');
    var description = document.getElementById('bp-desc');
    UM.store.bacaIsi(p).then(function (txt) {
      if (requestId !== kartuRequest) return;
      var d = document.getElementById('bp-desc');
      if (!d || d !== description) return;
      UM.renderScreen(d, txt != null ? '<div class="bp-text">' + teks(txt) + '</div>' : '<div class="um-muted">🔒 ' + teks(T('lockedShort')) + '</div>');
    });
    var dk = document.getElementById('um-b-doakan');
    if (dk) dk.onclick = function () {
      bukaDoa(item.g.id, p.id);
    };
    var em = document.getElementById('um-b-empati');
    if (em) em.onclick = function () {
      em.disabled = true;
      UM.store.empathy(p.id).then(function () {
        toast(T('empathiToast'));
      }).catch(function (err) {
        em.disabled = false;
        toast(err.message);
      });
    };
  }

  /* Butir debu di sabuk = pesan dari orang lain, plus doa yang menempel padanya.
     Karena setiap butir membawa pesannya sendiri, tidak ada lagi partikel yang
     buntu saat diklik. */
  function kartuBatu(item, entri) {
    var requestId = ++kartuRequest;
    var p = entri.pesan,
      d = entri.doa;
    var tr = d ? UM.doaData.byId(d.tradisi) : null;
    var doaEntri = d && d.doaId && d.doaId !== 'seed' ? UM.doaData.entri(d.tradisi, d.doaId) : null;
    var L = UM.i18n.getLang();
    var total = p.pendoa && p.pendoa.total || 0;
    UM.renderScreen(bpBody, '<div id="bp-name" style="color:' + warnaAman(item.g.warna) + '">' + escAttr(item.g.nama) + '</div>' + '<span id="bp-type">✦ ' + escAttr(T('batuLabel')) + '</span>' + (d ? '<div class="bp-row"><span class="k">' + escAttr(T('batuTradisi')) + '</span><span class="v">' + escAttr(tr ? tr.simbol + ' ' + (tr.label[L] || tr.label.id) : d.tradisi) + '</span></div>' : '') + (doaEntri ? '<div class="bp-row"><span class="k">' + escAttr(T('batuDoa')) + '</span><span class="v">' + escAttr(doaEntri.nama[L] || doaEntri.nama.id) + '</span></div>' : '') + (total ? '<div class="bp-row"><span class="k">' + escAttr(T('pcPendoa')) + '</span><span class="v">' + total + '</span></div>' : '') + (d ? '<div class="bp-row"><span class="k">' + escAttr(T('batuKapan')) + '</span><span class="v">' + escAttr(ntah(d.dibuat)) + '</span></div>' : '') + '<div id="bp-desc"><span class="um-dim">…</span></div>' + '<div class="um-muted" style="margin-top:10px">' + teks(T('batuDari')) + '</div>');
    bpEl.classList.add('open');
    var description = document.getElementById('bp-desc');
    UM.store.bacaIsi(p).then(function (txt) {
      if (requestId !== kartuRequest) return;
      var desc = document.getElementById('bp-desc');
      if (!desc || desc !== description) return;
      UM.renderScreen(desc, txt != null ? '<div class="bp-text">' + teks(txt) + '</div>' : '<div class="um-muted">🔒 ' + teks(T('lockedShort')) + '</div>');
    });
  }
  function tutupPanel() {
    ++kartuRequest;
    if (bpEl) bpEl.classList.remove('open');
  }

  /* ── ruang pribadi (PRD §9.6) ────────────────────────────────────────────── */

  function bukaDash() {
    if (!UM.account.isLogged()) {
      UM.account.require().then(function (ok) {
        if (ok) bukaDash();
      });
      return;
    }
    closeAllScreens();
    open(dashEl);
    renderDash();
  }
  function metadataPesan(p, clickable) {
    var html = p.mood ? '<span class="um-badge">' + teks(UM.i18n.mood(p.mood)) + '</span>' : '';
    (p.tag || []).forEach(function (tag) {
      html += clickable ? '<button class="um-chip" data-act="tag-filter" data-id="' + escAttr(tag) + '">#' + teks(tag) + '</button>' : '<span class="um-badge">#' + teks(tag) + '</span>';
    });
    return html ? '<div class="um-chips" style="margin:10px 0" aria-label="Suasana hati dan tag">' + html + '</div>' : '';
  }
  function filterPesanSaya() {
    return '<p class="um-hint">Cari pesan milikmu, termasuk pesan privat dan yang menunggu moderasi. Empati dan doa tersedia setelah ucapan publik disetujui dan dibuka.</p><div class="um-grid2"><div class="um-field"><label class="um-label" for="um-own-mood">Suasana hati pesan saya</label><select id="um-own-mood" class="um-select"><option value="">Semua</option>' + UM.i18n.moodIds().map(function (m) {
      return '<option value="' + escAttr(m) + '"' + (dashMood === m ? ' selected' : '') + '>' + teks(UM.i18n.mood(m)) + '</option>';
    }).join('') + '</select></div><div class="um-field"><label class="um-label" for="um-own-tag">Tag pesan saya</label><input id="um-own-tag" class="um-input" maxlength="50" value="' + escAttr(dashTag) + '"></div></div><div class="um-btn-row"><button class="um-btn" data-act="filter-own">Terapkan filter pesan saya</button><button class="um-btn ghost" data-act="reset-own">Hapus filter pesan saya</button></div>';
  }

  function renderDash() {
    Promise.all([UM.store.stats(), UM.store.listGalaksi()]).then(function (r) {
      var s = r[0],
        galaksi = r[1];
      UM.renderScreen(dashEl.querySelector('.um-wrap'), '<div class="um-head"><div class="um-h1">' + teks(T('dashTitle')) + '</div>' + '<button class="um-close" data-act="close" aria-label="' + escAttr(T('commonClose')) + '">×</button></div>' + '<div class="um-stats" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">' + '<div class="um-stat" data-stat="pesan"><b>' + s.pesan + '</b><span>' + teks(T('dashStatPesan')) + '</span></div>' + '<div class="um-stat"><b>' + s.galaksi + '</b><span>' + teks(T('dashStatGalaksi')) + '</span></div>' + '<div class="um-stat"><b>' + s.doaDiterima + '</b><span>' + teks(T('dashStatDoa')) + '</span></div>' + '<div class="um-stat"><b>' + s.doaDiberikan + '</b><span>' + teks(T('dashStatPendoa')) + '</span></div>' + '</div>' + (s.pesanMasuk ? '<div class="um-muted" style="margin-top:10px">✦ ' + s.pesanMasuk + ' ' + teks(T('dashMasuk')) + '</div>' : '') + '<div class="um-card" style="margin-top:14px">' + '<div class="um-h3">' + teks(T('dashGalaksi')) + '</div>' + (galaksi.length ? '<ul class="um-list">' + galaksi.map(function (g) {
        return '<li class="um-item"><div class="um-item-top">' + '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + warnaAman(g.warna) + '"></span>' + '<span class="who">' + escAttr(g.nama) + '</span>' + '<span class="when">' + escAttr(UM.i18n.kategori(g.kategori)) + '</span></div>' + '<div class="um-item-acts">' + '<button class="um-btn small" data-act="terbang" data-id="' + escAttr(g.id) + '">' + teks(T('gkTerbang')) + '</button>' + '<button class="um-btn small" data-act="tulis-untuk" data-id="' + escAttr(g.id) + '">' + teks(T('dockTulis')) + '</button>' + '</div></li>';
      }).join('') + '</ul>' : '<div class="um-empty">' + teks(T('dashEmptyGalaksi')) + '</div>') + '</div>' + '<div class="um-card"><h2 class="um-h3">' + teks(T('dashPesan')) + '</h2>' + filterPesanSaya() + '<div id="um-dash-pesan"><div class="um-empty">…</div></div></div>' + '<div class="um-btn-row">' + '<button class="um-btn primary" data-act="tulis">✎ ' + teks(T('dockTulis')) + '</button>' + '<button class="um-btn" data-act="peta">✧ ' + teks(T('dockPeta')) + '</button>' + '</div>');
      renderDashPesan();
    });
  }
  function renderDashPesan() {
    var request = ++dashRequest;
    Promise.all([UM.store.listPesan(), UM.store.listGalaksi()]).then(function (r) {
      if (request !== dashRequest || !dashEl.classList.contains('on')) return;
      // hanya pesan milikmu: pesan dari orang lain jumlahnya ratusan dan sudah
      // bisa dibaca satu per satu lewat butir debu di sabuk tiap galaksi
      var pesan = r[0].filter(function (p) {
        return p.sendiri !== false && (!dashMood || UM.store.normalisasiMood(p.mood) === dashMood) &&
          (!dashTag || (p.tag || []).some(function (tag) { return UM.store.normalisasiTag(tag) === dashTag; }));
      });
      var galaksi = r[1],
        nama = {};
      galaksi.forEach(function (g) {
        nama[g.id] = g;
      });
      renderDashDaftar(pesan, nama, 'um-dash-pesan', dashMood || dashTag ? 'Tidak ada pesan milikmu yang cocok dengan filter ini.' : T('dashEmptyPesan'));
    }).catch(function (err) {
      toast(err.message || 'Catatan belum dapat dimuat.');
    });
  }
  function renderDashDaftar(pesan, nama, hostId, emptyText) {
    var box = document.getElementById(hostId);
    if (!box) return;
    if (!pesan.length) {
      UM.renderScreen(box, '<div class="um-empty">' + teks(emptyText) + '</div>');
      return;
    }
    UM.renderScreen(box, '<ul class="um-list">' + pesan.slice().reverse().map(function (p) {
      var g = nama[p.galaksiId] || {
        nama: '—'
      };
      return '<li class="um-item"><div class="um-item-top">' + '<span class="who">' + escAttr(g.nama) + '</span>' + badge(p.privasi) + '<span class="when">' + escAttr(ntah(p.dibuat)) + '</span></div>' + (p.privasi === 'publik' ? '<div class="um-muted">Status: ' + escAttr({
        pending: 'Menunggu peninjauan',
        approved: 'Terbit',
        rejected: 'Ditolak',
        removed: 'Ditarik'
      }[p.moderationStatus] || p.moderationStatus) + '</div>' : '') + metadataPesan(p, false) + (p.privasi === 'publik' && !UM.store.supportStatus(p).available ? '<p class="um-hint">' + teks(UM.store.supportStatus(p).reason) + '</p>' : '') + '<div class="txt um-dim" data-isi="' + escAttr(p.id) + '">…</div>' + lampiran(p) + (p.pendoa && p.pendoa.total ? '<div class="um-muted" style="margin-top:6px">✦ ' + p.pendoa.total + ' ' + escAttr(T('pcPendoa')) + '</div>' : '') + '</li>';
    }).join('') + '</ul>');
    pesan.forEach(function (p) {
      UM.store.bacaIsi(p).then(function (txt) {
        var node = box.querySelector('[data-isi="' + p.id + '"]');
        if (!node) return;
        if (txt == null) {
          node.classList.add('locked');
          node.textContent = '🔒 ' + T('lockedShort');
        } else {
          node.classList.remove('um-dim');
          node.textContent = txt.length > 150 ? txt.slice(0, 150) + '…' : txt;
        }
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
      var act = btn.getAttribute('data-act'),
        id = btn.getAttribute('data-id');
      if (act === 'close') close(dashEl);else if (act === 'tulis') bukaKomposer();else if (act === 'peta') {
        close(dashEl);
        kePeta();
      } else if (act === 'filter-own' || act === 'reset-own') {
        dashMood = act === 'filter-own' ? dashEl.querySelector('#um-own-mood').value : '';
        dashTag = act === 'filter-own' ? UM.store.normalisasiTag(dashEl.querySelector('#um-own-tag').value) : '';
        renderDash();
      } else if (act === 'tulis-untuk') {
        close(dashEl);
        bukaKomposer(id);
      } else if (act === 'terbang') {
        close(dashEl);
        keLadang().then(function () {
          for (var i = 0; i < UM.galaksi.state.daftar.length; i++) {
            if (UM.galaksi.state.daftar[i].g.id === id) {
              UM.galaksi.terbangKe(UM.galaksi.state.daftar[i]);
              break;
            }
          }
        }).catch(function (err) {
          toast(err.message || T('genHilang'));
        });
      }
    });
    document.body.appendChild(dashEl);
  }

  /* ── jelajah (PRD §9.4) ──────────────────────────────────────────────────── */

  function bukaJelajah() {
    closeAllScreens();
    open(expEl);
    expOffset = 0;
    renderJelajah();
  }
  function gambarJelajah() {
    var busy = expBusy ? ' disabled' : '';
    var filters = (expMood ? 'Suasana: ' + UM.i18n.mood(expMood) : 'Semua suasana') + (expTag ? ' · Tag: #' + expTag : ' · Semua tag');
    UM.renderScreen(expEl.querySelector('.um-wrap'), '<div class="um-head"><div><div class="um-h1">Jelajah ucapan</div><p class="um-muted">Ruang untuk membaca ucapan publik anonim dan saling mendukung. Sampaikan empati atau pilih Doakan ucapan ini untuk membuka pilihan agama atau tradisi. Pesan pribadi Anda ada di Ruang Pribadi.</p></div><button class="um-close" data-act="close" aria-label="Tutup Jelajah">×</button></div>' + '<div class="um-card"><div class="um-grid2"><div class="um-field"><label class="um-label" for="um-filter-mood">Suasana hati</label><select id="um-filter-mood" class="um-select"' + busy + '><option value="">Semua</option>' + UM.i18n.moodIds().map(function (m) {
      return '<option value="' + escAttr(m) + '"' + (expMood === m ? ' selected' : '') + '>' + teks(UM.i18n.mood(m)) + '</option>';
    }).join('') + '</select></div><div class="um-field"><label class="um-label" for="um-filter-tag">Tag</label><input id="um-filter-tag" class="um-input" value="' + escAttr(expTag) + '" maxlength="50" placeholder="Contoh: kenangan"' + busy + '><p class="um-hint">Cari satu tag. Huruf besar, spasi tepi, dan tanda # tidak membedakan hasil. Pilih suasana dan/atau tag, lalu tekan Terapkan filter.</p></div></div>' + '<div class="um-btn-row"><button class="um-btn" data-act="filter"' + busy + '>Terapkan filter</button><button class="um-btn ghost" data-act="reset-filter"' + busy + '>Hapus filter</button></div>' + '<p class="um-hint">Pesan publik yang lolos pemeriksaan awal dan sudah dibuka tampil di sini. Pilih tag dan/atau suasana hati untuk melihat pesan yang sesuai.</p>' + '<div class="um-chips" role="group" aria-label="Urutan ucapan" style="margin-top:16px">' + '<button class="um-chip' + (expSort === 'baru' ? ' on' : '') + '" aria-pressed="' + (expSort === 'baru') + '" data-act="sort" data-id="baru"' + busy + '>Terbaru</button>' + '</div>' + '<p class="um-muted">Urutan waktu pesan dibuat, dari yang terbaru ke yang lebih lama.</p>' + '<p class="um-hint" data-filter-summary>' + teks(filters) + '</p></div>' + '<div aria-live="polite" aria-busy="' + expBusy + '">' + (expBusy ? '<p class="um-note" role="status">Memuat ucapan…</p>' : expError ? '<p class="um-note warn" role="alert">' + teks(expError) + '</p><button class="um-btn" data-act="retry">Coba lagi</button>' : expRows.length ? '<ul class="um-list um-card" style="margin-top:14px">' + expRows.map(function (p) {
      return '<li class="um-item"><div class="um-item-top"><span class="who">' + teks(p.sendiri ? T('expMine') : T('expAnon')) + '</span><span class="um-badge publik">' + (p.pendoa && p.pendoa.total || 0) + ' pendoa</span><span class="when">' + teks(ntah(p.dibuat)) + '</span></div>' + (p.authorDeleted ? '<div class="um-muted">Tulisan dipertahankan secara anonim; akun penulis sudah dihapus.</div>' : '') + metadataPesan(p, true) + '<div class="txt" data-isi="' + escAttr(p.id) + '">' + teks(p.publicBody || '') + '</div><div class="um-item-acts">' + '<button class="um-btn small primary" data-act="doa" data-id="' + escAttr(p.id) + '" data-g="' + escAttr(p.galaksiId) + '">Doakan ucapan ini</button>' + '<button class="um-btn small" data-act="empati" data-id="' + escAttr(p.id) + '">Aku merasakan ini</button>' + '<button class="um-btn small ghost" data-act="lapor" data-id="' + escAttr(p.id) + '">Laporkan</button>' + (p.sendiri || p.authorDeleted ? '' : '<button class="um-btn small ghost" data-act="block" data-id="' + escAttr(p.id) + '">Blokir pengirim</button>') + '</div></li>';
    }).join('') + '</ul>' : '<p class="um-empty">Belum ada pesan publik dengan tag atau suasana hati yang dipilih. Coba pilihan lain atau hapus filter.</p>') + '</div>' + '<p id="um-exp-page-status" class="um-hint" role="status">' + (expBusy ? 'Memuat halaman...' : expError ? 'Gagal memuat halaman. Tekan Coba lagi.' : expRows.length ? 'Menampilkan ucapan ' + (expOffset + 1) + ' sampai ' + (expOffset + expRows.length) + '. Maksimal 30 ucapan per halaman.' : 'Tidak ada ucapan untuk ditampilkan.') + '</p>' + '<nav aria-describedby="um-exp-page-status" class="um-btn-row between" aria-label="Halaman ucapan"><button class="um-btn" data-act="prev-page"' + (!expOffset || expBusy ? ' disabled' : '') + '>Sebelumnya</button><span class="um-muted">Halaman ' + (Math.floor(expOffset / 30) + 1) + '</span><button class="um-btn" data-act="next-page"' + (!expMore || expBusy || expError ? ' disabled' : '') + '>Berikutnya</button></nav>' + (!expBusy && !expError && !expOffset ? '<p class="um-hint">Anda berada di halaman pertama, sehingga Sebelumnya belum tersedia.</p>' : '') + (!expBusy && !expError && !expMore ? '<p class="um-hint">Anda sudah mencapai akhir hasil. Tidak ada halaman berikutnya. Berikutnya aktif jika masih ada ucapan setelah halaman ini.</p>' : ''));
  }
  function renderJelajah() {
    var request = ++expRequest;
    expBusy = true;
    expError = '';
    gambarJelajah();
    UM.store.explore(expSort, expOffset, expMood, expTag).then(function (rows) {
      if (request !== expRequest || !expEl.classList.contains('on')) return;
      expRows = rows.slice(0, 30);
      expMore = rows.length > 30;
      expBusy = false;
      gambarJelajah();
    }).catch(function (error) {
      if (request !== expRequest || !expEl.classList.contains('on')) return;
      expError = error.message || 'Ucapan belum dapat dimuat.';
      expBusy = false;
      gambarJelajah();
    });
  }
  function buildJelajah() {
    expEl = el('div', 'um-screen');
    expEl.id = 'um-exp';
    expEl.appendChild(el('div', 'um-wrap'));
    expEl.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn || btn.disabled) return;
      var act = btn.getAttribute('data-act'),
        id = btn.getAttribute('data-id');
      if (act === 'close') {
        ++expRequest;
        close(expEl);
      } else if (act === 'tag-filter') {
        expTag = UM.store.normalisasiTag(id); expOffset = 0; renderJelajah();
      } else if (act === 'retry') renderJelajah();else if (act === 'sort') {
        expSort = id;
        expOffset = 0;
        renderJelajah();
      } else if (act === 'filter' || act === 'reset-filter') {
        expMood = act === 'filter' ? expEl.querySelector('#um-filter-mood').value : '';
        expTag = act === 'filter' ? UM.store.normalisasiTag(expEl.querySelector('#um-filter-tag').value) : '';
        expOffset = 0;
        renderJelajah();
      } else if (act === 'prev-page' || act === 'next-page') {
        if (expBusy || act === 'next-page' && !expMore) return;
        expOffset = Math.max(0, expOffset + (act === 'next-page' ? 30 : -30));
        renderJelajah();
        expEl.scrollTop = 0;
      } else if (act === 'doa') bukaDoa(btn.getAttribute('data-g'), id);else if (act === 'empati') {
        btn.disabled = true;
        UM.store.empathy(id).then(function () {
          if (btn.isConnected) btn.textContent = 'Empati terkirim';
          toast(T('empathiToast'));
        }).catch(function (error) {
          btn.disabled = false;
          toast(error.message);
        });
      } else if (act === 'lapor' || act === 'block') UM.openSocial(act === 'lapor' ? 'report' : 'block', id);
    });
    document.body.appendChild(expEl);
  }

  /* ── modal doa (PRD §9.5) ────────────────────────────────────────────────── */

  function doaAktif(current, sequence) {
    return current === doaState && current.sequence === sequence && doaEl.classList.contains('on');
  }
  function namaTujuanDoa(current) {
    var item = UM.galaksi.state.daftar.find(function (item) {
      return item.g.id === current.galaksiId;
    });
    return item ? item.g.nama : 'Ucapan publik';
  }
  function muatDaftarDoa(current) {
    var sequence = ++current.sequence;
    current.fase = 'preparing';
    current.error = '';
    renderDoa();
    Promise.all([UM.store.prayerCatalog(), UM.store.explore('baru', current.offset || 0)]).then(function (results) {
      if (!doaAktif(current, sequence)) return;
      current.candidates = results[1].slice(0, 30);
      current.more = results[1].length > 30;
      current.fase = current.candidates.length ? 'target' : 'empty';
      renderDoa();
    }).catch(function (error) {
      if (!doaAktif(current, sequence)) return;
      current.fase = 'prepare-error';
      current.error = error.message || 'Pilihan doa belum dapat dimuat.';
      renderDoa();
    });
  }
  function isiDoa(entry, L, showAudio) {
    var preview = showAudio !== false && /^\/api\/v1\/prayers\/audio\/[a-z-]+$/.test(entry.audio_preview_url || '')
      ? '<div class="um-audio-reference"><p class="um-hint">' + (entry.reviewed ? 'Dengarkan rekaman · ' : 'Pratinjau rekaman · ') + teks(entry.audio_language || '') + ' · ' + (entry.detik || 30) + ' detik</p><audio data-prayer-preview controls preload="none" src="' + escAttr(entry.audio_preview_url) + '" aria-label="Pratinjau rekaman doa"></audio><p class="um-hint">' + teks(entry.audio_attribution || '') + '</p><p class="um-hint">Lisensi: ' + teks(entry.audio_license || '') + (/^https:\/\//.test(entry.audio_license_url || '') ? ' · <a href="' + escAttr(entry.audio_license_url) + '" target="_blank" rel="noopener noreferrer">Ketentuan penggunaan</a>' : '') + '</p>' + (/^https:\/\//.test(entry.audio_source_url || '') ? '<a class="um-muted" href="' + escAttr(entry.audio_source_url) + '" target="_blank" rel="noopener noreferrer">Sumber rekaman asli</a>' : '') + '<p class="um-hint">Mendengarkan pratinjau tidak menambah jumlah doa.</p></div>' : '';
    return '<div class="um-prayer" data-prayer-content="' + escAttr(entry.id) + '">' + (entry.teks ? '<div class="tx">' + teks(entry.teks[L] || entry.teks.id) + '</div>' : '<p class="um-note">Teks sedang disiapkan oleh kurator tradisi ini.</p>') + (entry.arti ? '<div class="tx">' + teks(entry.arti[L] || entry.arti.id) + '</div>' : '') + '<p class="src">Sumber: ' + teks(entry.sumber || 'Rujukan belum tersedia') + '</p>' + (/^https:\/\//.test(entry.source_url || '') ? '<a class="um-muted" href="' + escAttr(entry.source_url) + '" target="_blank" rel="noopener noreferrer">Lihat sumber doa</a>' : '') + preview + (!entry.reviewed ? '<p class="um-note">Pratinjau referensi. Materi dan rekaman menunggu tinjauan kurator sebelum sesi doa dapat dikirim.</p>' : '') + '</div>';
  }
  function muatTujuanDoa(current, pesanId) {
    var sequence = ++current.sequence;
    current.fase = 'preparing';
    current.error = '';
    renderDoa();
    return UM.store.preparePrayer(current.galaksiId, pesanId).then(function (id) {
      return UM.store.getPesan(id);
    }).then(function (pesan) {
      if (!doaAktif(current, sequence)) return;
      current.pesanId = pesan.id;
      current.pesan = pesan;
      current.fase = 'pick';
      renderDoa();
    }).catch(function (error) {
      if (!doaAktif(current, sequence)) return;
      current.fase = 'prepare-error';
      current.error = error.message || 'Ucapan belum dapat dimuat.';
      renderDoa();
    });
  }
  function bukaDoa(galaksiId, pesanId) {
    closeAllScreens();
    doaState = {
      galaksiId: galaksiId,
      pesanId: pesanId || null,
      tradisi: null,
      entriId: null,
      fase: 'preparing',
      sisa: 0,
      timer: null,
      audio: null,
      audioAktif: false,
      sequence: 0,
      error: ''
    };
    var current = doaState,
      sequence = current.sequence;
    open(doaEl);
    renderDoa();
    if (!galaksiId && !pesanId) {
      current.hub = true;
      current.offset = 0;
      muatDaftarDoa(current);
      return;
    }
    if (pesanId) {
      muatTujuanDoa(current, pesanId);
      return;
    }
    UM.store.listPesanLadang(galaksiId).then(function (messages) {
      if (!doaAktif(current, sequence)) return;
      current.candidates = messages.filter(function (p) {
        return UM.store.supportStatus(p).available;
      });
      if (current.candidates.length === 1) {
        muatTujuanDoa(current, current.candidates[0].id);
        return;
      }
      current.fase = current.candidates.length ? 'target' : 'empty';
      renderDoa();
    }).catch(function (error) {
      if (!doaAktif(current, sequence)) return;
      current.fase = 'prepare-error';
      current.error = error.message || 'Ucapan belum dapat dimuat.';
      renderDoa();
    });
  }
  function renderDoa() {
    stopDoaPreview();
    var current = doaState,
      L = UM.i18n.getLang();
    var busy = ['loading', 'audio-ready', 'hening', 'saving'].indexOf(current.fase) >= 0;
    var isi = '';
    isi += '<div class="um-h3" style="margin-top:20px">1. Ucapan yang didoakan</div>';
    if (current.galaksiId) isi += '<p class="um-muted">Tujuan: ' + teks(namaTujuanDoa(current)) + '</p>';
    if (current.fase === 'preparing') {
      isi += '<p class="um-note" role="status">Memuat ucapan dan pilihan doa…</p>';
    } else if (current.fase === 'prepare-error') {
      isi += '<p class="um-note warn" role="alert">' + teks(current.error) + '</p>' + '<button class="um-btn" data-act="reload">Coba muat kembali</button>';
    } else if (current.fase === 'empty') {
      isi += '<p class="um-note">' + (current.hub ? 'Belum ada pesan publik yang tersedia untuk didoakan.' : 'Kenangan ini belum memiliki pesan publik yang tersedia untuk didoakan.') + ' Penulis perlu membagikan pesan sebagai Publik anonim. Pesan yang lolos pemeriksaan awal dan sudah dibuka akan menjadi pilihan di sini.</p><button class="um-btn" data-act="reload">Muat ulang pesan tujuan</button>' + (current.hub ? '' : '<button class="um-btn" data-act="all-targets">Pilih pesan publik lain</button>');
    } else if (current.fase === 'target') {
      isi += '<p class="um-muted">Pilih pesan milik seseorang yang ingin kamu doakan. Berikutnya kamu memilih agama atau tradisi dan jenis doa. Identitas penulis tetap anonim.</p>' + '<div class="um-list">' + current.candidates.map(function (p) {
        return '<div class="um-item"><p class="txt">' + teks((p.publicBody || 'Ucapan publik').slice(0, 240)) + '</p>' + '<button class="um-btn" data-act="target" data-id="' + escAttr(p.id) + '">Doakan ucapan ini</button></div>';
      }).join('') + '</div>';
    } else {
      isi += '<blockquote class="um-note" style="margin-left:0;margin-right:0;overflow-wrap:anywhere">' + teks((current.pesan.publicBody || 'Ucapan publik').slice(0, 500)) + '</blockquote>';
      if (current.candidates && current.candidates.length > 1 && !busy && current.fase !== 'finish-error') {
        isi += '<button class="um-btn small" data-act="change-target">Ganti ucapan tujuan</button>';
      }
      isi += '<div class="um-h3" style="margin-top:20px">2. Pilih agama atau tradisi</div>' + '<p class="um-muted">Pilih sesuai keyakinanmu. Hening sejenak tersedia untuk semua orang. Teks agama dapat digunakan setelah ditinjau kurator.</p>' + '<div class="um-trad" role="group" aria-label="Pilihan agama atau tradisi">' + UM.doaData.tradisi.map(function (tr) {
        var ready = tr.entri.some(function (e) {
          return e.reviewed && (tr.id === 'umum' || e.audio);
        });
        var label = tr.id === 'umum' ? 'Umum / hening' : tr.label[L] || tr.label.id;
        return '<button class="um-chip' + (current.tradisi === tr.id ? ' on' : '') + '" data-act="trad" data-id="' + escAttr(tr.id) + '" aria-pressed="' + (current.tradisi === tr.id) + '"' + (busy || current.fase === 'finish-error' ? ' disabled' : '') + '>' + teks(label) + '<span class="um-hint" style="display:block">' + (ready ? 'Tersedia' : 'Menunggu kurasi / audio') + '</span></button>';
      }).join('') + '</div>';
      var tr = current.tradisi && UM.doaData.byId(current.tradisi);
      if (tr) {
        isi += '<div class="um-h3">3. Pilih doa, lalu mulai</div><div class="um-chips" style="margin-bottom:14px">' + tr.entri.map(function (e) {
          return '<button class="um-chip' + (current.entriId === e.id ? ' on' : '') + '" data-act="entri" data-id="' + escAttr(e.id) + '" aria-pressed="' + (current.entriId === e.id) + '"' + (busy || current.fase === 'finish-error' ? ' disabled' : '') + '>' + teks(e.nama[L] || e.nama.id) + (e.reviewed ? '' : ' · Menunggu kurasi') + '</button>';
        }).join('') + '</div>';
        if (!tr.entri.length) isi += '<p class="um-note">Pilihan doa untuk tradisi ini sedang disiapkan.</p>';
      }
      var entry = tr && current.entriId && UM.doaData.entri(tr.id, current.entriId);
      if (current.fase === 'pick' && entry && entry.reviewed && (tr.id === 'umum' || entry.audio)) {
        isi += '<div class="um-btn-row"><button class="um-btn primary" data-act="start">' + (entry.audio ? 'Dengarkan dan kirim doa' : 'Mulai hening dan kirim dukungan') + '</button></div><p class="um-hint">Dukungan untuk ucapan di atas dikirim setelah sesi selesai.</p>';
      }
      if (entry) {
        isi += '<div class="um-prayer"><div class="nm">' + teks(entry.nama[L] || entry.nama.id) + '</div>';
        isi += isiDoa(entry, L, !busy);
        if (entry.reviewed) {
          isi += '<p class="um-hint">' + (entry.audio ? 'Dengarkan audio sampai selesai' : tr.id === 'umum' ? 'Berdoa dalam hening' : 'Audio belum tersedia; sesi doa belum dapat dimulai') + ' · ' + (entry.detik || 30) + ' detik</p>';
        } else {
          isi += '<p class="um-note warn">Teks doa ini menunggu tinjauan kurator agama terkait dan belum dapat dimulai. Kamu tetap dapat mendoakan dengan kata-katamu sendiri melalui hening sejenak.</p>';
        }
        isi += '</div>';
      }
      if (current.fase === 'loading' || current.fase === 'saving') {
        isi += '<p class="um-note" role="status">' + (current.fase === 'loading' ? 'Menyiapkan sesi doa…' : 'Mencatat doa…') + '</p>';
      } else if (current.fase === 'hening' || current.fase === 'audio-ready') {
        isi += '<div class="um-hening" role="status">' + (current.audioAktif ? '<div class="lbl">Dengarkan audio sampai selesai. Gunakan pemutar untuk memulai, menjeda, atau melanjutkan.</div><div data-prayer-audio></div><p class="um-hint">' + teks(current.audioAttribution || entry.sumber) + '</p>' : '<div class="clock" aria-label="Sisa detik">' + current.sisa + '</div><div class="lbl">detik · Arahkan doamu kepada pemilik ucapan ini.</div>') + '</div>';
      } else if (current.fase === 'done') {
        isi += '<p class="um-note" role="status">' + (current.added === false ? 'Kamu sudah pernah mendoakan ucapan ini. Terima kasih telah kembali meluangkan waktu.' : 'Doamu sudah tercatat untuk ucapan ini. Terima kasih telah meluangkan waktu.') + '</p>' + '<p class="um-hint">Setiap orang dihitung satu kali untuk ucapan yang sama.</p><div class="um-btn-row"><button class="um-btn" data-act="again">Berdoa lagi</button><button class="um-btn primary" data-act="close">Selesai</button></div>';
      } else if (current.fase === 'finish-error') {
        isi += '<p class="um-note warn" role="alert">' + teks(current.error) + '</p><div class="um-btn-row">' + '<button class="um-btn primary" data-act="retry-finish">Coba catat doa kembali</button><button class="um-btn" data-act="cancel">Mulai sesi baru</button></div>';
      } else {
        if (current.error) isi += '<p class="um-note warn" role="alert">' + teks(current.error) + '</p>';
        if (!current.tradisi) isi += '<p class="um-hint">Pilih agama atau tradisi di atas, lalu klik jenis doa yang ingin kamu berikan.</p>';else if (!entry) isi += '<p class="um-hint">Pilih salah satu doa di atas.</p>';
        if ((!entry || !entry.reviewed || tr.id !== 'umum' && !entry.audio) && UM.doaData.entri('umum', 'hening') && UM.doaData.entri('umum', 'hening').reviewed) {
          isi += '<div class="um-btn-row"><button class="um-btn" data-act="silence">Pilih hening sejenak (untuk semua)</button></div>';
        }
        isi += '<p class="um-hint">Doa dicatat setelah sesi selesai. Menutup atau membatalkan sesi sebelum selesai tidak menambah hitungan doa.</p>';
      }
      if (current.fase === 'loading' || current.fase === 'hening' || current.fase === 'audio-ready') isi += '<div class="um-btn-row"><button class="um-btn" data-act="cancel">Batalkan sesi</button></div>';
    }
    if (current.hub && ['target', 'empty'].indexOf(current.fase) >= 0 && (current.offset || current.more)) isi += '<nav class="um-btn-row between" aria-label="Halaman tujuan doa"><button class="um-btn" data-act="targets-prev"' + (current.offset ? '' : ' disabled') + '>Ucapan sebelumnya</button><span class="um-muted">Halaman ' + (Math.floor((current.offset || 0) / 30) + 1) + '</span><button class="um-btn" data-act="targets-next"' + (current.more ? '' : ' disabled') + '>Ucapan berikutnya</button></nav><p class="um-hint">Tombol ini mengganti halaman daftar pesan. Untuk melanjutkan doa, tekan Doakan ucapan ini pada pesan pilihanmu.</p>';
    UM.renderScreen(doaEl.querySelector('.um-wrap'), '<div class="um-head"><div><div class="um-h1">Doa untuk seseorang</div>' + '<p class="um-muted">Pilih pesan tujuan, pilih agama dan jenis doa, lalu dengarkan sampai selesai. Dukungan tercatat pada pesan dan galaksi tujuan.</p></div><button class="um-close" data-act="close" aria-label="Tutup doa">×</button></div>' + '<div class="um-card">' + isi + '</div>');
    var player = doaEl.querySelector('[data-prayer-audio]');
    if (player && current.audio) player.appendChild(current.audio);
  }
  function mulaiDoa() {
    var current = doaState,
      entry = UM.doaData.entri(current.tradisi, current.entriId);
    if (current.fase !== 'pick' || !entry || !entry.reviewed || current.tradisi !== 'umum' && !entry.audio || !current.pesanId) return;
    stopDoaTimer();
    var sequence = current.sequence;
    current.fase = 'loading';
    current.error = '';
    current.token = null;
    renderDoa();
    UM.store.startPrayer(current.pesanId, current.tradisi + '/' + current.entriId).then(function (session) {
      if (!doaAktif(current, sequence)) return;
      current.token = session.playback_token;
      current.deadline = performance.now() + Math.max(0, session.seconds) * 1000 + 150;
      if (session.audio_url) {
        var audio = new Audio(session.audio_url);
        audio.controls = true;
        audio.preload = 'auto';
        audio.setAttribute('aria-label', 'Pemutar audio doa');
        current.audio = audio;
        current.audioAktif = true;
        current.fase = 'hening';
        current.audioAttribution = session.audio_attribution;
        var fail = function () {
          if (!doaAktif(current, sequence)) return;
          stopDoaTimer();
          current.fase = 'pick';
          current.error = 'Audio tidak dapat diputar. Coba mulai kembali.';
          renderDoa();
        };
        audio.onended = function () {
          if (doaAktif(current, sequence)) {
            current.audioAktif = false;
            jalankanHitung();
          }
        };
        audio.onerror = fail;
        renderDoa();
        audio.play().catch(function () {
          if (!doaAktif(current, sequence)) return;
          current.fase = 'audio-ready';
          renderDoa();
        });
      } else {
        current.audioAktif = false;
        jalankanHitung();
      }
    }).catch(function (error) {
      if (!doaAktif(current, sequence)) return;
      current.fase = 'pick';
      current.error = error.message || 'Sesi doa belum dapat dimulai.';
      renderDoa();
    });
  }
  function jalankanHitung() {
    var current = doaState,
      sequence = current.sequence;
    current.fase = 'hening';
    current.sisa = Math.max(0, Math.ceil((current.deadline - performance.now()) / 1000));
    renderDoa();
    var tick = function () {
      if (!doaAktif(current, sequence)) return;
      current.sisa = Math.max(0, Math.ceil((current.deadline - performance.now()) / 1000));
      if (!current.sisa) {
        selesaikanDoa();
        return;
      }
      var clock = doaEl.querySelector('.clock');
      if (clock) clock.textContent = String(current.sisa);
    };
    current.timer = setInterval(tick, 250);
    tick();
  }
  function selesaikanDoa() {
    var current = doaState;
    if (current.fase !== 'hening' && current.fase !== 'finish-error' || !current.token) return;
    stopDoaTimer();
    var sequence = current.sequence;
    current.fase = 'saving';
    current.error = '';
    renderDoa();
    UM.store.addDoa(current.pesanId, current.token).then(function (result) {
      if (!doaAktif(current, sequence)) return;
      current.added = result && result.added;
      current.fase = 'done';
      renderDoa();
      UM.galaksi.refresh().then(function () {
        if (!doaAktif(current, sequence)) return;
        var item = UM.galaksi.state.daftar.find(function (item) {
          return item.g.id === current.galaksiId;
        });
        if (item && UM.ui.renderKartuGalaksi) UM.ui.renderKartuGalaksi(item);
        if (expEl.classList.contains('on')) renderJelajah();
        if (dashEl.classList.contains('on')) renderDash();
      }).catch(function () {
        if (doaAktif(current, sequence)) toast('Doa sudah tercatat. Tampilan galaksi akan diperbarui saat dibuka kembali.');
      });
    }).catch(function (error) {
      if (!doaAktif(current, sequence)) return;
      current.fase = 'finish-error';
      current.error = error.message || 'Doa belum dapat dicatat. Coba kembali.';
      renderDoa();
    });
  }
  function buildDoa() {
    doaEl = el('div', 'um-screen z-top');
    doaEl.id = 'um-doa';
    doaEl.setAttribute('role', 'dialog');
    doaEl.setAttribute('aria-label', 'Doa untuk seseorang');
    doaEl.setAttribute('aria-modal', 'true');
    doaEl.appendChild(el('div', 'um-wrap narrow'));
    doaEl.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn || btn.disabled) return;
      var act = btn.getAttribute('data-act'),
        id = btn.getAttribute('data-id');
      if (act === 'close') {
        stopDoaTimer();
        close(doaEl);
        return;
      }
      if (act === 'reload') {
        if (doaState.hub) muatDaftarDoa(doaState);else bukaDoa(doaState.galaksiId, doaState.pesanId);
        return;
      }
      if (act === 'all-targets') {
        bukaDoa();
        return;
      }
      if (act === 'targets-prev' || act === 'targets-next') {
        doaState.offset = Math.max(0, (doaState.offset || 0) + (act === 'targets-next' ? 30 : -30));
        muatDaftarDoa(doaState);
        doaEl.scrollTop = 0;
        return;
      }
      if (act === 'cancel' || act === 'again') {
        stopDoaTimer();
        doaState.fase = 'pick';
        doaState.error = '';
        doaState.token = null;
        renderDoa();
        return;
      }
      if (act === 'retry-finish') {
        selesaikanDoa();
        return;
      }
      if (act === 'start') {
        mulaiDoa();
        return;
      }
      if (['loading', 'audio-ready', 'hening', 'saving', 'finish-error'].indexOf(doaState.fase) >= 0) return;
      if (act === 'target') {
        var target = doaState.candidates.find(function (p) {
          return p.id === id;
        });
        if (target) {
          doaState.galaksiId = target.galaksiId;
          muatTujuanDoa(doaState, id);
        }
        return;
      }
      if (act === 'change-target') {
        stopDoaTimer();
        doaState.fase = 'target';
        renderDoa();
        return;
      }
      if (act === 'trad' || act === 'entri' || act === 'silence') {
        stopDoaTimer();
        doaState.error = '';
        doaState.token = null;
        doaState.fase = 'pick';
        if (act === 'trad') {
          doaState.tradisi = id;
          doaState.entriId = null;
        } else if (act === 'entri') doaState.entriId = id;else {
          doaState.tradisi = 'umum';
          doaState.entriId = 'hening';
        }
        renderDoa();
      }
    });
    document.body.appendChild(doaEl);
  }

  /* ── modal kunci enkripsi (PRD §9.7) ─────────────────────────────────────── */

  function bukaSetup() {
    if (!UM.account.isLogged()) {
      UM.account.require().then(function (ok) {
        if (ok) bukaSetup();
      });
      return;
    }
    closeAllScreens();
    open(setupEl);
    setupErr = '';
    renderSetup();
  }
  function renderSetup() {
    if (!UM.crypto.available()) {
      UM.renderScreen(setupEl.querySelector('.um-wrap'), '<div class="um-head"><div class="um-h1">' + teks(T('setupTitle')) + '</div>' + '<button class="um-close" data-act="close" aria-label="' + escAttr(T('commonClose')) + '">×</button></div>' + '<div class="um-card"><div class="um-note warn">' + teks(T('setupUnsupported')) + '</div></div>');
      return;
    }
    UM.store.getMeta('kunci').then(function (rec) {
      var html;
      if (!rec) {
        html = '<p class="um-note">Masuk ke akun untuk membuka kunci pesan.</p><button class="um-btn" data-act="account">Masuk ke akun</button>';
      } else if (!UM.crypto.unlocked()) {
        html = '<p class="um-p">' + teks(T('lockedText')) + '</p>' + '<div class="um-field"><label class="um-label" for="um-pw">' + teks(T('setupPw')) + '</label>' + '<input class="um-input" id="um-pw" type="password" autocomplete="current-password"></div>' + '<div class="um-error">' + escAttr(setupErr) + '</div>' + '<div class="um-btn-row end"><button class="um-btn primary" data-act="unlock">' + teks(T('setupUnlock')) + '</button></div>' + '<div class="um-field" style="margin-top:18px"><label class="um-label" for="um-rec">' + teks(T('setupRecovery')) + '</label>' + '<input class="um-input" id="um-rec" placeholder="XXXXX-XXXXX-XXXXX-XXXXX"></div>' + '<div class="um-btn-row end"><button class="um-btn" data-act="unlock-rec">' + teks(T('setupUnlock')) + '</button></div>';
      } else {
        html = '<p class="um-p">' + teks(T('setupUnlocked')) + '</p>' + '<div class="bp-row"><span class="k">KDF</span><span class="v">' + escAttr(UM.crypto.kdfId()) + '</span></div>' + '<div class="bp-row"><span class="k">Iterasi</span><span class="v">' + UM.crypto.iterations() + '</span></div>' + '<div class="um-btn-row end"><button class="um-btn" data-act="lock">' + teks(T('setupLock')) + '</button></div>';
      }
      UM.renderScreen(setupEl.querySelector('.um-wrap'), '<div class="um-head"><div class="um-h1">' + teks(T('setupTitle')) + '</div>' + '<button class="um-close" data-act="close" aria-label="' + escAttr(T('commonClose')) + '">×</button></div>' + '<div class="um-card">' + html + '</div>');
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
      var pw = function (id) {
        var n = document.getElementById(id);
        return n ? n.value : '';
      };
      if (act === 'close') {
        close(setupEl);
        return;
      }
      if (act === 'unlock') {
        btn.disabled = true;
        UM.crypto.unlock(pw('um-pw')).then(function () {
          setupErr = '';
          renderSetup();
          UM.galaksi.refresh();
        }).catch(function () {
          btn.disabled = false;
          setupErr = T('setupWrong');
          renderSetup();
        });
        return;
      }
      if (act === 'unlock-rec') {
        btn.disabled = true;
        UM.crypto.unlockWithRecovery(pw('um-rec')).then(function () {
          setupErr = '';
          renderSetup();
          UM.galaksi.refresh();
        }).catch(function () {
          btn.disabled = false;
          setupErr = T('setupWrong');
          renderSetup();
        });
        return;
      }
      if (act === 'lock') {
        UM.crypto.lock();
        renderSetup();
        UM.galaksi.refresh();
        return;
      }
    });
    document.body.appendChild(setupEl);
  }

  /* ── pengaturan ──────────────────────────────────────────────────────────── */

  function bukaSet() {
    closeAllScreens();
    open(setEl);
    renderSet();
  }
  function renderSet() {
    var langs = [['id', 'Bahasa Indonesia']];
    UM.renderScreen(setEl.querySelector('.um-wrap'), '<div class="um-head"><div class="um-h1">' + teks(T('setTitle')) + '</div>' + '<button class="um-close" data-act="close" aria-label="' + escAttr(T('commonClose')) + '">×</button></div>' + '<div class="um-card">' + '<div class="um-field"><label class="um-label" for="um-lang">' + teks(T('setLang')) + '</label>' + '<select class="um-select" id="um-lang">' + langs.map(function (l) {
      return '<option value="' + l[0] + '"' + (UM.i18n.getLang() === l[0] ? ' selected' : '') + '>' + escAttr(l[1]) + '</option>';
    }).join('') + '</select></div>' + '<div class="um-btn-row"><button class="um-btn" data-act="account">Akun dan keamanan</button><button class="um-btn" data-act="switch-account">Ganti akun</button><button class="um-btn danger" data-act="delete-account">Hapus akun</button></div><p class="um-hint">Ganti akun tidak menghapus akun lama atau pesan dan doanya.</p>' + '<div class="um-h3" style="margin-top:18px">' + teks(T('setAbout')) + '</div>' + '<p class="um-muted">' + teks(T('setAboutText')) + '</p>' + '</div>' + '<div class="um-card">' + '<div class="um-h3">' + 'Hapus pesan dan tujuan' + '</div>' + '<p class="um-muted">' + 'Pesan dan tujuan akan dihapus permanen. Foto serta lampiran tetap dapat diambil melalui ekspor akun.' + '</p>' + '<div class="um-btn-row"><button class="um-btn danger" data-act="reset">' + 'Hapus pesan dan tujuan' + '</button>' + '<button class="um-btn" data-act="close">' + teks(T('btnCancel')) + '</button></div>' + '</div>');
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
      if (file.size > 4 * 1024 * 1024) {
        reject(new Error('too-big'));
        return;
      }
      var fr = new FileReader();
      fr.onerror = function () {
        reject(new Error('read-failed'));
      };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () {
          reject(new Error('bad-image'));
        };
        img.onload = function () {
          var max = 320,
            k = Math.min(1, max / Math.max(img.width, img.height));
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
    renderEntry();
    renderDock();
    renderSkyCtl();
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
    if (panelClose) panelClose.addEventListener('click', function () {
      ++kartuRequest;
    });
    buildEntry();
    buildDock();
    buildKomposer();
    buildDash();
    buildJelajah();
    buildDoa();
    buildSetup();
    buildSet();
    mounted = true;
    renderSemua();
    return true;
  }
  function bukaEntry() {
    open(entryEl);
    renderEntry();
  }
  return {
    mount: mount,
    bukaEntry: bukaEntry,
    toast: toast,
    renderSemua: renderSemua,
    setBahasa: setBahasa,
    renderKartuGalaksi: kartuGalaksi,
    renderKartuTitik: kartuTitik,
    renderKartuBatu: kartuBatu,
    tutupPanel: tutupPanel,
    bukaKomposer: bukaKomposer,
    bukaDash: bukaDash,
    bukaJelajah: bukaJelajah,
    bukaDoa: bukaDoa,
    bukaSetup: bukaSetup,
    bukaSet: bukaSet,
    keLadang: keLadang,
    kePeta: kePeta,
    closeAllScreens: closeAllScreens,
    anyScreenOpen: anyScreenOpen,
    _bacaGambar: bacaGambar
  };
}();
