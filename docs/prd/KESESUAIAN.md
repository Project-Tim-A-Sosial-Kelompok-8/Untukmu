# Pemeriksaan kesesuaian Untukmu terhadap PRD

Acuan: PRD Kelompok 8 versi 1.0, 8 Agustus 2026. Pemeriksaan implementasi: 10 Oktober 2026. Persyaratan produk dipakai untuk mengembangkan aplikasi; dokumen tidak mengubah kewenangan pengelolaan layanan atau kredensial. PRD asli tetap disimpan di `docs/referensi`.

## Pemeriksaan setiap bagian

| Bagian PRD | Implementasi dan bukti | Status |
| --- | --- | --- |
| 1 Informasi dokumen | Acuan, tanggal, tim, dan versi tetap pada PRD asli. | Tercatat |
| 2 Latar belakang | Beranda menjelaskan ruang untuk pesan personal, kenangan, kehilangan, refleksi, dan dukungan. Tidak ada pengikut atau percakapan dua arah. | Diterapkan |
| 3 Tujuan | Kendali privat/publik anonim/tautan terbatas; AES-256-GCM di perangkat; dukungan doa; bintang pesan pada galaksi. | Diterapkan |
| 4 Ruang lingkup | Akun, constellation, pesan, tiga privasi, Jelajah, Doa, dashboard, moderasi tersedia. Tidak ada pembayaran, chat langsung, aplikasi native, atau penerjemahan pesan otomatis. UI awal Bahasa Indonesia. | Diterapkan |
| 5 Istilah | Constellation ditampilkan sebagai galaksi kenangan; satu pesan satu bintang; Doakan memberi dukungan pada pesan publik; unlisted disebut tautan terbatas. | Diterapkan |
| 6 Target pengguna | Pilihan orang tua, saudara, sahabat, pasangan, seseorang, diri sendiri, dan kategori khusus. Simbol cahaya tersedia tanpa foto; pesan privat menjadi baku. | Diterapkan |
| 7 Deskripsi umum | Galaksi mengumpulkan pesan ke satu tujuan. Pesan publik anonim memerlukan persetujuan; pesan privat dan unlisted memakai enkripsi perangkat. | Diterapkan |
| 8.1 Alur menulis | Beranda → mulai menulis → masuk/daftar → tujuan baru atau yang sudah ada → foto/simbol dan bentuk untuk tujuan baru → isi/atribut → privasi/jadwal → simpan → efek dan bintang pesan. Tujuan lama melewati langkah bentuk. | Diterapkan dan diuji |
| 8.2 Alur Jelajah | Pengunjung tanpa akun → Jelajah → empati/doa → pilih ucapan/tradisi/jenis → rekaman asli atau hening Umum → penanda doa dan hitungan setelah selesai. Halaman Doa memiliki tombol lanjut memilih ucapan yang terpisah dari pagination. | Diterapkan; audio lima tradisi tersedia |
| 9.1 Halaman utama | Konsep produk, tombol menulis, Jelajah, Doa, dan tautan kebijakan privasi. Masuk diminta untuk menulis/ruang pribadi, tanpa menutup akses publik. | Diterapkan |
| 9.2 Pembuatan pesan | Kategori dan kategori khusus, foto/simbol, tanggal, mood, tag, maksimal lima lampiran terenkripsi, privasi. Nilai formulir dipertahankan saat render dan gagal simpan; galaksi yang sudah dibuat dipakai kembali saat mencoba ulang. | Diterapkan |
| 9.3 Constellation | Bintang dapat dipilih untuk membaca pesan; tanggal/jumlah pendoa; satu pesan dapat menuju maksimal sepuluh constellation. Indeks bintang stabil saat refresh. | Diterapkan dan diuji |
| 9.4 Jelajah | Publik anonim yang disetujui dan sudah dibuka, jumlah pendoa, empati tanpa jumlah suka, laporan, filter mood/tag, pagination. Tag menyamakan huruf besar, spasi tepi dan tanda #; alias mood lama tetap cocok. Filter dapat dilanjutkan ke Pesan saya untuk pesan privat/pending. Empati/doa hanya tampil pada ucapan yang bisa didukung. Urutan waktu; tombol peringkat “paling didoakan” dihapus. | Diterapkan |
| 9.5 Doa | Ketujuh tradisi dan jenis spesifik bisa diklik beserta teks, arti jika tersedia, rujukan, dan status kurasi. Empat rekaman asli berlisensi mengisi lima tradisi, disertai bahasa, atribusi, sumber dan pratinjau audio. Admin dapat meninjau/mengganti rekaman. Penyelesaian sesi diverifikasi server dan idempoten; pratinjau tidak menambah hitungan. | Audio Islam, Kristen, Katolik, Hindu dan Buddha tersedia; Konghucu masih memerlukan rekaman dengan izin distribusi yang jelas; Umum memakai hening |
| 9.6 Dashboard | Jumlah pesan, tujuan/galaksi, privasi, doa diterima/diberikan, daftar galaksi/pesan, riwayat doa. Filter mood/tag pesan sendiri dan status publikasi menjelaskan alasan belum muncul di Jelajah. Identitas pengunjung tidak dipublikasikan. | Diterapkan |
| 9.7 Akun | Surel/kata sandi, visibilitas baku/profil, sesi, pemulihan saat daftar, penggantian kata sandi, ekspor terenkripsi. Pengelolaan pesan menyediakan perubahan privasi. | Diterapkan |
| 9.8 Moderasi | Publik anonim pending sebelum persetujuan manusia; worker menandai spam; laporan masuk antrean; keputusan menyertakan token revisi; blok dua arah; rate limit Redis. Ciphertext privat/unlisted tidak dibaca moderator. | Diterapkan dan diuji |
| 10.1 Keamanan | Web Crypto AES-256-GCM; KDF Argon2id pada worker; hash Argon2id server atas verifier autentikasi; kunci mentah tidak dikirim; media terenkripsi; HTTPS produksi diwajibkan konfigurasi; refresh token HttpOnly dan rotasi. | Diterapkan; TLS produksi perlu domain/operator |
| 10.2 Performa | Cache feed/dashboard Redis, pagination, throttle atomik, batas partikel dan pixel ratio; metrik durasi/status API untuk Grafana. | Diterapkan; target beban produksi perlu pengukuran |
| 10.3 Skalabilitas | API stateless, PostgreSQL dengan migrasi/index, Redis bersama, object storage S3, worker dengan lock/skip_locked. | Diterapkan |
| 10.4 Aksesibilitas | Layout mobile, fokus dialog, keyboard, label, status/alert, reduced motion; daftar pesan menyediakan alternatif untuk Canvas. | Diterapkan dan diuji pada ukuran layar berbeda |
| 11 Arsitektur dan keamanan | Lihat `docs/arsitektur/SISTEM.md`; batas pesan privat, unlisted, publik dijelaskan terpisah. Tautan unlisted membawa kunci berbagi yang berbeda dari kunci akun, hanya dalam fragmen URL. | Diterapkan |
| 12 Teknologi | Matriks berikut memetakan semua komponen PRD. | Implementasi lokal dan konfigurasi layanan tersedia |
| 13 Struktur data | Users, constellations, messages, prayers, reports, sessions; relasi multi tujuan, unggahan, blok, empati, keputusan moderasi dan kurasi audio. `release_at` dan `share_payload` ditambahkan dengan migrasi. | Diterapkan |
| 14 Fase pengembangan | Fondasi, Sosial, Doa, Lanjutan, Penyempurnaan memiliki modul dan pengujian. Tahap Doa memerlukan kurator; publikasi memerlukan pengaturan layanan eksternal. | Diterapkan bertahap; ketergantungan dicatat |
| 15 Risiko | Pemulihan kehilangan kata sandi, moderasi publik, kurasi agama, pagination/cache/CDN; lihat matriks risiko di bawah. | Mitigasi kode tersedia |
| 16 Metrik | API admin `/admin/metrics` dan panel: pengguna/pesan dalam periode, proporsi pesan publik dengan doa, retensi tujuh hari, laporan ditindaklanjuti. Hasil audit kebocoran harus dicatat pemeriksa dan tidak diasumsikan nol. | Metrik tersedia; audit independen belum dijalankan |
| 17 Penutup | Matriks ini menjelaskan hasil implementasi dan batas verifikasi tanpa menulis ulang PRD tim. | Tercatat |

