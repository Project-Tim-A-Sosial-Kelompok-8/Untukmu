# Revisi galaksi, navigasi, dan doa — 29 September 2026

Home/Rumah dan tombol kembali sekarang menuju Milky Way. Memuat ulang halaman tidak otomatis memindahkan kamera ke seluruh galaksi pengguna. Galaksi yang tersimpan tetap tersedia melalui Ruang Pribadi dan peta.

Perjalanan kamera memakai transisi halus, memperhitungkan lebar layar, dan membatalkan perjalanan sebelumnya saat Home dipilih. Galaksi tujuan memakai ribuan partikel dengan bentuk sesuai pilihan. Pada ponsel, posisi galaksi dan tinggi panel disesuaikan agar bentuk galaksi tetap terlihat.

Tulis memilih galaksi yang sedang dibuka; pengguna dapat mengganti tujuan atau membuat galaksi baru. Komposer menjelaskan tujuan ucapan, mencegah perubahan saat menyimpan, dan mengaktifkan kembali tombol setelah berhasil/gagal. Kegagalan memperbarui tampilan setelah penyimpanan tidak meminta pengguna menyimpan ucapan yang sama lagi.

Tombol Doa pada navigasi membuka daftar ucapan yang dapat didoakan. Panel doa menampilkan ucapan tujuan, tujuh pilihan agama/tradisi, status kurasi, dan langkah mulai/batal. Jika galaksi memuat beberapa ucapan publik yang disetujui, pengguna memilih ucapan terlebih dahulu. Doa agama yang belum dikurasi tetap ditandai belum tersedia; hening umum dapat digunakan. Pembatalan mengabaikan respons sesi lama, dan pengulangan pencatatan memakai token yang sama agar tetap idempoten.

Panel, tombol, dan pilihan panjang membungkus teks pada layar kecil. Render galaksi berhenti sementara di belakang formulir layar penuh dan berjalan kembali setelah formulir ditutup. Sesi autentikasi kedaluwarsa ditolak, katalog doa dibaca sebagai UTF-8 pada Windows, dan durasi yang ditampilkan mengikuti durasi audio.

## Validasi

Hasil pengujian akhir dicatat setelah pemeriksaan browser selesai. Pengujian API menggunakan SQLite/fakeredis; PostgreSQL, Redis, object storage, rekaman doa, dan perangkat fisik belum diuji langsung dalam revisi ini.

Sumber yang perlu diedit berada di `apps/web/legacy`, `apps/web/scripts`, dan `apps/web/src`. Jalankan `npm run prepare:engine --workspace apps/web` untuk menghasilkan ulang `apps/web/public/engine`; perubahan langsung pada folder hasil akan tertimpa. Pemeriksaan hash ZIP awal akan menunjukkan perbedaan pada sumber tampilan yang sengaja direvisi.
