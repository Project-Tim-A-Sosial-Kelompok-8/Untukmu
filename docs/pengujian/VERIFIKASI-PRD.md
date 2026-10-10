# Verifikasi revisi PRD

Tanggal: 10 Oktober 2026. Acuan produk dan batas kesiapan dicatat di [matriks PRD](../prd/KESESUAIAN.md).

## Hasil pemeriksaan

| Pemeriksaan | Hasil |
| --- | --- |
| Ruff pada API, pengujian dan migrasi | Lolos |
| Pytest backend | 60 tes lolos |
| TypeScript dan ESLint | Lolos |
| Vitest katalog, metadata dan kelayakan dukungan | 11 tes lolos |
| Build produksi Next.js | Lolos; seluruh halaman berhasil dibuat |
| Dependensi Python dan sintaks controller visual/script | Lolos |
| Migrasi Alembic PostgreSQL online 0009 → 0010 | Lolos pada aplikasi lokal; katalog bertambah lima entri tanpa mengubah jumlah akun/pesan |
| Konfigurasi Docker Compose dengan profile monitoring | Lolos |
| Browser lokal pada build produksi | 37 skenario unik lolos melalui pengujian lengkap dan uji ulang |
| Revisi lanjut Doa dan pembentukan galaksi | 11 skenario browser lolos, mencakup dua skenario baru; dua skenario diuji ulang pada build terakhir |
| Rekaman asli | Empat berkas cocok checksum, berhasil didekode/diputar; durasi sesi sesuai berkas |
| Build dan pembaruan aplikasi Docker lokal | API, web, worker dan migrator berhasil dibangun; API sehat, akun/pesan dan container infrastruktur dipertahankan |

## Lingkungan dan cakupan

Backend diuji dengan database terisolasi. Tes browser menjalankan API nyata dengan SQLite/fakeredis, server Next.js standalone dari build produksi, dan Microsoft Edge headless dengan software WebGL. Zona waktu browser ditetapkan Asia/Jakarta. Tidak ada akun atau database aplikasi milik pengguna yang diubah oleh fixture pengujian. Berkas PRD dalam repositori cocok persis dengan dokumen acuan yang diberikan pengguna, berdasarkan SHA-256.

Suite lengkap memeriksa 34 skenario: 29 langsung lolos dan lima menemukan masalah yang kemudian diperbaiki. Perbaikan meliputi penantian halaman setelah keluar/hapus akun, penantian pemuatan penerima tautan, normalisasi zona waktu jadwal, dan Escape pada beranda. Tes ulang tujuh skenario pada build final semuanya lolos; pengujian ini juga memeriksa pertumbuhan ukuran galaksi selama pembentukannya dan menambahkan skenario konversi enkripsi pesan lama yang tertunda. Gabungan hasil terakhir mencakup 35 skenario unik tanpa kegagalan tersisa. Hasil historis tersebut dirangkum di sini; keluaran berkas lama dibersihkan oleh konfigurasi Playwright sebelumnya.

Cakupan mencakup pembuatan galaksi, pesan tambahan pada galaksi yang sama, bintang lama setelah refresh, formulir dan kegagalan penyimpanan, pemisahan data antar akun, pemulihan dan ekspor, tiga pilihan privasi, tautan terenkripsi dan pencabutan, jadwal pesan, Jelajah/moderasi, doa dan rekaman kurator, Peta Kenangan, akses keyboard, serta batas cache PWA. Ukuran tampilan yang diperiksa mencakup lebar 320, 390, 1280, dan 1366 piksel.

Pada revisi lanjut, sepuluh dari sebelas skenario Doa/galaksi langsung lolos. Tes sosial masih memakai urutan klik lama tanpa tahap memilih jenis doa, sehingga tes tersebut diperbarui dan diuji ulang hingga lolos dengan rekaman Bapa Kami asli sampai selesai. Tes pembatalan pembentukan juga memeriksa penghapusan efek, disposal geometri, pengembalian skala, dan reduced motion. Pratinjau Al-Fatihah berhasil diputar tanpa mencatat doa, tombol lanjut bekerja, serta halaman berisi 61 ucapan tetap mempertahankan pilihan saat pagination. Dua skenario terakhir diuji ulang pada build final dan lolos.

