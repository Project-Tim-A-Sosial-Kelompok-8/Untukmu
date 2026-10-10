# Katalog doa dan audio tim

Katalog utama berada di `backend/data/prayers-v1.json`. `frontend/visual/prayers.js` hanya menyediakan registry; build memasukkan katalog utama ke keluaran frontend dan tes memastikan kesamaannya. Tujuh pilihan mengikuti PRD: Islam, Kristen, Katolik, Hindu, Buddha, Konghucu, dan Umum.

Setiap tradisi dan jenis doa bisa diklik untuk membuka teks/arti jika tersedia, atribusi, tautan sumber, dan status kurasi. Pratinjau belum ditinjau tidak dinyatakan sebagai materi yang telah disetujui. Kutipan pembuka doa sebelum belajar Konghucu diambil dari Buku Siswa Kelas V SD Kementerian Pendidikan dan Kebudayaan, dengan tautan dokumen resmi; labelnya menjelaskan bahwa ini kutipan. Materi yang sudah dikurasi tim tidak ditimpa migrasi.

Pengguna memilih ucapan publik melalui tombol **Doakan** di Jelajah atau melalui halaman Doa, lalu memilih tradisi dan jenis doa. Tombol **Dengarkan dan kirim doa** tampil tepat setelah pilihan jenis doa; untuk Umum, gunakan **Mulai hening dan kirim dukungan**. Setelah audio selesai atau sesi hening berakhir, dukungan dicatat secara idempoten pada pesan tujuan dan konfirmasi ditampilkan. Mengakhiri sesi sebelum selesai tidak menambah jumlah doa.

Checkout ini menyertakan paket rekaman asli dari internet yang dipilih berdasarkan sumber, bahasa, atribusi, lisensi, durasi berkas, dan checksum. Ini tidak mengklaim persetujuan khusus seorang tokoh atau lembaga agama. Entri lain yang belum memiliki audio/kurasi dapat dibaca sebagai pratinjau. Pilihan Umum/hening tersedia tanpa audio.

Kurator dapat mendengarkan paket rekaman di panel admin sebelum mengubah kurasi, atau mengunggah berkas asli tim dengan lisensi, atribusi, durasi, dan catatan peninjauan. Audio unggahan lama milik tim tidak dihapus oleh migrasi. Rekaman tidak disintesis dan tidak diubah isinya. Referensi teks lain yang belum ditinjau tidak disetujui hanya karena tersedia tautan sumber.

## Paket rekaman dari internet

| Pilihan | Rekaman dan bahasa | Sumber asli | Izin penggunaan |
| --- | --- | --- | --- |
| Islam | Al-Fatihah, Arab, Ibrahimmusa4 | [AlFātihatulKitāb](https://commons.wikimedia.org/wiki/File:AlF%C4%81tihatulKit%C4%81b.ogg) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Kristen dan Katolik | Bapa Kami / Pater Noster, Latin, Dan Palraz | [Pater-Noster](https://commons.wikimedia.org/wiki/File:Pater-Noster.ogg) | CC0 1.0 |
| Hindu | Gayatri, Sanskerta, Wilfredor | [Gayatri mantra](https://commons.wikimedia.org/wiki/File:Gayatri_mantra.ogg) | CC0 1.0 |
| Buddha | Karaniya Metta Sutta, Inggris, Dawn Neal; terjemahan Amaravati | [AudioDharma / Insight Meditation Center](https://irc.audiodharma.org/talks/4293) | [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/), rekaman utuh, atribusi, penggunaan nonkomersial |
| Konghucu | Teks referensi tersedia; rekaman dengan izin distribusi yang jelas belum ditemukan | Buku siswa resmi pada tautan entri | Rekaman belum dipasang |
| Umum | Hening sejenak | Sesi hening tanpa audio | Tersedia untuk semua pengunjung |

Al-Fatihah merupakan jenis doa tambahan; audio itu tidak dipasang pada doa Rabbana atau doa jenazah. Pater Noster ditandai sebagai bahasa Latin. Karaniya Metta memakai rekaman Inggris asli. Jenis doa lain yang belum ditinjau tetap berstatus pratinjau. Pilihan tradisi tidak diganti rekaman dari agama lain.

Berkas berada pada `backend/data/prayer-audio/`. `manifest.json` mencatat sumber, bahasa, lisensi, ukuran, durasi, dan SHA-256. SHA-1 tiga rekaman Commons cocok dengan metadata penerbit. Semua rekaman berhasil didekode dan diputar di browser; durasi sesi dibulatkan ke atas dari durasi berkas: 93, 29, 21, dan 287 detik. Durasi berkas Buddha yang didekode lebih panjang dari angka 4:40 pada halaman sumber, sehingga sesi memakai durasi berkas. `scripts/fetch_prayer_recordings.py` mengunduh ulang sumber yang sama, memverifikasi checksum berkas, dan menghormati permintaan jeda server. Migrasi `0010_original_recordings` menambahkan lima pilihan rekaman tanpa mengganti materi/rekaman yang telah dikurasi tim. Data migrasi dibekukan pada `backend/alembic/catalog-recordings-v1.json`.

Rekaman disajikan lewat API pada origin aplikasi; pengguna tidak perlu menghubungi situs sumber untuk memutarnya. Pemutar menampilkan bahasa, atribusi, dan tautan lisensi. Mendengarkan pratinjau tidak menambah hitungan. Menutup dialog atau berpindah pilihan menghentikan pratinjau; pemutar pratinjau disembunyikan selama sesi aktif.

Tombol **Berikutnya: pilih ucapan** melanjutkan pilihan tradisi dan jenis doa ke ucapan tujuan. Tombol **Ucapan berikutnya** berpindah halaman daftar ucapan; tombol itu nonaktif saat hasil habis, dengan alasan yang terlihat. Pilihan doa tetap tersimpan saat berpindah halaman. Jika belum ada ucapan publik yang disetujui, aplikasi menjelaskan keadaan tersebut tanpa membuat ucapan palsu.

Untuk pemasangan komersial, rekaman AudioDharma harus diganti dengan rekaman yang izinnya sesuai. Peninjauan oleh perwakilan tradisi tetap bagian persiapan produksi; paket referensi ini tidak dinyatakan sebagai persetujuan institusi agama.
