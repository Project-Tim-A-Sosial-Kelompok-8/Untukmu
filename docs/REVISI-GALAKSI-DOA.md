# Revisi galaksi, navigasi, dan doa — 29–30 September 2026

Home/Rumah dan tombol kembali sekarang menuju Milky Way. Memuat ulang halaman tidak otomatis memindahkan kamera ke seluruh galaksi pengguna. Galaksi yang tersimpan tetap tersedia melalui Ruang Pribadi dan peta.

Perjalanan kamera memakai transisi halus, memperhitungkan lebar layar, dan membatalkan perjalanan sebelumnya saat Home dipilih. Galaksi tujuan memakai ribuan partikel dengan bentuk sesuai pilihan. Pada ponsel, posisi galaksi dan tinggi panel disesuaikan agar bentuk galaksi tetap terlihat.

Tulis memilih galaksi yang sedang dibuka; pengguna dapat mengganti tujuan atau membuat galaksi baru. Komposer menjelaskan tujuan ucapan, mencegah perubahan saat menyimpan, dan mengaktifkan kembali tombol setelah berhasil/gagal. Kegagalan memperbarui tampilan setelah penyimpanan tidak meminta pengguna menyimpan ucapan yang sama lagi.

Tombol Doa tepat di sebelah Tulis pada navigasi membuka halaman **Doa untuk seseorang**, terpisah dari Jelajah. Halaman ini menampilkan tujuh pilihan agama/tradisi, rujukan sumber, daftar ucapan tujuan dengan pagination, status kurasi, dan langkah mulai/batal. Jika galaksi memuat beberapa ucapan publik yang disetujui, pengguna memilih ucapan terlebih dahulu. Doa agama yang belum dikurasi tetap ditandai belum tersedia; hening umum dapat digunakan. Audio memiliki pemutar dengan kontrol jeda/lanjut; autoplay yang ditolak tetap dapat dimulai melalui pemutar. Pembatalan mengabaikan respons sesi lama, dan pengulangan pencatatan memakai token yang sama agar tetap idempoten. Pencarian sumber dan batas ketersediaannya dicatat dalam [SUMBER-DOA.md](SUMBER-DOA.md).

Jelajah menjelaskan filter aktif, urutan **Terbaru** (waktu pembuatan) dan **Paling didoakan** (jumlah pendoa, dengan waktu sebagai pembeda). Setiap halaman menampilkan 30 ucapan dan mengambil satu baris tambahan untuk memastikan halaman selanjutnya tersedia. Tombol Berikutnya hanya dinonaktifkan pada halaman terakhir, saat pemuatan, atau ketika permintaan gagal; alasannya ditampilkan. Ada Hapus filter, status pemuatan, dan Coba lagi. Keterangan rentang ucapan menjelaskan batas 30 per halaman; halaman pertama menjelaskan mengapa Sebelumnya nonaktif dan akhir hasil menjelaskan mengapa Berikutnya nonaktif. Pengantar membedakan dukungan untuk ucapan publik dari penyimpanan pesan pribadi.

Komposer menampilkan kontrol tutup selama tujuan dimuat dan menolak respons pemuatan yang sudah usang. Render React mengikuti perilaku penggantian isi yang diperlukan controller agar status disabled, isi input, dan teks hasil mutasi DOM tidak tertinggal pada layar berikutnya. Pengujian mencakup menyimpan pesan pertama lalu memilih nama, membuat kenangan baru, memilih kategori, dan menutup dengan silang.

Semua label mengambang disembunyikan pada kedua mode Peta, Kenangan dan Konstelasi/astronomi, termasuk ketika kamera digeser dan viewport berubah. Tata surya juga menyembunyikan label galaksi/kenangan. Label galaksi di luar Peta tetap mengikuti proyeksi kamera dan dibatasi di dalam viewport.

Panel, tombol, dan pilihan panjang membungkus teks pada layar kecil. Render galaksi berhenti sementara di belakang formulir layar penuh dan berjalan kembali setelah formulir ditutup. Sesi autentikasi kedaluwarsa ditolak, katalog doa dibaca sebagai UTF-8 pada Windows, dan durasi yang ditampilkan mengikuti durasi audio.

## Revisi posisi Doa dan Peta

