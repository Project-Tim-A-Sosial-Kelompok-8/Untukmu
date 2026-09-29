# Untukmu 

Proyek fullstack berdasarkan **Untukmu(3).zip**, PRD Kelompok 8, dan instruksi kerja yang disertakan. Tampilan menggunakan markup, CSS, gambar, tekstur, partikel, dan gerak kamera sumber asli; layar tambahan memakai kelas visual yang sama.

**Implementasi Fase 1–5 tersedia dalam paket ini.** Hasil ini adalah kandidat untuk pengujian integrasi, belum rilis produksi. Docker Compose, PostgreSQL/Redis/MinIO sungguhan, perangkat fisik, dan kurasi agama oleh manusia masih membutuhkan pemeriksaan operator. Tidak ada audio doa dalam ZIP asal; tidak ada rekaman pengganti yang dikarang atau diklaim sudah berlisensi.

## Isi paket

- `apps/web`: Next.js App Router, TypeScript strict, React, R3F, TanStack Query, Zustand, Framer Motion, Tailwind, enkripsi Argon2id WASM dalam Web Worker.
- `apps/api`: FastAPI async, SQLAlchemy, Alembic, PostgreSQL, Redis, object storage S3/MinIO, worker moderasi.
- `apps/web/legacy`: sumber engine, tampilan, foto, dan aset awal. Navigasi galaksi serta antarmuka telah direvisi; penyimpanan prototipe tidak dipakai pada produksi. Berkas `public/engine` dihasilkan dari sumber ini melalui `prepare:engine`.
- `referensi/Untukmu-asli.zip`: ZIP sumber utuh, termasuk riwayat repositori. **203 berkas sumber dipertahankan.**
- `docs`: pemetaan implementasi, keputusan arsitektur, hasil pengujian, OpenAPI, SQL PostgreSQL, perbandingan visual, dan audit.
- `scripts/verify_original.py`: membandingkan setiap berkas sumber berdasarkan SHA-256.

## Menjalankan pada Windows atau Linux

Gunakan Docker Desktop dengan Compose v2 dan Python. Ekstrak ZIP terlebih dahulu; buka terminal pada folder `Untukmu`.

```sh
python scripts/init_env.py
docker compose up --build
```

Generator `.env` membuat rahasia acak dan menolak menimpa konfigurasi yang sudah ada. Compose menyiapkan basis data, migrasi, bucket privat, worker, API, web, dan gateway.

| Tujuan | Alamat |
| --- | --- |
| Aplikasi | http://localhost:3000 |
| Dokumentasi API | http://localhost:3000/docs |
| Kesehatan layanan | http://localhost:3000/api/v1/health |
| Konsol MinIO lokal | http://localhost:9001 |

Nama database adalah **untukmu**. Kredensial MinIO berasal dari `S3_ACCESS_KEY` dan `S3_SECRET_KEY` dalam `.env`. Jangan mengunggah `.env` ke repositori. Stack ini menggunakan PostgreSQL, bukan MySQL Laragon.

```sh
docker compose logs api worker migrate init-storage web
docker compose down
```

Perintah `down` tanpa `-v` mempertahankan volume data. Docker Compose belum dijalankan pada lingkungan pengerjaan; jangan menyamakan keberhasilan test SQLite dengan pengujian layanan produksi.

## Fitur per fase

| Fase | Perilaku yang diimplementasikan |
| --- | --- |
| 1 | Pendaftaran/login, sesi JWT dan rotasi cookie HttpOnly, kunci Argon2id/AES-GCM, galaksi, kategori khusus, foto/lampiran terenkripsi, pesan privat, dashboard |
| 2 | Publikasi anonim setelah moderasi, jelajah dan filter, empati idempoten, laporan, blokir dua arah, antrean serta audit keputusan moderator |
| 3 | Katalog tujuh tradisi, kurasi teks/sumber, unggah audio dengan atribusi/lisensi, sesi doa berdurasi, hitungan unik, debu doa berdasarkan catatan nyata |
| 4 | Satu pesan untuk maksimal 10 tujuan, pemulihan penuh tanpa mengganti master key, pencabutan sesi lama, ekspor terenkripsi termasuk media, edit/hapus pesan, tautan terbatas yang dapat dicabut |
| 5 | PWA dengan cache aset publik, layar luring, akses keyboard/fokus/Escape, semantik dialog, CSP engine, audit akses dan kripto, pengukuran kamera, inventaris aset |

