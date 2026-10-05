# Pengujian aplikasi

Folder `hasil` menyimpan laporan JSON. Gambar tampilan berada di [UI/UX mobile](../ui-ux/mobile/README.md) dan [UI/UX desktop](../ui-ux/desktop/README.md). Laporan lama tetap menjadi bukti pemeriksaan versi saat laporan dibuat; bukan jaminan bahwa deployment pengguna sudah diuji.

## Ekspor UI/UX lengkap, 3 Oktober 2026

Galeri sekarang mencakup 71 layar dan keadaan pada masing-masing perangkat: 124 gambar mobile dan 116 gambar desktop. Gambar diambil dari aplikasi yang berjalan dengan akun contoh dan API sementara. Alur mencakup Tulis, Doa, Jelajah, Peta, akun, pengaturan, moderasi, kurasi, dan halaman pendukung. Formulir panjang direkam per bagian.

| Pemeriksaan ekspor | Hasil |
| --- | --- |
| Ekspor aplikasi mobile dan desktop | [2/2 skenario lulus](hasil/ui-ux-full-results.json), tanpa kesalahan JavaScript halaman. Menggunakan build produksi yang sudah diverifikasi pada perapian folder. |
| Integritas gambar | Semua 240 gambar cocok dengan checksum manifest; kedua perangkat memakai sumber runtime yang sama. |
| Galeri lokal | Pencarian, filter fitur, perpindahan perangkat/layar/bagian gambar, tombol tutup, dan pemuatan gambar lulus pada 390/1366 px. Tidak ada overflow horizontal. |
| Galeri perangkat | Masing-masing memuat 71 layar. |
| Komponen | Salinan CSS pada katalog cocok dengan sumber CSS aplikasi. |
| Tautan | 305 tautan lokal README dan galeri mengarah ke berkas yang tersedia. |
| Kode otomasi | TypeScript, ESLint, Ruff untuk data contoh, serta pemeriksaan sintaks skrip ekspor/galeri lulus. |

Galeri dapat dibuka langsung melalui [index.html](../ui-ux/index.html). Cara memperbaruinya ada di [panduan UI/UX](../ui-ux/README.md). Contoh pemutar audio memakai media uji yang diberi keterangan; ekspor tidak menyatakan bahwa rekaman agama sudah selesai dikurasi.

## Perapian dokumentasi dan folder, 3 Oktober 2026

README ditulis ulang untuk cara pakai versi sekarang, termasuk aktivasi admin. Sebanyak 17 Markdown lama yang berulang atau sudah selesai dipakai dihapus setelah informasi penting digabungkan. PRD, atribusi, sumber doa, dan bukti pengujian dipertahankan. Saat pemindahan 44 berkas, seluruh checksum sebelum dan sesudah cocok.

| Pemeriksaan revisi folder | Hasil |
| --- | --- |
| Build produksi, TypeScript, ESLint | Lulus. |
| Vitest frontend | 37/37 lulus. |
| Browser aplikasi | [8/8 lulus](hasil/structure-cleanup-results.json): navigasi 320/390/1366 px, Peta/25 rasi, PWA/keyboard, perbandingan halaman masuk, dan dua alur doa tertulis. |
| Galeri UI/UX | Semua gambar dimuat, tautan navigasi bekerja, dan tidak ada overflow horizontal pada 320/390/1366 px. |
| Tautan dokumentasi | 89 tautan lokal Markdown/galeri ditemukan dan mengarah ke berkas yang tersedia. |
| Lokasi keluaran | Tes, konfigurasi Playwright, skrip audit, dan artifact CI memakai folder baru. |
| Referensi API dan migrasi | OpenAPI dibuat ulang; SQL PostgreSQL mencapai `0005_written_prayers`. Tidak ada database pengguna yang dimigrasikan oleh langkah dokumentasi ini. |
| Pembuatan paket | Struktur baru, PRD, serta lisensi masuk paket; `.env`, dependensi lokal, dan folder lama tidak ikut. |

Tes browser berjalan dengan API/SQLite/fakeredis sementara dan Edge headless. Ini pemeriksaan lokal untuk perapian folder; batas perangkat fisik dan deployment produksi di bawah tetap berlaku.

## Menjalankan pemeriksaan tombol

Pasang dependensi frontend dengan `npm ci` dan dependensi backend dengan `pip install -r apps/api/requirements-dev.lock` pada virtual environment Python 3.12. Ikuti [panduan pengembangan](../panduan/PENGEMBANGAN.md) jika belum disiapkan.

Dari folder utama proyek:

```sh
npx playwright install chromium
npm run check:buttons
```

Perintah membangun frontend terbaru, menjalankan API nyata dengan SQLite/fakeredis sementara, lalu memeriksa interaksi browser. Data produksi tidak dipakai. Untuk mengulang seluruh skenario dua kali:

```sh
npm run check:buttons:repeat
```

Untuk menjalankan bagian tertentu, misalnya tampilan mobile/desktop:

```sh
npm run check:buttons -- frontend-navigation.spec.ts map-stars.spec.ts visual.spec.ts --trace off
```

Jika build sudah sesuai kode terbaru, gunakan `node scripts/test-browser-local.mjs` dengan nama tes yang sama untuk melewati build ulang. Jangan membangun ulang aplikasi ketika harness browser masih memakai build tersebut.