Dua tes browser terarah lulus dalam [map-explore-results.json](quality/map-explore-results.json): pagination/filter dengan 64 ucapan dan hasil kosong, serta urutan Tulis/Doa dan semua lapisan label Peta tersembunyi saat digeser pada lebar 1366/390 piksel. ESLint untuk skrip Jelajah dan tes revisi lulus; engine berhasil dihasilkan ulang.

## Validasi revisi lanjutan 30 September

- 37 tes frontend dan 12 tes API doa/sosial lulus. ESLint, TypeScript, Ruff, dan build produksi lulus.
- Tujuh tes interaksi lulus dalam [interaction-recheck-results.json](quality/interaction-recheck-results.json): filter/pagination 64 pesan, komposer sesudah penyimpanan, label Peta saat digeser dan berganti mode, pilihan doa pada lebar 320/390/1280 piksel, serta pemutar audio sampai selesai.
- Pemeriksaan navigasi desktop/ponsel, galaksi, dan akun dasar juga lulus pada rangkaian lanjutan. Tes pemulihan akun sempat kehabisan waktu menunggu server dan lulus ketika diulang. Rangkaian lengkap terhenti sebelum laporan akhirnya tersimpan, sehingga hasil ini tidak dinyatakan sebagai satu eksekusi penuh yang lulus.
- Tes pembatalan doa diperbaiki agar memakai respons yang ditahan sampai sesudah pembatalan, bukan jeda tetap 600 ms yang dapat selesai lebih dulu ketika mesin tes sibuk.
- Lima tes akhir lulus dalam [final-interaction-results.json](quality/final-interaction-results.json): kombinasi suasana/tag, urutan dan pagination, pembatalan doa pada tiga ukuran layar, serta alur nyata publikasi → moderasi → halaman Doa → sesi hening 30 detik → penanda doa di galaksi penerima. Uji integrasi sebelumnya melewati pemeriksaan penanda tetapi kehabisan waktu saat menutup browser; pengulangan tanpa trace dan dengan batas 180 detik berhasil selesai.

Audio pengujian adalah WAV hening khusus fixture, bukan rekaman keagamaan yang dipublikasikan. Rujukan web tidak otomatis mengubah status kurasi atau mengaktifkan rekaman agama.

## Validasi awal

- API: 38 tes lulus; pemeriksaan Ruff lulus.
- Frontend: 37 tes lulus; pemeriksaan ESLint dan TypeScript lulus; build produksi Next.js selesai dengan kode keluar 0.
- Browser: pengujian lengkap menghasilkan 14 lulus dari 15 skenario. Satu kegagalan berasal dari pemeriksa konsol yang turut menghitung galat jaringan yang memang dipicu tes luring. Pemeriksa tersebut diperbaiki agar mengabaikan hanya galat putus jaringan selama langkah luring. Pengujian ulang galaksi, edit ucapan/kunci, dan PWA menghasilkan 3 lulus tanpa kegagalan. Dengan pengujian ulang ini, seluruh 15 skenario telah lulus, meskipun bukan dalam satu eksekusi penuh terakhir.
- Laporan lengkap: [browser-results.json](quality/browser-results.json); pengujian ulang: [browser-recheck-results.json](quality/browser-recheck-results.json).

Browser diuji menggunakan Edge headless dengan software WebGL, server pada port terpisah, dan basis data sementara. Harness mencocokkan isi engine yang disajikan dengan hasil terbaru sebelum menjalankan tes. Cakupan meliputi Home ke Milky Way, transisi kamera, tujuan penyimpanan ucapan, muat ulang, tombol navigasi, edit ucapan, tujuh pilihan tradisi, pembatalan/pengulangan doa, moderasi, serta tata letak desktop dan ponsel.

Pengujian API menggunakan SQLite/fakeredis; PostgreSQL, Redis, object storage, rekaman doa, dan perangkat fisik belum diuji langsung dalam revisi ini. Server lama pada localhost:3000 tidak dimulai ulang; jalankan ulang layanan aplikasi untuk memuat hasil terbaru.

Sumber yang perlu diedit berada di `apps/web/legacy`, `apps/web/scripts`, dan `apps/web/src`. Jalankan `npm run prepare:engine --workspace apps/web` untuk menghasilkan ulang `apps/web/public/engine`; perubahan langsung pada folder hasil akan tertimpa. Pemeriksaan hash ZIP awal akan menunjukkan perbedaan pada sumber tampilan yang sengaja direvisi.
