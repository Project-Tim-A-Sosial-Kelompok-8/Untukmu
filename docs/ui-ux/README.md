# Panduan UI/UX

Folder ini berisi UI/UX lengkap dari web Untukmu yang sebenarnya: 71 layar dan keadaan pada masing-masing perangkat, dengan total 240 gambar. Buka [galeri lengkap](index.html), [versi mobile](mobile/index.html), atau [versi desktop](desktop/index.html) langsung di browser. Galeri bisa dibuka tanpa server dan menyediakan pencarian layar, filter fitur, perpindahan layar, serta seluruh bagian formulir panjang.

Setiap layar disertai cara membukanya, tindakan pengguna, dan hasil yang terlihat. Cakupan meliputi halaman awal, masuk/daftar/pemulihan, empat langkah Tulis, semua privasi, doa tertulis, tujuh tradisi, sesi hening, pemutar audio, Jelajah/filter/pagination, laporan/blokir, Ruang Pribadi, kelola tulisan/tautan, kunci/ekspor/sesi, galaksi, Peta, tata surya, moderasi/kurasi admin, tautan publik, kebijakan privasi, luring, dan 404.

Gambar berasal dari build web yang sama, menggunakan akun dan data contoh pada API sementara. Contoh pemutar audio menggunakan media uji yang diberi keterangan; audio agama yang belum dikurasi tetap ditampilkan sebagai belum tersedia. Panel panjang direkam per bagian dengan viewport asli. Daftar ucapan yang berulang menampilkan awal, bagian berikutnya, dan akhir, bukan setiap baris data contoh.

| Folder | Isi |
| --- | --- |
| [mobile](mobile/README.md) | Galeri dan semua layar/keadaan pada 390 × 844 px. |
| [desktop](desktop/README.md) | Galeri dan semua layar/keadaan pada 1366 × 844 px. |
| `mobile/layar`, `desktop/layar` | Gambar dikelompokkan menurut fitur: akun, Tulis, Doa, Jelajah, galaksi/Peta, pengaturan, admin, dan halaman pendukung. |
| [sistem-desain.html](sistem-desain.html) | Warna, token, tombol, chip, input, select, textarea, status, dan aturan responsif dari CSS aplikasi. |
| [cakupan.json](cakupan.json) | Daftar layar, alur, ukuran gambar, waktu ekspor, dan checksum sumber/gambar. |

Folder `assets` menyimpan salinan CSS asli untuk katalog komponen. `galeri-data.js`, `galeri.js`, dan `galeri.css` membuat galeri dapat dibuka langsung dari berkas lokal. Gambar `entry-asli.png` serta gambar ringkas dari pemeriksaan sebelumnya tetap menjadi referensi pembandingan; galeri lengkap memakai gambar terbaru di `layar`.

Gambar menampilkan antarmuka yang sudah ada, bukan rancangan pengganti. Galaksi bersifat dinamis; ekspor tidak menyatakan bahwa semua perangkat fisik telah diperiksa.

## Alur yang berlaku pada kedua perangkat

