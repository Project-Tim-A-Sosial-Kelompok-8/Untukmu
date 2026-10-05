# Untukmu

Untukmu adalah aplikasi untuk menyimpan pesan, kenangan, dan doa bagi seseorang. Setiap tujuan memiliki galaksi sendiri. Kamu juga bisa membaca ucapan publik dan memberi dukungan lewat doa.

## Menjalankan aplikasi

Pasang **Docker Desktop dengan Compose v2** dan **Python 3.12**. Buka terminal di folder utama proyek, lalu jalankan:

```sh
python scripts/init_env.py
docker compose up -d --build
```

Perintah pertama membuat `.env` dengan konfigurasi lokal. Jika `.env` sudah ada, lewati generator dan gunakan konfigurasi tersebut. Perintah kedua menyiapkan database, penyimpanan berkas, API, dan website. Tunggu layanan selesai menyala, lalu buka **http://localhost:3000**.

| Yang ingin dibuka | Alamat lokal |
| --- | --- |
| Aplikasi utama | http://localhost:3000 |
| Fitur Doa | http://localhost:3000/doa |
| Panel admin | http://localhost:3000/admin |
| Dokumentasi API | http://localhost:3000/docs |
| Pemeriksaan layanan API | http://localhost:3000/api/v1/health |
| Penyimpanan berkas MinIO | http://localhost:9001 |

Untuk menghentikan aplikasi, jalankan `docker compose down`. Data tetap tersimpan selama volume tidak dihapus. Konfigurasi dan kredensial lokal ada di `.env`; berkas ini tidak masuk Git.

## Cara memakai aplikasi

Pada tampilan galaksi, menu utama berada di **bagian bawah layar**. Tombol **Tulis** dan **Doa** berdampingan di sana.

| Menu | Kegunaan dan cara pakai |
| --- | --- |
| **Tulis** | Masuk atau daftar, pilih tujuan lama atau **+ Kenangan baru**, tulis pesan, pilih privasi, lalu simpan. Satu pesan bisa memiliki maksimal sepuluh tujuan. |
| **Doa** | Menulis doa untuk seseorang atau mendoakan ucapan publik melalui audio yang tersedia maupun hening. Langkahnya dijelaskan di bawah. |
| **Home / Rumah** | Mengembalikan tampilan ke galaksi utama, Milky Way. Galaksi yang kamu buat tetap tersimpan. |
| **Peta** | **Kenangan** menampilkan bintang galaksi milikmu; klik untuk menuju galaksinya. **Konstelasi** menampilkan rasi bintang; klik bintang atau garis rasi untuk membaca informasinya. Geser layar untuk melihat bagian langit lain. Nama pribadi tidak ditampilkan mengambang di Peta. |
| **Jelajah** | Membaca ucapan publik yang sudah disetujui admin, memberi empati, atau memilih ucapan untuk didoakan. |
| **Ruang Pribadi** | Melihat galaksi, daftar Pesan, Doa tertulis, dan riwayat doa. Gunakan **Kelola pesan / Kelola doa** untuk mengedit atau menghapus tulisan. |
| **Kunci** | Membuka kembali tulisan privat setelah halaman dimuat ulang. |
| **Pengaturan** | Mengatur akun, sesi aktif, pemulihan, pemblokiran, dan ekspor data. |

Saat mendaftar, gunakan kata sandi minimal **12 karakter** dan simpan kode pemulihan yang ditampilkan. Tulisan privat dienkripsi pada perangkat sebelum dikirim. Tulisan publik anonim dan tautan terbatas menunggu persetujuan admin; foto serta lampiran tetap privat untuk pemilik.

### Menulis doa untuk seseorang

1. Buka **Doa → Tulis doa untuk seseorang**, lalu masuk ke akun.
2. Pilih galaksi milikmu atau **+ Galaksi baru untuk seseorang**. Jika membuat galaksi, isi nama, hubungan/kategori, bentuk, warna, dan ukuran.
3. Pilih agama atau tradisi, tulis doa, lalu tentukan privasinya.
4. Tekan **Simpan doa**. Tulisan masuk ke bagian **Doa tertulis** di Ruang Pribadi dan galaksi tujuan.

**Satu doa tertulis menambah Doa satu; satu pesan menambah Pesan satu.** Tag `doa` pada pesan biasa tidak mengubah jenisnya. Label galaksi menjumlahkan doa tertulis dan sesi doa yang diterima; kartu galaksi menampilkan keduanya secara terpisah. Mengedit tidak menambah hitungan, sedangkan menghapus mengurangi jenis tulisan yang dihapus.

Doa ini disimpan dalam galaksimu, bukan dikirim langsung ke akun orang lain. Jika diminta membuka kunci, masukkan kata sandi lalu kembali ke formulir. Draf tetap ada selama halaman yang sama masih terbuka; memuat ulang halaman menghapus draf yang belum disimpan.

### Mendoakan ucapan publik

1. Buka **Doa**, atau pilih **Doakan ucapan ini** pada Jelajah.
2. Pilih ucapan publik dan tradisi: Islam, Kristen, Katolik, Hindu, Buddha, Konghucu, atau Umum.
3. Pilih jenis doa. Baca keterangan sumber dan ketersediaannya.
4. Putar audio yang sudah disetujui kurator hingga selesai, atau pilih **Umum → Hening sejenak** selama 30 detik.

