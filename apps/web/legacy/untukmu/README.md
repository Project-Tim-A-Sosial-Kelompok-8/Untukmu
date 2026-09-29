# Untukmu — antarmuka produk di atas Galaxy Explorer

Purwarupa **antarmuka** untuk PRD "Untukmu". Modelnya:

```
satu orang      = satu galaksi
pesanmu         = bintang kecil di piringan galaksi itu
pesan orang lain = partikel debu kecil di sabuk luar, masing-masing dengan doanya
mengirim        = benda terbang dari galaksi rumahmu, melintasi gelap, lalu tiba
```

Pesan dan doa sama-sama **partikel kecil**, dan **semuanya bisa diklik dan punya
isi** — tidak ada partikel buntu. Yang membedakan bukan ukurannya melainkan
tempat dan bahannya: piringan berisi yang kau tulis (bintang berkilau, berwarna
sesuai privasi), sabuk luar berisi pesan dari orang lain (debu bulat lembut) yang
masing-masing membawa satu doa.

Benda yang **kamu** kirim tetap berupa batu sungguhan saat menempuh perjalanan,
lalu larut menjadi bagian sabuk saat tiba. Berdoa untuk seseorang tidak menambah
butir baru di sabuk — yang bertambah adalah penghitung doa pada pesannya.

### Mengklik sebuah titik

Arahkan kursor ke salah satu bintang atau butir debu: kursor berubah menjadi
penunjuk, titiknya menyala, dan sebuah **cincin penanda** muncul di sekelilingnya.
Klik, dan kamera terbang ke titik itu lalu **mengikutinya** saat galaksi berputar.

Cincin itu ada karena titik di galaksi ini hanya beberapa piksel besarnya —
menerangkan warnanya saja tidak cukup untuk meyakinkan mata titik mana yang akan
terklik. Panduan angka pemilihannya (semuanya dalam piksel layar, di
`um-galaksi.js`):

| Angka | Arti |
|---|---|
| `JARI_KURSOR_PX = 10` | sejauh apa kursor masih dianggap menunjuk sebuah titik |
| `TOLERANSI_LAYAR = 0.75` | beda jarak-layar yang dianggap sama dekat; seri dimenangkan yang lebih dekat ke kamera |
| `PX_CINCIN = 46` | garis tengah cincin penanda terpilih |
| `JARAK_TIBA_REL = 0.7` | kamera berhenti pada 0.7 × radius galaksi |

Galaksi yang sedang dibingkai dihitung pada 3 × radius, jadi klik pada titik
mendekatkan kamera lebih dari empat kali lipat tanpa sampai membuat bintang
tetangganya melebar menjadi kabut.

### Penanda "ini doa"

Partikel doa **berwarna keemasan** (`#ffd9a0`, dicampur sedikit warna galaksinya).
Itu penandanya: bintang pesan berwarna menurut privasi, debu doa selalu keemasan.
Ditambah legenda di kartu galaksi. Pengujian memeriksa bahwa warna debu memang
condong keemasan dan **tidak** sama dengan warna bintang — supaya penanda ini
tidak bisa hilang tanpa ketahuan.

Sebarannya sengaja acak mengelilingi galaksi (bukan cincin rapi), makin renggang
makin jauh, dengan puntiran lembut sehingga ikut berputar seperti lengan spiral.

### Label data mockup: a, b, c, … z, aa, ab, …

Setiap butir sabuk adalah pesan sungguhan di basis data, bukan hiasan. Untuk
mockup, isinya dibangkitkan dengan penanda label seperti penomoran kolom lembar
kerja, plus satu dari 26 kalimat pendek:

```
"Pesan contoh (a) — Terima kasih untuk hal-hal kecil yang tidak sempat kusebut."
"Pesan contoh (z) — Terima kasih sudah pernah ada di hidupku."
"Pesan contoh (aa) — ...
```

Penanda itu sengaja ditaruh **di dalam teks** supaya jelas mana data mockup dan
mudah dihitung saat memeriksa.

| Galaksi | Butir sabuk |
|---|---|
| Ibu | 260 |
| Rani | 180 |
| Kakek | 420 |
| Diriku, lima tahun lagi | 120 |
| Mas Bayu | 200 |
| Bu Ratih | 230 |
| **Total** | **1.410** |

