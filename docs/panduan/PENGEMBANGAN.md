# Pengembangan

Frontend berada di `frontend`, backend di `backend`. PRD tetap berada di `docs/referensi/PRD_Kelompok_8.docx`.

## Frontend

Jalankan `npm ci` dari akar proyek. `npm run dev` menjalankan Next.js; API perlu aktif. `frontend/visual` memuat adegan kenangan dan kontrol produk. `frontend/scripts/build-visual.mjs` menggabungkannya dengan runtime React dan kripto produksi ke `frontend/public/visual`. Jangan mengedit keluaran build.

Tampilan memuat data akun melalui API. Tidak ada katalog astronomi atau data contoh lokal. Komponen akun/pesan berada di `frontend/src/features`; transport API di `frontend/src/lib/api`; enkripsi AES-256-GCM dan Argon2id di `frontend/src/lib/crypto`.

## Backend

Gunakan Python 3.12. Buat virtual environment dalam `backend/.venv`, kemudian pasang `backend/requirements-dev.lock`. Migrasi dijalankan dari `backend` dengan `python -m alembic upgrade head`. Untuk pengembangan API, jalankan `python -m uvicorn app.main:app --reload` dari folder tersebut.

PostgreSQL, Redis, penyimpanan S3/MinIO, API, worker, frontend, dan gateway tersedia melalui Docker Compose. `infra/minio` mengunci versi sumber MinIO. Kredensial dan konfigurasi ada dalam `.env` lokal; jangan unggah ke Git.

## Perubahan data

Migrasi `0007_prd` mengubah klasifikasi doa tertulis lama menjadi pesan tanpa menyentuh isi, ciphertext, lampiran, atau tujuan. Audio unggahan tim tetap ada; hanya tiga kunci rekaman internet bawaan yang dinonaktifkan. Penghapusan akun mengikuti pilihan pengguna dan tidak membuka pesan privat ke publik.

## Pengujian

Lint TypeScript/ESLint: `npm run lint`. Tes katalog/build: `npm test`. Build: `npm run build`. Dari `backend`, jalankan `python -m ruff check app tests alembic` dan `python -m pytest -q`.

`node scripts/test-browser-local.mjs` menggunakan SQLite/fakeredis dan akun sementara tanpa mengubah database aplikasi. Variabel `UNTUKMU_TEST_PYTHON` dapat menunjuk Python virtual environment; `PLAYWRIGHT_CHROMIUM_EXECUTABLE` dapat menunjuk browser lokal. `npm run test:e2e` memeriksa layanan produksi yang sedang berjalan.

CI menjalankan seluruh pemeriksaan tersebut, migrasi PostgreSQL, build Docker, serta browser SQLite dan produksi. Screenshot dan laporan disimpan di folder `test-results` yang diabaikan Git.

## Doa dan admin

Jalankan `python -m scripts.make_admin email@example.com` dari `backend` untuk akun kurator yang sudah terdaftar. Panel `/admin` menyediakan moderasi dan unggahan audio. Teks/audio agama harus ditinjau sebelum disetujui; tersedia hening umum saat materi belum siap. Detail berada di `docs/konten-doa/SUMBER.md`.
