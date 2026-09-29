# Audit internal Fase 5

Audit kode dan pengujian otomatis dilakukan pada 24 September 2026. Ini bukan audit independen atau jaminan bebas kerentanan.

| Area | Bukti dan hasil |
| --- | --- |
| Kepemilikan data | Uji silang akun pada galaksi, pesan, media, ekspor, blokir, dan sesi; akses tidak sah ditolak |
| Batas plaintext | Skema privat menolak field isi publik; error validasi tidak mengulang nilai rahasia; browser memeriksa request tanpa kata sandi, kode pemulihan, atau isi privat |
| Kripto | AES-GCM dan AAD; ciphertext yang AAD-nya diubah ditolak; file didekripsi kembali sesuai nama/isi; recovery mempertahankan data |
| Sesi | Cookie HttpOnly/SameSite, origin refresh/logout, rotasi refresh, penolakan replay, pencabutan setelah recovery |
| Publik/moderasi | Enkripsi konten publik saat tersimpan; private dikecualikan; antrean berbasis database; review token mencegah persetujuan versi lama |
| Interaksi sosial | Empati/doa idempoten, blokir dua arah, laporan, pembatasan laju Redis, penolakan doa pada konten belum disetujui |
| Unggahan | Kontrak presign membatasi ukuran/MIME; HEAD dengan ukuran berbeda ditolak; objek belum selesai dan milik akun lain tidak dapat diunduh |
| Tautan | Token diperlukan, pesan harus disetujui, tidak tampil pada explore, pencabutan langsung menolak pembacaan baru |
| PWA | Cache allowlist aset publik; pengujian tidak menemukan URL API/unggahan dalam cache; fallback luring bekerja |
| XSS/CSP | Teks di-escape sebelum markup React; tidak menampilkan SVG/HTML unggahan; CSP engine menggunakan hash inline script dan wasm-unsafe-eval khusus WASM, tanpa unsafe-eval JavaScript |
| Dependensi npm produksi | `npm audit --omit=dev --json`: 0 advisory dilaporkan pada lingkungan pengujian; JSON disertakan. Vendor Three asli di luar cakupan npm audit |
| Dependensi Python | Kunci versi cocok dengan lingkungan pengujian dan `pip check` lulus. Tidak ada hasil pemindaian advisory Python menyeluruh yang diklaim |
| Kamera | Mode galaxy/sky kembali normal, sinema dan resize diuji; metrics frame serta alokasi dicatat. Headless software WebGL bukan pengukuran FPS perangkat pengguna |
| Aksesibilitas | Semantik dialog, Tab, Escape, fokus, inert dan status; CSS asli dipertahankan. Audit manual screen reader/kontras semua keadaan belum dilakukan |
| Aset | 203 entri ZIP asli dan 175 salinan aplikasi cocok byte per byte dengan manifest SHA-256 |

## Pemeriksaan operator sebelum rilis publik

1. Jalankan Compose dengan PostgreSQL, Redis, MinIO/R2 nyata; uji unggah/unduh foto dan audio, CORS, migrasi, backup, serta pemulihan backup. Pengujian saat pengerjaan memakai SQLite/fakeredis dan kontrak object storage yang distub.
2. Pasang HTTPS dan `ENVIRONMENT=production`; buat JWT/PUBLIC_CONTENT_KEY/kredensial storage unik, atur APP_ORIGIN, Turnstile hostname/sitekey/secret, serta endpoint storage HTTPS. Build ulang web bila endpoint/key publik berubah. Simpan dan cadangkan PUBLIC_CONTENT_KEY agar pesan publik tetap terbaca.
3. Pastikan API tidak dapat diakses langsung dari internet; konfigurasi Uvicorn mempercayai reverse proxy pada jaringan Compose. Hanya gateway yang mengekspos aplikasi.
4. Minta kurator yang sesuai memeriksa teks agama dan sumber; unggah audio berlisensi yang benar, verifikasi durasi dan atribusi. Tanpa ini, entri terkait tetap belum aktif.
5. Uji kamera, pembaca layar, keyboard, sentuh, reduced motion, kontras, dan performa pada perangkat fisik. Pertahankan aset asli, sesuaikan optimasi hanya setelah pembandingan visual.
6. Tetapkan identitas/kontak pengelola, retensi backup, pembersihan objek yang tidak dipakai, dan prosedur laporan. Penghapusan pesan belum menghapus berkas yang tidak direferensikan dari bucket; foto/lampiran tersebut tetap termasuk ekspor pemilik.

Batas tambahan: tautan yang sudah dibuka/disalin orang lain tidak bisa menarik kembali salinan tersebut; ekspor besar membutuhkan memori browser; penghitungan anonim berbasis jaringan bukan identitas manusia. Kode pemulihan dan kata sandi ekspor harus disimpan sendiri.