Ditambah 16 pesan milikmu dan 120 doa yang diterima pesan-pesanmu, seluruh data
contoh berisi ±2.950 catatan. Ditulis dalam **satu transaksi per penyimpanan**
(`putBanyak`), jadi pemuatan pertama tetap cepat.

**Galaksi yang baru kamu buat juga langsung diberi 160 doa contoh**
(`saveGalaksiBaru`), supaya sabuknya tidak kosong saat pertama dibuka. Ubah
angkanya di `DOA_AWAL` dan `DOA_AWAL_GALAKSI_BARU` (`um-store.js`).

Untuk menggantinya dengan data sungguhan: tulis pesan seperti biasa, atau ubah
kedua tempat itu. Tidak ada kode lain yang perlu disentuh — pelapisan sabuk
membaca penanda `sabuk: true` pada pesan, dan pelapisan piringan membaca
`sendiri: true` atau `piringan: true`.

Bimasakti adalah **galaksi rumah** dan sekaligus pemandangan pembuka. Tidak ada
login: begitu aplikasi dibuka, pengguna dianggap sudah masuk sebagai anonim.

Cakupan saat ini **sengaja hanya frontend**. Tidak ada server, tidak ada akun
jaringan, tidak ada basis data pusat — semuanya berjalan di peramban pengguna,
dengan data contoh (mockup) supaya setiap galaksi langsung punya bintang dan
batu yang mengorbit.

---

## Menjalankan

Wajib lewat server lokal. Membuka `index.html` langsung dengan `file://` akan
mematikan Web Crypto (butuh konteks aman), sehingga enkripsi tidak bisa dipakai.

```sh
# dari folder galaxi-explorer-main
python -m http.server 8000
#   atau:  npx serve .
#   atau:  dev.bat  (Windows)  /  dev.command  (macOS)

# buka http://localhost:8000/
```

| URL / tombol | Kegunaan |
|---|---|
| `/` | Aplikasi normal |
| `/?umTest=1` | Pengujian mandiri di dalam peramban |
| `/?fx=1` | Memaksa efek langit agar demo selalu hidup |
| `/?video=1` | Rekaman deterministik untuk bahan presentasi |
| `F` | Mode sinema — seluruh antarmuka disembunyikan |

**Cara mencoba alur utamanya:** *Mulai Menulis* → pilih atau buat galaksi orang
→ tulis pesan → pilih privasi → simpan. Kamera akan mundur, benda terbang
melintasi gelap ke galaksi itu, dan saat tiba intinya menyala. Untuk membaca isi:
**scroll mendekat, lalu klik satu bintang atau satu batu.**

---

## Peta berkas

Engine Galaxy Explorer **tidak diubah**, kecuali lima sisipan kecil di
`index.html` (lihat di bawah). Semua kode produk ada di `untukmu/`.

```
index.html                     ← engine + 5 sisipan kecil
untukmu/
  untukmu.css                  ← seluruh gaya produk (memakai token warna engine)
  js/
    um-i18n.js                 ← tabel bahasa id/en + kategori & suasana hati
    um-doa.js                  ← data doa 7 tradisi (KERANGKA KURASI — baca di bawah)
    um-crypto.js               ← enkripsi sisi klien (AES-256-GCM)
    um-store.js                ← penyimpanan lokal (IndexedDB) + data contoh
    um-galaksi.js              ← ladang galaksi: bintang, batu, kamera, perjalanan
    um-sky.js                  ← Peta: kubah langit sebagai layar navigasi
    um-ui.js                   ← semua layar dan kartu
    um-tests.js                ← pengujian mandiri di peramban
    um-app.js                  ← bootstrap & kaitan ke engine
  dev/
    verify-node.cjs            ← pengujian sisi Node (tanpa peramban)
```

### Lima sisipan di `index.html`

| Sisipan | Alasan |
|---|---|
| `<link>` ke `untukmu/untukmu.css` | Gaya produk dimuat setelah gaya engine |
| `<option value="id">` di `#lang` | Bahasa Indonesia sebagai bahasa produk |
| `'id'` di whitelist `beaconLang` | Agar pilihan bahasa bertahan setelah muat ulang |
| Delapan `<script>` produk di akhir `<body>` | Dimuat setelah engine, jadi semua globalnya tersedia |
| **`window.GX = { buildGalaxyStars, galaxyLODs }`** di akhir IIFE `galaxies()` | Satu-satunya cara memakai generator galaksi engine dari luar |
| **`GX.deepSky` dan `GX.deepCluster`** di dalam IIFE `deepField()` | Mesh langit galaksi jauh ditambahkan ke `scene` tanpa menyimpan referensi, jadi perlu ditangkap agar bisa dimatikan |

