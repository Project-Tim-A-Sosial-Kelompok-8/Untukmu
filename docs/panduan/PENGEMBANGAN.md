# Pengembangan

Frontend berada di `frontend`, backend di `backend`. PRD tetap berada di `docs/referensi/PRD_Kelompok_8.docx`.

Matriks per bagian berada di `docs/prd/KESESUAIAN.md`, model/batas enkripsi di `docs/arsitektur/SISTEM.md`, dan konfigurasi layanan di `docs/operasional/PRODUKSI.md`.

## Frontend

Jalankan `npm ci` dari akar proyek. `npm run dev` menjalankan Next.js; API perlu aktif. `frontend/visual` memuat adegan kenangan dan kontrol produk. `frontend/scripts/build-visual.mjs` menggabungkannya dengan runtime React dan kripto produksi ke `frontend/public/visual`. Jangan mengedit keluaran build.

Tampilan memuat data akun melalui API. Tidak ada katalog astronomi atau data contoh lokal. Komponen akun/pesan berada di `frontend/src/features`; transport API di `frontend/src/lib/api`; enkripsi AES-256-GCM dan Argon2id di `frontend/src/lib/crypto`.

Sumber controller visual sudah memuat alur produk final dan memanggil renderer React secara langsung. Script enhance/port lama dihapus; build tidak lagi menyisipkan fitur melalui pencarian string. Katalog doa memiliki satu sumber di `backend/data/prayers-v1.json`.

## Backend

Gunakan Python 3.12. Buat virtual environment dalam `backend/.venv`, kemudian pasang `backend/requirements-dev.lock`. Migrasi dijalankan dari `backend` dengan `python -m alembic upgrade head`. Untuk pengembangan API, jalankan `python -m uvicorn app.main:app --reload` dari folder tersebut.

PostgreSQL, Redis, penyimpanan S3/MinIO, API, worker, frontend, dan gateway tersedia melalui Docker Compose. `infra/minio` mengunci versi sumber MinIO. Kredensial dan konfigurasi ada dalam `.env` lokal; jangan unggah ke Git.

## Perubahan data

Migrasi `0007_prd` mengubah klasifikasi doa tertulis lama menjadi pesan tanpa menyentuh isi, ciphertext, lampiran, atau tujuan. Audio unggahan tim tetap ada; hanya tiga kunci rekaman internet bawaan yang dinonaktifkan. Penghapusan akun mengikuti pilihan pengguna dan tidak membuka pesan privat ke publik.

Migrasi `0008_schedule_and_sharing` menambahkan jadwal dan envelope berbagi terenkripsi serta mencabut tautan unlisted lama. Pemilik mengenkripsi ulang isi unlisted lama di perangkat saat masuk. Migrasi `0009_prayer_sources` melengkapi referensi tanpa menimpa kurasi tim. Migrasi `0010_original_recordings` menambahkan lima pilihan yang memakai empat rekaman asli berlisensi. Paket audio, checksum, bahasa dan atribusi berada di `backend/data/prayer-audio`; pengunduhan ulang memakai `python scripts/fetch_prayer_recordings.py` dari akar repositori. Jalankan migrasi dan rebuild container sebelum memakai kode baru.

## Pengujian

Lint TypeScript/ESLint: `npm run lint`. Tes katalog/build: `npm test`. Build: `npm run build`. Dari `backend`, jalankan `python -m ruff check app tests alembic` dan `python -m pytest -q`.

`node scripts/test-browser-local.mjs` menggunakan SQLite/fakeredis dan akun sementara tanpa mengubah database aplikasi. Script otomatis memakai `backend/.venv` jika tersedia; variabel `UNTUKMU_TEST_PYTHON` dapat menunjuk Python lain. Pada Windows, Playwright memakai Edge yang terpasang jika Chromium bundel belum tersedia; `PLAYWRIGHT_CHROMIUM_EXECUTABLE` dapat menunjuk browser lain. `npm run test:e2e` memeriksa layanan produksi yang sedang berjalan.

CI menjalankan seluruh pemeriksaan tersebut, migrasi PostgreSQL, build Docker, serta browser SQLite dan produksi. Screenshot dan laporan disimpan di folder `test-results` yang diabaikan Git.

## Doa dan admin

Jalankan `python -m scripts.make_admin email@example.com` dari `backend` untuk akun kurator yang sudah terdaftar. Panel `/admin` menyediakan moderasi dan unggahan audio. Teks/audio agama harus ditinjau sebelum disetujui; tersedia hening umum saat materi belum siap. Detail berada di `docs/konten-doa/SUMBER.md`.

Jelajah hanya menampilkan pesan publik yang disetujui dan sudah dibuka. Pesan publik baru berstatus pending sampai moderator meninjaunya di `/admin`; worker tidak menyetujui otomatis. Pemilik dapat melihat status serta memakai filter mood/tag pada Ruang Pribadi, termasuk tombol **Cari di pesan saya** dari Jelajah. Penyamaan metadata berada di `backend/app/message_metadata.py` dan `frontend/src/lib/messages`; query PostgreSQL/SQLite juga mencocokkan penulisan lama dengan tanda #, spasi tepi, huruf besar, atau alias mood Inggris.

Untuk memberi doa, tekan **Doakan** pada ucapan Jelajah, pilih agama/tradisi dan jenis doa, lalu **Dengarkan dan kirim doa**. Sesi hanya dicatat setelah audio selesai; tersedia konfirmasi dan penanda pada galaksi. Tombol empati/doa tidak ditampilkan pada pesan privat, pending, atau yang belum dibuka. Galaksi publik bersama memuat daftar ucapan publik melalui loader yang sama dengan bintangnya.
