# Build MinIO untuk Compose

Dockerfile ini membangun sumber resmi MinIO yang sama dengan rilis pada konfigurasi awal. Image publik Quay untuk rilis tersebut menolak pull anonim pada CI tanggal 5 Oktober 2026.

- Rilis: `RELEASE.2025-04-22T22-12-26Z`.
- Commit: `0d7408fc9969caf07de6a8c3a84f9fbb10a6739e`.
- Sumber: <https://github.com/minio/minio/tree/0d7408fc9969caf07de6a8c3a84f9fbb10a6739e>.
- Arsip: <https://codeload.github.com/minio/minio/tar.gz/0d7408fc9969caf07de6a8c3a84f9fbb10a6739e>.
- SHA-256 arsip: `7eb30a913fea30f18069abf194e1e78e4983b558cc526911ae1c11396a9859a5`.

Build memeriksa checksum arsip serta modul Go. Binary, LICENSE, dan CREDITS masuk image hasil build; sumber MinIO tidak dimodifikasi. Versi binary, protokol S3, port, konfigurasi lingkungan, dan volume `/data` tetap memakai rilis awal. Dokumentasi sumber resmi tersedia pada <https://github.com/minio/minio>.

Jalankan dari akar repository:

```sh
docker compose build minio
```

Build pertama memerlukan unduhan toolchain image dan modul Go. Seluruh pemeriksaan CI tetap dijalankan; startup Compose ditempatkan sebelum dua rangkaian browser agar kegagalan build atau layanan segera terlihat.