Hook `GX` itu penting: `buildGalaxyStars` berada di dalam closure, jadi tanpa
hook ia tidak bisa dipanggil dari `untukmu/`. Berkat hook ini, galaksi setiap
orang dibuat oleh **generator yang sama** dengan Milky Way dan galaksi jauh di
engine — spiral / elips / tak beraturan, lengkap dengan inti, halo dan veil —
tanpa menyalin satu baris pun shader galaksi.

---

## Dua temuan teknis yang wajib diketahui

### 1. Kabut adegan tidak memengaruhi partikel, tapi memengaruhi sprite

Diukur dengan `THREE.FogExp2(0x03040a, 0.0012)` milik engine:

| Jarak dari pusat | Sisa yang terlihat |
|---|---|
| 400 | 79% |
| 700 | 49% |
| 900 | **31%** |
| 1200 | 13% |
| 2000 | 0,3% |

- `ShaderMaterial.fog = false` → **partikel galaksi kebal kabut**, tetap utuh di jarak berapa pun.
- `SpriteMaterial.fog = true` → **inti, halo, dan veil berkabut.** Pada radius 900, inti galaksi tinggal 31%.

Karena itu `um-galaksi.js` membebaskan **hanya sprite** galaksi orang dari kabut
(termasuk `material.needsUpdate = true`, karena define kabut sudah ter-bake di
program shader). Kabutnya sendiri dibiarkan — justru itulah "gelap" yang
dilintasi batu saat dikirim.

### 2. Adegan galaksi tidak punya sumber cahaya sama sekali

Lampu engine hanya dipasang di adegan tata surya (`solarRoot`). Jadi
`MeshLambertMaterial` atau `MeshStandardMaterial` di adegan galaksi akan tampil
**hitam pekat**. Semua objek produk di ladang galaksi karena itu memakai
material **tanpa cahaya**: `MeshBasicMaterial` dengan variasi warna
per-instance (`InstancedMesh.setColorAt`) untuk batu, dan sprite additive untuk
pesan serta kilatan.

---

## Galaksi bawaan engine

Engine membawa galaksi bawaannya sendiri:

- **satu batch langit jauh** — puluhan galaksi kecil (satu draw call), plus satu sprite glow kluster;
- **tujuh galaksi luar bernama** — M31, M33, M104, M87, NGC 5128, LMC, SMC — masing-masing galaksi partikel penuh, dengan kartu berbahasa lima dan beacon sendiri, ditambah fitur di dalamnya (daerah pembentukan bintang, gugus bola, jet).

Di produk ini **semuanya dimatikan secara baku**, karena sekarang setiap galaksi
berarti satu orang; galaksi bawaan hanya mengaburkan makna itu.

Kodenya tidak dihapus — ia tetap ada dan bisa dinyalakan kembali **sebagai
template**:

- **Pengaturan → Galaksi bawaan → Tampilkan**, atau
- buka dengan **`?galaksiBawaan=1`** (parameter URL menang, jadi bisa dipakai tanpa mengubah apa pun).

Penyembunyiannya menangani tiga hal sekaligus: objek 3D-nya, halo/intinya
(sprite yang diletakkan tepat di pusat galaksi), dan label beacon-nya. Label
terakhir itu perlu penanganan khusus: `updateBeacons` milik engine menulis
`style.display` setiap frame, jadi produk menyembunyikannya **setelah** fungsi
yang dibungkus berjalan, dan mereset cache `shown` supaya saat dinyalakan lagi
engine menghitung ulang tampil/sembunyinya dengan benar.

Penyaringnya memakai penanda `.cat` yang hanya dimiliki galaksi bawaan, jadi
**galaksi orang tidak mungkin ikut tersembunyi**. Ini diperiksa oleh pengujian.

---

## Kaitan per frame