Sesi yang selesai dicatat sebagai doa untuk ucapan tersebut. Menutup atau membatalkan sesi tidak menambah hitungan. Mengulang pencatatan tidak menggandakan jumlah pendoa yang sama pada ucapan yang sama.

**Audio untuk semua agama belum lengkap.** Tiga rekaman tersedia untuk ditinjau admin dan belum disetujui otomatis. Pilihan yang belum siap diberi keterangan; hening umum dapat digunakan langsung. Lihat [sumber dan status audio doa](docs/konten-doa/SUMBER.md).

### Filter dan halaman Jelajah

Pilih suasana atau tag, lalu tekan **Terapkan filter**. **Hapus filter** menampilkan hasil tanpa filter. **Terbaru** mengurutkan berdasarkan waktu pembuatan; **Paling didoakan** mengurutkan berdasarkan jumlah pendoa.

Satu halaman memuat maksimal **30 ucapan**. **Sebelumnya** aktif setelah halaman pertama. **Berikutnya** aktif jika masih ada hasil berikutnya. Tombol juga menunggu saat data sedang dimuat; jika gagal, gunakan **Coba lagi**. Bila tidak ada hasil, hapus filter atau tunggu ucapan publik disetujui admin.

## Akun admin

Tidak ada email atau kata sandi admin bawaan. Daftarkan akun melalui aplikasi terlebih dahulu, lalu jalankan perintah ini dari folder utama proyek:

```sh
docker compose exec api python -m scripts.make_admin emailanda@example.com
```

Ganti email contoh dengan email akun yang sudah terdaftar. Masuk ulang, lalu buka **http://localhost:3000/admin** atau **Pengaturan → Akun dan keamanan → Panel moderasi**.

Admin dapat meninjau tulisan publik/tautan terbatas dan mengelola katalog serta audio doa. Tulisan privat tidak bisa dibaca admin. **Daftar seluruh akun terdaftar belum tersedia di panel admin**; data akun disimpan pada tabel `users` di database.

Cara meninjau dan mengaktifkan audio ada di [panduan sumber doa](docs/konten-doa/SUMBER.md).

## Memakai perubahan terbaru

Setelah kode diperbarui, bangun ulang layanan:

```sh
docker compose up -d --build
```

Kemudian muat ulang browser. Jika masih menampilkan versi lama, tutup tab lalu buka kembali. Untuk melihat layanan yang bermasalah, jalankan `docker compose logs api worker migrate init-storage web`.

Jika menjalankan frontend tanpa Docker, hentikan proses lama, jalankan `npm run build`, lalu `npm run start --workspace apps/web`. Panduan lengkapnya ada di [pengembangan lokal](docs/panduan/PENGEMBANGAN.md).

## Susunan folder

| Folder | Isi |
| --- | --- |
| `apps/web/src` | Halaman, komponen, akun, pesan, doa, dan koneksi frontend ke API. |
| `apps/web/legacy` | Sumber tampilan galaksi, peta, tata surya, CSS, dan aset gambar. |
| `apps/web/scripts` | Proses yang menggabungkan sumber tampilan dengan aplikasi React. |
| `apps/api` | API, data katalog doa, migrasi database, dan tes backend. |
| `infra` | Konfigurasi akses website melalui Caddy. |
| `scripts` | Perintah untuk konfigurasi, pengujian, dan pembuatan paket. |
| `docs/panduan` | Cara mengembangkan, mengonfigurasi, dan memahami alur sistem. |
| `docs/ui-ux/mobile` | Panduan serta gambar antarmuka ponsel. |
| `docs/ui-ux/desktop` | Panduan serta gambar antarmuka laptop/desktop. |
| `docs/pengujian` | Ringkasan pemeriksaan dan laporan hasil tes. |
| `docs/api` | Salinan skema API dan SQL migrasi untuk referensi. |
| `docs/konten-doa`, `docs/lisensi`, `docs/referensi` | Sumber doa, catatan lisensi, dan PRD. |

Mulai dari [panduan UI/UX](docs/ui-ux/README.md) atau buka [galeri tampilan mobile dan desktop](docs/ui-ux/index.html). Berkas `apps/web/public/engine` adalah hasil otomatis; edit sumbernya, bukan berkas hasil tersebut. Folder `.next`, `node_modules`, `.venv`, dan `test-results` berisi hasil build, dependensi, atau data uji lokal.

UI/UX lengkap tersedia untuk [mobile](docs/ui-ux/mobile/index.html) dan [desktop](docs/ui-ux/desktop/index.html), termasuk seluruh formulir, panel, keadaan penting, alur penggunaan, serta [komponen dan warna aplikasi](docs/ui-ux/sistem-desain.html). Jalankan `npm run ui-ux:export` untuk memperbarui semuanya dari build web terbaru dengan akun contoh.

## Memeriksa aplikasi

Setelah dependensi frontend dan backend tersedia:

```sh
npx playwright install chromium
npm run check:buttons
```

Perintah ini membuat build terbaru dan memeriksa tombol melalui browser dengan database uji sementara. Gunakan `npm run check:buttons:repeat` untuk mengulang skenario dua kali. Cara menjalankan tes lain dan batas hasilnya dijelaskan dalam [panduan pengujian](docs/pengujian/README.md).

PRD tersimpan di [docs/referensi/PRD_Kelompok_8.docx](docs/referensi/PRD_Kelompok_8.docx). Atribusi aset tetap ada di [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) dan [catatan lisensi](docs/lisensi/CATATAN.md).
