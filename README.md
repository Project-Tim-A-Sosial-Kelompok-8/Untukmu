# Untukmu

Website untuk menyimpan pesan dan kenangan, membaca pesan publik anonim, dan memberi dukungan melalui doa dengan rekaman terkurasi. Acuan produk: [PRD Kelompok 8](docs/PRD.docx) dan [matriks kesesuaian](docs/KESESUAIAN-PRD.md).

## Teknologi

| Bagian               | Teknologi                                                                   |
| -------------------- | --------------------------------------------------------------------------- |
| Frontend             | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS                   |
| Visual kenangan      | Three.js, React Three Fiber; controller visual berada dalam sumber frontend |
| State dan data       | Zustand, TanStack Query                                                     |
| Backend              | Python 3.12, FastAPI, SQLAlchemy async, Alembic                             |
| Database dan antrean | PostgreSQL 16, Redis                                                        |
| Berkas               | S3/MinIO; lampiran pribadi dienkripsi di perangkat                          |
| Infrastruktur        | Docker Compose, Caddy, Turnstile; Sentry dan Prometheus/Grafana opsional    |
| Pemeriksaan          | ESLint, TypeScript, Prettier, Ruff, pytest, Vitest, Playwright              |

## Menjalankan secara lokal

Pasang Docker Desktop dengan Docker Compose v2 dan Python 3.12. Dari akar proyek:

```sh
python scripts/init_env.py
docker compose up -d --build --wait
```

Generator membuat `.env` dan rahasia lokal hanya jika file belum ada. Jika `.env` sudah tersedia, lanjutkan ke perintah Compose. Nilai contoh dalam `.env.example` bukan kredensial untuk deploy.

| Halaman / layanan | Alamat                                        |
| ----------------- | --------------------------------------------- |
| Aplikasi          | http://localhost:3000                         |
| Doa               | http://localhost:3000/doa                     |
| Panel admin       | http://localhost:3000/admin                   |
| Dokumentasi API   | http://localhost:3000/docs                    |
| PostgreSQL        | `127.0.0.1:5432`; database/user dari `.env`   |
| Konsol MinIO      | http://localhost:9001; kredensial dari `.env` |

Gunakan `docker compose logs --tail 100 api web worker` untuk pemeriksaan layanan. `docker compose down` menghentikan layanan dan mempertahankan volume database serta storage.

Untuk pgAdmin, daftarkan server dengan host `127.0.0.1`, port `5432`, database `POSTGRES_DB`, username `POSTGRES_USER`, dan password `POSTGRES_PASSWORD` dari `.env`. Tabel utama: `users`, `messages`, `constellations`, `prayers`, dan `prayer_contents`. Metadata audio berada di PostgreSQL; berkas unggahan berada di MinIO.

## Fitur saat ini

- Pengunjung dapat membaca pesan publik anonim, memfilter tag/suasana hati di Jelajah, memberikan empati, melaporkan, dan mendoakan pesan.
- Akun digunakan untuk menulis serta mengelola pesan dan kenangan pribadi. Pesan pertama membentuk galaksi dengan efek cahaya; pesan berikutnya masuk ke galaksi yang sama sebagai bintang jatuh.
- Pesan publik tampil sebagai daftar di Jelajah dan Doa. Galaksi milik penulis tetap menjadi tempat kenangan dan bintang doa.
- Pesan privat, tautan terbatas, dan lampiran dienkripsi di perangkat. Kata sandi asli dan kunci pesan tidak dikirim ke server. Pemilik dapat mencabut atau memperbarui tautan berbagi.
- Jadwal publik dan kapsul waktu mengikuti waktu pembukaan serta status moderasi. Pesan yang belum dibuka, belum disetujui, atau diblokir dikecualikan dari daftar publik.
- Ruang Pribadi menampilkan pesan, kenangan, serta doa yang diterima/diberikan. Pengaturan menyediakan pengelolaan sesi, ekspor, pemulihan, dan penghapusan akun.

## Doa dan audio

Alur pengunjung: **pilih pesan publik → pilih tradisi → pilih doa spesifik → Dengarkan dan kirim doa → dengarkan sampai selesai**. Setelah audio berakhir, sistem memperbarui jumlah pendoa dan menampilkan bintang doa pada constellation terkait milik penulis. Menjeda, membatalkan, atau mendengarkan pratinjau tidak mencatat doa. Pengiriman ulang sesi tetap idempoten.

Tujuh pilihan tersedia: Islam, Kristen, Katolik, Hindu, Buddha, Konghucu, dan doa umum non-denominasi. Checkout menyertakan empat rekaman manusia asli yang melayani lima pilihan: Al-Fatihah, Bapa Kami/Pater Noster untuk Kristen dan Katolik, Gayatri, serta Karaniya Metta. Bahasa, sumber, lisensi, durasi, dan checksum setiap rekaman tercatat dalam [manifest audio](backend/data/prayer-audio/manifest.json).

**Konghucu dan doa umum masih memerlukan rekaman asli terkurasi dengan izin distribusi yang jelas.** Admin dapat mengunggah rekaman ke entri yang tersedia. Keduanya baru masuk daftar doa pengunjung setelah audio dan sumber disetujui. Teks maupun audio doa tidak dibuat dengan AI.

Untuk memberikan peran admin kepada akun yang sudah terdaftar:

