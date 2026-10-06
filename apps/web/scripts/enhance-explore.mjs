export function enhanceExplore(ui, replace) {
  ui = replace(ui, "var expSort = 'baru';", "var expSort = 'baru', expOffset = 0, expMood = '', expTag = '', expRequest = 0, expRows = [], expMore = false, expBusy = false, expError = ''; ");
  const start = ui.indexOf('  function bukaJelajah() {');
  const end = ui.indexOf('  /* ── modal doa', start);
  if (start < 0 || end < 0) throw new Error('Explore screen anchors missing');
  return ui.slice(0, start) + String.raw`  function bukaJelajah() {
    closeAllScreens(); open(expEl); expOffset = 0; renderJelajah();
  }

  function gambarJelajah() {
    var busy = expBusy ? ' disabled' : '';
    var filters = (expMood ? 'Suasana: ' + UM.i18n.mood(expMood) : 'Semua suasana') + (expTag ? ' · Tag: #' + expTag : ' · Semua tag');
    expEl.querySelector('.um-wrap').innerHTML =
      '<div class="um-head"><div><div class="um-h1">Jelajah ucapan</div><p class="um-muted">Ruang untuk membaca ucapan publik anonim dan saling mendukung. Sampaikan empati atau pilih Doakan ucapan ini untuk membuka pilihan agama atau tradisi. Pesan pribadi Anda ada di Ruang Pribadi.</p></div><button class="um-close" data-act="close" aria-label="Tutup Jelajah">×</button></div>' +
      '<div class="um-card"><div class="um-grid2"><div class="um-field"><label class="um-label" for="um-filter-mood">Suasana hati</label><select id="um-filter-mood" class="um-select"' + busy + '><option value="">Semua</option>' +
      UM.i18n.moodIds().map(function(m) { return '<option value="' + escAttr(m) + '"' + (expMood === m ? ' selected' : '') + '>' + teks(UM.i18n.mood(m)) + '</option>'; }).join('') +
      '</select></div><div class="um-field"><label class="um-label" for="um-filter-tag">Tag</label><input id="um-filter-tag" class="um-input" value="' + escAttr(expTag) + '" maxlength="50" placeholder="Contoh: kenangan"' + busy + '><p class="um-hint">Cari satu tag yang dicantumkan penulis. Pilih suasana dan/atau tag, lalu tekan Terapkan filter.</p></div></div>' +
      '<div class="um-btn-row"><button class="um-btn" data-act="filter"' + busy + '>Terapkan filter</button><button class="um-btn ghost" data-act="reset-filter"' + busy + '>Hapus filter</button></div>' +
      '<div class="um-chips" role="group" aria-label="Urutan ucapan" style="margin-top:16px">' +
      '<button class="um-chip' + (expSort === 'baru' ? ' on' : '') + '" aria-pressed="' + (expSort === 'baru') + '" data-act="sort" data-id="baru"' + busy + '>Terbaru</button>' +
      '<button class="um-chip' + (expSort === 'doa' ? ' on' : '') + '" aria-pressed="' + (expSort === 'doa') + '" data-act="sort" data-id="doa"' + busy + '>Paling didoakan</button></div>' +
      '<p class="um-muted">' + (expSort === 'doa' ? 'Urutan jumlah pendoa terbanyak; jika sama, pesan terbaru lebih dahulu. Ini jumlah dukungan doa, bukan peringkat pengguna.' : 'Urutan waktu pesan dibuat, dari yang terbaru ke yang lebih lama.') + '</p>' +
      '<p class="um-hint" data-filter-summary>' + teks(filters) + '</p></div>' +
      '<div aria-live="polite" aria-busy="' + expBusy + '">' + (expBusy ? '<p class="um-note" role="status">Memuat ucapan…</p>' : expError ? '<p class="um-note warn" role="alert">' + teks(expError) + '</p><button class="um-btn" data-act="retry">Coba lagi</button>' :
      expRows.length ? '<ul class="um-list um-card" style="margin-top:14px">' + expRows.map(function(p) {
        return '<li class="um-item"><div class="um-item-top"><span class="who">' + teks(p.sendiri ? T('expMine') : T('expAnon')) + '</span><span class="um-badge publik">' + ((p.pendoa && p.pendoa.total) || 0) + ' pendoa</span><span class="when">' + teks(ntah(p.dibuat)) + '</span></div>' +
          (p.authorDeleted ? '<div class="um-muted">Tulisan dipertahankan secara anonim; akun penulis sudah dihapus.</div>' : '') +
          '<div class="txt" data-isi="' + escAttr(p.id) + '">' + teks(p.publicBody || '') + '</div><div class="um-item-acts">' +
          '<button class="um-btn small primary" data-act="doa" data-id="' + escAttr(p.id) + '" data-g="' + escAttr(p.galaksiId) + '">Doakan ucapan ini</button>' +
          '<button class="um-btn small" data-act="empati" data-id="' + escAttr(p.id) + '">Sampaikan empati</button>' +
          '<button class="um-btn small ghost" data-act="lapor" data-id="' + escAttr(p.id) + '">Laporkan</button>' +
          (p.sendiri || p.authorDeleted ? '' : '<button class="um-btn small ghost" data-act="block" data-id="' + escAttr(p.id) + '">Blokir pengirim</button>') + '</div></li>';
      }).join('') + '</ul>' : '<p class="um-empty">Belum ada ucapan publik yang sesuai. Coba hapus filter. Pesan privat atau yang menunggu moderasi tidak tampil di sini.</p>') + '</div>' +
      '<p id="um-exp-page-status" class="um-hint" role="status">' + (expBusy ? 'Memuat halaman...' : expError ? 'Gagal memuat halaman. Tekan Coba lagi.' : expRows.length ? 'Menampilkan ucapan ' + (expOffset + 1) + ' sampai ' + (expOffset + expRows.length) + '. Maksimal 30 ucapan per halaman.' : 'Tidak ada ucapan untuk ditampilkan.') + '</p>' +
      '<nav aria-describedby="um-exp-page-status" class="um-btn-row between" aria-label="Halaman ucapan"><button class="um-btn" data-act="prev-page"' + (!expOffset || expBusy ? ' disabled' : '') + '>Sebelumnya</button><span class="um-muted">Halaman ' + (Math.floor(expOffset / 30) + 1) + '</span><button class="um-btn" data-act="next-page"' + (!expMore || expBusy || expError ? ' disabled' : '') + '>Berikutnya</button></nav>' +
      (!expBusy && !expError && !expOffset ? '<p class="um-hint">Anda berada di halaman pertama, sehingga Sebelumnya belum tersedia.</p>' : '') +
      (!expBusy && !expError && !expMore ? '<p class="um-hint">Anda sudah mencapai akhir hasil. Tidak ada halaman berikutnya. Berikutnya aktif jika masih ada ucapan setelah halaman ini.</p>' : '');
  }

  function renderJelajah() {
    var request = ++expRequest;
    expBusy = true; expError = ''; gambarJelajah();
    UM.store.explore(expSort, expOffset, expMood, expTag).then(function(rows) {
      if (request !== expRequest || !expEl.classList.contains('on')) return;
      expRows = rows.slice(0, 30); expMore = rows.length > 30; expBusy = false; gambarJelajah();
    }).catch(function(error) {
      if (request !== expRequest || !expEl.classList.contains('on')) return;
      expError = error.message || 'Ucapan belum dapat dimuat.'; expBusy = false; gambarJelajah();
    });
  }

  function buildJelajah() {
    expEl = el('div', 'um-screen'); expEl.id = 'um-exp';
    expEl.appendChild(el('div', 'um-wrap'));
    expEl.addEventListener('click', function(e) {
      var btn = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!btn || btn.disabled) return;
      var act = btn.getAttribute('data-act'), id = btn.getAttribute('data-id');
      if (act === 'close') { ++expRequest; close(expEl); }
      else if (act === 'retry') renderJelajah();
      else if (act === 'sort') { expSort = id; expOffset = 0; renderJelajah(); }
      else if (act === 'filter' || act === 'reset-filter') {
        expMood = act === 'filter' ? expEl.querySelector('#um-filter-mood').value : '';
        expTag = act === 'filter' ? expEl.querySelector('#um-filter-tag').value.trim().replace(/^#/, '') : '';
        expOffset = 0; renderJelajah();
      } else if (act === 'prev-page' || act === 'next-page') {
        if (expBusy || (act === 'next-page' && !expMore)) return;
        expOffset = Math.max(0, expOffset + (act === 'next-page' ? 30 : -30)); renderJelajah(); expEl.scrollTop = 0;
      } else if (act === 'doa') bukaDoa(btn.getAttribute('data-g'), id);
      else if (act === 'empati') {
        btn.disabled = true;
        UM.store.empathy(id).then(function() { if (btn.isConnected) btn.textContent = 'Empati terkirim'; toast(T('empathiToast')); }).catch(function(error) { btn.disabled = false; toast(error.message); });
      } else if (act === 'lapor' || act === 'block') UM.openSocial(act === 'lapor' ? 'report' : 'block', id);
    });
    document.body.appendChild(expEl);
  }

` + ui.slice(end);
}
