# Pengujian

Pemeriksaan aktif berada di `.github/workflows/ci.yml`:

- TypeScript dan ESLint, tes kesamaan katalog JS/API dan keluaran visual, build Next.js.
- Ruff, pytest API, dan migrasi database termasuk pelestarian ciphertext/tulisan lama serta audio tim.
- Browser SQLite/fakeredis dan layanan produksi PostgreSQL/Redis/MinIO melalui Docker.
- Akses pengunjung, daftar/ganti/hapus akun, batas privasi, tautan terenkripsi, jadwal/kapsul waktu, pesan publik, moderasi, Peta Kenangan, sesi doa, pembentukan galaksi/bintang jatuh, kamera, PWA, serta navigasi responsif.

Hasil browser dan screenshot berada di `frontend/test-results`; HTML report berada di `frontend/playwright-report`. CI mengunggahnya sebagai artifact `verification`. Laporan historis untuk katalog astronomi dan formulir doa manual telah dilepas karena fitur tersebut sengaja dihapus.

Tes audio menggunakan fixture atau rekaman unggahan kurator. Tes tidak menjadikan materi agama yang belum ditinjau sebagai materi produksi yang disetujui.
