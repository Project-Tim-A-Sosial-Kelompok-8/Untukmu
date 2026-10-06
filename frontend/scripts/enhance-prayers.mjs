export function enhancePrayers(ui, replace) {
  ui = replace(ui, "else if (act === 'doa') bukaJelajah();", "else if (act === 'doa') bukaDoa();");
  ui = ui.replaceAll("teks(T('pcDoakan'))", "'Doakan ucapan ini'");
  ui = replace(ui, "function closeAllScreens() {", "function closeAllScreens() { stopDoaTimer();");
  ui = replace(ui, "function stopDoaTimer() {", "function stopDoaTimer() {\n    doaState.sequence = (doaState.sequence || 0) + 1;\n    if (doaState.audio) { doaState.audio.onended = null; doaState.audio.onerror = null; }");
  const start = ui.indexOf('  function bukaDoa(galaksiId, pesanId) {');
  const end = ui.indexOf('  /* ── modal kunci enkripsi', start);
  if (start < 0 || end < 0) throw new Error('Prayer screen anchors missing');
  ui = ui.slice(0, start) + String.raw`  function doaAktif(current, sequence) {
    return current === doaState && current.sequence === sequence && doaEl.classList.contains('on');
  }

  function namaTujuanDoa(current) {
    var item = UM.galaksi.state.daftar.find(function(item) { return item.g.id === current.galaksiId; });
    return item ? item.g.nama : 'Ucapan publik';
  }

  function muatDaftarDoa(current) {
    var sequence = ++current.sequence;
    current.fase = 'preparing'; current.error = ''; renderDoa();
    Promise.all([UM.store.prayerCatalog(), UM.store.explore('baru', current.offset || 0)]).then(function(results) {
      if (!doaAktif(current, sequence)) return;
      current.candidates = results[1].slice(0, 30); current.more = results[1].length > 30;
      current.fase = current.candidates.length ? 'target' : 'empty'; renderDoa();
    }).catch(function(error) {
      if (!doaAktif(current, sequence)) return;
      current.fase = 'prepare-error'; current.error = error.message || 'Pilihan doa belum dapat dimuat.'; renderDoa();
    });
  }

  function katalogAwalDoa(current) {
    var L = UM.i18n.getLang();
    var selected = current.tradisi && UM.doaData.byId(current.tradisi);
    var preview = selected ? '<section class="um-card" aria-label="Jenis doa"><h3 class="um-h3">Pilihan doa ' + teks(selected.label[L] || selected.label.id) + '</h3>' + selected.entri.map(function(entry) {
      var available = entry.reviewed && (selected.id === 'umum' || entry.audio);
      return '<div class="um-item"><div class="um-h3">' + teks(entry.nama[L] || entry.nama.id) + '</div><p class="um-hint">' +
        (available ? (entry.audio ? 'Audio doa tersedia' : 'Sesi hening tersedia') + ' · ' + (entry.detik || 30) + ' detik' : entry.reviewed ? 'Teks sudah ditinjau. Audio belum tersedia.' : 'Materi sedang menunggu kurasi.') + '</p>' +
        (entry.reviewed && entry.teks ? '<p>' + teks(entry.teks[L] || entry.teks.id) + '</p>' : '') +
        '<p class="um-muted">Sumber: ' + teks(entry.sumber || 'Lihat rujukan tradisi') + '</p></div>';
    }).join('') + '<p class="um-note">Pilih ucapan tujuan di bawah untuk memulai. Doa yang selesai akan dicatat pada ucapan tersebut.</p></section>' : '';
    return '<div class="um-h3">Doa lintas agama dan tradisi</div><p class="um-muted">Pilih tradisi sesuai keyakinanmu, lalu pilih ucapan publik di bawah. Audio dan teks agama tersedia setelah ditinjau kurator. Hening sejenak bisa digunakan tanpa audio.</p><div class="um-trad" aria-label="Pilihan agama atau tradisi">' +
      UM.doaData.tradisi.map(function(tr) {
        var ready = tr.entri.filter(function(entry) { return entry.reviewed && (tr.id === 'umum' || entry.audio); });
        return '<button class="um-chip' + (current.tradisi === tr.id ? ' on' : '') + '" data-act="hub-trad" data-id="' + escAttr(tr.id) + '" aria-pressed="' + (current.tradisi === tr.id) + '">' + teks(tr.label[L] || tr.label.id) + '<span class="um-hint">' +
          (ready.length ? (ready.some(function(e) { return e.audio; }) ? 'Audio tersedia' : 'Baca / hening tersedia') : 'Menunggu kurasi / audio') + '</span></button>';
      }).join('') + '</div>' + preview + '<p class="um-hint">Doa dicatat untuk ucapan yang kamu pilih, setelah audio atau sesi hening selesai. Setiap orang dihitung satu kali per ucapan.</p>';
  }

  function muatTujuanDoa(current, pesanId) {
    var sequence = ++current.sequence;
    current.fase = 'preparing'; current.error = ''; renderDoa();
    return UM.store.preparePrayer(current.galaksiId, pesanId).then(function(id) {
      return UM.store.getPesan(id);
    }).then(function(pesan) {
      if (!doaAktif(current, sequence)) return;
      current.pesanId = pesan.id; current.pesan = pesan; current.fase = 'pick'; renderDoa();
    }).catch(function(error) {
      if (!doaAktif(current, sequence)) return;
      current.fase = 'prepare-error'; current.error = error.message || 'Ucapan belum dapat dimuat.'; renderDoa();
    });
  }

  function bukaDoa(galaksiId, pesanId) {
    closeAllScreens();
    doaState = { galaksiId: galaksiId, pesanId: pesanId || null, tradisi: null, entriId: null,
      fase: 'preparing', sisa: 0, timer: null, audio: null, audioAktif: false, sequence: 0, error: '' };
    var current = doaState, sequence = current.sequence;
    open(doaEl); renderDoa();
    if (!galaksiId && !pesanId) { current.hub = true; current.offset = 0; muatDaftarDoa(current); return; }
    if (pesanId) { muatTujuanDoa(current, pesanId); return; }
    UM.store.listPesan(galaksiId).then(function(messages) {
      if (!doaAktif(current, sequence)) return;
      current.candidates = messages.filter(function(p) { return p.privasi === 'publik' && p.moderationStatus === 'approved'; });
      if (current.candidates.length === 1) { muatTujuanDoa(current, current.candidates[0].id); return; }
      current.fase = current.candidates.length ? 'target' : 'empty'; renderDoa();
    }).catch(function(error) {
      if (!doaAktif(current, sequence)) return;
      current.fase = 'prepare-error'; current.error = error.message || 'Ucapan belum dapat dimuat.'; renderDoa();
    });
  }

  function renderDoa() {
    var current = doaState, L = UM.i18n.getLang();
    var busy = ['loading', 'audio-ready', 'hening', 'saving'].indexOf(current.fase) >= 0;
    var choosing = ['preparing', 'prepare-error', 'empty', 'target'].indexOf(current.fase) >= 0;
    var isi = '';
    isi += choosing ? katalogAwalDoa(current) : '';
    isi += '<div class="um-h3" style="margin-top:20px">1. Ucapan yang didoakan</div>';
    if (current.galaksiId) isi += '<p class="um-muted">Tujuan: ' + teks(namaTujuanDoa(current)) + '</p>';
    if (current.fase === 'preparing') {
      isi += '<p class="um-note" role="status">Memuat ucapan dan pilihan doa…</p>';
    } else if (current.fase === 'prepare-error') {
      isi += '<p class="um-note warn" role="alert">' + teks(current.error) + '</p>' +
        '<button class="um-btn" data-act="reload">Coba muat kembali</button>';
    } else if (current.fase === 'empty') {
      isi += '<p class="um-note">' + (current.hub ? 'Belum ada ucapan publik untuk didoakan pada halaman ini.' : 'Kenangan ini belum memiliki ucapan publik yang disetujui.') + ' Pesan privat dan pesan yang menunggu moderasi tidak bisa didoakan oleh pengunjung.</p>' +
        (current.hub ? '' : '<p class="um-muted">Pilih ucapan publik dari galaksi lain melalui daftar Doa.</p><button class="um-btn" data-act="all-targets">Pilih ucapan publik lain</button>');
    } else if (current.fase === 'target') {
      isi += '<p class="um-muted">Pilih ucapan berikut sebagai tujuan doamu. Identitas penulis tetap anonim.</p>' +
        '<div class="um-list">' + current.candidates.map(function(p) {
          return '<div class="um-item"><p class="txt">' + teks((p.publicBody || 'Ucapan publik').slice(0, 240)) + '</p>' +
            '<button class="um-btn" data-act="target" data-id="' + escAttr(p.id) + '">Doakan ucapan ini</button></div>';
        }).join('') + '</div>';
    } else {
      isi += '<blockquote class="um-note" style="margin-left:0;margin-right:0;overflow-wrap:anywhere">' + teks((current.pesan.publicBody || 'Ucapan publik').slice(0, 500)) + '</blockquote>';
      if (current.candidates && current.candidates.length > 1 && !busy && current.fase !== 'finish-error') {
        isi += '<button class="um-btn small" data-act="change-target">Ganti ucapan tujuan</button>';
      }
      isi += '<div class="um-h3" style="margin-top:20px">2. Pilih agama atau tradisi</div>' +
        '<p class="um-muted">Pilih sesuai keyakinanmu. Hening sejenak tersedia untuk semua orang. Teks agama dapat digunakan setelah ditinjau kurator.</p>' +
        '<div class="um-trad" role="group" aria-label="Pilihan agama atau tradisi">' + UM.doaData.tradisi.map(function(tr) {
          var ready = tr.entri.some(function(e) { return e.reviewed && (tr.id === 'umum' || e.audio); });
          var label = tr.id === 'umum' ? 'Umum / hening' : (tr.label[L] || tr.label.id);
          return '<button class="um-chip' + (current.tradisi === tr.id ? ' on' : '') + '" data-act="trad" data-id="' + escAttr(tr.id) +
            '" aria-pressed="' + (current.tradisi === tr.id) + '"' + (busy || current.fase === 'finish-error' ? ' disabled' : '') + '>' +
            teks(label) + '<span class="um-hint" style="display:block">' + (ready ? 'Tersedia' : 'Menunggu kurasi / audio') + '</span></button>';
        }).join('') + '</div>';
      var tr = current.tradisi && UM.doaData.byId(current.tradisi);
      if (tr) {
        isi += '<div class="um-h3">3. Pilih doa, lalu mulai</div><div class="um-chips" style="margin-bottom:14px">' + tr.entri.map(function(e) {
          return '<button class="um-chip' + (current.entriId === e.id ? ' on' : '') + '" data-act="entri" data-id="' + escAttr(e.id) +
            '" aria-pressed="' + (current.entriId === e.id) + '"' + (busy || current.fase === 'finish-error' ? ' disabled' : '') + '>' +
            teks(e.nama[L] || e.nama.id) + (e.reviewed ? '' : ' · Menunggu kurasi') + '</button>';
        }).join('') + '</div>';
        if (!tr.entri.length) isi += '<p class="um-note">Pilihan doa untuk tradisi ini sedang disiapkan.</p>';
      }
      var entry = tr && current.entriId && UM.doaData.entri(tr.id, current.entriId);
      if (entry) {
        isi += '<div class="um-prayer"><div class="nm">' + teks(entry.nama[L] || entry.nama.id) + '</div>';
        if (entry.reviewed) {
          isi += '<div class="src">' + teks(entry.sumber) + '</div>' +
            (/^https:\/\//.test(entry.source_url || '') ? '<a class="um-muted" href="' + escAttr(entry.source_url) + '" target="_blank" rel="noopener noreferrer">Lihat sumber doa</a>' : '') +
            (entry.teks ? '<div class="tx">' + teks(entry.teks[L] || entry.teks.id) + '</div>' : '') +
            (entry.arti ? '<div class="tx">' + teks(entry.arti[L] || entry.arti.id) + '</div>' : '') +
            '<p class="um-hint">' + (entry.audio ? 'Dengarkan audio sampai selesai' : (tr.id === 'umum' ? 'Berdoa dalam hening' : 'Audio belum tersedia; sesi doa belum dapat dimulai')) + ' · ' + (entry.detik || 30) + ' detik</p>';
        } else {
          isi += '<p class="um-note warn">Teks doa ini menunggu tinjauan kurator agama terkait dan belum dapat dimulai. Kamu tetap dapat mendoakan dengan kata-katamu sendiri melalui hening sejenak.</p>';
        }
        isi += '</div>';
      }
      if (current.fase === 'loading' || current.fase === 'saving') {
        isi += '<p class="um-note" role="status">' + (current.fase === 'loading' ? 'Menyiapkan sesi doa…' : 'Mencatat doa…') + '</p>';
      } else if (current.fase === 'hening' || current.fase === 'audio-ready') {
        isi += '<div class="um-hening" role="status">' + (current.audioAktif
          ? '<div class="lbl">Dengarkan audio sampai selesai. Gunakan pemutar untuk memulai, menjeda, atau melanjutkan.</div><div data-prayer-audio></div><p class="um-hint">' + teks(current.audioAttribution || entry.sumber) + '</p>'
          : '<div class="clock" aria-label="Sisa detik">' + current.sisa + '</div><div class="lbl">detik · Arahkan doamu kepada pemilik ucapan ini.</div>') + '</div>';
      } else if (current.fase === 'done') {
        isi += '<p class="um-note" role="status">' + (current.added === false ? 'Kamu sudah pernah mendoakan ucapan ini. Terima kasih telah kembali meluangkan waktu.' : 'Doamu sudah tercatat untuk ucapan ini. Terima kasih telah meluangkan waktu.') + '</p>' +
          '<p class="um-hint">Setiap orang dihitung satu kali untuk ucapan yang sama.</p><div class="um-btn-row"><button class="um-btn" data-act="again">Berdoa lagi</button><button class="um-btn primary" data-act="close">Selesai</button></div>';
      } else if (current.fase === 'finish-error') {
        isi += '<p class="um-note warn" role="alert">' + teks(current.error) + '</p><div class="um-btn-row">' +
          '<button class="um-btn primary" data-act="retry-finish">Coba catat doa kembali</button><button class="um-btn" data-act="cancel">Mulai sesi baru</button></div>';
      } else {
        if (current.error) isi += '<p class="um-note warn" role="alert">' + teks(current.error) + '</p>';
        if (entry && entry.reviewed && (tr.id === 'umum' || entry.audio)) isi += '<div class="um-btn-row"><button class="um-btn primary" data-act="start">' + (entry.audio ? 'Mulai dengarkan doa' : 'Mulai berdoa / hening') + '</button></div>';
        else if (!current.tradisi) isi += '<p class="um-hint">Pilih agama atau tradisi di atas untuk melihat pilihan doa.</p>';
        else if (!entry) isi += '<p class="um-hint">Pilih salah satu doa di atas.</p>';
        if ((!tr || !tr.entri.some(function(e) { return e.reviewed && (tr.id === 'umum' || e.audio); })) && UM.doaData.entri('umum', 'hening') && UM.doaData.entri('umum', 'hening').reviewed) {
          isi += '<div class="um-btn-row"><button class="um-btn" data-act="silence">Pilih hening sejenak (untuk semua)</button></div>';
        }
        isi += '<p class="um-hint">Doa dicatat setelah sesi selesai. Menutup atau membatalkan sesi sebelum selesai tidak menambah hitungan doa.</p>';
      }
      if (current.fase === 'loading' || current.fase === 'hening' || current.fase === 'audio-ready') isi += '<div class="um-btn-row"><button class="um-btn" data-act="cancel">Batalkan sesi</button></div>';
    }
    if (choosing && current.hub && current.fase !== 'preparing') isi += '<nav class="um-btn-row between" aria-label="Halaman tujuan doa"><button class="um-btn" data-act="targets-prev"' + (current.offset ? '' : ' disabled') + '>Sebelumnya</button><span class="um-muted">Halaman ' + (Math.floor((current.offset || 0) / 30) + 1) + '</span><button class="um-btn" data-act="targets-next"' + (current.more ? '' : ' disabled') + '>Berikutnya</button></nav>';
    doaEl.querySelector('.um-wrap').innerHTML = '<div class="um-head"><div><div class="um-h1">Doa untuk seseorang</div>' +
      '<p class="um-muted">Luangkan waktu untuk seseorang melalui doa atau hening.</p></div><button class="um-close" data-act="close" aria-label="Tutup doa">×</button></div>' +
      '<div class="um-card">' + isi + '</div>';
    var player = doaEl.querySelector('[data-prayer-audio]');
    if (player && current.audio) player.appendChild(current.audio);
  }

  function mulaiDoa() {
    var current = doaState, entry = UM.doaData.entri(current.tradisi, current.entriId);
    if (current.fase !== 'pick' || !entry || !entry.reviewed || (current.tradisi !== 'umum' && !entry.audio) || !current.pesanId) return;
    stopDoaTimer();
    var sequence = current.sequence;
    current.fase = 'loading'; current.error = ''; current.token = null; renderDoa();
    UM.store.startPrayer(current.pesanId, current.tradisi + '/' + current.entriId).then(function(session) {
      if (!doaAktif(current, sequence)) return;
      current.token = session.playback_token;
      current.deadline = performance.now() + Math.max(0, session.seconds) * 1000 + 150;
      if (session.audio_url) {
        var audio = new Audio(session.audio_url); audio.controls = true; audio.preload = 'auto';
        audio.setAttribute('aria-label', 'Pemutar audio doa');
        current.audio = audio; current.audioAktif = true; current.fase = 'hening'; current.audioAttribution = session.audio_attribution;
        var fail = function() {
          if (!doaAktif(current, sequence)) return;
          stopDoaTimer(); current.fase = 'pick'; current.error = 'Audio tidak dapat diputar. Coba mulai kembali.'; renderDoa();
        };
        audio.onended = function() { if (doaAktif(current, sequence)) { current.audioAktif = false; jalankanHitung(); } };
        audio.onerror = fail; renderDoa(); audio.play().catch(function() {
          if (!doaAktif(current, sequence)) return;
          current.fase = 'audio-ready'; renderDoa();
        });
      } else { current.audioAktif = false; jalankanHitung(); }
    }).catch(function(error) {
      if (!doaAktif(current, sequence)) return;
      current.fase = 'pick'; current.error = error.message || 'Sesi doa belum dapat dimulai.'; renderDoa();
    });
  }

  function jalankanHitung() {
    var current = doaState, sequence = current.sequence;
    current.fase = 'hening'; current.sisa = Math.max(0, Math.ceil((current.deadline - performance.now()) / 1000)); renderDoa();
    var tick = function() {
      if (!doaAktif(current, sequence)) return;
      current.sisa = Math.max(0, Math.ceil((current.deadline - performance.now()) / 1000));
      if (!current.sisa) { selesaikanDoa(); return; }
      var clock = doaEl.querySelector('.clock'); if (clock) clock.textContent = String(current.sisa);
    };
    current.timer = setInterval(tick, 250); tick();
  }

  function selesaikanDoa() {
    var current = doaState;
    if ((current.fase !== 'hening' && current.fase !== 'finish-error') || !current.token) return;
    stopDoaTimer();
    var sequence = current.sequence;
    current.fase = 'saving'; current.error = ''; renderDoa();
    UM.store.addDoa(current.pesanId, current.token).then(function(result) {
      if (!doaAktif(current, sequence)) return;
      current.added = result && result.added; current.fase = 'done'; renderDoa();
      UM.galaksi.refresh().then(function() {
        if (!doaAktif(current, sequence)) return;
        var item = UM.galaksi.state.daftar.find(function(item) { return item.g.id === current.galaksiId; });
        if (item && UM.ui.renderKartuGalaksi) UM.ui.renderKartuGalaksi(item);
        if (expEl.classList.contains('on')) renderJelajah();
        if (dashEl.classList.contains('on')) renderDash();
      }).catch(function() { if (doaAktif(current, sequence)) toast('Doa sudah tercatat. Tampilan galaksi akan diperbarui saat dibuka kembali.'); });
    }).catch(function(error) {
      if (!doaAktif(current, sequence)) return;
      current.fase = 'finish-error'; current.error = error.message || 'Doa belum dapat dicatat. Coba kembali.'; renderDoa();
    });
  }

  function buildDoa() {
    doaEl = el('div', 'um-screen z-top'); doaEl.id = 'um-doa';
    doaEl.setAttribute('role', 'dialog'); doaEl.setAttribute('aria-label', 'Doa untuk seseorang');
    doaEl.setAttribute('aria-modal', 'true');
    doaEl.appendChild(el('div', 'um-wrap narrow'));
    doaEl.addEventListener('click', function(e) {
      var btn = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn || btn.disabled) return;
      var act = btn.getAttribute('data-act'), id = btn.getAttribute('data-id');
      if (act === 'close') { stopDoaTimer(); close(doaEl); return; }
      if (act === 'reload') { if (doaState.hub) muatDaftarDoa(doaState); else bukaDoa(doaState.galaksiId, doaState.pesanId); return; }
      if (act === 'all-targets') { bukaDoa(); return; }
      if (act === 'hub-trad') { doaState.tradisi = id; doaState.entriId = null; renderDoa(); return; }
      if (act === 'targets-prev' || act === 'targets-next') {
        doaState.offset = Math.max(0, (doaState.offset || 0) + (act === 'targets-next' ? 30 : -30)); muatDaftarDoa(doaState); doaEl.scrollTop = 0; return;
      }
      if (act === 'cancel' || act === 'again') { stopDoaTimer(); doaState.fase = 'pick'; doaState.error = ''; doaState.token = null; renderDoa(); return; }
      if (act === 'retry-finish') { selesaikanDoa(); return; }
      if (act === 'start') { mulaiDoa(); return; }
      if (['loading', 'audio-ready', 'hening', 'saving', 'finish-error'].indexOf(doaState.fase) >= 0) return;
      if (act === 'target') {
        var target = doaState.candidates.find(function(p) { return p.id === id; });
        if (target) { doaState.galaksiId = target.galaksiId; muatTujuanDoa(doaState, id); } return;
      }
      if (act === 'change-target') { stopDoaTimer(); doaState.fase = 'target'; renderDoa(); return; }
      if (act === 'trad' || act === 'entri' || act === 'silence') {
        stopDoaTimer(); doaState.error = ''; doaState.token = null; doaState.fase = 'pick';
        if (act === 'trad') { doaState.tradisi = id; doaState.entriId = null; }
        else if (act === 'entri') doaState.entriId = id;
        else { doaState.tradisi = 'umum'; doaState.entriId = 'hening'; }
        renderDoa();
      }
    });
    document.body.appendChild(doaEl);
  }

` + ui.slice(end);
  ui = replace(ui, "var orangLain = semua.filter(function (p) { return p.sabuk === true; });", "var orangLain = item.batuList || [];");
  return ui;
}
