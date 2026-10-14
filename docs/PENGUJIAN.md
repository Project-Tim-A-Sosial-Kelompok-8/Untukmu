# Pengujian

Pemeriksaan aktif berada di `.github/workflows/ci.yml`:

- Prettier, TypeScript dan ESLint, tes kesamaan katalog JS/API dan keluaran visual, build Next.js.
- Ruff lint/format, pytest API, dan migrasi database termasuk pelestarian ciphertext/tulisan lama serta audio tim.
- Browser SQLite/fakeredis dan layanan produksi PostgreSQL/Redis/MinIO melalui Docker.
- Akses pengunjung, daftar/ganti/hapus akun, batas privasi, tautan terenkripsi, jadwal/kapsul waktu, pesan publik, moderasi, Peta Kenangan, sesi doa, pembentukan galaksi/bintang jatuh, kamera, PWA, serta navigasi responsif.

Hasil browser dan screenshot berada di `frontend/test-results`; HTML report berada di `frontend/playwright-report`. CI mengunggahnya sebagai artifact `verification`. Laporan historis untuk katalog astronomi dan formulir doa manual telah dilepas karena fitur tersebut sengaja dihapus.

Tes audio menggunakan fixture atau rekaman unggahan kurator. Tes tidak menjadikan materi agama yang belum ditinjau sebagai materi produksi yang disetujui.

Tes admin memastikan durasi rekaman asli dibaca oleh browser, file rusak ditolak, dan pratinjau lokal dibersihkan saat memilih entri lain. Tes API memastikan admin dapat mendengarkan unggahan draf, pengunjung hanya dapat mendengarkan unggahan yang telah disetujui, dan pratinjau tidak membuat sesi atau mencatat doa. Fixture tujuan pada `frontend/tests/e2e/fixtures` hanya mengganti respons baca untuk pemeriksaan UI; tidak ditulis ke database aplikasi.
