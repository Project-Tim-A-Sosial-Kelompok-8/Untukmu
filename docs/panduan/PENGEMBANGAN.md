# Panduan pengembangan

Panduan ini untuk mengubah kode atau menjalankan layanan satu per satu. Untuk sekadar memakai aplikasi, ikuti [README utama](../../README.md).

## Siapkan alat dan layanan

Gunakan Node.js 22 atau lebih baru yang kompatibel dengan `package-lock.json`, Python 3.12, serta Docker Compose v2. Dari folder utama proyek:

```sh
python scripts/init_env.py
docker compose up -d postgres redis minio
npm ci
python -m venv .venv
```

Jika `.env` sudah ada, lewati generator. Aktifkan virtual environment:

```powershell
# Windows PowerShell, dari folder utama
.\.venv\Scripts\Activate.ps1
pip install -r apps/api/requirements-dev.lock
Copy-Item -LiteralPath .env -Destination apps/api/.env
```

Untuk Linux/macOS:

```sh
source .venv/bin/activate
pip install -r apps/api/requirements-dev.lock
cp .env apps/api/.env
```

Salinan `.env` pada API dipakai saat perintah dijalankan dari `apps/api`. Jika konfigurasi utama berubah, sesuaikan salinan ini juga.

## Jalankan tiga terminal

**Terminal pertama:** aktifkan virtual environment, masuk ke `apps/api`, lalu jalankan:

```sh
alembic upgrade head
python -m scripts.init_storage
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Migrasi menyiapkan seluruh versi skema, termasuk `0005_written_prayers` yang memisahkan pesan dan doa tertulis. Selalu jalankan migrasi sebelum API baru menggunakan database lama.

**Terminal kedua:** aktifkan virtual environment, masuk ke `apps/api`, lalu jalankan:

```sh
python -m app.worker
```

Worker memeriksa tulisan publik/tautan terbatas dan menyiapkan antrean moderasi. Persetujuan tetap dilakukan admin.

**Terminal ketiga:** dari folder utama, jalankan:

```sh
npm run dev
```

Buka http://localhost:3000. Frontend meneruskan permintaan API ke `http://127.0.0.1:8000` secara bawaan. Jika alamat API berbeda, setel `API_INTERNAL_URL` pada lingkungan proses frontend.

Untuk menjalankan frontend hasil build:

```sh
npm run build
npm run start --workspace apps/web
```

Untuk mengaktifkan admin tanpa container, dari `apps/api` jalankan `python -m scripts.make_admin emailanda@example.com`, lalu masuk ulang. Akunnya harus sudah terdaftar.

## Variabel konfigurasi

Gunakan [.env.example](../../.env.example) sebagai daftar konfigurasi. Generator membuat nilai acak lokal dan tidak menimpa `.env` yang sudah ada.