Di mode langit kita menumpang `updateSkyLabels()`. Di mode galaksi, padanannya
adalah **`updateBeacons()`** — dipanggil engine setiap frame setelah render, dan
bertipe fungsi global yang bisa dibungkus. `um-galaksi.js` membungkusnya untuk
menggerakkan: rotasi sabuk batu, kedipan bintang pesan, animasi perjalanan,
kilatan, proyeksi label, **orbit setiap partikel galaksi**, dan **putaran + pendar
kawanan**.

Orbitnya dipisahkan dari rotasi piringan Milky Way hanya karena satu alasan:
sebuah `Group` yang **diputar** akan membawa piringan tiap galaksi orang ikut
berputar, sehingga galaksi yang tadinya menghadap kamera perlahan menjadi
tepi-tipis. Grup pemindahnya karena itu **hanya dipindahkan**, dan `L.center` milik
engine ikut diperbarui — engine membacanya untuk menentukan LOD (berapa titik yang
digambar dan seberapa besar).

Seluruh kemajuan perjalanan dihitung di tick ini, **bukan `setTimeout`** — kalau
tab tidak aktif, jam animasi ikut berhenti dan tidak ada kedatangan yang
tertinggal.

Kaitan lain yang dipakai: `flyTo` / `flyHome` / `showReturnBtn` (kamera; `stepFly`
sudah dipanggil engine otomatis), `makeAsteroidGeometries` (bentuk batu),
`METEOR_TEX` (jejak terbang), `GLOW_TEX` (kilatan), `mulberry32` (posisi
deterministik).

---

## Memilih titik: kenapa bukan hasil pertama raycast

Ini jebakan yang paling mudah terulang, dan sudah pernah terjadi: pengguna
mengklik satu titik, lalu kamera terbang ke titik yang lain.

Penyebabnya bukan ambang jarak, melainkan **urutan** hasil raycast. `Points.raycast`
di three.js mengembalikan hasil terurut menurut `distance` = jarak titik potong ke
kamera; `intersectObject` menyortir ulang dengan urutan yang sama. Ambangnya
sendiri adalah jarak **dunia tegak lurus** ke berkas sinar, bukan jarak di layar —
jadi titik yang lebih dekat ke kamera punya toleransi piksel yang jauh lebih
besar. Di piringan galaksi yang miring dan berlapis-lapis, `hits[0]` bisa berada
puluhan piksel dari tempat kursor berada. Dulu itu yang membuat "yang menyala di
hover" dan "yang diterbang" bukan titik yang sama.

Karena itu `pilihDi()` di `um-galaksi.js`:

1. memakai raycaster hanya untuk **menyaring kandidat**, dengan ambang longgar
yang dihitung pada jarak sisi terjauh galaksi (pusat + 3 × radius, cukup untuk
sabuk doa paling luar) — pada titik yang lebih jauh satu piksel layar berarti
perpindahan dunia yang lebih besar, jadi angka dari jarak terjauh selalu cukup;
2. memilih kandidat dengan **jarak terkecil ke kursor di layar** (proyeksi NDC →
piksel), bukan yang terdepan;
3. hanya menerima yang jaraknya ≤ `JARI_KURSOR_PX`; seri di bawah 0.75 px
dimenangkan yang lebih dekat ke kamera (itu yang tampak "di depan").

Setelah mendarat, `luruskanIkut()` menggeser kamera **dan** `controls.target`
sebesar pergeseran titik selama penerbangan (galaksinya berputar 0.02 rad/s), jadi
titik yang dipilih benar-benar berhenti di tengah layar — bukan meleset di
pinggirnya.

Titik yang sedang dipilih disimpan di `state.pilihan` dan cincinnya dipasang
ulang tiap `refresh()`, karena sabuk doa dibangun ulang saat data berubah (mis.
sesudah mengirim doa) dan cincin yang menempel pada objek lama akan ikut terbuang.

`pilihSpek()` (tingkat kawanan) memakai aturan yang sama, dengan dua tambahan:
raycast berlaku atas awan 60.000 partikel, dan galaksi milikmu sendiri diberi
keunggulan dua piksel — ia lebih terang, punya label, dan biasanya itu yang dicari.

---

## Animasi "terkirim"

Tiga babak, dirantai dengan `flyTo(..., onDone)`:

1. **Mundur** — kamera menjauh sampai tepi piringan dan arah tujuan masuk bingkai.
2. **Menyeberang** — benda menempuh kurva bezier kuadratik dari **tepi piringan
   Bimasakti** (radius 360) masuk ke dalam, menuju partikel orang yang dituju.
   Kamera sengaja **tidak bergerak** supaya mata mengikuti bendanya. Durasi
   berskala jarak: 2,6–5,2 detik.
