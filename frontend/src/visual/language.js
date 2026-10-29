/* Untukmu — tabel bahasa UI produk.
 *
 * Bahasa ditentukan oleh <select id="lang"> milik engine:
 *   'id'  → Bahasa Indonesia (bahasa utamaproduk ini)
 *   lain  → jatuh ke 'en'; tampilan produk memakai Bahasa Indonesia.
 *
 * Ditulis gaya ES5 agar seragam dengan engine. */
window.UM = window.UM || {};

UM.i18n = (function () {
  var T = {
    id: {
      brand: "Untukmu",
      brandSub: "ruang untuk pesan yang tak tersampaikan",
      brandHint: "putar langitnya · dekatkan dengan gulir · F untuk mode sinema",

      /* pembuka */
      entryKicker: "Surat yang tak sempat terkirim",
      entryH1: "Untukmu",
      entryLead:
        "Ada yang tak sempat kau sampaikan. Tulis di sini; biarkan ia tinggal sebagai bintang di ruangmu, mengorbit pelan di Bima Sakti.",
      entryActsTulis: "Mulai menulis",
      entryActsLangit: "Jelajahi Langit",
      entryFine:
        "Pesan privat dan tautan terbatas dienkripsi di perangkatmu. Pesan publik anonim ditinjau sebelum terbit. Baca kebijakan privasi.",
      entryFineWarn:
        "Enkripsi membutuhkan HTTPS atau localhost. Penulisan pesan terenkripsi belum tersedia pada koneksi ini.",
      entrySkip: "Lihat langitnya dulu",

      /* dock */
      dockTulis: "Tulis",
      dockLangit: "Langit",
      dockJelajah: "Jelajah",
      dockDash: "Ruang Pribadi",
      dockSetup: "Kunci",
      dockSet: "Pengaturan",
      dockRumah: "Rumah",
      dockPeta: "Peta",

      /* ladang galaksi */
      entryActsGalaksi: "Jelajahi Bima Sakti",
      galaksiKosong: "Ruang ini belum punya galaksi.",
      genHilang: "Generator galaksi engine tidak tersedia — ladang galaksi tidak bisa dibangun.",
      kirimPesan: "Pesanmu sudah tiba.",
      kirimJalan: "Menempuh perjalanan…",
      petaHint: "Klik penanda untuk mengunjungi galaksi itu.",

      /* pemilih bentuk galaksi */
      bentukTitle: "Bentuk galaksi untuk orang ini",
      bentukSpiral: "Spiral",
      bentukSpiralD: "Piringan berputar dengan lengan bercahaya.",
      bentukEllipsoid: "Elips",
      bentukEllipsoidD: "Bola cahaya tua yang tenang.",
      bentukIrregular: "Tak beraturan",
      bentukIrregularD: "Gumpalan muda yang berantakan dan hidup.",
      bentukWarna: "Warna",
      bentukUkuran: "Ukuran",
      bentukHint: "Bentuk ini tidak bisa diubah lagi setelah disimpan.",
      ukuranKecil: "Kecil",
      ukuranSedang: "Sedang",
      ukuranBesar: "Besar",
      jenisSpiral: "spiral",
      jenisEllipsoid: "elips",
      jenisIrregular: "tak beraturan",

      /* kartu galaksi, bintang, batu */
      gkBintang: "Pesanmu",
      gkBatu: "Pesan orang lain",
      gkDoa: "Doa diterima",
      gkHint: "Dekatkan dengan gulir, lalu klik bintang atau butir debu untuk membaca isinya.",
      gkKirim: "Tulis pesan ke galaksi ini",
      gkDoakan: "Doakan orang ini",
      gkLihat: "Lihat",
      gkTerbang: "Terbang ke sini",
      bintangLabel: "Pesanmu",
      titikLabel: "Bintang di lengan galaksi",
      titikSendiri: "Pesan yang kau tulis untuk orang ini.",
      titikOrangLain: "Pesan dari seseorang, tanpa nama.",
      batuLabel: "Pesan dari orang lain",
      batuTradisi: "Tradisi",
      batuDoa: "Doa",
      batuKapan: "Didoakan",
      batuDari: "Dikirim oleh seseorang, tanpa nama. Doanya menempel pada pesan ini.",

      /* ruang pribadi */
      dashStatGalaksi: "Galaksi",
      dashGalaksi: "Galaksi orang",
      dashEmptyGalaksi: "Belum ada galaksi.",
      dashMasuk: "pesan dari orang lain di sabuk galaksimu",
      legenda:
        "Klik bintang untuk membaca pesan. Debu keemasan di sekeliling galaksi adalah doa dari orang lain.",

      /* langit */
      skyKenangan: "Kenangan",
      skyHint: "Pilih satu kenangan untuk membuka pesan-pesannya.",

      /* komposer */
      compTitle: "Tulis Pesan",
      c1Title: "Untuk siapa pesan ini?",
      c1Label: "Nama yang dituju",
      c1Ph: "misalnya: Ibu, Rani, atau Diri Sendiri",
      c1Cat: "Kategori (opsional)",
      c1Baru: "＋ Kenangan baru",
      c1Pick: "Pilih kenangan yang sudah ada, atau buat yang baru.",
      c1Ke: "Pesan ini akan ditambahkan ke kenangan ini.",
      c2Title: "Bagaimana kenangan ini tampil di langit?",
      c2Foto: "Unggah foto",
      c2Cahaya: "Simbol cahaya",
      c2Upload: "Pilih gambar…",
      c2Remove: "Hapus foto",
      c2Hinta: "Foto akan disimpan lokal di perangkat ini.",
      c2Hints: "Bintang dengan warna cahaya pilihanmu.",
      c3Title: "Tulis isinya",
      c3Isi: "Isi pesan",
      c3IsiPh: "Tulis dengan bebas. Tidak ada yang membacanya selain dirimu.",
      c3Tanggal: "Tanggal",
      c3Mood: "Suasana hati",
      c3Tag: "Tag",
      c3TagPh: "maaf, rindu, ulang tahun",
      c3TagHint: "Pisahkan dengan koma. Maksimal 5 tag.",
      c4Title: "Siapa yang boleh membacanya?",
      c4Note: "Pilihan ini bisa diubah nanti.",
      privPrivat: "Privat",
      privPrivatD:
        "Hanya dirimu. Dienkripsi penuh — server tidak bisa membaca isinya, dan tidak ikut moderasi.",
      privPublik: "Publik anonim",
      privPublikD:
        "Muncul di Jelajah dan galaksi publik tanpa namamu. Untuk bisa dibaca orang lain, pesan ini tidak dienkripsi penuh.",
      privUnlisted: "Tidak terdaftar",
      privUnlistedD: "Tidak muncul di halaman jelajah. Hanya bisa dibuka lewat tautan langsung.",

      /* tombol umum */
      btnBack: "Kembali",
      btnNext: "Lanjut",
      btnSave: "Simpan sebagai bintang",
      btnCancel: "Batal",
      btnClose: "Tutup",
      btnDelete: "Hapus",

      /* galat */
      errNama: "Nama yang dituju belum diisi.",
      errIsi: "Isi pesan belum diisi.",
      errFoto: "Pilih gambar dulu, atau ganti ke simbol cahaya.",
      errPrivatLocked: "Buka kuncimu dulu supaya pesan privat bisa dienkripsi.",
      savedToast: "Tersimpan. Satu bintang baru menyala.",

      /* status */
      stPrivat: "Privat",
      stPublik: "Publik",
      stUnlisted: "Tidak terdaftar",

      /* kartu rasi */
      rcPesan: "pesan",
      rcDoa: "doa diterima",
      rcTulis: "+ Tulis pesan di sini",

      /* kartu pesan */
      pcTanggal: "Tanggal",
      pcMood: "Suasana hati",
      pcTag: "Tag",
      pcDoakan: "Doakan",
      pcEmpati: "Berikan empati",
      pcEmpatiHint:
        "Dukungan anonim. Penulis melihat jumlahnya di Ruang Pribadi; untuk ikut mendoakan, pilih Doakan.",
      pcEmpatiSent: "Empati terkirim",
      pcEmpatiReceived: "dukungan empati diterima",
      pcPendoa: "pendoa",
      pcEmpty: "Belum ada pesan di kenangan ini.",

      /* kondisi terkunci */
      lockedTitle: "Terkunci",
      lockedText: "Kenanganmu terenkripsi. Masukkan kata sandi untuk membukanya.",
      lockedBtn: "Buka kunci",

      /* doa */
      doaTitle: "Doakan",
      doaTrad: "Pilih tradisi",
      doaPick: "Pilih doa",
      doaStart: "Mulai",
      doaPlaying: "Sedang berdoa…",
      doaHening: "Hening sejenak",
      doaDone: "Doa terkirim. Satu bintang doa menyala.",
      doaEmpty: "Belum ada doa terkurasi untuk tradisi ini.",
      doaUncurated: "Belum dikurasi",
      doaUncuratedNote:
        "Teks ini belum ditinjau. Isi sesuai sumber yang tercantum sebelum dipakai.",
      doaSecond: "detik",
      doaAgain: "Doakan lagi",
      doaCount: "doa",
      doaNeedPick: "Pilih satu doa dulu.",

      /* tradisi */
      tradUmum: "Doa umum",
      tradUmumD: "Hening tanpa teks, untuk siapa pun.",

      /* jelajah */
      expTitle: "Jelajahi Pesan Publik",
      expLead:
        "Pesan yang dibagikan secara anonim. Tidak ada pengikut, tidak ada tanda suka, tidak ada peringkat.",
      expEmpty: "Belum ada pesan publik.",
      expSortNew: "Terbaru",
      expSortDoa: "Paling didoakan",
      expAnon: "Anonim",
      expMine: "Milikmu",
      expReportToast: "Laporan tercatat. Pesan disembunyikan dari jelajahmu.",
      empathiToast: "Dukungan empati Anda telah dicatat secara anonim.",
      empathiAlready: "Empati Anda untuk pesan ini sudah tercatat. Hitungan tidak bertambah lagi.",
      lockedShort: "Terkunci — buka kuncimu untuk membaca.",
      compTooBig: "Gambar terlalu besar (maksimal 4 MB).",
      expRead: "Baca",
      expReport: "Laporkan",
      expReported: "Laporan tercatat",
      expFrom: "dari",

      /* ruang pribadi */
      dashTitle: "Ruang Pribadi",
      dashStatPesan: "Pesan",
      dashStatRasi: "Kenangan",
      dashStatDoa: "Doa diterima",
      dashStatPendoa: "Doa yang kauberikan",
      dashRasi: "Kenanganmu",
      dashPesan: "Pesanmu",
      dashNewRasi: "Kenangan baru",
      dashEmptyRasi: "Belum ada kenangan.",
      dashEmptyPesan: "Belum ada pesan.",
      dashGoSky: "Lihat di langit →",

      /* kunci / enkripsi */
      setupTitle: "Kunci Enkripsi",
      setupIntro:
        "Kata sandi ini menurunkan kunci yang mengenkripsi kenanganmu. Kunci tidak pernah dikirim ke mana pun. Kalau kata sandi ini hilang, isi pesan privat tidak bisa dibuka lagi.",
      setupCreate: "Buat kunci",
      setupUnlock: "Buka kunci",
      setupPw: "Kata sandi",
      setupPw2: "Ulangi kata sandi",
      setupPwHint: "Minimal 8 karakter. Tidak dikirim ke server mana pun.",
      setupShort: "Kata sandi minimal 8 karakter.",
      setupMismatch: "Kata sandi tidak sama.",
      setupWrong: "Kata sandi salah.",
      setupLock: "Kunci sekarang",
      setupLocked: "Terkunci",
      setupUnlocked: "Terbuka",
      setupRecovery: "Kunci pemulihan",
      setupRecoveryNote:
        "Simpan ini di tempat aman, terpisah dari perangkatmu. Ini satu-satunya cara membuka kenanganmu kalau kata sandi lupa. Hanya ditampilkan sekali.",
      setupRecoveryCopy: "Salin",
      setupCopied: "Tersalin.",
      setupUnsupported:
        "Peramban ini tidak mendukung Web Crypto, atau halaman dibuka lewat file://. Enkripsi dinonaktifkan dan pesan disimpan tanpa sandi.",
      setupNotyet: "Belum dibuat",

      /* pengaturan */
      setTitle: "Pengaturan",
      setLang: "Bahasa",
      setAktif: "Tampilkan",
      setMati: "Sembunyikan",
      setReset: "Hapus semua data",
      setResetNote: "Semua kenangan, pesan, dan doa di perangkat ini akan dihapus permanen.",
      setResetDo: "Hapus permanen",
      setResetDone: "Semua data dihapus.",
      setAbout: "Tentang",
      setAboutText:
        "Untukmu — purwarupa antarmuka. Mesin visual: Galaxy Explorer (PolyForm Noncommercial 1.0.0).",

      /* umum */
      commonPesan: "pesan",
      commonRasi: "kenangan",
      commonDoa: "doa",
      commonNone: "—",
      commonClose: "Tutup",
      confirmYes: "Ya, lanjutkan",
      confirmNo: "Batal",
    },
    en: {
      brand: "Untukmu",
      brandSub: "a place for what was never said",
      brandHint: "turn the sky · scroll to move closer · F for cinema",

      entryH1: "Untukmu",
      entryLead:
        "Some things never got said. Leave them here; they will stay as a star in your space, circling the Milky Way.",
      entryActsTulis: "Start Writing",
      entryActsLangit: "Explore the Sky",
      entryFine:
        "Message contents are encrypted on your device before being stored. We cannot read them.",
      entryFineWarn:
        "Encryption is unavailable on this page (needs https or localhost). Messages will be stored unencrypted.",
      entrySkip: "Just show the galaxy →",

      dockTulis: "Write",
      dockLangit: "Sky",
      dockJelajah: "Explore",
      dockDash: "My Space",
      dockSetup: "Key",
      dockSet: "Settings",
      dockRumah: "Home",
      dockPeta: "Map",

      /* galaxy field */
      entryActsGalaksi: "Explore the Galaxies",
      galaksiKosong: "No galaxies yet. Start writing to light the first one.",
      genHilang: "The engine’s galaxy generator is unavailable — the galaxy field cannot be built.",
      kirimPesan: "Your message has arrived.",
      kirimJalan: "Travelling…",
      petaHint: "Click a marker to visit that galaxy.",

      /* galaxy shape chooser */
      bentukTitle: "The shape of this person’s galaxy",
      bentukSpiral: "Spiral",
      bentukSpiralD: "A spinning disc with glowing arms.",
      bentukEllipsoid: "Elliptical",
      bentukEllipsoidD: "A calm, older ball of light.",
      bentukIrregular: "Irregular",
      bentukIrregularD: "A young, messy, lively clump.",
      bentukWarna: "Colour",
      bentukUkuran: "Size",
      bentukHint: "This shape cannot be changed after saving.",
      ukuranKecil: "Small",
      ukuranSedang: "Medium",
      ukuranBesar: "Large",
      jenisSpiral: "spiral",
      jenisEllipsoid: "elliptical",
      jenisIrregular: "irregular",

      /* galaxy, star, rock cards */
      gkBintang: "Your messages",
      gkBatu: "Messages from others",
      gkDoa: "Prayers received",
      gkHint: "Move closer with the scroll wheel, then click a star or a mote of dust to read it.",
      gkKirim: "Write a message to this galaxy",
      gkDoakan: "Pray for this person",
      gkLihat: "View",
      gkTerbang: "Fly here",
      bintangLabel: "Your message",
      titikLabel: "A star in the galaxy’s arm",
      titikSendiri:
        "This is one of the messages you wrote for them. The camera rides along as the galaxy turns.",
      titikOrangLain: "Sent by someone, unnamed. The camera rides along as the galaxy turns.",
      batuLabel: "A message from someone else",
      batuTradisi: "Tradition",
      batuDoa: "Prayer",
      batuKapan: "Prayed",
      batuDari: "Sent by someone, unnamed. Their prayer is attached to this message.",

      /* my space */
      dashStatGalaksi: "Galaxies",
      dashGalaksi: "People’s galaxies",
      dashEmptyGalaksi: "No galaxies yet.",
      dashMasuk: "messages from others in your galaxies’ belts",
      legenda:
        "✦ every star in the galaxy’s arm is clickable · ✧ golden dust circling = prayers from others",

      skyKenangan: "Memories",
      skyHint: "Pick a memory to open its messages.",

      compTitle: "Write a Message",
      c1Title: "Who is this for?",
      c1Label: "Name",
      c1Ph: "e.g. Mom, Rani, or Myself",
      c1Cat: "Category (optional)",
      c1Baru: "＋ New memory",
      c1Pick: "Pick an existing memory, or create a new one.",
      c1Ke: "This message will be added to this memory.",
      c2Title: "How should this memory appear in the sky?",
      c2Foto: "Upload a photo",
      c2Cahaya: "A symbol of light",
      c2Upload: "Choose image…",
      c2Remove: "Remove photo",
      c2Hinta: "The photo stays on this device only.",
      c2Hints: "A star tinted with the colour you choose.",
      c3Title: "Write it",
      c3Isi: "Message",
      c3IsiPh: "Write freely. Nobody reads this but you.",
      c3Tanggal: "Date",
      c3Mood: "Mood",
      c3Tag: "Tags",
      c3TagPh: "sorry, longing, birthday",
      c3TagHint: "Comma separated. Up to 5 tags.",
      c4Title: "Who may read it?",
      c4Note: "You can change this later.",
      privPrivat: "Private",
      privPrivatD:
        "You only. Fully encrypted — the server cannot read it, and it is excluded from moderation.",
      privPublik: "Public, anonymous",
      privPublikD:
        "Appears in Explore and public galaxies without your name. To be readable by others, it is not fully encrypted.",
      privUnlisted: "Unlisted",
      privUnlistedD: "Hidden from Explore. Reachable only through a direct link.",

      btnBack: "Back",
      btnNext: "Next",
      btnSave: "Save as a star",
      btnCancel: "Cancel",
      btnClose: "Close",
      btnDelete: "Delete",

      errNama: "Please enter who this is for.",
      errIsi: "Please write the message.",
      errFoto: "Choose an image first, or switch to a symbol of light.",
      errPrivatLocked: "Unlock your key first so private messages can be encrypted.",
      savedToast: "Saved. A new star is lit.",

      stPrivat: "Private",
      stPublik: "Public",
      stUnlisted: "Unlisted",

      rcPesan: "messages",
      rcDoa: "prayers received",
      rcTulis: "+ Write a message here",

      pcTanggal: "Date",
      pcMood: "Mood",
      pcTag: "Tags",
      pcDoakan: "Pray",
      pcEmpati: "Send empathy",
      pcEmpatiHint:
        "Send anonymous support to show you understand the writer's feelings. The writer sees the support count in their Private Space. To listen to a prayer and add to the prayer count, choose Pray for this message.",
      pcEmpatiSent: "Empathy sent",
      pcEmpatiReceived: "messages of empathy received",
      pcPendoa: "praying",
      pcEmpty: "No messages in this memory yet.",

      lockedTitle: "Locked",
      lockedText: "Your memories are encrypted. Enter your password to open them.",
      lockedBtn: "Unlock",

      doaTitle: "Pray",
      doaTrad: "Choose a tradition",
      doaPick: "Choose a prayer",
      doaStart: "Begin",
      doaPlaying: "Praying…",
      doaHening: "A moment of silence",
      doaDone: "Prayer sent. A prayer star is lit.",
      doaEmpty: "No curated prayer for this tradition yet.",
      doaUncurated: "Not yet reviewed",
      doaUncuratedNote:
        "This text has not been reviewed. Fill it from the cited source before use.",
      doaSecond: "seconds",
      doaAgain: "Pray again",
      doaCount: "prayers",
      doaNeedPick: "Choose a prayer first.",

      tradUmum: "General prayer",
      tradUmumD: "Silence without words, for anyone.",

      expTitle: "Explore Public Messages",
      expLead: "Messages shared anonymously. No followers, no likes, no ranking.",
      expEmpty: "No public messages yet.",
      expSortNew: "Newest",
      expSortDoa: "Most prayed for",
      expAnon: "Anonymous",
      expMine: "Yours",
      expReportToast: "Report recorded. Hidden from your Explore.",
      empathiToast: "Your anonymous support has been recorded.",
      empathiAlready:
        "Your empathy for this message is already recorded. The count stays the same.",
      lockedShort: "Locked — unlock to read.",
      compTooBig: "Image is too large (4 MB max).",
      expRead: "Read",
      expReport: "Report",
      expReported: "Report recorded",
      expFrom: "from",

      dashTitle: "My Space",
      dashStatPesan: "Messages",
      dashStatRasi: "Memories",
      dashStatDoa: "Prayers received",
      dashStatPendoa: "Prayers you gave",
      dashRasi: "Your memories",
      dashPesan: "Your messages",
      dashNewRasi: "New memory",
      dashEmptyRasi: "No memories yet.",
      dashEmptyPesan: "No messages yet.",
      dashGoSky: "See it in the sky →",

      setupTitle: "Encryption Key",
      setupIntro:
        "This password derives the key that encrypts your memories. The key is never sent anywhere. If you lose the password, private message contents cannot be recovered.",
      setupCreate: "Create key",
      setupUnlock: "Unlock",
      setupPw: "Password",
      setupPw2: "Repeat password",
      setupPwHint: "At least 8 characters. Never sent to any server.",
      setupShort: "Password must be at least 8 characters.",
      setupMismatch: "Passwords do not match.",
      setupWrong: "Wrong password.",
      setupLock: "Lock now",
      setupLocked: "Locked",
      setupUnlocked: "Unlocked",
      setupRecovery: "Recovery key",
      setupRecoveryNote:
        "Keep this somewhere safe, separate from this device. It is the only way back in if you forget the password. Shown once.",
      setupRecoveryCopy: "Copy",
      setupCopied: "Copied.",
      setupUnsupported:
        "This browser does not support Web Crypto, or the page was opened over file://. Encryption is disabled and messages are stored unencrypted.",
      setupNotyet: "Not created yet",

      setTitle: "Settings",
      setLang: "Language",
      setAktif: "Show",
      setMati: "Hide",
      setReset: "Delete all data",
      setResetNote: "Every memory, message and prayer on this device will be permanently deleted.",
      setResetDo: "Delete permanently",
      setResetDone: "All data deleted.",
      setAbout: "About",
      setAboutText:
        "Untukmu — interface prototype. Visual engine: Galaxy Explorer (PolyForm Noncommercial 1.0.0).",

      commonPesan: "messages",
      commonRasi: "memories",
      commonDoa: "prayers",
      commonNone: "—",
      commonClose: "Close",
      confirmYes: "Yes, continue",
      confirmNo: "Cancel",
    },
  };

  /* Kategori pihak yang dituju (PRD §9.2). */
  var KATEGORI = {
    id: {
      "orang-tua": "Orang tua",
      pasangan: "Pasangan",
      sahabat: "Sahabat",
      saudara: "Saudara",
      "diri-sendiri": "Diri sendiri",
      almarhum: "Yang telah pergi",
      "lain-lain": "Lainnya",
    },
    en: {
      "orang-tua": "Parent",
      pasangan: "Partner",
      sahabat: "Friend",
      saudara: "Sibling",
      "diri-sendiri": "Myself",
      almarhum: "Someone gone",
      "lain-lain": "Other",
    },
  };

  /* Suasana hati (PRD §9.2, atribut opsional). */
  var MOOD = {
    id: {
      rindu: "Rindu",
      syukur: "Syukur",
      sesal: "Sesal",
      marah: "Marah",
      tenang: "Tenang",
      haru: "Haru",
      bangga: "Bangga",
      kehilangan: "Kehilangan",
    },
    en: {
      rindu: "Longing",
      syukur: "Gratitude",
      sesal: "Regret",
      marah: "Anger",
      tenang: "Calm",
      haru: "Tender",
      bangga: "Proud",
      kehilangan: "Grief",
    },
  };

  var lang = "id";

  function table(l) {
    return T[l] || T.en;
  }
  function t(key) {
    var tb = table(lang);
    return tb[key] != null ? tb[key] : T.en[key] != null ? T.en[key] : key;
  }
  function kategori(id) {
    var m = KATEGORI[lang] || KATEGORI.en;
    return m[id] || KATEGORI.en[id] || id;
  }
  function mood(id) {
    var m = MOOD[lang] || MOOD.en;
    return m[id] || MOOD.en[id] || id;
  }
  function kategoriIds() {
    return Object.keys(KATEGORI.id);
  }
  function moodIds() {
    return Object.keys(MOOD.id);
  }

  /* Engine hanya mengenal 5 bahasa. 'id' adalah tambahan produk; sisanya → 'en'. */
  function setLang(next) {
    lang = next === "id" ? "id" : "en";
    return lang;
  }
  function getLang() {
    return lang;
  }
  function isId() {
    return lang === "id";
  }

  /* Tanggal ramah-baca mengikuti bahasa aktif. */
  function tanggal(ms) {
    if (!ms) return "";
    var d = new Date(ms);
    if (isNaN(d.getTime())) return "";
    var bulan = isId()
      ? [
          "Januari",
          "Februari",
          "Maret",
          "April",
          "Mei",
          "Juni",
          "Juli",
          "Agustus",
          "September",
          "Oktober",
          "November",
          "Desember",
        ]
      : [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ];
    return d.getDate() + " " + bulan[d.getMonth()] + " " + d.getFullYear();
  }

  /* Angka + satuan: 1 pesan / 3 pesan (tanpa pluralisasi rumit). */
  function jumlah(n, satuanKey) {
    return n + " " + t(satuanKey);
  }

  return {
    t: t,
    setLang: setLang,
    getLang: getLang,
    isId: isId,
    kategori: kategori,
    mood: mood,
    kategoriIds: kategoriIds,
    moodIds: moodIds,
    tanggal: tanggal,
    jumlah: jumlah,
    table: table,
  };
})();
