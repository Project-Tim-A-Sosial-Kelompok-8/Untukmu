/* Untukmu — bootstrap.
 *
 * Dimuat SETELAH script engine, sehingga seluruh variabel dan fungsi tingkat
 * atas engine (viewMode, skyScene, skyCamera, SKY_R, bpEl, bpBody, beaconLang,
 * setBeaconLang, esc, enterSky, exitSky, updateSkyLabels, clearSkySelection,
 * mulberry32, renderer, videoNow, ...) sudah menjadi global dan bisa dikaitkan.
 *
 * Semua kaitan bersifat membungkus (wrap), bukan mengubah: fungsi asli selalu
 * dipanggil lebih dulu atau sesudahnya, jadi perilaku bawaan Galaxy Explorer
 * tetap utuh.
 */
window.UM = window.UM || {};

UM.app = (function () {
  var booted = false;

  function engineSiap() {
    return typeof THREE !== 'undefined' && typeof skyScene !== 'undefined' && skyScene &&
      typeof renderer !== 'undefined' && renderer && typeof bpBody !== 'undefined' && bpBody;
  }

  /* Engine hanya menyimpan bahasa 'en', 'hans', 'hant', 'ja', 'ko'.
     Produk menambahkan 'id'. Karena ini produk berbahasa Indonesia (PRD §4.2),
     kunjungan pertama tanpa pilihan tersimpan dimulai dalam Bahasa Indonesia. */
  function sinkronBahasa() {
    var tersimpan = null;
    try { tersimpan = localStorage.getItem('gx-lang'); } catch (e) {}
    if (!tersimpan && typeof setBeaconLang === 'function') {
      setBeaconLang('id'); // sekaligus menyimpan pilihan, jadi pilihan pengguna tetap dihormati
    }
    var aktif = (typeof beaconLang === 'string') ? beaconLang : 'id';
    return UM.i18n.setLang(aktif);
  }

  /* Pemilih bahasa milik engine tetap menjadi satu-satunya sakelar bahasa:
     astronomi memakai tabelnya sendiri, produk memakai tabelnya sendiri. */
  function kaitBahasa() {
    var sel = document.getElementById('lang');
    if (!sel) return;
    sel.addEventListener('change', function () {
      UM.i18n.setLang(sel.value);
      UM.ui.renderSemua();
      UM.sky.segarkanTeks();
      if (typeof viewMode !== 'undefined' && viewMode === 'sky') UM.sky.perbaruiLabel();
    });
  }

  /* Membungkus siklus hidup mode langit supaya chrome produk ikut berubah. */
  function kaitLangit() {
    if (typeof window.enterSky === 'function') {
      var asliMasuk = window.enterSky;
      window.enterSky = function () {
        var hasil = asliMasuk.apply(this, arguments);
        if (hasil) { UM.sky.onEnter(); UM.ui.renderSemua(); }
        return hasil;
      };
    }
    if (typeof window.exitSky === 'function') {
      var asliKeluar = window.exitSky;
      window.exitSky = function () {
        UM.sky.onExit();
        var hasil = asliKeluar.apply(this, arguments);
        UM.ui.renderSemua();
        return hasil;
      };
    }
  }

  /* Esc menutup layar produk lebih dulu, baru milik engine.
     Fase capture dipakai agar layar produk menang atas penangan Esc engine. */
  function kaitEsc() {
    window.addEventListener('keydown', function (e) {
      if ((e.key || '').toLowerCase() !== 'escape') return;
      if (document.body.classList.contains('gx-cinema')) return;
      if (!UM.ui.anyScreenOpen()) return;
      UM.ui.closeAllScreens();
      e.stopImmediatePropagation();
    }, true);
  }

  /* Beberapa label engine hanya punya 5 bahasa. Untuk 'id' engine jatuh ke
     Inggris; teks navigasi yang paling terlihat kita ganti sendiri supaya
     tidak setengah Indonesia setengah Inggris. */
  function kaitTeksEngine() {
    if (typeof window.updateSolarNavigationText !== 'function') return;
    var asli = window.updateSolarNavigationText;
    window.updateSolarNavigationText = function () {
      var hasil = asli.apply(this, arguments);
      if (UM.i18n.getLang() === 'id') {
        ['skyback', 'solarback'].forEach(function (id) {
          var n = document.getElementById(id);
          if (n) { n.textContent = '← Kembali'; n.setAttribute('aria-label', '← Kembali'); }
        });
        var tutup = document.getElementById('bp-close');
        if (tutup) { tutup.setAttribute('aria-label', 'Tutup'); tutup.title = 'Tutup'; }
      }
      return hasil;
    };
  }

  /* Galaksi latar bawaan engine dimatikan secara baku (lihat um-galaksi.js).
     Pilihan pengguna disimpan di meta 'setelan'; parameter URL menang, supaya
     "template dengan galaksi bawaan" bisa dibuka tanpa mengubah apa pun. */
  function terapkanGalaksiBawaan() {
    var paksa = /[?&]galaksiBawaan=(1|on|true)/.test(location.search);
    if (paksa) return Promise.resolve(UM.galaksi.setGalaksiBawaan(true));
    return UM.store.getMeta('setelan').then(function (s) {
      return UM.galaksi.setGalaksiBawaan(!!(s && s.galaksiBawaan));
    });
  }

  function boot() {
    if (booted) return false;
    booted = true;

    document.title = 'Untukmu — Ruang untuk Pesan, Kenangan, dan Doa';
    document.body.classList.add('um-on');
    document.body.style.background = '#03040a';

    sinkronBahasa();

    if (!engineSiap()) {
      /* Kalau engine gagal dimuat, jangan tampilkan UI yang tidak bisa apa-apa. */
      var el = document.createElement('div');
      el.className = 'um-screen on z-top';
      el.innerHTML = '<div class="um-wrap narrow" style="margin-top:12vh"><div class="um-card">' +
        '<div class="um-h1">Untukmu</div>' +
        '<p class="um-p">Mesin visual Galaxy Explorer tidak termuat. Pastikan folder <b>vendor/</b> ada di sebelah <b>index.html</b> dan halaman dibuka lewat server lokal (bukan file://).</p>' +
        '</div></div>';
      document.body.appendChild(el);
      return false;
    }

    UM.ui.mount();
    UM.sky.pasangKait();
    UM.galaksi.pasangKait();
    kaitBahasa();
    kaitLangit();
    kaitEsc();
    kaitTeksEngine();
    if (typeof window.updateSolarNavigationText === 'function') window.updateSolarNavigationText();
    UM.ui.renderSemua();

    /* Data contoh diisi sekali, lalu ladang galaksi dan Peta dibangun dari data itu.
       Pengujian dijalankan paling akhir supaya basis data sudah siap. */
    UM.store.seedIfEmpty().then(function () {
      return terapkanGalaksiBawaan();
    }).then(function () {
      return UM.galaksi.refresh();
    }).then(function () {
      return UM.sky.refresh();
    }).then(function () {
      UM.galaksi.segarkanTeks();
      UM.sky.segarkanTeks();
      UM.ui.bukaEntry();
    }).catch(function (err) {
      if (window.console) console.error('[Untukmu] gagal memuat data:', err);
      UM.ui.bukaEntry();
    }).then(function () {
      if (/[?&]umTest=1/.test(location.search) && UM.tests) UM.tests.run();
    });

    return true;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return { boot: boot, engineSiap: engineSiap };
})();