3. **Menyusul** — kamera mulai bergerak 2,2 detik sebelum tiba, mendarat
   bersamaan, dan sejak itu **mengikuti** partikel galaksinya (kamera akan
   ditinggal kalau tidak — partikelnya mengorbit Sagittarius A*).

Bendanya: **batu** untuk doa (`makeAsteroidGeometries`, berputar), **mote cahaya**
untuk pesan. Jejaknya bidang datar memanjang searah gerak, selalu menghadap
kamera, memakai `METEOR_TEX`.

Ukuran benda **dan** jejaknya mengikuti jarak yang ditempuh (`skala` pada catatan
perjalanan), bukan angka tetap. Angka tetapnya dulu dirancang untuk perjalanan
sejauh ~1000 satuan; sejak galaksi orang pindah ke dalam piringan, jaraknya bisa
seperempatnya — dan batu sebesar itu akan tampak seperti bulan yang menabrak
galaksinya sendiri.

---

## Model enkripsi — dan satu janji yang sengaja tidak dibuat

PRD meminta enkripsi sisi klien, **sekaligus** meminta pesan publik bisa dibaca
siapa pun di halaman jelajah. Keduanya tidak bisa benar bersamaan. Dua tingkat,
dinyatakan apa adanya:

| Privasi | Kunci | Siapa yang bisa membaca | Moderasi |
|---|---|---|---|
| **Privat** | Master Key turunan kata sandi pengguna | Hanya pengguna | Dikecualikan (sesuai PRD §9.8) |
| **Publik anonim** | Kunci bersama yang juga dipegang sistem | Semua orang | Wajib |
| **Tidak terdaftar** | Sama seperti publik | Siapa pun yang punya tautan | Wajib |

**Jangan** mengklaim semua pesan end-to-end di dokumen atau presentasi.

Bintang privat yang belum bisa dibuka **tetap tampil di galaksi** — yang
tersembunyi hanya isinya, bukan keberadaan kenangannya.

### KDF: belum Argon2id

Argon2id **tidak ada** di Web Crypto API; ia butuh pustaka WASM yang harus
di-vendor lokal. Sementara ini: **PBKDF2-HMAC-SHA256, 600.000 iterasi** — nol
dependensi, tetap jalan offline. Menukarnya nanti tidak perlu menyentuh sisa
aplikasi:

```js
UM.crypto.setKdf(fn, 'Argon2id', 3);
// fn(password, saltBuffer, iterations) -> Promise<ArrayBuffer>
```

```
kata sandi ──KDF──> KEK (kunci pembungkus)
                      │
   Master Key acak ───┴──> dibungkus KEK           → untuk pesan privat
                      └──> dibungkus kode pemulihan

tiap pesan: Master Key + IV acak 96-bit → AES-256-GCM
```

Master Key hanya ada di memori dan hilang saat halaman ditutup.

---

## Pengujian

**Di Node** (cepat, tanpa peramban):

```sh
cd untukmu/dev && node verify-node.cjs
```

66 pemeriksaan: sintaks semua berkas, keseimbangan tabel bahasa, **setiap kunci
bahasa yang benar-benar dipakai kode**, kelengkapan data doa, jalur enkripsi
dengan Web Crypto sungguhan, lapisan data di atas stub IndexedDB, **koherensi
angka doa di tiga tempat**, **tidak adanya butir sabuk yang buntu**, **sabuk tiap
galaksi memang berisi banyak butir**, **galaksi baru langsung dapat doa contoh**,
**gerbang publikasi menolak tanpa membuat data apa pun**, **partikel nomor i
benar-benar galaksi `g_asing_i`**, dan fungsi murni ladang galaksi (posisi orbit,
kurva jalur, warna, `perPiksel`, aturan pemilihan titik, jarak tiba, skala titik).

Pemeriksaan "setiap kunci yang dipakai ada di tabel" adalah yang paling sering
menyelamatkan — ia menangkap salah ketik nama kunci tanpa membuka peramban.
Catatan: kunci yang dipakai lewat variabel (mis. `T(b.kunci)`) **tidak**
terdeteksi, jadi periksa manual bila menambah pola seperti itu.

