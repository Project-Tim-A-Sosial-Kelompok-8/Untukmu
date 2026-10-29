# Konfigurasi produksi dan pemantauan

Untukmu berjalan sebagai dua proses biasa tanpa Docker: **API Go** (satu biner dengan penyimpanan berkas terenkripsi dan worker moderasi; database PostgreSQL Neon lewat `DATABASE_URL`, atau SQLite bila kosong) serta **frontend Next.js**. Caddy di depan keduanya menangani HTTPS. Konfigurasi tidak boleh dianggap sudah aktif hanya karena tersedia di repositori.

Panduan instalasi, pemakaian akun, admin, katalog/audio, struktur, dan perintah pengujian tersedia di [README utama](../README.md). Dokumen ini khusus untuk pemasangan, backup, pemulihan, dan pemantauan layanan.

## Pemasangan di server

Siapkan Go 1.26+, Node.js 22, dan [Caddy 2](https://caddyserver.com/docs/install) di server (Linux atau Windows). Dari akar proyek:

```sh
cd backend
go run ./cmd/untukmu init-env
go build -o untukmu ./cmd/untukmu
cd ..
npm ci
NEXT_PUBLIC_TURNSTILE_SITE_KEY=... npm run build
```

Isi `.env` produksi: `ENVIRONMENT=production`, `SITE_DOMAIN` (hostname tanpa skema), `APP_ORIGIN=https://SITE_DOMAIN`, `TURNSTILE_SECRET`, `TURNSTILE_HOSTNAME`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, serta `JWT_SECRET` dan `PUBLIC_CONTENT_KEY` acak dari `init-env`. API menolak mulai pada produksi tanpa HTTPS, Turnstile, atau `PUBLIC_CONTENT_KEY`. `DATABASE_PATH` dan `STORAGE_DIR` relatif terhadap folder `backend`; arahkan ke disk yang dibackup jika perlu.

Jalankan ketiga proses sebagai layanan sistem (systemd, NSSM di Windows, atau supervisor lain) dengan restart otomatis:

| Layanan  | Perintah (direktori kerja)                                          | Alamat           |
| -------- | ------------------------------------------------------------------- | ---------------- |
| API      | `./untukmu serve` (`backend/`)                                      | `127.0.0.1:8000` |
| Frontend | `npm start` (akar proyek, `API_INTERNAL_URL=http://127.0.0.1:8000`) | `127.0.0.1:3000` |
| Gateway  | `caddy run --config infra/Caddyfile.production` (akar proyek)       | port 80/443      |

Contoh unit systemd untuk API:

```ini
[Unit]
Description=Untukmu API
After=network.target

[Service]
WorkingDirectory=/srv/untukmu/backend
ExecStart=/srv/untukmu/backend/untukmu serve
Restart=on-failure
User=untukmu

[Install]
WantedBy=multi-user.target
```

Hanya Caddy yang membuka port publik. API dan frontend mendengarkan di `127.0.0.1`. Caddy membatasi body API 200 KB dan unggahan berkas bertanda tangan (`/api/v1/storage/upload`) 32 MB agar audio kurasi 30 MiB beserta formulir diterima. API hanya mempercayai `X-Forwarded-For` dari alamat di `TRUSTED_PROXIES` (bawaan loopback), sehingga pembatasan laju dan identitas pengunjung memakai IP klien asli.

API membuat dan memigrasikan skema (PostgreSQL atau SQLite) secara otomatis saat mulai, lalu menambahkan entri katalog doa baru tanpa menimpa kurasi yang sudah tersimpan. Rekaman doa bawaan tertanam di dalam biner. Satu proses API per database: cache, sesi doa, tantangan pemulihan, dan pembatasan laju disimpan di memori proses, sehingga restart mengharuskan sesi doa/pemulihan yang sedang berjalan dimulai ulang (sesi login tetap berlaku).

## TLS dan layanan Cloudflare

Pada Cloudflare, aktifkan DNS proxy untuk domain, TLS Full (strict), Managed WAF rules, dan rate rule untuk endpoint autentikasi/publik. Buat widget Turnstile pada hostname tersebut; isi `TURNSTILE_SECRET`, `TURNSTILE_HOSTNAME`, dan `NEXT_PUBLIC_TURNSTILE_SITE_KEY` saat build frontend. Server memeriksa hostname/action.

Cache CDN hanya untuk aset versioned `_next/static` dan visual yang bersifat publik. Bypass `/api/*`, halaman berbagi, profil/sesi, serta URL berkas bertanda tangan. API mengirim `Cache-Control: no-store`. Service worker hanya menyimpan aset statis dan halaman luring; tidak menyimpan pesan atau respons akun.

## Sentry dan Grafana

Isi `SENTRY_DSN` untuk mengaktifkan pelaporan kesalahan API. Setiap event dibangun ulang dari allowlist: tanpa request, user, breadcrumbs, nilai exception, SQL, maupun stack frame. Tanpa DSN, tidak ada pengiriman ke Sentry.

Untuk metrik, isi `METRICS_TOKEN` acak minimal 32 karakter (dibuat oleh `init-env`). Endpoint `/metrics` di API memerlukan header `Authorization: Bearer <token>` dan tidak diteruskan oleh Caddy. Pasang Prometheus dan Grafana secara native bila diperlukan: simpan token di berkas `credentials_file` pada `infra/monitoring/prometheus.yml`, jalankan `prometheus --config.file=infra/monitoring/prometheus.yml`, lalu provisioning Grafana dengan `infra/monitoring/grafana/*.yml` dan dashboard `untukmu.json`. Dashboard menampilkan laju permintaan, latensi p95, error server, dan status scrape. Metrik produk terpisah di panel admin `/admin`.

## Backup database, storage, dan konfigurasi

Untuk Neon, gunakan fitur point-in-time restore/branch dari Neon dan, bila perlu, `pg_dump` berkala dengan URL koneksi langsung (tanpa `-pooler`). Panduan SQLite di bawah berlaku bila `DATABASE_URL` kosong.

Backup harus mencakup tiga bagian dari instalasi yang sama: database (`DATABASE_URL` atau `DATABASE_PATH`), folder unggahan terenkripsi (`STORAGE_DIR`), dan `.env`. `PUBLIC_CONTENT_KEY` diperlukan untuk membaca pesan publik tersimpan. Backup server tidak menggantikan kata sandi/kode pemulihan yang dimiliki pengguna.

Database berjalan dalam mode WAL. Untuk salinan konsisten tanpa menghentikan API, gunakan perintah `VACUUM INTO` dari klien SQLite (misalnya `sqlite3`), lalu salin folder storage dan `.env`:

```sh
sqlite3 backend/var/untukmu.db "VACUUM INTO '.local-backups/untukmu-$(date +%Y%m%d-%H%M%S).db'"
tar -czf .local-backups/storage-$(date +%Y%m%d-%H%M%S).tar.gz -C backend/var storage
cp .env .local-backups/
```

Alternatif paling sederhana: hentikan layanan API, salin `untukmu.db` (beserta `-wal`/`-shm` bila ada) dan folder storage, lalu jalankan kembali. `.local-backups` diabaikan Git; salin backup ke penyimpanan terpisah dengan akses terbatas dan enkripsi yang dikelola operator. Contoh ini bukan pengaturan backup otomatis.

### Uji pemulihan pada target kosong

Uji di folder atau mesin terpisah, bukan dengan menimpa instalasi yang sedang digunakan:

1. Siapkan kode versi backup dan salinan `.env` yang cocok; sesuaikan origin/port tanpa mengganti `JWT_SECRET` atau `PUBLIC_CONTENT_KEY`.
2. Letakkan berkas database di `DATABASE_PATH` dan ekstrak arsip storage ke `STORAGE_DIR`.
3. Jalankan API; skema dinaikkan otomatis ke versi kode target. Jalankan frontend.
4. Periksa `/api/v1/health`, jumlah akun/pesan/objek, login, pembukaan pesan privat dengan kunci pemilik, lampiran, pesan publik, dan pratinjau rekaman.

Tetapkan retensi, jadwal backup, lokasi salinan terpisah, dan penanggung jawab pemulihan sebelum publikasi.

## Rilis dan upgrade

Workflow CI memeriksa format, lint, tes frontend, `go vet`/`go test`, build, dan tes browser terisolasi. Untuk upgrade: backup, tarik kode baru, `go build` ulang biner API, `npm ci && npm run build`, lalu restart layanan API dan frontend. Migrasi skema berjalan otomatis saat API mulai; API menolak database dengan versi skema yang lebih baru dari kodenya.

Audit independen perlu menguji akses antar akun, ciphertext, kunci pemulihan, pencabutan sesi/tautan, XSS/CSRF, storage, dependency dan konfigurasi edge. Tes lokal mendukung audit tersebut tanpa mengklaim seluruh risiko produksi telah teruji.
