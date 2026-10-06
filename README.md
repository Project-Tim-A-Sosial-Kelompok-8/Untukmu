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

- Setiap masuk atau memuat ulang aplikasi, pengguna memilih Masuk atau Daftar akun. Kata sandi dan kunci pesan asli tidak dikirim ke server.
- Tulis pesan untuk satu atau beberapa orang/kenangan, pilih bentuk dan warna visual, lalu tentukan privasi. Foto dan lampiran pengguna tetap terenkripsi.
- Rumah menampilkan kenangan pengguna dan galaksi publik. Galaksi publik memuat 100 pesan terbaru yang disetujui; Jelajah menyediakan halaman berikutnya dan filter. Pesan privat, tulisan yang belum disetujui, dan pengirim yang diblokir tidak masuk tampilan publik.
- Tampilan awal mempertahankan Milky Way dan tujuh galaksi bawaan tanpa label astronomi. Peta Kenangan mempertahankan latar dan kontrol sebelumnya, dengan bintang berwarna dari data aplikasi. Arahkan kursor untuk nama dan jumlah pesan/doa; klik untuk mengunjungi kenangan.
- Doa memakai pilihan Islam, Kristen, Katolik, Hindu, Buddha, Konghucu, dan Umum. Pilih pesan publik, tradisi, dan jenis doa. Dukungan tercatat setelah audio atau sesi hening selesai, satu kali per orang per pesan.
- Ruang Pribadi menampilkan pesan, kenangan, dan dukungan doa yang diterima/diberikan. Doa tertulis lama tetap disimpan sebagai pesan; formulir doa manual telah dilepas.
- Pengaturan menyediakan Ganti akun tanpa menghapus akun lama, pengelolaan sesi, ekspor, pemulihan, dan Hapus akun dengan pilihan mempertahankan atau menghapus tulisan. Tulisan publik yang dipertahankan tetap anonim; tulisan privat tetap terenkripsi dan tidak menjadi publik.

Audio agama asli belum disertakan dalam checkout ini. Tiga rekaman internet tambahan telah dilepas. Katalog JS bawaan tetap digunakan; kurator dapat mengunggah audio tim dan meninjau teks sebelum mengaktifkannya. Hening pada pilihan Umum tersedia. Baca [pengelolaan doa](docs/konten-doa/SUMBER.md).

## Folder

| Folder | Isi |
| --- | --- |
| `frontend/src` | Halaman, komponen React, API client, dan kripto browser |
| `frontend/visual` | Adegan kenangan, peta, katalog doa JS, CSS, dan vendor yang digunakan |
| `frontend/scripts` | Build visual dan integrasi tampilan React |
| `frontend/tests` | Pengujian frontend dan browser |
| `backend/app` | API FastAPI dan worker |
| `backend/alembic` | Migrasi database |
| `backend/data` | Katalog doa untuk API |
| `backend/tests` | Pengujian API dan migrasi |
| `infra` | Gateway dan build MinIO |
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
