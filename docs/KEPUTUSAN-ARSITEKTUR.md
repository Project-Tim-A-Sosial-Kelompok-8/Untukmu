# Keputusan arsitektur Fase 1–5

## Mempertahankan sumber

`apps/web/legacy` adalah acuan yang tidak diedit. Semua 203 berkas arsip tetap ada dalam `referensi/Untukmu-asli.zip`; 175 berkas aplikasi di luar riwayat Git juga tersedia sebagai salinan kerja identik. Aset gambar, tekstur, font/vendor, kamus bahasa, CSS, dan katalog asli disertakan. `scripts/verify_original.py` memeriksa hash setiap berkas.

Build menyalin aset lalu menerapkan transformasi yang memerlukan kecocokan anchor pada JavaScript asli. Build gagal jika sumber berubah dan anchor hilang. Keluaran `public/engine` dapat dibuat ulang dan tidak menjadi sumber utama. Data contoh, IndexedDB, kunci bersama prototipe, dan skrip tes prototipe tidak disertakan dalam runtime produksi.

## React, iframe, dan R3F

Next.js menggunakan iframe dengan origin yang sama untuk mempertahankan geometri viewport, aturan CSS, kamera, shader, dan handler pointer asli. Markup layar lama yang sudah di-escape dipetakan melalui AST ke React roots `EntryScreen`, `ComposerScreen`, `DashboardScreen`, `ExploreScreen`, `PrayerScreen`, `EncryptionScreen`, `SettingsScreen`, dan `GalaxyCard`, tanpa wrapper tambahan. Controller JavaScript asli masih mengatur alur layar. Ini port hibrida, bukan penulisan ulang seluruh logika imperatif ke JSX.

R3F memiliki satu render loop. `useGalaxyCamera` mengikuti kamera galaxy/sky/solar asli; `useStarField` menjalankan frame engine pada prioritas yang mematikan render pass ganda. Renderer, scene, tone mapping, kamera, dan shader asli tetap digunakan. Vendor Three r128 dari ZIP dipertahankan untuk kesetiaan visual; dependensi Three modern digunakan oleh R3F. Interoperabilitas ini perlu diuji ulang setiap pembaruan dependensi. Frame dihentikan saat tab tersembunyi; tingkat detail adaptif asli tetap berlaku.

## Batas enkripsi

- **Privat:** hanya ciphertext AES-256-GCM yang masuk ke API. Master key non-extractable disimpan di memori; versi raw hanya hidup sementara selama pembuatan/pembungkusan lalu buffer dihapus. Argon2id 64 MiB, 3 iterasi, paralelisme 1 berjalan di Worker. AAD mengikat ciphertext ke identitas dan jenis objek.
- **Foto/lampiran:** isi, nama, dan MIME dienkripsi bersama; bucket privat; presigned POST dibatasi ukuran dan MIME, penyelesaian diperiksa dengan HEAD, unduhan memerlukan pemilik.
- **Publik/tautan terbatas:** isi memang diberikan kepada sistem moderasi, dienkripsi saat tersimpan dengan `PUBLIC_CONTENT_KEY` khusus server. Ini sesuai batas moderasi dalam instruksi kerja; bukan E2EE. Kunci ini berbeda dari master key privat dan tidak dibundel ke browser. Lampiran tetap privat.
- **Tautan terbatas:** token acak 256 bit dikirim sekali kepada pemilik; server menyimpan HMAC. Token ada dalam fragment URL dan header saat mengambil isi, bukan query URL. Tautan tidak masuk feed dan memerlukan persetujuan moderator.
- **Pemulihan:** kode acak 256 bit membungkus master key. Verifier autentikasi pemulihan dipisah melalui SHA-256 berdomain dan di-hash Argon2id pada server. Challenge 5 menit terikat versi verifier. Row lock dan perubahan versi menolak pemakaian ulang; seluruh sesi lama dicabut.
- **Ekspor:** server hanya mengembalikan data akun yang berwenang. Klien membuka isi/media, lalu mengenkripsi satu paket mandiri dengan kata sandi ekspor terpisah. Ekspor gagal bila satu berkas tidak dapat dibaca; tidak diam-diam melewatkan lampiran. Verifikasi di perangkat tidak mengimpor data. Dataset sangat besar masih memerlukan ekspor streaming pada pengembangan berikutnya.

Metadata tujuan, suasana hati, tag, tanggal, ukuran unggahan, dan identitas akun tetap terlihat layanan. Proteksi E2EE tidak mengamankan perangkat yang sudah dikuasai atau skrip berbahaya yang berhasil berjalan saat kunci terbuka.

## Moderasi dan doa

Worker memindai hanya pesan publik/tautan terbatas yang belum diperiksa. Penanda spam tidak otomatis menyetujui konten. Antrean tersimpan di database, sehingga kehilangan notifikasi Redis tidak menghilangkan pekerjaan. Keputusan manusia menyimpan reviewer, waktu, alasan, dan token revisi untuk mencegah persetujuan versi yang berubah.

Katalog migrasi adalah snapshot sumber asli tujuh tradisi. Entri agama belum diberi stempel kurasi. Tidak ada audio di arsip asal. Jalur unggah audio mengharuskan ukuran/MIME/lisensi/atribusi/durasi; pemeriksaan isi dan hak penggunaan tetap tugas operator/kurator.

Sesi doa memeriksa durasi, pengunjung, pesan, serta versi entri. Indeks unik mencegah penghitung ganda. Server tidak dapat membuktikan seseorang benar-benar mendengar audio; waktu minimum hanya menolak penyelesaian instan. Pengenal anonim berbasis HMAC jaringan dapat menyatukan pengguna pada jaringan yang sama; bukan hitungan manusia unik sempurna. Debu berasal dari catatan doa nyata, tidak dari pesan contoh.

## PWA dan aksesibilitas

Service worker hanya menyimpan aset publik pada allowlist, dibatasi 128 entri dan versi berbasis hash runtime. API, akun, HTML navigasi, unggahan, token, dan hasil dekripsi tidak di-cache. Saat luring, aplikasi menunjukkan halaman penyambungan kembali. Tidak ada janji membuka pesan privat secara luring.

Semantik dialog, inert untuk layar tertutup, navigasi Tab, pengembalian fokus, Escape, status pesan, dan focus-visible ditambahkan tanpa mengganti CSS asli. Reduced motion asli dipertahankan. Belum ada sertifikasi WCAG atau audit pembaca layar/perangkat fisik menyeluruh.