| Variabel | Kegunaan |
| --- | --- |
| `ENVIRONMENT`, `APP_ORIGIN` | Mode aplikasi dan alamat website yang diizinkan. |
| `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PASSWORD` | Akun dan database PostgreSQL pada Compose. |
| `DATABASE_URL`, `REDIS_URL` | Koneksi database dan Redis. Compose mengganti host menjadi nama layanan container. |
| `JWT_SECRET` | Kunci autentikasi server; gunakan nilai acak minimal 32 karakter. |
| `PUBLIC_CONTENT_KEY` | Kunci server untuk menyimpan isi publik/tautan terbatas; 32 byte dalam base64url. Cadangkan bersama konfigurasi server. |
| `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT` | Alamat penyimpanan dari server dan browser. Alamat browser harus dapat dijangkau pengguna. |
| `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Wilayah, bucket, dan kredensial penyimpanan berkas. |
| `TURNSTILE_SECRET`, `TURNSTILE_HOSTNAME` | Verifikasi pengunjung pada server. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Site key Turnstile yang ditampilkan frontend. |
| `API_INTERNAL_URL` | Alamat API yang dipakai frontend saat dijalankan di luar gateway Compose. |

`S3_PUBLIC_ENDPOINT` dan `NEXT_PUBLIC_TURNSTILE_SITE_KEY` digunakan saat membangun frontend. Bangun ulang jika nilainya berubah. Jangan memasukkan `.env`, kata sandi, atau kunci server ke Git.

## Bagaimana sistem bekerja

Browser membuka halaman Next.js. Tampilan galaksi berada dalam iframe pada origin yang sama, dan React menangani akun, formulir tambahan, serta koneksi API. Data disimpan oleh FastAPI pada PostgreSQL; Redis membantu pembatasan permintaan dan pekerjaan latar. MinIO/S3 menyimpan foto, lampiran, serta audio unggahan.

Sumber engine ada di `apps/web/legacy`. Proses `prepare:engine` menyalin aset, menyesuaikan controller lama, dan membundel kode React ke `apps/web/public/engine`. Folder hasil tersebut dibuat ulang pada `dev` dan `build`; perubahan langsung di sana akan tertimpa.

React Three Fiber menjalankan frame engine dan memakai kamera yang sesuai untuk mode galaksi, peta, atau tata surya. Formulir layar penuh menghentikan animasi latar sementara. Bentuk dan material galaksi harus tetap cocok dengan engine; adegan galaksi tidak memiliki lampu biasa, sehingga material yang memerlukan pencahayaan dapat terlihat hitam.

| Yang ingin diubah | Sumber yang dikerjakan |
| --- | --- |
| Halaman Next.js dan kebijakan privasi | `apps/web/src/app` |
| Akun, pemulihan, dan ekspor | `apps/web/src/features/account` |
| Doa tertulis dan kurasi audio | `apps/web/src/features/prayers` |
| Moderasi, laporan, dan pemblokiran | `apps/web/src/features/social` |
| Edit, hapus, dan berbagi tulisan | `apps/web/src/features/messages` |
| Alur layar engine dan galaksi | `apps/web/legacy/untukmu/js`, `apps/web/scripts` |
| Tampilan responsif | [CSS engine](../../apps/web/legacy/untukmu/untukmu.css), [CSS halaman](../../apps/web/src/app/globals.css) |
| Koneksi API dan kripto pada browser | `apps/web/src/lib`, `apps/web/src/runtime` |
| Endpoint dan model database | `apps/api/app` |
| Perubahan skema | `apps/api/alembic/versions` |
| Katalog dan rekaman doa | `apps/api/data` |

Kode layar digunakan bersama oleh mobile dan desktop; penyesuaian ukuran mengikuti CSS responsif. Panduan dan gambar masing-masing perangkat dipisahkan dalam [folder UI/UX](../ui-ux/README.md), agar perubahan perilaku tidak perlu digandakan.

Jangan membuka `apps/web/legacy/index.html` dengan Live Server sebagai aplikasi versi sekarang. Itu masih sumber engine dan tidak memuat integrasi API hasil build. Data contoh serta penyimpanan IndexedDB prototipe tidak digunakan sebagai data produksi.

## Data, privasi, dan hitungan

Tulisan privat dienkripsi di browser dengan AES-GCM; API menyimpan ciphertext. Foto dan lampiran juga dienkripsi. Kunci enkripsi berada di memori browser, sehingga pengguna perlu membuka kunci lagi setelah reload. Metadata seperti tujuan, tanggal, suasana, dan tag tetap terlihat layanan.

Isi publik anonim/tautan terbatas dapat diperiksa moderator. Server menyimpannya dengan kunci khusus `PUBLIC_CONTENT_KEY`. Tautan terbatas memerlukan token dan persetujuan; tautan tidak masuk Jelajah. Mengedit isi publik memerlukan tinjauan ulang.

Jenis tulisan disimpan sebagai `entry_type`: `message` untuk pesan dan `prayer` untuk doa tertulis. Tag tidak menentukan jenis tulisan baru. Ringkasan akun, label galaksi, dan kartu galaksi memakai jenis yang sama. Sesi audio/hening dicatat terpisah setelah selesai; pencatatan ulang memakai batas unik agar jumlah tidak berlipat.

Admin dibuat dengan menaikkan peran akun yang sudah terdaftar. Panel admin saat ini berisi moderasi dan kurasi, belum memiliki daftar seluruh pengguna.

Pemulihan akun memakai kode pemulihan untuk membuka kembali kunci; sesi lama dicabut. Ekspor menghasilkan paket terenkripsi dengan kata sandi ekspor terpisah. Ekspor besar masih memakai memori browser. Service worker menyimpan aset publik tertentu, bukan API, token, hasil dekripsi, atau tulisan privat; aplikasi tidak menyediakan pembacaan privat saat luring.

## Dokumen dan hasil otomatis

Panduan berada di `docs/panduan`; PRD dan instruksi awal berada di `docs/referensi`. Instruksi awal adalah konteks sumber; perilaku yang sudah direvisi mengikuti README dan panduan versi sekarang.

Gambar UI berada di `docs/ui-ux/mobile` dan `docs/ui-ux/desktop`. Tes menyimpan laporan JSON di `docs/pengujian/hasil` dan memperbarui gambar pada folder perangkat terkait. [Panduan pengujian](../pengujian/README.md) menjelaskan perintahnya.

`docs/api/openapi.json` dan `docs/api/migration-postgresql.sql` adalah salinan referensi, bukan sumber konfigurasi aplikasi. Dokumentasi API yang sedang berjalan dapat dibuka pada `/docs`; migrasi tetap dijalankan dengan Alembic.

`python scripts/verify_original.py --archive-only --if-present` memeriksa arsip sumber bila tersedia. ZIP awal opsional berada di `docs/referensi/Untukmu-asli.zip` dan tidak disertakan pada checkout ini. Manifest SHA-256 menyimpan catatan sumber awal; salinan kerja sudah sengaja direvisi. `scripts/package_release.py` membuat paket sumber dan menulis manifest paket baru ke `docs/referensi/release-manifest.json`.

## Sebelum dipasang pada server publik

Gunakan `ENVIRONMENT=production`, HTTPS untuk `APP_ORIGIN` serta endpoint storage publik, kunci server unik, kredensial storage, dan konfigurasi Turnstile yang lengkap. Sesuaikan [contoh Caddy produksi](../../infra/Caddyfile.production.example); file tersebut masih contoh, bukan konfigurasi produksi siap pakai. API sebaiknya diakses melalui gateway.

Uji migrasi, unggah/unduh, CORS, pencadangan, serta pemulihan dengan PostgreSQL/Redis/MinIO yang akan digunakan. Cadangkan database, object storage, dan kunci konten publik. Menghapus tulisan/tujuan belum membersihkan semua berkas yang tidak lagi direferensikan di bucket.

Kurator perlu memeriksa teks, terjemahan, audio, dan hak penggunaan sebelum mengaktifkan entri agama. Baca [sumber doa](../konten-doa/SUMBER.md) dan [catatan lisensi engine](../lisensi/CATATAN.md). Pemeriksaan perangkat fisik, pembaca layar, dan audit keamanan independen belum dicakup seluruh tes lokal.

## Bekerja bersama tim

Gunakan branch dengan nama `<jenis>/<nama>/<pekerjaan>`, misalnya `fix/adit/filter-jelajah` atau `docs/tarisa/panduan-pakai`. Tulis perubahan yang jelas, jalankan pemeriksaan yang sesuai, lalu ajukan PR dengan hasil tes. Panduan ini tidak menjalankan commit, push, atau publikasi secara otomatis.
