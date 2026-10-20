# Untukmu

Website untuk menyimpan pesan dan kenangan dalam galaksi, membaca pesan publik anonim, serta memberi empati dan dukungan melalui rekaman doa terkurasi. Acuan produk asli: [PRD Kelompok 8](docs/PRD.docx).

Panduan penggunaan, konfigurasi lokal, pengembangan, dan katalog disatukan di README ini. Panduan operator berada di [Operasional produksi](docs/PRODUKSI.md); atribusi tetap berada di [pemberitahuan pihak ketiga](THIRD-PARTY-NOTICES.md).

## Daftar isi

- [Teknologi](#teknologi)
- [Menjalankan secara lokal](#menjalankan-secara-lokal)
- [Fitur dan privasi pesan](#fitur-dan-privasi-pesan)
- [Tombol Berikan empati](#tombol-berikan-empati)
- [Doa dan kurasi audio](#doa-dan-kurasi-audio)
- [Panel admin](#panel-admin)
- [Struktur proyek](#struktur-proyek)
- [Arsitektur dan keamanan data](#arsitektur-dan-keamanan-data)
- [Pengembangan tanpa Docker untuk kode aplikasi](#pengembangan-tanpa-docker-untuk-kode-aplikasi)
- [Format dan pengujian](#format-dan-pengujian)
- [Persiapan deploy dan backup](#persiapan-deploy-dan-backup)

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

### 1. Siapkan perangkat dan proyek

- Pasang **Docker Desktop** dan jalankan sampai engine siap. Pada Windows, gunakan WSL 2 dan mode **Linux containers**.
- Pasang **Python 3.12** untuk membuat konfigurasi lokal. Pada Windows, aktifkan opsi penambahan Python ke `PATH` saat instalasi.
- Unduh/clone repositori ini, lalu buka terminal pada folder yang berisi `docker-compose.yml`, `README.md`, dan `.env.example`.
- Siapkan koneksi internet untuk mengunduh image dan dependensi saat build pertama. Pastikan port `3000`, `5432`, `6379`, `9000`, dan `9001` belum dipakai aplikasi lain.

Untuk menjalankan seluruh aplikasi melalui Docker, **tidak perlu memasang PostgreSQL, Redis, MinIO, Node.js, atau dependensi backend secara terpisah**. Node.js hanya diperlukan jika ingin mengembangkan frontend di luar Docker.

Periksa dari terminal yang sama:

```sh
docker version
docker compose version
python --version
```

Gunakan Docker Compose **2.24.4 atau lebih baru**. `docker version` harus menampilkan bagian Client dan Server. Di PowerShell, contoh masuk ke folder proyek:

```powershell
Set-Location D:\Project\Untukmu-Git
```

Sesuaikan alamat folder tersebut dengan lokasi hasil unduhan Anda.

### 2. Buat `.env` dan password PostgreSQL

Jalankan dari akar proyek:

```sh
python scripts/init_env.py
```

Jika perintah `python` tidak tersedia di Windows tetapi Python Launcher sudah terpasang, gunakan `py -3.12 scripts/init_env.py`.

Script membuat file **`.env` di akar proyek**, menghasilkan password/kunci acak, dan menyamakan password PostgreSQL dengan `DATABASE_URL`. Anda **tidak memerlukan password PostgreSQL yang sudah ada di komputer**: container PostgreSQL baru akan memakai password buatan script tersebut. Setiap orang yang mencoba proyek membuat `.env` miliknya sendiri. `.env.example` hanya template; menyalinnya tanpa mengganti `CHANGE_ME` belum menghasilkan konfigurasi yang siap dipakai.

Buka `.env` menggunakan editor lokal jika perlu melihat kredensial. Jangan unggah file ini ke Git atau membagikannya dalam tangkapan layar. Peran setiap nilai utama:

| Variabel                                        | Fungsi dan cara mengisinya                                                                                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_USER`                                 | User database; default `untukmu`. Bukan surel akun aplikasi.                                                                                                                 |
| `POSTGRES_DB`                                   | Nama database; default `untukmu`.                                                                                                                                            |
| `POSTGRES_PASSWORD`                             | Password user PostgreSQL di atas, dibuat acak oleh script. Pakai nilai ini ketika login dari pgAdmin.                                                                        |
| `DATABASE_URL`                                  | Koneksi API yang dijalankan langsung di komputer: `postgresql+asyncpg://USER:PASSWORD@localhost:5432/DATABASE`. User, password, dan database harus sama dengan `POSTGRES_*`. |
| `JWT_SECRET`, `PUBLIC_CONTENT_KEY`              | Kunci sesi dan penyimpanan pesan publik; dibuat otomatis. Simpan bersama backup `.env` untuk instalasi yang sama.                                                            |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY`                | Kredensial MinIO lokal; dibuat otomatis. Keduanya juga dipakai untuk konsol MinIO.                                                                                           |
| `APP_ORIGIN`, `S3_PUBLIC_ENDPOINT`              | Alamat browser lokal; biarkan nilai `localhost` bawaan untuk panduan ini.                                                                                                    |
| `TURNSTILE_*`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Boleh kosong untuk pengujian lokal dengan `ENVIRONMENT=development`; konfigurasi produksi dijelaskan di bawah.                                                               |

Konfigurasi lain pada template:

| Variabel                                  | Nilai lokal / kegunaan                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `ENVIRONMENT`                             | `development` untuk lokal; produksi menggunakan `production` dan pemeriksaan HTTPS/Turnstile yang lebih ketat.      |
| `REDIS_URL`                               | `redis://localhost:6379/0` untuk API di host; Compose menggantinya dengan host internal `redis`.                    |
| `S3_ENDPOINT`                             | `http://localhost:9000` untuk API di host; Compose menggantinya dengan `http://minio:9000`.                         |
| `S3_PUBLIC_ENDPOINT`                      | Alamat storage yang dapat diakses browser, lokal `http://localhost:9000`; berbeda dari endpoint internal container. |
| `S3_REGION`, `S3_BUCKET`                  | Lokal `us-east-1` dan `untukmu-private`; bucket disiapkan oleh layanan `init-storage`.                              |
| `API_INTERNAL_URL`                        | Tujuan proxy API frontend; bawaan host `http://127.0.0.1:8000`, sedangkan image Docker memakai `http://api:8000`.   |
| `SENTRY_DSN`                              | Kosong bila pelaporan kesalahan eksternal tidak digunakan.                                                          |
| `METRICS_TOKEN`, `GRAFANA_ADMIN_PASSWORD` | Dibuat generator; dipakai saat profile monitoring diaktifkan. Tidak diperlukan untuk login akun aplikasi.           |
| `SITE_DOMAIN`, `STORAGE_DOMAIN`           | Kosong untuk lokal; hostname tanpa skema untuk konfigurasi Caddy produksi.                                          |

Dalam Docker Compose, `DATABASE_URL` diganti otomatis menjadi koneksi ke host internal `postgres`, memakai `POSTGRES_USER`, `POSTGRES_PASSWORD`, dan `POSTGRES_DB` dari `.env`. Sementara itu, nilai `DATABASE_URL` dalam file tetap memakai `localhost` agar cocok saat backend dijalankan langsung di komputer. Pertahankan password acak hasil script agar aman digunakan dalam kedua bentuk koneksi tersebut.

Jika muncul **`.env sudah ada; tidak diubah.`**, script sengaja mempertahankan konfigurasi lama. Lanjutkan jika `.env` itu berasal dari generator dan masih sesuai dengan database. Jangan membuat ulang kunci atau mengganti password sembarangan pada instalasi yang sudah memiliki data; lihat pemecahan masalah di bawah.

### 3. Bangun dan jalankan layanan

```sh
docker compose config --quiet
docker compose up -d --build --wait
docker compose ps -a
```

Build pertama dapat memerlukan beberapa menit. Compose menyiapkan PostgreSQL, Redis, MinIO, migrasi database, API, worker, frontend, dan gateway. Layanan `migrate` dan `init-storage` memang berhenti dengan **Exited (0)** setelah berhasil; itu normal. Layanan yang berjalan harus berstatus Up, dan yang mempunyai healthcheck harus healthy.

Buka http://localhost:3000/api/v1/health untuk memeriksa API. Hasil yang diharapkan memuat `"status":"ok"`. Kemudian buka aplikasi:

| Halaman / layanan | Alamat                                        |
| ----------------- | --------------------------------------------- |
| Aplikasi          | http://localhost:3000                         |
| Doa               | http://localhost:3000/doa                     |
| Panel admin       | http://localhost:3000/admin                   |
| Dokumentasi API   | http://localhost:3000/docs                    |
| PostgreSQL        | `127.0.0.1:5432`; database/user dari `.env`   |
| Konsol MinIO      | http://localhost:9001; kredensial dari `.env` |

Tidak ada akun aplikasi bawaan. Buat akun melalui aplikasi seperti langkah berikut; password akun aplikasi berbeda dari `POSTGRES_PASSWORD`.

### 4. Buat akun dan coba pesan publik dari akun lain

1. Buka http://localhost:3000, pilih **Mulai Menulis** atau **Tulis**, lalu **Daftar akun** saat formulir masuk muncul.
2. Isi surel dan kata sandi minimal **12 karakter**, ulangi kata sandi, lalu pilih **Daftar**. Simpan kode pemulihan yang ditampilkan di tempat aman.
3. Sebagai **akun A**, pilih tujuan/nama kenangan, bentuk galaksi, lalu isi pesan sederhana, misalnya `Semoga hari ini membawa kabar baik`. Pada pilihan pembaca, pilih **Publik anonim**, kosongkan jadwal pembukaan untuk uji ini, lalu **Simpan sebagai bintang**.
4. Buka browser lain atau jendela privat/incognito, akses **alamat aplikasi yang sama**, lalu daftar/masuk sebagai **akun B** dengan surel berbeda. Dua tab biasa dalam browser yang sama berbagi cookie dan bukan dua sesi akun yang terpisah.
5. Akun B harus dapat melihat galaksi yang memiliki pesan publik milik akun A di langit, serta membaca pesan itu melalui **Jelajah** dan memilihnya di **Doa**. Jika aplikasi sudah dibuka sebelum pesan dibuat, muat ulang halaman/daftar agar mengambil data terbaru. Ulangi tanpa login untuk memeriksa akses pengunjung.
6. Buat pesan kedua sebagai akun A dengan pilihan **Privat**. Pesan privat tersebut hanya dapat dibuka oleh akun A; akun B tetap hanya menerima pesan yang dipublikasikan.

Pesan publik harus lolos pemeriksaan awal dan sudah mencapai waktu pembukaan. Pesan yang ditandai untuk moderasi menunggu peninjauan admin. Nama pribadi tujuan, foto, lampiran, dan isi privat tidak ikut dibagikan lewat galaksi publik. **Ruang Pribadi** tetap berisi data milik akun yang sedang masuk.

Semua akun harus mengakses server/instalasi yang sama agar berbagi pesan publik. Menjalankan salinan Docker terpisah di dua komputer menghasilkan database terpisah; `localhost` pada masing-masing komputer menunjuk komputer itu sendiri.

**Refresh halaman tetap mempertahankan login** selama cookie dan sesi akun masih valid. Cookie sesi memiliki masa berlaku bawaan 30 hari dan diperpanjang saat token sesi diperbarui. Login ulang diperlukan setelah sesi berakhir/dicabut atau cookie dihapus. **Keluar/Ganti akun** mencabut sesi yang sedang digunakan.

Sesudah refresh, akun tetap masuk, tetapi kunci enkripsi privat perlu dibuka kembali: pilih tombol **Kunci** (ikon kunci), masukkan kata sandi akun, lalu **Buka kunci**. Ini diperlukan untuk membaca/menulis pesan privat, membuka lampiran, atau mengekspor data; pesan publik dan galaksi tetap dapat dijelajahi. Kata sandi dan kunci enkripsi tidak disimpan di penyimpanan browser agar kunci tidak menetap setelah halaman ditutup.

### 5. Mengakses PostgreSQL, menghentikan, dan menjalankan kembali

Untuk pgAdmin yang berjalan di komputer Anda, daftarkan server menggunakan nilai berikut. Ganti nama variabel di tabel dengan **isi nilainya dari `.env`**, bukan teks nama variabelnya:

| Isian pgAdmin        | Nilai                                     |
| -------------------- | ----------------------------------------- |
| Host name/address    | `127.0.0.1`                               |
| Port                 | `5432`                                    |
| Maintenance database | Nilai `POSTGRES_DB` (default `untukmu`)   |
| Username             | Nilai `POSTGRES_USER` (default `untukmu`) |
| Password             | Nilai `POSTGRES_PASSWORD` hasil generator |

Tabel utama: `users`, `messages`, `constellations`, `prayers`, dan `prayer_contents`. Metadata audio berada di PostgreSQL; berkas unggahan berada di MinIO.

```sh
docker compose down
docker compose up -d --wait
```

`down` menghentikan layanan dan mempertahankan volume database/storage; akun dan pesan tetap ada saat dijalankan kembali. Setelah memperbarui kode, gunakan kembali `docker compose up -d --build --wait` agar image dan migrasi terbaru diterapkan. **`docker compose down -v` menghapus volume beserta data lokal**, sehingga jangan gunakan untuk sekadar menghentikan atau memperbarui aplikasi.

### Jika belum berhasil

Lihat layanan yang gagal dan lognya tanpa mencetak seluruh konfigurasi `.env`:

```sh
docker compose ps -a
docker compose logs --tail 100 postgres migrate init-storage api web worker
```

| Kendala                                                      | Yang perlu diperiksa                                                                                                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker`/`python` tidak dikenali                             | Pastikan sudah terpasang dan buka ulang terminal. Untuk Python di Windows, coba `py -3.12`.                                                                                                       |
| Cannot connect to Docker daemon / bagian Server tidak muncul | Jalankan Docker Desktop; tunggu engine siap dan pastikan mode Linux containers/WSL 2 aktif.                                                                                                       |
| `CHANGE_ME`, variabel kosong, atau `.env` tidak ditemukan    | Jalankan generator dari akar proyek. Jika `.env` sudah ada, periksa file lokal; generator tidak menimpa file lama.                                                                                |
| Port already allocated / address already in use              | Hentikan aplikasi/container lain yang memakai port tersebut, misalnya PostgreSQL lokal pada `5432`, lalu jalankan Compose kembali.                                                                |
| `password authentication failed`                             | Cocokkan `POSTGRES_*`, `DATABASE_URL`, dan password pada database yang sudah ada. Mengubah `.env` **tidak mengubah password dalam volume PostgreSQL lama**; ikuti langkah di bawah.               |
| Gateway 502 / API belum siap                                 | Periksa status/log `migrate`, `init-storage`, dan `api`. Tunggu proses selesai atau perbaiki penyebab yang tercatat, lalu ulangi perintah build/jalankan.                                         |
| Pesan A belum terlihat pada akun B                           | Pastikan server sama, pilihan **Publik anonim**, jadwal sudah terbuka, moderasi sudah disetujui, filter Jelajah dikosongkan, dan tidak ada blokir antar akun. Muat ulang setelah menyimpan pesan. |
| Tampilan masih seperti sebelum pembaruan                     | Rebuild dengan perintah di atas, kemudian muat ulang paksa browser (`Ctrl+Shift+R`).                                                                                                              |

Jika volume PostgreSQL lama sudah ada, cara paling sederhana adalah mengembalikan `POSTGRES_PASSWORD` ke password instalasi sebelumnya dan menyamakan `DATABASE_URL`. Jika memang ingin mengganti password, simpan backup terlebih dahulu, masuk ke PostgreSQL pada container, lalu ubah melalui prompt interaktif berikut (contoh memakai user/database default):

```sh
docker compose exec postgres psql -U untukmu -d untukmu
```

Di dalam `psql`, jalankan `\password untukmu`, masukkan password baru dua kali, lalu `\q`. Sesuaikan user/database bila nilai `.env` Anda berbeda. Isi password baru yang sama pada `POSTGRES_PASSWORD` dan `DATABASE_URL`, kemudian jalankan `docker compose up -d --force-recreate --wait`. Password acak huruf/angka menghindari karakter khusus yang perlu encoding dalam URL. Pertahankan `PUBLIC_CONTENT_KEY`, `JWT_SECRET`, dan kredensial storage milik instalasi tersebut; menghapus `.env` bukan langkah pemulihan password database.

## Fitur dan privasi pesan

- Pengunjung dapat membaca pesan publik anonim, memfilter tag/suasana hati di Jelajah, memberikan empati, melaporkan, dan mendoakan pesan.
- Akun digunakan untuk menulis serta mengelola pesan dan kenangan pribadi. Pesan pertama membentuk galaksi dengan efek cahaya; pesan berikutnya masuk ke galaksi yang sama sebagai bintang jatuh.
- Galaksi yang memiliki pesan publik tersedia lintas akun dan bagi pengunjung; isi yang ditampilkan hanya pesan publik yang sudah terbuka serta disetujui. Pesan tersebut juga tampil sebagai daftar di Jelajah dan Doa.
- Pesan privat, tautan terbatas, dan lampiran dienkripsi di perangkat. Kata sandi asli dan kunci pesan tidak dikirim ke server. Pemilik dapat mencabut atau memperbarui tautan berbagi.
- Jadwal publik dan kapsul waktu mengikuti waktu pembukaan serta status moderasi. Pesan yang belum dibuka, belum disetujui, atau diblokir dikecualikan dari daftar publik.
- Ruang Pribadi menampilkan pesan, kenangan, serta doa yang diterima/diberikan. Pengaturan menyediakan pengelolaan sesi, ekspor, pemulihan, dan penghapusan akun.

| Pilihan pembaca     | Siapa yang dapat membaca                                            | Cara membuka                                                                                |
| ------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Privat**          | Pemilik akun                                                        | Login dan buka kunci enkripsi. Pesan/lampiran dienkripsi di perangkat.                      |
| **Tautan terbatas** | Pemilik dan penerima tautan yang masih berlaku                      | Penerima membuka tautan lengkap yang memuat kunci berbagi setelah `#`. Tidak masuk Jelajah. |
| **Publik anonim**   | Pengunjung dan akun lain setelah pesan disetujui dan jadwal terbuka | Melalui galaksi anonim, Jelajah, atau Doa. Isi publik dapat dibaca layanan untuk moderasi.  |

Satu pesan dapat ditautkan ke beberapa galaksi milik penulis, maksimal sepuluh tujuan. Lampiran maksimal lima berkas per pesan. Status, jadwal, suasana hati, dan tag dapat dilihat pada daftar pesan sendiri. Galaksi pemilik memakai data lengkap miliknya; galaksi orang lain memakai label **Galaksi anonim** dan hanya memuat bintang pesan publik yang tersedia.

Simpan kode pemulihan saat daftar. Jika kata sandi dan kode pemulihan sama-sama hilang, layanan tidak dapat memulihkan kunci isi privat. Pencabutan tautan menghentikan akses berikutnya; penerima yang sudah membaca tetap dapat menyimpan salinannya.

### Pemeriksaan dan pelaporan pesan publik

Pemeriksaan awal berjalan sebelum pesan publik disimpan. Pesan tanpa tanda mencurigakan dapat langsung disetujui; banyak tautan, pengulangan berlebihan, atau markup mencurigakan dapat menahannya untuk moderator. Laporan dan keputusan admin menjadi peninjauan lanjutan. Pemeriksaan berbasis aturan ini tidak menjamin semua konten berbahaya terdeteksi.

Worker memeriksa kembali pesan pending lama yang belum mempunyai flag, laporan terbuka, atau keputusan manusia. Edit pesan yang ditolak, ditarik, atau dilaporkan tetap memerlukan peninjauan ulang. Blokir berlaku dua arah pada akses publik. Moderator tidak menerima isi pesan privat atau tautan terbatas yang terenkripsi.

## Tombol Berikan empati

Tombol yang sebelumnya bertuliskan **Aku merasakan ini** kini diperjelas menjadi **Berikan empati**. Gunanya memberi tanda dukungan anonim kepada penulis ketika Anda ikut merasakan isi pesan tersebut. Setelah berhasil, tombol menampilkan **Empati terkirim**; penulis dapat melihat jumlah empati yang diterima pada pesan miliknya di **Ruang Pribadi**.

Empati tidak memutar audio dan tidak menambah jumlah pendoa. Untuk mengirim doa, gunakan **Doakan** lalu dengarkan rekaman sampai selesai. Jumlah empati tidak ditampilkan sebagai peringkat atau jumlah suka pada pesan publik, dan identitas pemberi tidak ditampilkan kepada penulis.

Satu akun hanya menambah satu empati pada pesan yang sama; menekan ulang tidak menggandakan hitungan. Untuk pengunjung tanpa akun, server memakai identitas jaringan yang disamarkan, sehingga pengunjung pada jaringan yang sama dapat berbagi batas tersebut. Ini bukan hitungan jumlah manusia yang terverifikasi.

## Doa dan kurasi audio

Alur pengunjung: **pilih pesan publik → pilih tradisi → pilih doa spesifik → Dengarkan dan kirim doa → dengarkan sampai selesai**. Setelah audio berakhir, sistem memperbarui jumlah pendoa dan menampilkan bintang doa pada constellation terkait milik penulis. Menjeda, membatalkan, atau mendengarkan pratinjau tidak mencatat doa. Pengiriman ulang sesi tetap idempoten.

Tujuh tradisi tersedia: Islam, Kristen, Katolik, Hindu, Buddha, Konghucu, dan doa umum non-denominasi. Katalog berisi **18 entri**. Checkout menyertakan **lima berkas rekaman manusia asli untuk tujuh entri**: lima entri sudah tersedia untuk publik, sedangkan **Mantram Gayatri** dan **Penghormatan kepada Buddha / Namo Tassa** sudah memiliki rekaman untuk ditinjau admin. Kedua draf tersebut belum disetujui otomatis. Dua entri Gayatri memakai berkas yang sama karena naskahnya identik; berkas audio tidak diduplikasi. Bahasa, sumber, izin, durasi, dan checksum setiap rekaman tercatat dalam [manifest audio](backend/data/prayer-audio/manifest.json).

**Konghucu dan doa umum masih memerlukan rekaman asli terkurasi dengan izin distribusi yang jelas.** Admin dapat mengunggah rekaman ke entri yang tersedia. Keduanya baru masuk daftar doa pengunjung setelah audio dan sumber disetujui. Teks maupun audio doa tidak dibuat dengan AI.

### Sumber rekaman bawaan

| Pilihan                 | Rekaman dan bahasa                                             | Sumber                                                                                      | Lisensi                                                               |
| ----------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Islam                   | Al-Fatihah, Arab; Ibrahimmusa4                                 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:AlF%C4%81tihatulKit%C4%81b.ogg) | CC0 1.0                                                               |
| Kristen dan Katolik     | Bapa Kami / Pater Noster, Latin; Dan Palraz                    | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Pater-Noster.ogg)               | CC0 1.0                                                               |
| Hindu                   | Gayatri, Sanskerta; Wilfredor                                  | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Gayatri_mantra.ogg)             | CC0 1.0                                                               |
| Buddha                  | Karaniya Metta Sutta, Inggris; Dawn Neal, terjemahan Amaravati | [AudioDharma / Insight Meditation Center](https://irc.audiodharma.org/talks/4293)           | CC BY-NC-ND 4.0; nonkomersial, atribusi, rekaman utuh tanpa perubahan |
| Konghucu                | Referensi teks pembuka doa tersedia di katalog                 | Buku siswa resmi pada tautan sumber entri                                                   | Rekaman berizin belum terpasang                                       |
| Doa umum non-denominasi | Draf untuk diisi kurator                                       | Sumber dan izin perlu ditetapkan                                                            | Rekaman berizin belum terpasang                                       |

Tambahan draf Namo Tassa memakai [rekaman Pali asli Amaravati Publications](https://amaravati.org/audio/parittas-namo-tassa-page-27/), berdasarkan [kebijakan distribusi gratis penerbit yang mencakup audio](https://amaravati.org/support/amaravati-publications/). Berkas dipertahankan utuh. Izin ini dicatat sesuai pernyataan penerbit, tidak dinyatakan sebagai lisensi Creative Commons.

Audio dipasang pada jenis doa yang sesuai dengan isinya: Al-Fatihah tidak dipakai untuk doa Rabbana/jenazah; rekaman Latin dan Inggris diberi label bahasanya. Jangan mengisi entri kosong dengan rekaman berbeda doa atau tradisi hanya agar statusnya terlihat lengkap. Paket referensi ini tidak menyatakan persetujuan institusi agama.

Durasi sesi dibulatkan ke atas dari durasi berkas: Al-Fatihah 93, Pater Noster 29, Gayatri 21, Karaniya Metta 287, dan Namo Tassa 43 detik. Namo Tassa terbaca sekitar 42,08 detik pada pemutar browser. Durasi berkas Karaniya Metta lebih panjang dari angka pada halaman sumber, sehingga aplikasi memakai hasil pembacaan berkas. Sumber, ukuran, lisensi, atribusi, bahasa, dan SHA-256 tersedia di [manifest](backend/data/prayer-audio/manifest.json). Untuk mengunduh ulang dan memeriksa checksum dari sumber yang sama, jalankan `python scripts/fetch_prayer_recordings.py` dari akar proyek; diperlukan koneksi internet. Importer memeriksa checksum sebelum menyimpan berkas dan memperbarui manifest setelah seluruh sumber berhasil.

### Rekaman yang masih perlu dilengkapi

**Sebelas entri belum memiliki rekaman sesuai naskah dengan izin distribusi yang sudah diverifikasi.** Status ini ditampilkan sebagai **Perlu audio** pada admin. Daftar ini bukan pernyataan bahwa rekamannya tidak ada; hasil penelusuran belum cukup untuk memasang berkas yang dapat didistribusikan bersama aplikasi.

| Tradisi  | ID entri yang belum memiliki audio                                |
| -------- | ----------------------------------------------------------------- |
| Islam    | `rabbana-atina`, `inna-lillahi`                                   |
| Kristen  | `bapa-kami`, `mazmur-23`                                          |
| Katolik  | `bapa-kami-katolik`, `salam-maria`                                |
| Hindu    | `santih`                                                          |
| Buddha   | `metta`                                                           |
| Konghucu | `ren`, `sembahyang-tian`                                          |
| Umum     | `doa-umum`; naskah dan sumber juga masih perlu ditetapkan kurator |

Kandidat resmi berbahasa Inggris untuk kurator Katolik tersedia pada [Our Father oleh Kardinal Vincent Nichols](https://soundcloud.com/catholicchurch/our-father-in-english) dan [Hail Mary dari kanal Catholic Church](https://soundcloud.com/catholicchurch/hail-mary-english). Halaman menyatakan `cc-by-nc-sa`, dan [inisiatif resmi The God Who Speaks](https://www.godwhospeaks.uk/hail-mary-full-of-grace/) menyediakan penggunaan melalui pemutar SoundCloud. Kandidat tersebut belum dibundel: versi izin, akses berkas asli, dan kecocokan ucapan dengan naskah entri perlu dituntaskan. Ketersediaan pemutar atau tombol unduh saja tidak digunakan sebagai pengganti pemeriksaan izin dan isi rekaman.

Rekaman bawaan diputar melalui API pada origin aplikasi. Rekaman unggahan diputar melalui URL storage bertanda tangan yang berumur terbatas. Pratinjau tidak membuat sesi doa atau menambah hitungan. Pratinjau draf hanya tersedia untuk admin; pratinjau publik baru tersedia setelah kurasi disetujui. Menutup dialog, mengganti pilihan, atau memulai sesi menghentikan pratinjau sebelumnya.

## Panel admin

Daftarkan akun melalui aplikasi terlebih dahulu. Untuk memberikan peran admin kepada akun tersebut, jalankan perintah berikut dengan surel akun yang ingin dijadikan admin:

```sh
docker compose exec api python -m scripts.make_admin emailakun@example.com
```

Keluar lalu masuk kembali agar peran terbaru dimuat, kemudian buka http://localhost:3000/admin. Panel memiliki empat tab:

| Tab                    | Kegunaan                                                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ringkasan**          | Melihat jumlah pengguna, **Pesan semua akun**, **Pesan akun saya**, dan pesan publik yang tersedia. Pilih periode metrik untuk membandingkan jumlah dalam rentang waktu yang sama.            |
| **Pengguna terdaftar** | Melihat nama, surel, peran, tanggal pendaftaran, serta jumlah pesan tersimpan setiap akun. Pencarian tersedia berdasarkan nama atau surel. Jumlah pesan di daftar ini mencakup seluruh waktu. |
| **Peninjauan konten**  | Meninjau pesan publik yang ditandai atau dilaporkan, lalu menyetujui, menolak, atau menariknya dari publik.                                                                                   |
| **Doa & audio**        | Memilih tradisi dan entri doa, meninjau teks/sumber, serta mengunggah dan mendengarkan rekaman.                                                                                               |

**Pesan semua akun** menjumlahkan pesan tersimpan dari seluruh pengguna dalam periode terpilih, termasuk pesan privat dan tautan terbatas. **Pesan akun saya** hanya menghitung pesan milik admin yang sedang masuk dalam periode yang sama. Sebagai contoh ilustrasi, jika seluruh pengguna mempunyai 15 pesan dan admin mempunyai 2 di antaranya, kedua kartu menampilkan 15 dan 2; ini bukan jumlah yang harus sama. Pesan yang sudah dihapus tidak dihitung, dan satu pesan dengan beberapa tujuan tetap dihitung satu kali. Daftar pengguna hanya menampilkan metadata dan jumlah pesan; isi pesan privat tetap terenkripsi.

Untuk menambah atau mengganti rekaman doa:

1. Pilih tab **Doa & audio**, lalu **Agama atau tradisi**. Daftar berisi **18 entri dari tujuh tradisi** sesuai [katalog utama](backend/data/prayers-v1.json), termasuk entri yang belum memiliki rekaman. Gunakan **Status kurasi**: **Semua status**, **Perlu audio**, **Menunggu kurasi**, atau **Tampil ke publik** untuk membatasi antrean.
2. Pilih **Entri katalog** berdasarkan nama doa. Periksa judul, tradisi, status audio/kurasi, dan **ID katalog** yang hanya dapat dibaca agar rekaman masuk ke entri yang benar. Teks dan sumber awal dimuat dari katalog atau kurasi yang sudah tersimpan.
3. Lengkapi **Judul**, **Teks doa**, **Terjemahan** jika tersedia, **Atribusi sumber**, **Tautan sumber HTTPS**, dan **Catatan peninjauan** berdasarkan materi yang benar-benar ditinjau bersama kurator tradisi terkait.
4. Gunakan **Unggah audio** atau **Ganti audio** untuk memilih berkas rekaman yang Anda siapkan. Dengarkan pratinjau, lalu isi **Lisensi audio** dan **Atribusi rekaman**. Format yang didukung: MP3, OGG, WAV, dan M4A, maksimal **30 MiB** dengan durasi **5–900 detik**. Durasi dibaca dari berkas; rekaman tersimpan juga dapat dipratinjau sebelum persetujuan.
5. Untuk menyimpan **draf**, biarkan kotak persetujuan tidak dicentang dan pilih **Simpan kurasi**. Setelah teks, rekaman, sumber, dan izin selesai ditinjau, centang persetujuan lalu simpan. Entri tanpa audio atau yang belum disetujui **belum tampil dalam pilihan doa publik**.
6. Pilih **Simpan dan lanjut** untuk menyimpan lalu membuka entri berikutnya yang belum tampil ke publik, sesuai filter aktif. Fokus langsung berpindah ke judul editor entri berikutnya. Tombol ini tidak menyetujui entri berikutnya secara otomatis.

Panel menampilkan tahap pemeriksaan, unggahan, verifikasi server, dan penyimpanan. Metadata dibaca sekali untuk berkas yang sama; memilih rekaman baru membatalkan centang persetujuan agar rekaman baru ditinjau. Jika unggahan dan verifikasi berhasil tetapi penyimpanan metadata gagal, isian/file dipertahankan. Coba simpan lagi: rekaman yang sama tidak diunggah ulang selama file, entri, lisensi, dan atribusinya tidak berubah. Jangan menutup atau memuat ulang halaman sebelum mencoba ulang karena cache percobaan berada di memori halaman.

Penyiapan unggahan dan verifikasi memakai kuota terpisah, masing-masing sepuluh permintaan per admin per menit. Sepuluh unggahan dapat diselesaikan tanpa kedua tahap saling menghabiskan kuota; respons batas permintaan tetap memberi waktu untuk mencoba kembali.

Unggahan memakai rekaman berkas yang dipilih admin; aplikasi tidak membuat teks/audio doa dengan AI. Perubahan lewat panel tersimpan di database dan storage tanpa perlu mengedit JSON, mengubah kode, atau melakukan rebuild. JSON menentukan pilihan katalog awal; penambahan jenis doa di luar pilihan tersebut merupakan perubahan katalog dan migrasi oleh pengembang.

Audio Buddha memiliki lisensi nonkomersial; visual adaptasi juga memiliki batas nonkomersial. Untuk pemasangan komersial, gunakan rekaman dan visual dengan izin yang sesuai. Lihat [atribusi](THIRD-PARTY-NOTICES.md) sebelum menentukan penggunaan.

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
docs/                   # PRD.docx asli dan runbook PRODUKSI.md
```

`frontend/public/visual` adalah hasil build otomatis, bukan sumber yang diedit. `node_modules`, `.next`, `.venv`, cache, laporan tes, `.env`, dan `.local-backups` diabaikan Git. Snapshot katalog dalam Alembic tetap diperlukan untuk instalasi dan upgrade database lama. Berkas `__init__.py` diperlukan sebagai penanda paket Python.

## Arsitektur dan keamanan data

```mermaid
flowchart LR
  Browser[Next.js React dan Web Crypto] -->|HTTPS| Edge[Cloudflare dan Caddy]
  Edge --> Web[Next.js]
  Edge --> API[FastAPI REST]
  API --> DB[(PostgreSQL)]
  API --> Cache[(Redis)]
  Browser -->|Objek dan URL bertanda tangan| Storage[(MinIO atau R2)]
  Worker[Worker moderasi publik] --> DB
  Worker --> Cache
  Prometheus[Prometheus dengan token] --> API
  Grafana[Grafana] --> Prometheus
  API -->|Jika diaktifkan operator| Sentry[Sentry]
```

API berada di `/api/v1`, dokumentasi interaktif di `/docs`. Browser berbicara ke API pada origin aplikasi melalui gateway atau rewrite Next.js. Data akun dan daftar publik diperoleh dari API, tanpa data contoh atau katalog astronomi lokal. Cache feed/dashboard dan pembatasan laju memakai Redis. PWA hanya menyimpan aset statis serta halaman luring, tanpa menyimpan pesan atau respons akun.

Kata sandi diproses Argon2id di worker browser. Derivasi autentikasi dipisahkan dari kunci enkripsi; server meng-hash verifier autentikasi lagi dengan Argon2id. Kunci turunan membungkus kunci akun AES-256. Pesan privat/tautan terbatas, media, serta metadata berkas dienkripsi AES-256-GCM dengan IV acak dan AAD yang mengikat objek. Pesan publik dapat dibaca layanan dan disandikan saat tersimpan menggunakan `PUBLIC_CONTENT_KEY` instalasi.

Tautan terbatas memakai ciphertext dan kunci berbagi terpisah dari kunci akun. Server menyimpan hash token; kunci setelah `#` tidak ikut dalam request HTTP. Rotasi, pencabutan, edit, atau perubahan privasi mencabut tautan lama. API menahan pesan publik/tautan terbatas sampai `release_at`. Kapsul privat adalah pengaturan tampilan untuk pemilik yang memiliki kunci; itu tidak mengunci pemilik secara kriptografis sampai tanggal pembukaan.

Token akses dan `CryptoKey` akun hanya berada di memori halaman. Cookie refresh `um_refresh` bersifat HttpOnly dan SameSite Strict, serta Secure pada produksi. Token refresh diputar dan server menyimpan hash/statusnya. Pemulihan sesi setelah refresh tidak menyimpan password, token akses, atau kunci mentah di localStorage, sessionStorage, atau IndexedDB. Penanda ID akun per tab mencegah tab lama mengambil identitas akun lain saat cookie berubah. Gunakan profil browser atau jendela privat terpisah untuk mencoba dua akun bersamaan.

| Tabel / model                                            | Isi dan relasi utama                                                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `users`, `sessions`                                      | Akun, peran, preferensi, kunci terbungkus, verifier pemulihan; hash token sesi, kedaluwarsa, pencabutan dan perangkat. |
| `constellations`, `messages`, `message_constellations`   | Galaksi milik pengguna, isi/ciphertext pesan, privasi, jadwal, moderasi, relasi beberapa tujuan dan payload berbagi.   |
| `uploads`, `message_attachments`                         | Referensi objek terenkripsi, ukuran, penyelesaian unggah, relasi pemilik/pesan.                                        |
| `prayers`, `prayer_contents`                             | Doa selesai yang idempoten, entri katalog, sumber, status kurasi, metadata rekaman.                                    |
| `reports`, `moderation_decisions`, `blocks`, `empathies` | Laporan, keputusan bertoken revisi, blok publik dua arah, dan dukungan empati tanpa peringkat publik.                  |
| `storage_deletions`                                      | Antrean penghapusan objek yang dapat dicoba ulang setelah akun dihapus.                                                |

Penghapusan akun mengikuti pilihan pemilik. Pesan yang dipertahankan kehilangan relasi identitas dan tetap mengikuti privasi aslinya. Migrasi/worker tidak mengubah ciphertext privat menjadi pesan publik.

### Migrasi dan katalog

Sumber aktif doa hanya [prayers-v1.json](backend/data/prayers-v1.json). Registry frontend di `frontend/src/visual/prayers.js` menerima data yang dibundel oleh build; API dan pengujian membaca katalog yang sama. Panel admin mengubah kurasi di database, bukan JSON. Entri di luar katalog aktif tidak dicantumkan pada antrean admin.

Snapshot pada `backend/alembic/catalog-*.json` merupakan data historis yang dibekukan agar upgrade database lama tetap dapat diulang. Migrasi `0007` mengubah klasifikasi doa tertulis lama menjadi pesan tanpa mengubah isi/lampiran. `0008` menambah jadwal dan envelope berbagi terenkripsi serta mencabut tautan lama; pemilik mengenkripsi ulang pesan tautan lama di perangkat saat masuk, dengan retry bila jaringan/rate limit menunda. `0009` melengkapi referensi, `0010` menambah paket rekaman asli, dan `0011` menyediakan draf doa umum. `0012` dan `0013` melengkapi referensi rekaman draf Gayatri dan Namo Tassa hanya jika entri lama masih merupakan draf bawaan yang belum disentuh. Unggahan, revisi teks, dan riwayat keputusan kurator dipertahankan; keduanya tetap belum disetujui. Pengisian referensi tersebut memerlukan migrasi online seperti yang dijalankan Compose; ekspor SQL offline melewatinya karena perlu memeriksa isi entri tersimpan. Selalu jalankan migrasi berurutan, jangan menghapus snapshot yang tampak mirip katalog aktif.

## Pengembangan tanpa Docker untuk kode aplikasi

Bagian ini untuk mengubah kode. Untuk mencoba aplikasi saja, gunakan panduan Docker di atas. Siapkan **Node.js 22+**, npm, dan **Python 3.12**; `.env` tetap dibuat dari akar proyek. PostgreSQL, Redis, dan MinIO tetap dapat memakai Compose.

Jika stack lengkap sedang berjalan, hentikan layanan yang memakai aplikasi/port frontend sebelum menjalankan kode dari host:

```sh
docker compose stop gateway web api worker
docker compose up -d --build --wait postgres redis minio migrate init-storage
npm ci
```

Buat virtual environment dari akar proyek. PowerShell:

```powershell
py -3.12 -m venv backend/.venv
.\backend\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements-dev.lock
```

Pada Linux/macOS, gunakan `python3.12 -m venv backend/.venv` lalu `source backend/.venv/bin/activate`. Jika aktivasi PowerShell dibatasi kebijakan komputer, jalankan interpreter secara langsung: `.\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.lock`; gunakan path interpreter tersebut untuk perintah Python berikutnya.

Di terminal pertama, dari akar proyek, jalankan API:

```sh
python -m uvicorn app.main:app --app-dir backend --reload --env-file .env
```

Di terminal kedua, dari akar proyek, jalankan frontend:

```sh
npm run dev
```

Buka http://localhost:3000. Frontend development meneruskan `/api/v1` ke `http://127.0.0.1:8000` secara bawaan. `DATABASE_URL`, `REDIS_URL`, dan `S3_ENDPOINT` pada `.env` generator memakai alamat host yang sesuai. Untuk fitur worker, jalankan `docker compose up -d --build worker`; perubahan kode worker memerlukan rebuild container tersebut.

Setelah mengubah model, buat migrasi Alembic dan tinjau hasilnya. Dari direktori `backend`, dengan virtual environment aktif, perintah berikut memuat `.env` akar proyek sebelum migrasi manual:

```sh
python -m dotenv -f ../.env run -- python -m alembic upgrade head
```

Jika frontend memakai storage/Turnstile yang berbeda dari bawaan lokal, set `S3_PUBLIC_ENDPOINT` dan `NEXT_PUBLIC_TURNSTILE_SITE_KEY` pada environment proses **sebelum** menjalankan dev/build. Root `.env` dipakai Compose/API; build visual membaca environment proses. Untuk kembali ke stack lengkap, hentikan proses dev lalu jalankan `docker compose up -d --build --wait`.

### Sumber MinIO yang dikunci

`infra/minio/Dockerfile` membangun sumber resmi tanpa perubahan pada rilis `RELEASE.2025-04-22T22-12-26Z`, commit [`0d7408fc9969caf07de6a8c3a84f9fbb10a6739e`](https://github.com/minio/minio/tree/0d7408fc9969caf07de6a8c3a84f9fbb10a6739e). [Arsip sumber](https://codeload.github.com/minio/minio/tar.gz/0d7408fc9969caf07de6a8c3a84f9fbb10a6739e) diperiksa dengan SHA-256 `7eb30a913fea30f18069abf194e1e78e4983b558cc526911ae1c11396a9859a5`, lalu modul Go diverifikasi. Binary, LICENSE, dan CREDITS dimasukkan ke image. Build dari sumber menghindari ketergantungan pada akses pull anonim image komunitas rilis tersebut. Jalankan `docker compose build minio` untuk membangunnya ulang; unduhan toolchain/modul diperlukan pada build pertama.

## Format dan pengujian

Jalankan dari akar proyek setelah `npm ci`:

```sh
npm run format
npm run format:check
npm run lint
npm test
npm run build
```

Prettier dikunci di lockfile dan mengikuti `.prettierrc.json`/`.prettierignore`. Perintah format mencakup frontend, script JavaScript, konfigurasi serta dokumentasi yang didukung. Vendor, data audio/katalog, snapshot migrasi, lockfile, notices, dependensi, dan hasil build dikecualikan. **Python dirapikan dengan Ruff**, bukan Prettier. Dari `backend`, dengan virtual environment aktif:

```sh
python -m ruff format app tests scripts alembic ../scripts
python -m ruff check app tests scripts alembic ../scripts
python -m ruff format --check app tests scripts alembic ../scripts
python -m pytest -q
```

`npm test` menyiapkan aset visual dahulu lalu menjalankan Vitest. Pemeriksaan mencakup katalog aktif versus frontend/API, metadata pesan, batas dukungan, dan pemulihan sesi. Tes API memeriksa akses antar akun/pengunjung, ciphertext, jadwal, tautan, moderasi, metrik, pengguna admin, kurasi, unggahan, serta doa/empati idempoten. Fixture audio hanya memeriksa fungsi aplikasi dan tidak menyetujui materi produksi.

### Browser terisolasi

Jalankan setelah build berhasil:

```sh
npx playwright install chromium
node scripts/test-browser-local.mjs
```

Runner menjalankan API nyata memakai SQLite/fakeredis, akun sementara, dan salinan build Next.js standalone di direktori sementara. Database/akun aplikasi Compose tidak dipakai. Runner menghentikan proses miliknya dan membersihkan direktori sementara setelah selesai, gagal, atau dibatalkan. `backend/.venv` dipakai bila tersedia; `UNTUKMU_TEST_PYTHON` dapat menunjuk interpreter lain. Pada Windows, Edge yang terpasang menjadi fallback jika Chromium bundel belum tersedia; `PLAYWRIGHT_CHROMIUM_EXECUTABLE` dapat menunjuk browser lain.

Untuk menjalankan berkas tertentu: `node scripts/test-browser-local.mjs social.spec.ts prayer-admin.spec.ts`. Skenario browser mencakup login/refresh/ganti akun, galaksi publik lintas akun, tiga privasi, moderasi, doa dengan audio sampai selesai, pembatalan/pratinjau, kurasi admin, keyboard/reduced motion, responsif, serta batas cache PWA.

### Integrasi Compose dan CI

`npm run test:e2e` memakai layanan pada `http://localhost:3000` secara bawaan dan dapat membuat akun/data fixture. Jalankan pada instalasi pengujian tersendiri, bukan database produksi. `UNTUKMU_TEST_BASE_URL` dapat mengubah targetnya. Pada Linux CI, pasang browser beserta dependensi OS menggunakan `npx playwright install --with-deps chromium`.

Workflow [ci.yml](.github/workflows/ci.yml) menjalankan format/lint, unit/API, SQL migrasi, build, browser terisolasi, dan integrasi PostgreSQL/Redis/MinIO melalui Compose. Laporan/screenshot berada di `frontend/test-results`, HTML di `frontend/playwright-report`; CI mengunggah artifact `verification`. Hasil lokal bersifat keluaran pengujian yang diabaikan Git. Keberhasilan tes fungsi tidak menggantikan audit keamanan independen, uji beban produksi, atau pengukuran ponsel fisik.

## Persiapan deploy dan backup

Konfigurasi produksi disediakan dalam `docker-compose.production.yml`; gunakan Docker Compose **2.24.4+**. Siapkan domain aplikasi dan storage, DNS ke server, port 80/443, Turnstile, serta `.env` produksi. Set `ENVIRONMENT=production`, `SITE_DOMAIN`, `STORAGE_DOMAIN`, `APP_ORIGIN=https://...`, `S3_PUBLIC_ENDPOINT=https://...`, `TURNSTILE_SECRET`, `TURNSTILE_HOSTNAME`, dan `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Pertahankan rahasia serta kunci enkripsi saat upgrade instalasi yang sudah memiliki data.

Pada server tujuan, setelah konfigurasi dan backup siap:

```sh
docker compose -f docker-compose.yml -f docker-compose.production.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build --wait
```

Override produksi memasang Caddy untuk HTTPS aplikasi dan storage, menyimpan sertifikat pada volume, mengaktifkan restart layanan, dan menutup port host PostgreSQL/Redis/MinIO/Grafana. Paket rekaman asli ikut dalam image backend. Migrator berjalan sebelum API; katalog frontend dibundel saat build.

Panduan lengkap untuk migrasi, backup/pemulihan, Cloudflare, monitoring, dan image GHCR: [Operasional produksi](docs/PRODUKSI.md). Domain, kredensial layanan produksi, rekaman dua pilihan yang masih kosong, dan peninjauan konten tetap perlu disiapkan sebelum peluncuran penuh. Repositori ini menyediakan konfigurasi deploy; belum terpasang pada server publik.
