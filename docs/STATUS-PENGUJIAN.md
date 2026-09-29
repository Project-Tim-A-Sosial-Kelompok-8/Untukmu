# Status pengujian

Paket Fase 1–5, 24 September 2026. Pengujian dilakukan terhadap source di paket, bukan server produksi.

| Pemeriksaan | Hasil |
| --- | --- |
| TypeScript strict + ESLint | Lulus |
| Vitest | 37 lulus: 33 assertion prototipe pada fixture sumber + 4 batas migrasi |
| Next.js production build | Lulus; halaman `/`, `/admin`, `/bagi`, kebijakan privasi, ikon dan manifest |
| Ruff API/tests/migrations/scripts | Lulus |
| pytest API | 33 lulus, SQLite dengan foreign keys dan fakeredis |
| Alembic PostgreSQL `upgrade head --sql` | Lulus sampai `0004_recovery`; SQL disertakan |
| `pip check` | Lulus; dependensi terpasang konsisten |
| Audit npm dependensi produksi | 0 advisory dilaporkan; JSON disertakan |
| Integritas arsip | 203/203 entri utuh; 175/175 salinan aplikasi identik |
| Visual entry desktop/mobile | Posisi, ukuran, font, warna, padding dan radius empat elemen utama cocok dengan sumber |
| Browser akhir | 6/6 lulus dalam 2,5 menit; hasil terstruktur di `docs/quality/browser-results.json` |

## Cakupan browser

- Pendaftaran, kode pemulihan sekali tampil, penyimpanan privat, tidak adanya isi rahasia dalam request, reload, unlock, dan penolakan perubahan AAD.
- Pengunjung tanpa data contoh dan tanpa IndexedDB produksi.
- Publikasi, antrean moderasi, persetujuan, jelajah anonim, empati, laporan, tujuh tradisi, dan sesi hening nyata.
- Multi-tujuan, recovery penuh, master key tetap dapat membuka pesan lama, ekspor dan pembacaan/verifikasi ekspor.
- Fokus keyboard, perpindahan galaxy/sky, mode sinema, viewport ponsel, manifest, cache allowlist, serta fallback luring.
- Perbandingan halaman masuk 1280×800 dan 390×844 terhadap prototipe. Screenshot disertakan di `docs/visual`.

## Perbaikan akhir

Dialog akun melepaskan fokus dan status `inert` saat mulai ditutup agar input komposer dapat langsung digunakan. Nama, kategori khusus, isi, dan tanggal diserap saat pengguna mengetik; render asinkron yang lebih lama tidak menimpa langkah terbaru. Regresi nama yang hilang setelah pemilihan kategori telah diperbaiki dan diuji ulang tiga kali.

## Lingkungan uji

Node 22, Next.js 16.3.6, Python 3.12, Chromium headless. Peringatan konfigurasi proxy npm dan konflik NO_COLOR/FORCE_COLOR berasal dari runner pengujian. Build aplikasi tidak menghasilkan error TypeScript; uji browser memeriksa error runtime pada alur yang dicatat.

## Batas kesimpulan

Tidak ada bukti Docker Compose, PostgreSQL/Redis/MinIO sungguhan, unggah audio nyata, Turnstile produksi, perangkat fisik, ataupun audit screen reader menyeluruh. Kesamaan empat elemen entry dan hash CSS/aset bukan bukti pixel-identik semua layar dinamis. `npm audit` tidak mencakup vendor Three dari ZIP; advisory Python tidak dipindai penuh. Test prototipe bukan bukti API produksi; karena itu uji API dan browser dicatat terpisah.

Harness mempertahankan maksud assertion lama dengan pembetulan representasi Float32 dan sintaks constructor di fixture, tanpa mengedit berkas asli. Data demonstrasi hanya hidup dalam harness prototipe. Uji aplikasi produksi menggunakan akun pengujian dan layanan API sebenarnya dengan database uji, bukan store tiruan di frontend.
