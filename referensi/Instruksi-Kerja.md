# PROMPT KERJA — Bangun Platform "Untukmu" Full-Stack Sesuai PRD (Tampilan Asli 100% Dipertahankan)

> **Cara pakai:** Tempel seluruh isi file ini sebagai satu prompt ke Claude Code (atau agent coding lain) di dalam repo yang berisi dua sumber di bawah. Jangan dipotong — setiap bagian saling bergantung (kontrak API, skema data, aturan tampilan).

---

## 0. PERAN KAMU

Kamu adalah **lead full-stack engineer** yang menyelesaikan produk **"Untukmu"** dari tahap purwarupa (prototype frontend-only) menjadi **aplikasi web production-ready, FE + BE lengkap, tanpa error, siap deploy**, dengan **dua sumber kebenaran yang wajib dipatuhi bersamaan**:

1. **Sumber tampilan (jangan diubah):** folder `Untukmu/` (isi `Untukmu.zip`) — ini adalah *engine* Milky Way Galaxy berbasis three.js (`index.html`) yang sudah dilapis produk "Untukmu" (`untukmu/untukmu.css`, `untukmu/js/um-*.js`). Prototipe ini **sudah menerapkan seluruh alur UX yang benar**: entry screen, komposer pesan multi-langkah, kartu galaksi/titik/debu, dashboard, jelajah, doa, setup enkripsi, pengaturan — semua dalam Bahasa Indonesia, dengan palet warna, tipografi, animasi kamera, dan interaksi klik-titik yang sudah final secara desain.
2. **Sumber kebutuhan & arsitektur (jangan disimpangi):** `PRD_Kelompok_8.docx` — mendefinisikan stack teknologi wajib, kebutuhan fungsional, kebutuhan non-fungsional, model keamanan, struktur data, dan roadmap bertahap.

Tugasmu **bukan mendesain ulang**, melainkan **memindahkan (port) dan melengkapi**: bungkus ulang engine + UI yang sudah ada ke dalam arsitektur Next.js + FastAPI yang diwajibkan PRD, sambil menyambungkannya ke backend sungguhan (PostgreSQL, Redis, penyimpanan objek, JWT), tanpa mengubah satu piksel pun dari hasil visual yang sudah ada.

---

## 1. ATURAN NON-NEGOTIABLE (jangan dilanggar demi alasan apapun)