| Tujuan pengguna | Urutan tindakan | Hasil yang harus jelas |
| --- | --- | --- |
| Menyimpan pesan | Tulis → masuk → pilih/buat tujuan → isi pesan → privasi → simpan | Tulisan berada di galaksi tujuan dan bagian Pesan; penghitung Pesan bertambah. |
| Menyimpan doa tertulis | Doa → Tulis doa untuk seseorang → pilih/buat galaksi → tradisi, isi, privasi → simpan | Tulisan berada di bagian Doa tertulis; Pesan tidak bertambah. |
| Mendoakan ucapan | Doa/Jelajah → pilih ucapan publik → tradisi/jenis doa → audio atau hening → selesai | Hitungan diperbarui hanya setelah sesi selesai. Sumber dan kesiapan audio terlihat sebelum mulai. |
| Melihat kenangan | Peta → Kenangan → klik bintang berwarna | Kamera bergerak ke galaksi milik pengguna. Menggeser langit tidak memilih bintang. |
| Mengenali rasi | Peta → Konstelasi → klik bintang/garis rasi | Kartu menampilkan nama, informasi, dan ilustrasi rasi. |
| Mencari ucapan publik | Jelajah → suasana/tag → Terapkan filter → urutan → halaman | Filter aktif, rentang hasil, dan alasan tombol halaman nonaktif terlihat. |
| Mengelola tulisan | Ruang Pribadi → Kelola pesan/Kelola doa | Edit mempertahankan jenis tulisan; hapus mengurangi jenis yang benar. |
| Membuka kembali tulisan privat | Kunci → masukkan kata sandi → kembali ke tulisan | Isi muncul setelah kunci berhasil dibuka; kata sandi salah bisa diperbaiki. |
| Mendaftar atau masuk | Tulis/Ruang Pribadi → Buat akun/Masuk | Formulir menampilkan validasi, proses, dan hasil; pendaftaran menampilkan kode pemulihan. |
| Memulihkan akun | Layar akun → pemulihan → kode pemulihan dan kata sandi baru | Kunci tulisan lama tetap dapat dipulihkan dan sesi lama dicabut. |
| Mengelola sesi | Pengaturan → Akun dan keamanan → sesi aktif | Pengguna dapat melihat dan mencabut sesi miliknya. |
| Mengekspor data | Pengaturan → ekspor → kata sandi ekspor | Paket terenkripsi dapat diunduh dan diperiksa kembali. |
| Melaporkan atau memblokir | Ucapan publik → Laporkan/Blokir → konfirmasi | Laporan masuk antrean admin; pemblokiran bisa dibatalkan di pengaturan. |
| Membuka tautan terbatas | Buka tautan yang dibuat pemilik | Token dan persetujuan diperlukan; konten yang tidak tersedia diberi penjelasan. |
| Meninjau sebagai admin | Panel moderasi → konten atau Kurasi doa dan audio | Tindakan dibatasi akun admin; rekaman pratinjau tidak mencatat doa. |
| Menjelajahi tata surya | Pilih tujuan astronomi → objek tata surya → kartu informasi | Informasi objek terlihat tanpa label nama kenangan. Home kembali ke Milky Way. |
| Membaca kebijakan privasi | Tautan privasi pada halaman pembuka | Kebijakan dapat dibaca sebagai halaman tersendiri. |

## Aturan tampilan dan interaksi

Menu utama berada di bawah, dengan Tulis lalu Doa. Home/Rumah menuju Milky Way. Peta tetap menampilkan bintang dan rasi, tetapi menyembunyikan label nama pribadi yang mengambang. Tata surya juga menyembunyikan label kenangan. Nama rasi ditampilkan pada kartu setelah dipilih.

Setiap dialog memiliki tutup atau batal. Saat menyimpan atau menghapus, kontrol menunggu hingga proses selesai. Kegagalan menampilkan pesan dan tindakan untuk mencoba lagi. Keberhasilan penyimpanan tidak meminta pengguna mengirim ulang tulisan hanya karena pembaruan tampilan gagal.

Teks panjang membungkus dalam panel. Kartu informasi berada di atas menu bawah dan tidak menutupi pemilih Peta. Fokus keyboard terlihat, dialog mengelola fokus, dan mode pengurangan gerakan mengikuti pengaturan pengguna.

Kode responsif digunakan bersama: [CSS engine](../../apps/web/legacy/untukmu/untukmu.css) dan [CSS halaman](../../apps/web/src/app/globals.css). Alur formulir berada di `apps/web/src/features` dan controller engine di `apps/web/legacy/untukmu/js`.

## Memperbarui gambar

Setelah dependensi dan browser tersedia, dari folder utama jalankan:

```sh
npm run ui-ux:export
```

Perintah membangun frontend, membuka web dan API sementara, membuat akun contoh, mengekspor kedua perangkat, memeriksa checksum, lalu menghasilkan galeri dan panduan perangkat. Data produksi tidak digunakan. `ui-ux.spec.ts` hanya berjalan ketika mode ekspor aktif; pemeriksaan tombol biasa tidak mengulang ekspor besar ini.

Jika build sudah sesuai sumber terbaru, gunakan `npm run ui-ux:export -- --reuse-build`. Untuk membuat ulang galeri dari gambar yang sudah ada, jalankan `node scripts/render-ui-ux.mjs`. Jangan membangun frontend lain ketika ekspor masih berjalan.

Laporan berada di [ui-ux-full-results.json](../pengujian/hasil/ui-ux-full-results.json). Lokasi Python dan Edge dapat ditentukan melalui `UNTUKMU_TEST_PYTHON` serta `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, seperti pada panduan pengujian.

Cara menjalankannya tersedia pada [panduan pengujian](../pengujian/README.md). Tes ukuran viewport membantu menemukan panel yang keluar layar, tetapi pemeriksaan perangkat fisik tetap perlu dilakukan sebelum rilis.