```sh
docker compose exec api python -m scripts.make_admin emailakun@example.com
```

Keluar lalu masuk kembali, buka `/admin`, dan pilih **Kurasi doa dan audio**. Pilih entri, lengkapi teks/sumber/catatan peninjauan, pilih audio, dengarkan pratinjau, isi izin serta atribusi, lalu simpan kurasi. Durasi unggahan dibaca dari berkas; MP3, OGG, WAV, dan M4A didukung dengan batas 30 MiB dan durasi 5–900 detik. Rekaman tersimpan juga dapat dipratinjau admin sebelum disetujui. Perubahan katalog tersimpan di database/storage tanpa mengubah kode atau memerlukan rebuild.

Rincian sumber dan aturan kurasi: [Katalog doa](docs/KATALOG-DOA.md). Audio Buddha memiliki lisensi nonkomersial; visual adaptasi juga memiliki batas nonkomersial. Lihat [atribusi](THIRD-PARTY-NOTICES.md) sebelum menentukan penggunaan.

## Struktur proyek

```text
frontend/
  src/
    app/                # Route, layout, metadata Next.js App Router
    features/           # Komponen React per fitur
    lib/                # API client, enkripsi, helper pesan
    runtime/            # Render layar, aksesibilitas dan penghubung controller visual
    visual/             # Sumber adegan, controller, CSS, aset, vendor beratribusi
  public/               # Ikon, service worker, halaman luring
  scripts/              # Build visual dan start standalone
  tests/                # Unit test dan browser test
backend/
  app/
    routers/            # Endpoint FastAPI per fitur
    main.py             # App, middleware, lifespan, pemasangan router
    models.py           # Model SQLAlchemy
    schemas.py          # Validasi input API
    ...                 # Konfigurasi, keamanan, katalog, worker dan helper
  alembic/              # Migrasi berurutan dan snapshot katalog historis
  data/                 # Katalog aktif serta rekaman asli dan manifest
  scripts/              # Inisialisasi storage dan pemberian peran admin
  tests/                # Tes API, migrasi dan fixture browser
infra/                  # Caddy, MinIO, Prometheus/Grafana
scripts/                # Konfigurasi lokal, verifikasi audio dan browser terisolasi
docs/                   # Dokumen langsung per topik; acuan asli pada PRD.docx
```

`frontend/public/visual` adalah hasil build otomatis, bukan sumber yang diedit. `node_modules`, `.next`, `.venv`, cache, laporan tes, `.env`, dan `.local-backups` diabaikan Git. Snapshot katalog dalam Alembic tetap diperlukan untuk instalasi dan upgrade database lama. Berkas `__init__.py` diperlukan sebagai penanda paket Python.

## Pengembangan dan pemeriksaan

Gunakan Node.js 22+ dan Python 3.12. Pasang dependensi frontend dari akar proyek:

```sh
npm ci
npm run format:check
npm run lint
npm test
npm run build
```

`npm run dev` menjalankan frontend; API dan layanan pendukung tetap perlu aktif. `npm run format` merapikan sumber frontend dengan konfigurasi Prettier yang dikunci.

Untuk backend, buat/aktifkan virtual environment `backend/.venv`, kemudian:

```sh
python -m pip install -r backend/requirements-dev.lock
cd backend
python -m ruff check app tests scripts alembic ../scripts
python -m ruff format --check app tests scripts alembic ../scripts
python -m pytest -q
```

Dari akar proyek, `node scripts/test-browser-local.mjs` menjalankan browser dengan database dan akun sementara yang terpisah dari aplikasi. Setelah Docker aktif, `npm run test:e2e` memeriksa aplikasi Compose. Detail: [Pengembangan](docs/PENGEMBANGAN.md) dan [Pengujian](docs/PENGUJIAN.md).

## Persiapan deploy

Konfigurasi produksi disediakan dalam `docker-compose.production.yml`; gunakan Docker Compose **2.24.4+**. Siapkan domain aplikasi dan storage, DNS ke server, port 80/443, Turnstile, serta `.env` produksi. Set `ENVIRONMENT=production`, `SITE_DOMAIN`, `STORAGE_DOMAIN`, `APP_ORIGIN=https://...`, `S3_PUBLIC_ENDPOINT=https://...`, `TURNSTILE_SECRET`, `TURNSTILE_HOSTNAME`, dan `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Pertahankan rahasia serta kunci enkripsi saat upgrade instalasi yang sudah memiliki data.

Pada server tujuan, setelah konfigurasi dan backup siap:

```sh
docker compose -f docker-compose.yml -f docker-compose.production.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build --wait
```

Override produksi memasang Caddy untuk HTTPS aplikasi dan storage, menyimpan sertifikat pada volume, mengaktifkan restart layanan, dan menutup port host PostgreSQL/Redis/MinIO/Grafana. Paket rekaman asli ikut dalam image backend. Migrator berjalan sebelum API; katalog frontend dibundel saat build.

Panduan lengkap untuk migrasi, backup/pemulihan, Cloudflare, monitoring, dan image GHCR: [Operasional produksi](docs/PRODUKSI.md). Domain, kredensial layanan produksi, rekaman dua pilihan yang masih kosong, dan peninjauan konten tetap perlu disiapkan sebelum peluncuran penuh. Repositori ini menyediakan konfigurasi deploy; belum terpasang pada server publik.
