# Deploy Vercel (multi-service)

Repositori ini memakai satu project Vercel dengan dua service:

| Service    | Root       | Framework | Publik                     |
| ---------- | ---------- | --------- | -------------------------- |
| `frontend` | `frontend/` | `nextjs`  | semua path selain `/api/*` |
| `backend`  | `backend/`  | `go`      | `/api/*`                   |

`vercel.json` di akar repo mengatur keduanya. Saat mengimpor project, biarkan
**Root Directory** kosong (akar repo), bukan `frontend/`.

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

Backend (Production):

- `ENVIRONMENT=production`
- `APP_ORIGIN=https://<domain-produksi>` (harus sama persis dengan Origin
  browser; preview deployment membutuhkan nilai sendiri)
- `DATABASE_URL=postgresql://...` (Neon/Postgres; jangan memakai SQLite di Vercel)
- `JWT_SECRET`, `PUBLIC_CONTENT_KEY`, `METRICS_TOKEN`
- `TURNSTILE_SECRET`, `TURNSTILE_HOSTNAME`
- `STORAGE_DIR=/tmp/untukmu-storage`
- `SENTRY_DSN` (opsional)

Frontend (build-time):

- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`

Jangan set `LISTEN_ADDR` di Vercel; server Go memakai `PORT` yang disuntikkan
Vercel. Jangan set `API_INTERNAL_URL` di Vercel; rewrite Next dimatikan di sana.

## Catatan produksi

- `STORAGE_DIR` di Vercel bersifat sementara. Upload pengguna tidak bertahan
  antar-instance/deploy. Untuk produksi, pindahkan penyimpanan ke Vercel Blob
  atau S3.
- Worker moderasi/cleanup berjalan di dalam proses API (`RunWorker`). Pada
  Vercel, proses hanya hidup selama instance function; jadwal berkala yang
  benar-benar andal perlu Cron/Daemon atau worker terpisah.
- `APP_ORIGIN` dan `TURNSTILE_HOSTNAME` bersifat per-domain; preview deployment
  memerlukan konfigurasi environment preview tersendiri.