1. **Tampilan asli wajib identik 100%.** Semua warna (`--um-panel`, `--um-accent: #6366f1`, `--um-gold: #f4d58d`, dst di `untukmu.css`), semua radius/spacing/font-size, seluruh copy Bahasa Indonesia (istilah "galaksi", "piringan", "sabuk", "bintang", "debu doa", dsb — ini adalah *metafora produk*, bukan istilah teknis yang boleh diterjemahkan/diganti), animasi kamera three.js (fly-to, cincin penanda, cinema mode `F`), dan seluruh layout layar (`um-screen`, `um-card`, `um-btn`, `um-chip`, `um-priv-opt`, dll) harus tampil **pixel-identik** dengan prototipe. Migrasi framework tidak boleh terlihat oleh pengguna sebagai perubahan visual apapun.
2. **Jangan ganti metafora produk.** PRD menyebut "constellation", tapi implementasi FE yang sudah ada memakai metafora **galaksi** (1 orang = 1 galaksi, pesan = bintang di piringan, doa = debu keemasan di sabuk luar). Ini adalah keputusan desain tim yang sah dan lebih detail dari PRD — **pertahankan istilah "galaksi" di UI**, tapi petakan secara konsisten ke istilah "constellation/pesan/doa" di level data & API backend agar tetap selaras dengan PRD §5 dan §13.
3. **Jangan menyisakan data mock/dummy di build akhir.** Semua sumber `um-store.js` (IndexedDB) harus diganti pemanggilan API sungguhan ke backend FastAPI + PostgreSQL. Boleh menyediakan *seed script* backend untuk data contoh (seperti 6 galaksi contoh di README lama), tapi jalur produksi harus 100% dari server.
4. **Jangan downgrade keamanan.** Prototipe sudah mengimplementasikan enkripsi sisi klien AES-256-GCM lewat Web Crypto API di `um-crypto.js` (lihat komentar di file tsb: PBKDF2-SHA256 dipakai sebagai *placeholder* karena Argon2id tidak tersedia native di browser). Untuk versi final: **implementasikan Argon2id sungguhan di sisi klien** (via WASM library seperti `argon2-browser` atau `hash-wasm`, dijalankan di Web Worker agar tidak memblokir UI thread) sesuai PRD §10.1/§11, ganti PBKDF2. Kunci enkripsi **tidak boleh pernah** dikirim atau disimpan di server dalam bentuk apapun.
5. **Zero error / zero warning saat build & runtime.** `next build` harus sukses tanpa error TypeScript, tanpa `console.error` yang tidak tertangani. `uvicorn`/`fastapi` harus start bersih, seluruh endpoint terdokumentasi via OpenAPI (`/docs`) tanpa error skema. Semua test yang sudah ada di `untukmu/js/um-tests.js` (668 baris — mencakup pengecekan warna debu doa tidak sama dengan warna bintang, dsb) harus diporting jadi test otomatis (Vitest/Playwright) dan **lulus**.
6. **Lisensi engine.** `index.html` memuat header: *"Milky Way Galaxy — Copyright © 2026 Justin Zhang Jun. PolyForm Noncommercial License 1.0.0"*. Pertahankan file lisensi (`THIRD-PARTY-NOTICES.md`) apa adanya dan jangan hapus atribusi ini dari kode sumber. Jika produk ini akan dikomersialkan, catat sebagai risiko terbuka di dokumentasi — jangan diam-diam dihapus.

---

## 2. PEMETAAN SUMBER PROTOTIPE → ARSITEKTUR TARGET