Jika Python tidak ada di PATH, tentukan lokasinya. Contoh PowerShell dengan virtual environment pada folder utama:

```powershell
$env:UNTUKMU_TEST_PYTHON = (Resolve-Path '.venv/Scripts/python.exe').Path
npm run check:buttons
```

Jika virtual environment berada di `apps/api/.venv`, sesuaikan jalurnya. Untuk memakai Edge terpasang:

```powershell
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run check:buttons
```

Laporan pemeriksaan tombol ditulis ke `docs/pengujian/hasil/button-audit-results.json`; laporan HTML ada di `apps/web/playwright-report`. Variabel `UNTUKMU_BROWSER_REPORT` dapat memilih nama laporan lain; jalur relatif dihitung dari `apps/web`.

## Pemeriksaan kode

Dari folder utama:

```sh
npm run lint
npm test
npm run build
python scripts/verify_original.py --archive-only --if-present
```

Dari `apps/api`, setelah virtual environment aktif:

```sh
ruff check app tests alembic scripts
pytest -q
alembic upgrade head --sql
```

ZIP sumber awal tidak tersedia pada checkout ini; pemeriksaan opsional melaporkan **SKIP**. Jika ZIP tersedia, pemeriksa mencocokkan checksum arsip. Salinan kerja sengaja direvisi dan tidak diklaim identik dengan seluruh arsip.

## Hasil fitur sebelum perapian folder, 2 Oktober 2026

| Pemeriksaan | Bukti |
| --- | --- |
| Build produksi, TypeScript, ESLint | Lulus pada revisi hitungan galaksi. |
| Vitest frontend | 37 tes lulus. |
| pytest API dan Ruff | 43 tes API lulus; Ruff lulus pada revisi doa tertulis/Peta. |
| Migrasi `0005_written_prayers` | Upgrade/downgrade dan data lama diuji pada SQLite; SQL PostgreSQL berhasil dihasilkan. |
| Label dan kartu galaksi | [Rangkaian akhir](hasil/galaxy-counts-final-results.json): tiga tes lulus, satu tes terkena referensi iframe lama setelah reload. Setelah tes diperbaiki, [pengujian ulang](hasil/galaxy-counts-recheck-results.json) lulus 1/1. |
| Peta, 25 rasi, dan panel mobile/desktop | [Audit akhir](hasil/personal-prayers-map-final-results.json) lulus 7/7 setelah perbaikan ekspektasi nama rasi dan jarak animasi kartu. |
| Doa tertulis | [Audit awal](hasil/written-prayer-results.json) lulus 15/16; [ulang](hasil/written-prayer-recheck-results.json) lulus 3/3 termasuk skenario integrasi yang sempat timeout. |
| Audio dan panel kurasi | [Audit pemutar](hasil/prayer-source-results.json) lulus lima tes; [ulang panel admin](hasil/prayer-source-recheck-results.json) lulus setelah benturan ID kolom diperbaiki. |
| Akun, pemulihan, pengaturan | [Audit awal](hasil/button-audit-results.json) lulus 23/24; [ulang](hasil/button-audit-recheck-results.json) lulus 5/5 setelah timeout pendaftaran. Versi ini masih memuat navigasi atas yang kemudian dihapus. |

Hasil gabungan di atas berasal dari beberapa eksekusi, bukan satu rangkaian penuh yang semuanya lulus. Riwayat rinci tersedia pada laporan masing-masing; ringkasan lama yang berulang sudah digabung ke dokumen ini.

Tes galaksi memeriksa satu doa menghasilkan **0 pesan / 1 doa**, satu pesan menghasilkan **1 pesan / 1 doa**, doa kedua menghasilkan **1 pesan / 2 doa**, lalu edit, hapus, beberapa tujuan, dan reload. Tes Peta mengklik bintang serta garis asli, memutar kamera, dan memeriksa kartu tidak menutupi dock atau keluar layar.

Cakupan lain mencakup pendaftaran, enkripsi, unlock, publikasi/moderasi, empati, laporan, filter dan pagination 64 ucapan, audio/jeda/batal/retry, pemulihan, ekspor, hapus data, keyboard, PWA, serta cache privat. Audio hening pada fixture tes adalah bahan pengujian, bukan rekaman agama yang dipublikasikan.

## Pemeriksaan berkala

GitHub Actions menjalankan lint, tes, build, pemeriksaan browser, dan pemeriksaan Compose saat push/PR; tersedia juga pemicu manual dan jadwal Senin 08.00 WIB. Jadwal baru berlaku setelah workflow berada pada branch default. Laporan tombol diunggah sebagai artifact CI. Perapian lokal tidak menjalankan push atau jadwal GitHub.

## Batas hasil

Tes lokal memakai Edge headless, software WebGL, SQLite, dan fakeredis. Hasil tersebut belum membuktikan performa perangkat fisik, kesiapan PostgreSQL/Redis/MinIO produksi, Turnstile produksi, atau audit pembaca layar penuh. Pengujian keamanan mencakup kepemilikan data, enkripsi, sesi, moderasi, dan cache; bukan sertifikasi keamanan independen.

Pilihan tujuh tradisi tersedia, tetapi audio berizin dan tinjauan agama belum lengkap. Status yang benar ada pada [sumber doa](../konten-doa/SUMBER.md). Perbandingan visual mengukur empat elemen halaman masuk, bukan semua layar dinamis.
