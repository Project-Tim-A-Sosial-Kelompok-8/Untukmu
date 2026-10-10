# Untukmu

Website untuk menyimpan pesan dan kenangan bagi seseorang, membaca pesan publik anonim, serta memberi dukungan melalui doa pilihan. Perilaku produk mengikuti `docs/referensi/PRD_Kelompok_8.docx`.

## Menjalankan

Pasang Docker Desktop dengan Compose v2 dan Python 3.12, lalu jalankan dari folder proyek:

```sh
python scripts/init_env.py
docker compose up -d --build --wait
```

Generator membuat `.env` lokal hanya jika belum ada. Kredensial tidak masuk Git. Buka http://localhost:3000; halaman doa tersedia di `/doa`, admin di `/admin`, dan dokumentasi API aktif di `/docs`. `docker compose down` menghentikan layanan tanpa menghapus volume data.

MinIO dibangun dari sumber resmi dengan versi dan checksum yang dikunci di `infra/minio/Dockerfile`.

## Fitur

- Beranda, Jelajah, dan Doa tersedia bagi pengunjung. Menulis dan membuka data pribadi memerlukan Masuk atau Daftar akun. Kata sandi dan kunci pesan asli tidak dikirim ke server.
- Tulis pesan untuk satu atau beberapa orang/kenangan, pilih bentuk dan warna visual, lalu tentukan privasi. Foto dan lampiran pengguna tetap terenkripsi.
- Pesan pertama membentuk galaksi; pesan berikutnya tiba sebagai bintang jatuh pada galaksi yang sama. Efek mengikuti pengaturan reduced motion.
- Privat dan tautan terbatas dienkripsi di perangkat. Tautan membawa kunci berbagi terpisah di fragmen URL; pemilik dapat mengganti privasi, membuat ulang, atau mencabut tautan melalui Kelola pesan.
- Jadwalkan pesan publik atau buat kapsul waktu. Publik terbit setelah jadwal dan persetujuan moderator; penerima tautan terjadwal menunggu waktu pembukaan.
- Rumah menampilkan kenangan pengguna dan galaksi publik. Galaksi publik memuat 100 pesan terbaru yang disetujui; Jelajah menyediakan halaman berikutnya dan filter. Pesan privat, tulisan yang belum disetujui, dan pengirim yang diblokir tidak masuk tampilan publik.
- Tampilan awal mempertahankan Milky Way dan tujuh galaksi bawaan tanpa label astronomi. Peta Kenangan mempertahankan latar dan kontrol sebelumnya, dengan bintang berwarna dari data aplikasi. Arahkan kursor untuk nama dan jumlah pesan/doa; klik untuk mengunjungi kenangan.
- Doa memakai pilihan Islam, Kristen, Katolik, Hindu, Buddha, Konghucu, dan Umum. Klik jenis spesifik untuk membuka teks, arti, sumber dan status kurasi, lalu pilih pesan tujuan. Dukungan tercatat setelah audio terkurasi atau sesi hening selesai, satu kali per pengenal pengunjung per pesan.
- Ruang Pribadi menampilkan pesan, kenangan, dan dukungan doa yang diterima/diberikan. Doa tertulis lama tetap disimpan sebagai pesan; formulir doa manual telah dilepas.
- Pengaturan menyediakan Ganti akun tanpa menghapus akun lama, pengelolaan sesi, ekspor, pemulihan, dan Hapus akun dengan pilihan mempertahankan atau menghapus tulisan. Tulisan publik yang dipertahankan tetap anonim; tulisan privat tetap terenkripsi dan tidak menjadi publik.

Audio agama asli belum disertakan dalam checkout ini. Kurator mengunggah audio tim dan meninjau teks sebelum mengaktifkannya. Hening pada pilihan Umum tersedia. Katalog tunggal ada di `backend/data/prayers-v1.json`; build frontend memakainya sebagai pratinjau lalu API memuat hasil kurasi. Baca [pengelolaan doa](docs/konten-doa/SUMBER.md).

Pemeriksaan seluruh bagian PRD tercatat dalam [matriks kesesuaian](docs/prd/KESESUAIAN.md). Arsitektur ada di [Sistem](docs/arsitektur/SISTEM.md), konfigurasi Cloudflare/TLS/Sentry/Grafana dan rilis di [Produksi](docs/operasional/PRODUKSI.md). Metrik keberhasilan agregat tersedia di panel admin. Aktifkan pemantauan lokal dengan `docker compose --profile monitoring up -d --build --wait` setelah mengisi token pemantauan dan kata sandi Grafana.

## Folder

| Folder | Isi |
| --- | --- |
| `frontend/src` | Halaman, komponen React, API client, dan kripto browser |
| `frontend/visual` | Adegan kenangan, peta, registry doa, CSS, dan vendor yang digunakan |
| `frontend/scripts` | Build/bundle sumber visual dan runtime React, tanpa patch string berlapis |
| `frontend/tests` | Pengujian frontend dan browser |
| `backend/app` | API FastAPI dan worker |
| `backend/alembic` | Migrasi database |
| `backend/data` | Sumber katalog doa bersama untuk API dan frontend |
| `backend/tests` | Pengujian API dan migrasi |
| `infra` | Gateway, MinIO, serta konfigurasi Prometheus/Grafana |
| `scripts` | Konfigurasi lokal dan pemeriksaan browser |
| `docs` | PRD, panduan pengembangan, doa, tes, dan atribusi |

`frontend/public/visual` dihasilkan otomatis. `.next`, `node_modules`, `.venv`, `test-results`, dan laporan browser adalah berkas lokal yang diabaikan Git. Nama/katalog astronomi, mode Astronomi, tata surya, foto kartu objek, serta laporan/arsip lama yang tidak digunakan telah dilepas. Milky Way, galaksi latar, tiga tekstur yang diperlukan untuk bentuk galaksi, dan tema panel tetap digunakan.

## Pengembangan dan pengujian

```sh
npm ci
npm run lint
npm test
npm run build
python -m pip install -r backend/requirements-dev.lock
cd backend
python -m ruff check app tests alembic
python -m pytest -q
```

Untuk browser lokal, kembali ke akar proyek lalu jalankan `node scripts/test-browser-local.mjs`. Pengujian produksi memakai `npm run test:e2e` setelah Docker aktif. Detail berada di [panduan pengembangan](docs/panduan/PENGEMBANGAN.md).
