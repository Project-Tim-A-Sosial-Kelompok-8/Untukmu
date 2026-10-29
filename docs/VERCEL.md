# Deploy Vercel (multi-service)

Repositori ini memakai satu project Vercel dengan dua service:

| Service    | Root       | Framework | Publik                     |
| ---------- | ---------- | --------- | -------------------------- |
| `frontend` | `frontend/` | `nextjs`  | semua path selain `/api/*` |
| `backend`  | `backend/`  | `go`      | `/api/*`                   |

`vercel.json` di akar repo mengatur keduanya. Saat mengimpor project, biarkan
**Root Directory** kosong (akar repo), bukan `frontend/`.

Backend yang ada di repo ini adalah **Go** (`go.mod`, `cmd/untukmu`). Contoh
awal yang memakai `framework: "fastapi"` berasal dari backend Python lama; file
itu sudah tidak dipakai. Kalau backend FastAPI ingin dikembalikan, konfigurasi
dan kode backend harus diubah bersama, bukan hanya `vercel.json`.

## Routing

- Browser memanggil `/api/v1/...` (relatif). Rewrite teratas meneruskannya ke
  service `backend` dengan path yang sama; backend memang mendaftarkan route
  `/api/v1/...`.
- Semua request lain masuk ke `frontend`.
- `next.config.ts` hanya memakai rewrite `/api/v1` saat **bukan** di Vercel
  (`npm run dev`). Di Vercel rewrite itu dimatikan karena routing sudah
  ditangani `vercel.json`.

## Binding

Tidak ada binding pada konfigurasi ini. Frontend tidak melakukan panggilan
server-ke-server ke backend: yang memanggil API adalah browser lewat route
publik `/api`. Binding hanya diperlukan bila backend dibuat internal dan
frontend mem-proxy-nya lewat route handler runtime.

## Environment variable

Nilai siap pakai ada di `vercel.env.local` (tidak di-commit; berisi koneksi
database dan rahasia dari `.env` lokal). Format dan komentar ada di
`vercel.env.example`.

Backend (Production):

| Variabel | Nilai/format |
| --- | --- |
| `ENVIRONMENT` | `production` |
| `APP_ORIGIN` | `https://<domain-produksi>` — harus sama persis dengan Origin browser, tanpa slash akhir |
| `DATABASE_URL` | `postgresql://USER:PASSWORD@HOST/DB?sslmode=require` |
| `STORAGE_DIR` | `/tmp/untukmu-storage` |
| `JWT_SECRET` | 96 karakter hex acak |
| `PUBLIC_CONTENT_KEY` | 32 byte base64url, akhiri `=`; jangan dirotasi jika database sudah berisi pesan publik |
| `METRICS_TOKEN` | minimal 32 karakter acak |
| `TURNSTILE_SECRET` | secret key dari widget Cloudflare Turnstile |
| `TURNSTILE_HOSTNAME` | domain saja, mis. `untukmu.vercel.app` |
| `SENTRY_DSN` | opsional |
| `SITE_DOMAIN` | domain saja, opsional |

Frontend (build-time):

| Variabel | Nilai/format |
| --- | --- |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | site key Cloudflare Turnstile |

Jangan set `LISTEN_ADDR` di Vercel; server Go memakai `PORT` yang disuntikkan
Vercel. Jangan set `API_INTERNAL_URL` di Vercel; rewrite Next dimatikan di sana.

`ENVIRONMENT=production` akan menolak start jika `APP_ORIGIN` bukan https atau
`TURNSTILE_SECRET`/`TURNSTILE_HOSTNAME`/`PUBLIC_CONTENT_KEY` kosong.

## Catatan produksi

- `STORAGE_DIR` di Vercel bersifat sementara. Upload pengguna tidak bertahan
  antar-instance/deploy. Untuk produksi, pindahkan penyimpanan ke Vercel Blob
  atau S3.
- Worker moderasi/cleanup berjalan di dalam proses API (`RunWorker`). Pada
  Vercel, proses hanya hidup selama instance function; jadwal berkala yang
  benar-benar andal perlu Cron/Daemon atau worker terpisah.
- `APP_ORIGIN` dan `TURNSTILE_HOSTNAME` bersifat per-domain; preview deployment
  memerlukan konfigurasi environment preview tersendiri.