## Alur penggunaan

1. Pilih **Tulis → Buat akun**, gunakan kata sandi minimal 12 karakter, simpan kode pemulihan yang ditampilkan sekali.
2. Tentukan tujuan, kategori, bentuk galaksi, foto opsional, isi pesan, serta lampiran. Tujuan tambahan dapat dipilih pada langkah pertama.
3. Pesan privat langsung tersimpan terenkripsi. Publik dan tautan terbatas menunggu persetujuan moderator. Foto serta lampiran tetap privat untuk pemilik.
4. Setelah memuat ulang halaman, buka **Kunci** untuk membaca pesan privat. **Ruang Pribadi** menampilkan data akun dari server.
5. Pilih **Kelola pesan** pada pesan milik sendiri untuk mengedit, menghapus, atau membuat/mencabut tautan. Tautan baru membatalkan tautan sebelumnya; perubahan isi membutuhkan moderasi ulang.
6. **Pengaturan → Akun dan keamanan** menyediakan sesi aktif, pemulihan, pemblokiran, dan ekspor. Verifikasi ekspor membaca berkas di perangkat tanpa mengimpor atau mengubah akun.
7. **Pulihkan akun** pada layar masuk memakai surel dan kode pemulihan. Kode baru ditampilkan setelah pemulihan. Akun yang dibuat pada Fase 1–3 perlu mengaktifkan pemulihan dari sesi login dengan kata sandi lama dan kode yang benar terlebih dahulu.

## Administrator dan kurator

Daftarkan akun terlebih dahulu. Promosi administrator dilakukan oleh operator melalui terminal, bukan melalui endpoint publik:

```sh
docker compose exec api python -m scripts.make_admin moderator@example.com
```

Buka `/admin` atau tombol **Panel moderasi** pada pengaturan akun. Antrean hanya berisi pesan publik atau tautan terbatas. Pesan privat tidak dapat dibaca moderator. Keputusan menyertakan token revisi sehingga perubahan isi setelah peninjauan ditolak.

Pada **Kurasi doa dan audio**, pilih entri, isi teks yang telah disetujui kurator, sumber HTTPS, catatan tinjauan, dan durasi. Rekaman memerlukan lisensi dan atribusi. Hanya centang persetujuan setelah isi serta rekaman benar-benar ditinjau. Entri agama dari sumber asli tetap menunggu kurasi; hanya sesi hening umum yang dapat digunakan langsung. Tujuh tradisi tetap tampil seluruhnya.

## Pengembangan lokal

Jalankan PostgreSQL, Redis, dan MinIO:

```sh
docker compose up -d postgres redis minio
python -m venv .venv
```

Aktifkan `.venv\Scripts\Activate.ps1` (PowerShell) atau `source .venv/bin/activate` (Linux/macOS), kemudian:

```sh
pip install -r apps/api/requirements-dev.lock
```

Salin `.env` ke `apps/api/.env`. Dari `apps/api`, jalankan:

```sh
alembic upgrade head
python -m scripts.init_storage
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Terminal kedua, dari `apps/api`: `python -m app.worker`. Terminal ketiga, dari akar proyek:

```sh
npm ci
npm run dev
```

Untuk build: `npm run build`. Jalankan dengan `npm run start --workspace apps/web`. Jika alamat object storage berbeda, sediakan `S3_PUBLIC_ENDPOINT` saat build frontend agar CSP mengizinkan endpoint tersebut.

## Pemeriksaan

```sh
python scripts/verify_original.py
npm run lint
npx playwright install chromium
npm test
npm run build
```

Dari `apps/api`: `ruff check app tests alembic scripts`, `pytest -q`, dan `alembic upgrade head --sql`. Untuk uji browser lokal terisolasi gunakan `node scripts/test-browser-local.mjs`; jika Python tidak ada di PATH, set `UNTUKMU_TEST_PYTHON` ke Python virtual environment. Skrip ini hanya menggunakan basis data pengujian SQLite/fakeredis, tanpa data contoh dalam aplikasi produksi.

Lihat `docs/STATUS-PENGUJIAN.md` dan `docs/AUDIT-FASE-5.md` untuk cakupan dan batas hasil. Paket belum dipublikasikan. Seluruh pemberitahuan hak cipta asli dipertahankan. Ada ketidaksesuaian penyebutan lisensi dalam sumber; baca `docs/CATATAN-LISENSI.md` dan `THIRD-PARTY-NOTICES.md`.
