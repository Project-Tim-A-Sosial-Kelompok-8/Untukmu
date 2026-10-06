# Katalog doa dan audio tim

Katalog asli berasal dari `frontend/visual/prayers.js` (sebelumnya `um-doa.js`). Salinan API berada di `backend/data/prayers-v1.json`; tes memastikan keduanya sama. Tujuh pilihan mengikuti PRD: Islam, Kristen, Katolik, Hindu, Buddha, Konghucu, dan Umum.

Pengguna memilih ucapan publik, tradisi, dan jenis doa. Tidak ada formulir doa manual. Setelah audio selesai atau sesi hening berakhir, dukungan dicatat secara idempoten pada pesan tujuan. Mengakhiri sesi sebelum selesai tidak menambah jumlah doa.

Folder audio prototipe hanya memuat README; checkout ini tidak memiliki rekaman asli tim. Rekaman dan daftar rujukan internet tambahan telah dihapus sesuai permintaan. Entri yang belum memiliki audio/kurasi tetap diberi status belum tersedia. Pilihan Umum/hening dapat digunakan langsung.

Kurator mengunggah berkas asli melalui panel admin, mengisi lisensi, atribusi, durasi, dan catatan peninjauan, lalu meninjau teks dan audio sebelum menyetujui. Audio unggahan lama milik tim tidak dihapus oleh migrasi. Sistem tidak membuat rekaman pengganti atau menyetujui materi agama otomatis.
