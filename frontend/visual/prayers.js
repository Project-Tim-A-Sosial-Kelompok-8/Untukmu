/* Prayer registry. Content comes from backend/data/prayers-v1.json and the API. */
window.UM = window.UM || {};
UM.doaData = (function () {
  var TRADISI = window.UM_PRAYER_CATALOG || [];

  function byId(id) {
    for (var i = 0; i < TRADISI.length; i++) if (TRADISI[i].id === id) return TRADISI[i];
    return null;
  }
  function entri(tradisiId, entriId) {
    var tr = byId(tradisiId);
    if (!tr) return null;
    for (var i = 0; i < tr.entri.length; i++) if (tr.entri[i].id === entriId) return tr.entri[i];
    return null;
  }
  function label(tradisiId, lang) {
    var tr = byId(tradisiId);
    if (!tr) return tradisiId;
    return tr.label[lang] || tr.label.id || tradisiId;
  }
  /* Berapa entri yang masih menunggu kurasi — dipakai UI untuk jujur ke pengguna. */
  function belumDikurasi() {
    var n = 0, list = [];
    TRADISI.forEach(function (tr) {
      tr.entri.forEach(function (e) { if (!e.reviewed) { n++; list.push(tr.id + '/' + e.id); } });
    });
    return { jumlah: n, daftar: list };
  }

  return {
    tradisi: TRADISI,
    byId: byId, entri: entri, label: label, belumDikurasi: belumDikurasi,
    catatan: 'Status kurasi dan ketersediaan rekaman ditampilkan pada setiap jenis doa.'
  };
})();