Aplikasi Docker lokal diperbarui setelah cadangan PostgreSQL dibuat. Migrasi 0010 berjalan pada PostgreSQL nyata; jumlah akun dan pesan tetap, sedangkan katalog bertambah lima entri. Container PostgreSQL, Redis, MinIO dan gateway tetap sama. Pemeriksaan UI pada tab aplikasi pengguna mengonfirmasi audio Al-Fatihah dapat diputar dan tombol Berikutnya membuka tahap ucapan. Pada database lokal ini belum ada ucapan publik yang disetujui, sehingga daftar tujuan kosong dengan penjelasan yang terlihat.

Pada 10 Oktober, suite lengkap menjalankan 37 skenario: 34 langsung lolos. Tiga kegagalan meliputi HTTP 500 saat pendaftaran fixture, satu klik Peta yang juga diproses listener galaksi, serta selector tes penutup Doa yang ambigu. Klik Peta diperbaiki dengan menghentikan listener lain pada klik yang sama; tes penutup memilih tombol Selesai. Pendaftaran fixture berhasil pada uji ulang dan kegagalan 500 tersebut tidak terulang; log layanan kini disimpan jika tes berikutnya gagal. Uji ulang berikutnya mengungkap batas waktu total tes galaksi dan pemilihan kartu sebelum transisi kamera selesai. Tes galaksi diberi waktu total 240 detik untuk tiga penyimpanan serta dua login, dengan batas tiap assertion tetap; tes sosial memakai tombol Lihat setelah transisi selesai. Hasil terakhir mencakup seluruh 37 skenario tanpa kegagalan tersisa. Filter memeriksa kombinasi Rindu/#KENANGAN, pencarian pesan pending milik sendiri, empati nyata, rekaman Bapa Kami hingga doa tercatat, dan tujuan galaksi publik bersama.

Penjadwalan publik/unlisted ditegakkan API. Kapsul privat adalah pengaturan tampilan bagi pemilik; pemilik yang masih memiliki kunci tetap dapat mengelola isinya sebelum waktu pembukaan. Tidak ada klaim enkripsi yang mengunci pemilik sampai tanggal tertentu.

## Bukti dan batas

Laporan browser dan screenshot terbaru dihasilkan dalam `frontend/test-results` serta `frontend/playwright-report`. Playwright kini hanya membersihkan `frontend/test-results/runs`, sehingga laporan JSON dan bukti yang disimpan di direktori induknya tidak ikut terhapus saat tes dijalankan ulang. Berkas tersebut adalah keluaran pengujian, bukan sumber aplikasi. Build visual disusun langsung dari `frontend/visual` dan katalog tunggal `backend/data/prayers-v1.json`.

Laporan revisi lanjut tersedia pada `prayer-motion-recheck.json`; suite lengkap dan uji ulang 10 Oktober ada pada `revisi-jelajah-doa-final.json`, `revisi-jelajah-doa-recheck.json` dan `revisi-jelajah-doa-confirmed.json`; pemeriksaan rekaman dirangkum pada `recording-verification-summary.json`, dan respons byte-range API aplikasi berjalan pada `live-audio-api.json`. Bukti aplikasi berjalan ada pada `doa-audio-dan-berikutnya.jpg`; efek pembentukan pada screenshot `galaksi-pembentukan-cahaya.png`. `local-update.json` dan `social-local-update.json` mencatat pemeriksaan jumlah data dan infrastruktur. Pembaruan filter mempertahankan 12 akun, 17 pesan dan 18 entri katalog; empat pesan publik masih pending. Query filter legacy PostgreSQL serta health/catalog merespons 200. Screenshot filter aplikasi berjalan tersedia pada `jelajah-filter-lokal.png`. Cadangan database merupakan berkas lokal privat dalam `.local-backups/database`, diabaikan Git/Docker dan dipisahkan dari hasil tes; bukan artefak untuk publikasi.

Validasi ini tidak mencakup pemasangan produksi pada domain operator, pengiriman nyata ke Sentry, menjalankan Grafana/Prometheus dalam container, tolok ukur FPS pada ponsel fisik, uji kapasitas produksi, atau audit keamanan independen. Suite integrasi PostgreSQL/Redis/MinIO lengkap tetap disediakan workflow CI; pemeriksaan lokal hanya mencakup pembaruan layanan, migrasi dan API/audio aplikasi yang berjalan. Audio tersedia untuk lima tradisi dengan sumber/lisensi yang tercatat; audio Konghucu masih memerlukan sumber dengan izin distribusi yang jelas. Paket tersebut tidak mengklaim persetujuan institusi agama; fixture audio tes tidak mengesahkan materi produksi.