**Di peramban:** `?umTest=1` (memeriksa hal-hal yang butuh adegan 3D sungguhan:
bintang dan debu benar-benar menempel pada galaksinya, **yang terpilih benar-benar
titik/partikel di bawah kursor** — hasil `pilihDi` dan `pilihSpek` dibandingkan
dengan hitung paksa jarak-layar terkecil — kawanan benar-benar terbangun, dan
**gerbang publikasi menolak tanpa membuat data**).

> Pengujian mengunci kunci enkripsimu di akhir. Buka lagi lewat menu **Kunci**.

---

## Data doa: kerangka kurasi, bukan konten jadi

PRD §9.5 dan §15 melarang isi doa disusun otomatis dan mewajibkan kurasi
manusia. Karena itu `um-doa.js` **hanya** memuat kutipan kitab yang dapat
diverifikasi (dengan medan `sumber`) plus kerangka kosong (`teks: null`).

Setiap entri wajib ditinjau perwakilan tradisi terkait, lalu `reviewed` diubah
ke `true`. Selama `false`, antarmuka menandainya **"Belum dikurasi"**.

```sh
grep -c "reviewed: false" untukmu/js/um-doa.js
```

**Audio doa** belum ada yang berlisensi. Antarmuka sudah siap: isi medan `audio`
dengan nama berkas di `untukmu/audio/`. Selama kosong, alurnya memakai hitungan
hening sepanjang medan `detik`. Jangan meng-commit audio yang haknya tidak
kalian miliki.

---

## Yang belum ada (dan di mana menambahkannya)

Semua akses data melewati `um-store.js`. Mengganti ke REST API FastAPI dari PRD
cukup dilakukan di berkas itu; UI tidak perlu diubah.

| Belum ada | Catatan |
|---|---|
| Backend, akun, JWT | Ganti isi `um-store.js`; tanda tangan fungsinya sudah berpromise |
| Pesan dari orang lain sungguhan | 1.410 butir sabuk sekarang data mockup berlabel a..z |
| Galaksi orang lain sungguhan | 60.000 partikel kawanan adalah mockup ber-seed. Nama samaran (`#7F4K`), jumlah pesan, dan status publikasi semuanya turunan nomor partikel — tidak ada satu pun yang disimpan sampai partikelnya dibuka |
| Gerbang publikasi di sisi server | Sekarang gerbangnya ada di `um-store.js`. Kalau data orang lain datang dari API, gerbang ini **wajib** pindah ke server: di sisi klien ia hanya bisa menolak membaca, bukan menyembunyikan apa yang sudah terunduh |
| Moderasi & pelaporan sungguhan | Pelaporan menaikkan `dilaporkan` lokal dan menyembunyikan pesan dari jelajah |
| Unggah foto ke penyimpanan objek | Foto dikecilkan ke 320 px dan disimpan di perangkat |
| Pencarian, kapsul waktu, enkripsi lampiran | Fase 4–5 PRD |
| LOD bertahap untuk galaksi | Galaksimu dibangun penuh saat muat; galaksi orang lain dibangun saat pertama dimasuki |

---

## Catatan istilah

Engine memakai kata **"constellation"** untuk rasi **astronomi** (`SKY_CONS`,
`SKY_GAL`, `renderConstellationPanel`). Produk memakai kata **"galaksi"** untuk
**orang**, dan **"partikel"** untuk rupa galaksi itu di dalam piringan Bimasakti.
Ketiganya sengaja tidak dicampur — kalau dicampur, kode akan sulit diikuti dan
merge conflict antar anggota tim jadi mimpi buruk.

Langit punya pengalih mode: **Astronomi** ↔ **Kenangan**. Dalam mode Kenangan,
rasi astronomi disembunyikan dan setiap galaksi orang tampil sebagai penanda
berlabel; mengkliknya menutup Peta dan menerbangkan kamera ke galaksi itu.

---

## Lisensi dan atribusi

Engine Galaxy Explorer berlisensi **PolyForm Noncommercial 1.0.0** — bebas untuk
studi, pengajaran, dan penelitian; **penggunaan komersial butuh lisensi
terpisah**. Aman untuk tugas kelas. Pertahankan `THIRD-PARTY-NOTICES.md` dan
atribusi foto NASA bila proyek ini dibagikan.
