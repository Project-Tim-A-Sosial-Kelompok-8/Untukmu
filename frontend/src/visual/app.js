/* Bootstrap the product after its visual scene and API runtime have loaded. */
window.UM = window.UM || {};
UM.app = (function () {
  /* Layar pembuka hanya untuk tamu. Anggota yang sudah masuk langsung dibawa
     ke tempat terakhirnya — refresh tidak boleh menahan mereka di intro. */
  function bukaEntryJikaPerlu() {
    return UM.store.identitas().then(function (user) {
      if (user) return;
      UM.ui.bukaEntry();
    });
  }
  function boot() {
    document.body.classList.add("um-on");
    UM.i18n.setLang("id");
    UM.ui.mount();
    UM.sky.pasangKait();
    UM.galaksi.pasangKait();
    UM.ruang.pasangKait();
    var enter = window.enterSky,
      exit = window.exitSky;
    window.enterSky = function () {
      var result = enter();
      UM.sky.onEnter();
      UM.ui.renderSemua();
      return result;
    };
    window.exitSky = function () {
      UM.sky.onExit();
      var result = exit();
      UM.ui.renderSemua();
      return result;
    };
    window.addEventListener(
      "keydown",
      function (event) {
        if (event.key === "Escape" && UM.ui.anyScreenOpen()) {
          UM.ui.closeAllScreens();
          event.stopImmediatePropagation();
        }
      },
      true,
    );
    UM.store
      .ready()
      .then(function () {
        return UM.galaksi.refresh();
      })
      .then(function () {
        /* Langit yang gagal dimuat tidak boleh membatalkan pemulihan ruang. */
        return UM.sky.refresh().catch(function () {
          return null;
        });
      })
      .then(function () {
        return UM.ruang.mulai();
      })
      .then(function () {
        UM.ui.renderSemua();
        if (new URLSearchParams(location.search).get("screen") === "doa") {
          UM.ui.bukaDoa();
          return;
        }
        return bukaEntryJikaPerlu();
      })
      .catch(function () {
        UM.ui.renderSemua();
        UM.store
          .identitas()
          .then(function (user) {
            if (!user) return bukaEntryJikaPerlu();
            /* Jangan menahan anggota di layar pembuka gara-gara ruang terakhir
               gagal dimuat. Kembalikan ke Bima Sakti. */
            return UM.store
              .masukRuang(null)
              .then(function () {
                return UM.galaksi.refresh();
              })
              .then(function () {
                return UM.ruang.mulai();
              })
              .then(function () {
                UM.ui.renderSemua();
                if (UM.ui.toast)
                  UM.ui.toast("Ruang terakhir tidak bisa dibuka. Kamu kembali ke Bima Sakti.");
              });
          })
          .catch(function () {
            UM.ui.renderSemua();
          });
      });
  }
  boot();
  return { boot: boot };
})();
