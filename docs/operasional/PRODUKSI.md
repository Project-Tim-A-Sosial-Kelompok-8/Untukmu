# Konfigurasi produksi dan pemantauan

Lingkungan pengembangan memakai Compose dan localhost. Produksi memerlukan domain serta layanan operator; konfigurasi tidak boleh dianggap sudah aktif hanya karena tersedia di repositori.

## TLS dan layanan Cloudflare

Gunakan `ENVIRONMENT=production`, `APP_ORIGIN=https://domain-operator`, `S3_PUBLIC_ENDPOINT=https://storage-domain`, kunci acak JWT/PUBLIC_CONTENT_KEY, dan kredensial storage. Pasang `infra/Caddyfile.production.example` sebagai Caddyfile, set `SITE_DOMAIN`, dan publikasikan port 80/443 gateway. API/worker/database/Redis tetap di jaringan internal. Kredensial production disimpan pada secret store operator.

Pada Cloudflare, aktifkan DNS proxy untuk domain, TLS Full (strict), Managed WAF rules, dan rate rule untuk endpoint autentikasi/publik. Buat widget Turnstile pada hostname tersebut; isi `TURNSTILE_SECRET`, `TURNSTILE_HOSTNAME`, dan `NEXT_PUBLIC_TURNSTILE_SITE_KEY` saat build frontend. Server memeriksa hostname/action; produksi menolak konfigurasi tanpa Turnstile atau HTTPS.

Cache CDN hanya untuk aset versioned `_next/static` dan visual yang bersifat publik. Bypass `/api/*`, halaman berbagi, profil/sesi, serta URL unggah bertanda tangan. API mengirim `Cache-Control: no-store`. Service worker hanya menyimpan aset statis dan halaman luring; tidak menyimpan pesan atau respons akun.

## Sentry dan Grafana

Isi `SENTRY_DSN` untuk mengaktifkan pelaporan kesalahan API. Allowlist laporan membuang request, user, breadcrumbs, nilai exception, SQL dan variabel lokal. Tidak ada session replay atau pengiriman isi pesan. Tanpa DSN, tidak ada pengiriman ke Sentry.

Untuk Grafana, isi `METRICS_TOKEN` acak minimal 32 karakter dan `GRAFANA_ADMIN_PASSWORD` minimal 12 karakter pada `.env`, lalu jalankan:

```sh
docker compose --profile monitoring up -d --build --wait
```

Generator `scripts/init_env.py` membuat kedua rahasia pada checkout baru. Pada `.env` lama, tambahkan nilai tersebut tanpa mengganti rahasia yang sudah dipakai. Jangan menyalin nilai contoh atau membagikannya ke Git. Profile gagal mulai jika token/kata sandi belum diisi. Grafana tersedia di `http://localhost:3001`, login `admin`; dashboard operasional dan datasource terpasang otomatis. Prometheus tidak membuka port host dan mengambil `/metrics` dengan token melalui jaringan internal. Endpoint tersebut tidak diteruskan gateway.

Dashboard menampilkan laju permintaan, latensi p95, error server, dan status scrape. Konfigurasikan alert API down/error berkepanjangan melalui Grafana pada lingkungan operator. Metrik produk terpisah di panel admin `/admin`: jumlah pengguna/pesan, dukungan doa, retensi, laporan tertangani.

## Rilis dan pemulihan

Workflow CI memeriksa kode, migrasi, Docker dan browser. Workflow `release.yml` dipicu manual pada environment `production`, menguji kode, membangun dan menerbitkan image bertag commit ke GHCR. Set variabel environment `S3_PUBLIC_ENDPOINT` dan `NEXT_PUBLIC_TURNSTILE_SITE_KEY` sebelum menjalankannya untuk produksi. Jika alamat storage belum diisi, build memakai nilai pengembangan Dockerfile `http://localhost:9000` agar tidak menerima URL kosong; image tersebut harus dibangun ulang dengan alamat HTTPS dan site key yang sesuai sebelum pemasangan produksi. Pemasangan image ke server dan persetujuan environment dikelola operator; tidak ada remote deployment tanpa target server.

Environment `production` harus tersedia di Settings → Environments repository GitHub. Jika ekstensi GitHub Actions menampilkan `Environment production not found`, periksa environment tersebut dan muat ulang jendela editor setelah konfigurasi tersedia. Pembuatan environment saja belum menetapkan reviewer atau mengisi variabel produksi; operator mengatur keduanya sebelum rilis produksi.

Jalankan migrasi Alembic sebelum mengganti API. Migrasi 0008 mempertahankan isi lama dan mencabut tautan unlisted lama; masuk pemilik mengenkripsi ulang di perangkat. Migrasi 0009 melengkapi sumber/pratinjau doa tanpa menimpa materi yang telah dikurasi. Migrasi 0010 menambahkan lima pilihan rekaman asli dari paket `backend/data/prayer-audio` tanpa menimpa kurasi yang sudah tersimpan. Image backend harus memuat paket tersebut; rebuild API, worker, migrator dan web agar katalog serta pemutar memakai versi yang sama. Simpan cadangan PostgreSQL dan storage terenkripsi beserta rahasia layanan pada penyimpanan yang dilindungi, uji pemulihan, dan tetapkan retensi/kontak pengelola sebelum publikasi. Kunci perangkat tidak dapat diganti cadangan server.

Audit independen perlu menguji akses antar akun, ciphertext, kunci pemulihan, pencabutan sesi/tautan, XSS/CSRF, storage, dependency dan konfigurasi edge. Tes lokal mendukung audit tersebut tanpa mengklaim seluruh risiko produksi telah teruji.