## Teknologi yang digunakan

| Komponen | Lokasi |
| --- | --- |
| Next.js, TypeScript, Tailwind CSS | `frontend/src/app`, `frontend/src/features`, `frontend/tailwind.config.ts` |
| Framer Motion | `frontend/src/features/account/AccountScreen.tsx` |
| Canvas, Three.js, React Three Fiber | `frontend/visual`, `frontend/src/features/galaxy/FiberBridge.tsx`; sumber shader/engine klasik dipertahankan dengan lisensinya |
| FastAPI, Python, REST | `backend/app`, `/api/v1`, dokumentasi OpenAPI |
| PostgreSQL, SQLAlchemy, Alembic | `backend/app/models.py`, `backend/alembic`; SQLite hanya fixture pengujian |
| Redis cache/antrean | `backend/app/security.py`, `social.py`, `dashboard.py`, `worker.py` |
| MinIO atau R2 | `backend/app/uploads.py`, `infra/minio`, konfigurasi S3 pada `.env.example` |
| JWT dan refresh token | `backend/app/security.py`, `auth.py` |
| Argon2id, AES-256-GCM, Web Crypto | `frontend/src/lib/crypto`, `backend/app/security.py` |
| HTTPS/TLS dan Caddy | `infra/Caddyfile.production.example`, pemeriksaan konfigurasi produksi |
| Cloudflare CDN/WAF/Turnstile | Validasi Turnstile browser/server tersedia. Pengaturan domain, DNS proxy, cache rule, dan WAF memerlukan akun operator; panduan `docs/operasional/PRODUKSI.md`. |
| Docker | Dockerfile backend/frontend/MinIO dan `docker-compose.yml` |
| Sentry, Grafana | `backend/app/monitoring.py`, `infra/monitoring`; Sentry diaktifkan dengan DSN operator dan tidak mengirim isi/identitas |
| GitHub Actions CI/CD | `.github/workflows/ci.yml`, `release.yml`; penerbitan image dilakukan melalui workflow manual dengan environment production |