| Sumber saat ini (frontend-only) Tujuan porting                                                                                       |                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html` (engine three.js: galaksi, sky view, solar view, cinema mode, quick-jump strip)                                         | Komponen React Three Fiber `<GalaxyEngine />` di `apps/web`, logic kamera & partikel dipindah ke hooks (`useGalaxyCamera`, `useStarField`), tetap pakai three.js di baliknya (boleh R3F sebagai wrapper deklaratif, sesuai PRD §12 "Canvas dan Three.js atau React Three Fiber")                                                            |
| `untukmu/untukmu.css` (token warna, `.um-*` classes)                                                                                 | Port jadi Tailwind `theme.extend` tokens (warna, radius) + tetap pertahankan nama class semantik lewat `@layer components` agar HTML/JSX hasil porting tidak perlu redesain kelas satu per satu                                                                                                                                             |
| `untukmu/js/um-app.js` (bootstrap, dock, kontrol sky)                                                                                | `apps/web/src/app/(galaxy)/layout.tsx` + provider global                                                                                                                                                                                                                                                                                    |
| `untukmu/js/um-galaksi.js` (1336 baris — logic pemilihan titik, cincin penanda, penerbangan kamera, sebaran partikel piringan/sabuk) | `apps/web/src/features/galaxy/*` — pertahankan SEMUA konstanta (`JARI_KURSOR_PX=10`, `TOLERANSI_LAYAR=0.75`, `PX_CINCIN=46`, `JARAK_TIBA_REL=0.7`) persis sama                                                                                                                                                                              |
| `untukmu/js/um-ui.js` (1158 baris — semua layar: entry, komposer, dashboard, jelajah, doa, setup, pengaturan)                        | Komponen React per layar di `apps/web/src/features/*/screens/*.tsx`, render logic (`renderEntry`, `renderKomposer`, `renderDash`, `renderJelajah`, `renderDoa`, `renderSetup`, `renderSet`) jadi komponen dengan state React/Zustand, tapi markup & class tetap sama                                                                        |
| `untukmu/js/um-store.js` (IndexedDB: `galaksi`, `pesan`, `doa`, `meta`)                                                              | Diganti **client API layer** (`apps/web/src/lib/api/*.ts`, fetch ke FastAPI) + React Query untuk cache; skema field yang sudah ada (`dibuat`, `sabuk: true`, `sendiri`/`piringan: true`) dipetakan langsung ke kolom tabel Postgres yang setara (lihat §5)                                                                                  |
| `untukmu/js/um-crypto.js`                                                                                                            | Modul `apps/web/src/lib/crypto/*.ts`, ganti PBKDF2→Argon2id (WASM, Web Worker), tetap AES-256-GCM, tambahkan alur kunci pemulihan (recovery key) sesuai PRD §9.7/§14 Fase 4                                                                                                                                                                 |
| `untukmu/js/um-doa.js`                                                                                                               | Logic pemilihan tradisi + audio doa terkurasi → `apps/web/src/features/doa/*`, audio file tetap dari `audio/` (lihat `audio/README.md` untuk sumber kurasi) disajikan lewat objek storage (R2/MinIO) atau tetap sebagai static asset jika lisensinya memperbolehkan                                                                         |
| `untukmu/js/um-i18n.js` (538 baris, multi-bahasa)                                                                                    | Port ke `next-intl` atau tetap dictionary custom sama persis — **PRD §4.2 menyatakan penerjemahan ke bahasa lain di luar cakupan awal**, jadi cukup pertahankan struktur i18n yang ada tapi kunci default & satu-satunya locale aktif di produksi adalah `id` (Bahasa Indonesia); jangan hapus infrastrukturnya karena berguna untuk Fase 5 |
| `untukmu/js/um-tests.js`                                                                                                             | Porting ke `apps/web/tests/*.spec.ts` (Vitest) — pertahankan semua assertion, terutama pengecekan warna debu doa (`#ffd9a0` dicampur warna galaksi) harus berbeda dari warna bintang pesan                                                                                                                                                  |
| `images/*`, `audio/*`                                                                                                                | Pindah ke `apps/web/public/` untuk aset statis non-user-generated, atau ke object storage untuk lampiran/foto yang diunggah pengguna (lihat §6)                                                                                                                                                                                             |

---

## 3. STACK TEKNOLOGI (wajib, dari PRD §12 — jangan diganti komponen lain tanpa alasan kuat yang didokumentasikan)

**Frontend** — `apps/web`

- Next.js (App Router) + TypeScript (strict mode)
- Tailwind CSS (tokenized dari `untukmu.css`)
- Framer Motion (animasi antarmuka non-3D: transisi layar, komposer, chip, tombol)
- Three.js + React Three Fiber (visualisasi galaksi, sky view, solar view)
- React Query / TanStack Query untuk data fetching & cache
- Zustand (atau React Context) untuk state UI lokal (langkah komposer, filter jelajah, dll)

**Backend** — `apps/api`

- FastAPI (Python 3.11+)
- SQLAlchemy 2.x (async) + Alembic untuk migrasi
- PostgreSQL 15+
- Redis (cache + rate limiting + task queue ringan)
- Cloudflare R2 atau MinIO (S3-compatible) untuk foto/lampiran terenkripsi
- Autentikasi: JWT (access + refresh token)
- Hash kata sandi: Argon2id (`passlib[argon2]` atau `argon2-cffi`)
- Enkripsi pesan: AES-256-GCM dilakukan **di klien**; backend hanya menyimpan ciphertext + metadata (backend TIDAK melakukan enkripsi/dekripsi isi pesan privat)

**Infrastruktur**

- Docker + docker-compose (web, api, postgres, redis, minio/lokal untuk dev)
- Nginx atau Caddy sebagai reverse proxy
- Sentry (error tracking) + Grafana (metrics) — opsional untuk MVP, tapi siapkan hook-nya
- GitHub Actions CI: lint → test → build (mengikuti `README.md` lama: `npm run lint`, `npm run test`, `npm run build`)
- Cloudflare Turnstile untuk anti-bot di form pendaftaran & pengiriman pesan publik

---

## 4. KEBUTUHAN FUNGSIONAL — CHECKLIST WAJIB (dari PRD §9, dipetakan ke layar yang SUDAH ADA di prototipe)

Untuk setiap poin, layar/komponen prototipe yang relevan sudah disebutkan — **selesaikan dengan memperluas komponen itu**, bukan membuat layar baru dari nol.

### 9.1 Halaman Utama (`renderEntry` di `um-ui.js`)

- [ ] Penjelasan singkat filosofi produk (sudah ada) — pertahankan copy
- [ ] Tombol mulai menulis pesan → buka komposer
- [ ] Tombol jelajahi pesan publik → `bukaJelajah()`
- [ ] Ringkasan kebijakan privasi & keamanan data (tambahkan link ke halaman kebijakan privasi lengkap, buat sebagai halaman statis Next.js baru `app/kebijakan-privasi/page.tsx`)

### 9.2 Pembuatan Pesan (`renderKomposer`, alur `um-steps`)

- [ ] Step 1: pilih pihak yang dituju — kategori tersedia (orang tua, saudara, sahabat, pasangan, seseorang, diri sendiri) **atau kategori khusus buatan pengguna** (field custom sudah ada di `comp.newKategori`, pastikan tervalidasi & tersimpan)
- [ ] Step 2: representasi visual — unggah foto **atau** simbol cahaya (sudah ada `comp.newFoto`); untuk versi final, unggahan foto **wajib dienkripsi di klien sebelum diunggah** ke object storage (PRD §10.1)
- [ ] Step 3: isi pesan + atribut opsional (foto tambahan, tanggal, mood/suasana hati, tag, lampiran) — field sudah ada di `comp.isi/tanggal/mood/tag`
- [ ] Step 4: privasi — privat / publik anonim / tidak terdaftar (`um-priv-opt`, sudah ada tiga opsi) — pastikan backend menyimpan `visibility` enum yang sesuai dan menerapkan aturan akses per level

### 9.3 Halaman Constellation/Galaksi

- [ ] Setiap pesan = satu titik bintang yang bisa diklik untuk membaca isi (sudah ada, logic klik di `um-galaksi.js`)
- [ ] Tampilkan tanggal & jumlah pendoa pada pesan publik (field `jumlahDoa` sudah ada di store)
- [ ] **Dukung constellation dengan lebih dari satu pihak dituju**, termasuk pesan ke beberapa pihak sekaligus — ini **belum ada di prototipe**, harus ditambahkan: skema many-to-many antara `messages` dan `constellations` (lihat §5), plus UI untuk memilih multi-galaksi tujuan di komposer step 1

### 9.4 Halaman Jelajah (`renderJelajah`, `bukaJelajah`)

- [ ] Tidak ada follower/following/like/ranking (sudah sesuai — prototipe memang tidak punya fitur itu; pastikan tetap begitu saat porting)
- [ ] Tampilkan jumlah pendoa + opsi beri tanda empati (`act === 'empati'` sudah ada di ui, sambungkan ke endpoint backend)
- [ ] Opsi laporkan konten (`act === 'report'` sudah ada di ui sebagai toast, **buat sungguhan**: kirim ke tabel `reports` di backend, masuk antrian moderasi)

### 9.5 Fitur Doa (`renderDoa`, `um-doa.js`)

- [ ] Pilihan tradisi: Islam, Kristen, Katolik, Hindu, Buddha, Konghucu, doa umum non-denominasi — cek daftar tradisi di `um-doa.js` sudah lengkap sesuai PRD, kalau ada yang kurang lengkapi
- [ ] Konten doa dari sumber kredibel & terkurasi (bukan AI-generated) — audit ulang isi `audio/` dan pastikan setiap file punya sumber/atribusi tercatat (lihat `audio/README.md`), lengkapi metadata sumber di database (`prayers.source_attribution`)
- [ ] Setelah audio selesai diputar → tambah penanda bintang doa di galaksi + update jumlah pendoa (logic sudah ada di `um-ui.js` sekitar baris 897-912, sambungkan ke endpoint backend `POST /messages/{id}/prayers`)

### 9.6 Dashboard Pribadi (`renderDash`, `renderDashPesan`)

- [ ] Ringkasan: jumlah pesan, jumlah pihak dituju, jumlah constellation/galaksi, jumlah doa diterima (kerangka sudah ada, sambungkan ke query backend agregat)
- [ ] Daftar galaksi milik pengguna
- [ ] Daftar pesan + status privasi masing-masing
- [ ] Riwayat doa yang diterima pada pesan publik

### 9.7 Autentikasi & Pengaturan Akun — **INI YANG PALING BESAR GAP-nya, belum ada backend/network di prototipe sama sekali**

- [ ] Pendaftaran via surel + kata sandi → `POST /auth/register`
- [ ] Masuk (login) → `POST /auth/login` (kembalikan access + refresh token JWT)
- [ ] Refresh token flow → `POST /auth/refresh`
- [ ] Pengaturan visibilitas pesan baku (default), visibilitas profil, riwayat sesi aktif (tabel `sessions` PRD §13) — tambahkan ke layar `renderSet`
- [ ] Pengaturan enkripsi termasuk **kunci pemulihan data** (recovery key) — prototipe sudah punya kerangka `unlockWithRecovery` di `um-ui.js`/`um-crypto.js`, lengkapi alur pembuatan & penyimpanan recovery key yang aman di sisi klien (tampilkan sekali saat registrasi, minta pengguna simpan sendiri, backend hanya simpan versi ter-hash/wrapped)

### 9.8 Moderasi Konten

- [ ] Semua konten publik lewat moderasi pra/pasca tayang — desain minimal: status `pending_review` → `published`/`rejected` di tabel `messages`, dengan job worker (bisa pakai Redis queue sederhana) untuk deteksi spam awal
- [ ] Fitur pelaporan (lihat 9.4)
- [ ] Fitur pemblokiran pengguna lain — tabel `blocks` baru (belum ada di §13, tapi implisit dibutuhkan; tambahkan)
- [ ] Deteksi spam & rate limiting pengiriman konten — pakai Redis (sliding window) di endpoint `POST /messages`
- [ ] Panel admin sederhana untuk peninjauan (boleh minimal: halaman terproteksi role `admin` di Next.js, list antrian moderasi + tombol approve/reject/hapus)
- [ ] **Pesan privat TIDAK masuk moderasi** — pastikan endpoint moderasi secara arsitektural tidak pernah punya akses ke ciphertext pesan privat yang bisa dibaca

---

## 5. SKEMA DATA (PRD §13 + field yang sudah eksis di `um-store.js`, disatukan)

Buat migrasi Alembic dengan tabel-tabel berikut (nama kolom contoh, boleh disesuaikan gaya penamaan tim asal konsisten):

```
users
  id (uuid, pk)
  email (unique)
  password_hash (argon2id)
  display_name
  default_message_visibility (enum: private|public_anon|unlisted)
  profile_visibility (enum)
  recovery_key_wrapped (text, nullable)  -- wrapped, bukan plaintext
  role (enum: user|admin)
  created_at, updated_at

sessions
  id (uuid, pk)
  user_id (fk users)
  refresh_token_hash
  user_agent, ip_hash
  created_at, last_seen_at, revoked_at (nullable)

constellations                -- "galaksi" di UI
  id (uuid, pk)
  owner_id (fk users)
  target_kind (enum: orang_tua|saudara|sahabat|pasangan|seseorang|diri_sendiri|custom)
  target_label (text)          -- nama custom jika target_kind = custom
  visual_type (enum: photo|light_symbol)
  visual_ref (text, nullable)  -- object storage key, terenkripsi jika foto
  created_at

message_constellations         -- tabel penghubung many-to-many (§9.3: pesan ke >1 pihak)
  message_id (fk messages)
  constellation_id (fk constellations)
  primary key (message_id, constellation_id)

messages                       -- "pesan/bintang"
  id (uuid, pk)
  author_id (fk users, nullable jika anonim penuh)
  ciphertext (bytea/text)
  iv (text)
  kdf_salt (text)
  encryption_meta (jsonb: algo, kdf, versi)
  mood (text, nullable)
  tag (text, nullable)
  date_label (date, nullable)   -- tanggal yang dipilih pengguna, bukan created_at
  visibility (enum: private|public_anon|unlisted)
  moderation_status (enum: pending|approved|rejected)  -- hanya relevan utk public_anon
  prayer_count (int, default 0)
  empathy_count (int, default 0)
  created_at

message_attachments
  id (uuid, pk)
  message_id (fk messages)
  storage_key (text)            -- R2/MinIO, terenkripsi di klien sebelum unggah
  content_type
  created_at

prayers                        -- "debu doa"
  id (uuid, pk)
  message_id (fk messages)
  visitor_id (nullable, anon)
  tradition (enum: islam|kristen|katolik|hindu|buddha|konghucu|umum)
  prayer_type (text)
  played_audio_ref (text)       -- rujukan konten doa terkurasi
  created_at

reports
  id (uuid, pk)
  message_id (fk messages)
  reporter_id (nullable, anon)
  reason (text)
  status (enum: open|reviewed|dismissed)
  created_at, reviewed_at

blocks
  id (uuid, pk)
  blocker_id (fk users)
  blocked_id (fk users)
  created_at

```

Catatan penting: kolom `ciphertext`/`iv`/`kdf_salt` **wajib tersimpan sebagai data buram** — tidak ada satu pun endpoint backend yang melakukan dekripsi isi pesan privat. Backend hanya boleh membaca metadata (visibility, mood, tag, tanggal, jumlah doa) untuk keperluan tampilan agregat & moderasi konten publik (yang memang tidak terenkripsi konten publiknya — cek ulang di PRD §9.8: "Pesan dengan status privat tidak termasuk dalam proses moderasi karena isi pesan tidak dapat dibaca" → implikasinya pesan **publik anonim** isinya harus bisa dibaca sistem untuk moderasi, jadi HANYA pesan `visibility = private` yang terenkripsi dengan master key milik pengguna; pesan `public_anon`/`unlisted` dienkripsi dengan **kunci bersama** (`shareKey`, konsep ini sudah ada di komentar `um-crypto.js`) supaya tetap terenkripsi saat transit/rest tapi bisa didekripsi backend/moderator saat perlu ditinjau).

---

## 6. KONTRAK API MINIMUM (REST, FastAPI, prefiks `/api/v1`)

```
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
GET    /auth/sessions
DELETE /auth/sessions/{id}

GET    /constellations               (milik user login)
POST   /constellations
GET    /constellations/{id}
PATCH  /constellations/{id}
DELETE /constellations/{id}

POST   /messages
GET    /messages/{id}
PATCH  /messages/{id}
DELETE /messages/{id}
GET    /constellations/{id}/messages

GET    /explore                      (feed publik anonim, paginated, filter+sort)
POST   /messages/{id}/empathy
POST   /messages/{id}/prayers
GET    /prayers/traditions

GET    /dashboard/summary
GET    /dashboard/messages
GET    /dashboard/prayers-received

POST   /reports
GET    /admin/moderation/queue        (role=admin)
POST   /admin/moderation/{message_id}/decision

POST   /uploads/presign               (presigned URL ke R2/MinIO untuk foto/lampiran terenkripsi)

POST   /users/blocks
DELETE /users/blocks/{id}
PATCH  /users/me/settings

```

Semua endpoint yang menulis konten (`POST /messages`, `POST /constellations`, `POST /reports`) wajib melalui rate limiter Redis dan (untuk endpoint publik/anonim) Cloudflare Turnstile verification.

---

## 7. KEBUTUHAN NON-FUNGSIONAL (PRD §10 — jadikan bagian dari Definition of Done)

- **Keamanan (§10.1):** HTTPS/TLS wajib di semua environment kecuali dev lokal; Argon2id untuk password; AES-256-GCM client-side untuk isi pesan privat; foto/lampiran dienkripsi di klien sebelum upload.
- **Performa (§10.2):** cache Redis untuk feed jelajah & dashboard summary; rate limiting di semua endpoint penulisan.
- **Skalabilitas (§10.3):** desain query dengan index yang tepat (terutama `messages.visibility + moderation_status` untuk feed jelajah, `prayers.message_id`), siapkan connection pooling (pgbouncer opsional).
- **Aksesibilitas & responsif (§10.4):** mobile-first — prototipe sudah pakai `env(safe-area-inset-*)` dan grid responsif (`um-grid2` collapse di `max-width:640px`), pertahankan breakpoint itu; audit kontras warna teks (`--um-muted: #9ca3af` di atas latar gelap) memenuhi WCAG AA minimal untuk teks yang lebih besar.

---

## 8. URUTAN PENGERJAAN (mengikuti PRD §14, jangan loncat fase)

1. **Fase 1 — Fondasi:** setup monorepo (`apps/web`, `apps/api`), migrasi skema §5, auth (register/login/refresh), CRUD constellation & pesan privat dengan enkripsi klien penuh, port tampilan galaksi (engine three.js) 1:1 ke R3F, dashboard dasar.
2. **Fase 2 — Sosial:** halaman jelajah, publikasi publik anonim, empati, pelaporan, pemblokiran, antrian moderasi + panel admin minimal.
3. **Fase 3 — Doa:** tradisi keagamaan, audio terkurasi, penanda debu doa, penghitung pendoa real-time (bisa polling ringan atau WebSocket opsional).
4. **Fase 4 — Lanjutan:** constellation multi-pihak (tabel `message_constellations`), kunci pemulihan penuh, ekspor data terenkripsi milik pengguna.
5. **Fase 5 — Penyempurnaan:** audit performa animasi kamera, aksesibilitas, PWA (manifest + service worker, tanpa mengubah tampilan), audit keamanan menyeluruh sebelum rilis.

Di akhir setiap fase: jalankan `npm run lint && npm run test && npm run build` (frontend) dan `pytest` + `alembic upgrade head --sql` dry-run (backend) — **jangan lanjut fase berikutnya kalau ada yang gagal.**

---

## 9. DEFINITION OF DONE (kriteria "siap pakai, tanpa error 100%")

- [ ] `docker-compose up` menyalakan web + api + postgres + redis + minio, seluruh alur pengguna utama (§8.1 dan §8.2 PRD) bisa dijalankan end-to-end dari browser tanpa error console/network.
- [ ] Tampilan galaksi, semua layar (`entry`, komposer 4 langkah, dashboard, jelajah, doa, setup, pengaturan) **identik secara visual** dengan `Untukmu.zip` asli — lakukan perbandingan screenshot side-by-side sebelum dianggap selesai.
- [ ] Tidak ada data yang tersimpan di IndexedDB lokal sebagai sumber kebenaran produksi — semuanya lewat API.
- [ ] Semua 8 kebutuhan fungsional §9.1–9.8 PRD terimplementasi dan bisa didemokan.
- [ ] Semua checklist keamanan §10.1/§11 terpenuhi, terutama: server tidak pernah bisa membaca isi pesan `visibility = private`.
- [ ] Test otomatis (porting dari `um-tests.js` + test backend baru) hijau semua di CI.
- [ ] README baru menjelaskan cara menjalankan dev & production, termasuk env var yang dibutuhkan (DB URL, JWT secret, R2/MinIO credentials, Turnstile keys).

---

Mulai dari **Fase 1**, dan di setiap langkah besar, laporkan file apa yang diporting dari sumber lama ke mana, supaya bisa diverifikasi tidak ada bagian tampilan yang berubah tanpa sengaja.