## Rencana pengembangan dan risiko

Fase 1 mengunci model data dan batas enkripsi. Fase 2 membatasi publikasi lewat moderasi. Fase 3 menyediakan katalog, kurasi, rekaman asli dan penyelesaian doa. Fase 4 mencakup multi tujuan, penjadwalan/kapsul, pemulihan dan ekspor. Fase 5 mencakup pembentukan galaksi sekali dengan debu berpilin dan inti bercahaya yang melebur, bintang jatuh untuk pesan berikutnya, mobile, keyboard/reduced motion, PWA dan pemantauan. Rekaman dipilih berdasarkan sumber, lisensi, bahasa dan durasi; pilihan ini tidak mengklaim persetujuan institusi agama atau audit produksi.

| Risiko PRD | Mitigasi dan batasnya |
| --- | --- |
| Lupa kata sandi | Kode pemulihan sekali saat daftar, rotasi kode/sesi setelah pemulihan. Tanpa kedua rahasia, ciphertext tidak dapat dipulihkan layanan. |
| Penyalahgunaan publik anonim | Moderasi sebelum terbit, worker hanya menandai, laporan/keputusan setelah terbit, blok dan throttle atomik. Identitas publik tetap anonim. |
| Kesalahan representasi doa | Referensi bersumber, label pratinjau, status kurasi, rekaman tim berlisensi, persetujuan admin. Kutipan Konghucu dilabeli sebagai kutipan pembuka, bukan doa lengkap. |
| Pertumbuhan beban | Cache Redis, pagination, index, worker paralel, storage objek, CDN aset publik; API/konten privat tidak di-cache CDN/PWA. Uji kapasitas produksi perlu data beban riil. |

## Batas yang harus diselesaikan operator

Rekaman Konghucu dengan izin distribusi yang jelas, peninjauan perwakilan tradisi sebelum publikasi, domain/TLS, Cloudflare CDN/WAF, kunci Turnstile, DSN Sentry, cadangan/retensi, kontak pengelola, dan audit keamanan independen masih memerlukan operator. Rekaman Buddha berlisensi CC BY-NC-ND 4.0 hanya tersedia untuk penggunaan nonkomersial tanpa perubahan; ganti dengan rekaman berizin sesuai jika penggunaan berubah. Sumber rekaman dan batasnya dicatat dalam `docs/konten-doa/SUMBER.md`; hasil pemeriksaan lokal dalam `docs/pengujian/VERIFIKASI-PRD.md`.
