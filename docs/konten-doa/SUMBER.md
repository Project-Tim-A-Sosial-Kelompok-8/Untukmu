# Rujukan doa — penelusuran 30 September 2026

PRD §8.2 dan §9.5 meminta pilihan tujuh tradisi, konten dari sumber kredibel yang dikurasi, audio, dan pencatatan setelah sesi selesai. Penelusuran web tidak dianggap sebagai persetujuan kurator agama. Tidak ada teks doa baru atau rekaman keagamaan yang dibuat oleh AI dalam revisi ini.

| Tradisi | Sumber yang ditemukan | Kesiapan rekaman untuk aplikasi |
| --- | --- | --- |
| Islam | [Al-Baqarah 2:201, Quran.com](https://quran.com/id/sapi-betina/201-221), [Qur’an Kemenag](https://quran.kemenag.go.id/) | Quran.com menyediakan tilawah di situsnya; izin distribusi ulang rekaman belum dikonfirmasi. |
| Kristen | [Matius 6:9, Lembaga Alkitab Indonesia](https://alkitab.or.id/cari-alkitab/bimk/matius/6/9) | Rujukan Bapa Kami ada pada ayat 9–13. Layanan LAI menampilkan pilihan audio; versi naskah dan izin rekaman harus diperiksa sebelum diimpor. |
| Katolik | [Bapa Kami, Iman Katolik](https://www.imankatolik.or.id/bapakami.html) | Teks dapat dirujuk. Situs mengizinkan kutipan dengan atribusi; halaman ini belum menyediakan rekaman yang bisa dipastikan izinnya. |
| Hindu | [Buku Doa Dalam Agama Hindu, PAKIS Bali / Pemprov Bali](https://dpma.baliprov.go.id/wp-content/uploads/2022/03/PAKIS-Bali_Buku-Doa-Dalam-Agama-Hindu_compressed.pdf), [Pray from Home, Bimas Hindu](https://bimashindu.kemenag.go.id/berita-pusat/wujudkan-5m-plus-ditjen-bimas-hindu-gelar-pray-from-home-POFvn) | PDF terindeks, tetapi pengambilan langsung gagal saat pemeriksaan. Bimas Hindu mendokumentasikan siaran Tri Sandhya dan Panca Sembah; berkas audio beserta izin belum diperoleh. |
| Buddha | [Rekaman Paritta, DhammaCitta](https://dhammacitta.org/download/audio.html) | MP3 tersedia, termasuk Karaniyametta Sutta dengan atribusi Vihara Samaggi Jaya / Bhante Dhammadiro. Izin unduh tidak otomatis membuktikan izin distribusi ulang. |
| Konghucu | [Doa Untuk Indonesia, MATAKIN](https://www.matakin.or.id/category/berita/read/ws-budi-suniarto-memimpin-upacara-sembahyang-doa-untuk-indonesia-pada-perayaan-imlek-2572-kongzili) | Halaman resmi menautkan rekaman upacara. Doa kebangsaan tidak otomatis cocok untuk seseorang atau orang yang meninggal; bagian rekaman dan izinnya perlu ditinjau. |
| Umum / non-denominasi | Hening sejenak, pilihan yang sudah tersedia dalam produk | Sesi tanpa rekaman atau teks agama; pencatatan berjalan setelah durasi selesai. |

Rujukan disimpan dalam `apps/api/data/prayer-sources.json`, dikirim bersama katalog, ditampilkan pada pilihan tradisi, dan tersedia dalam panel admin **Kurasi doa dan audio**. Membuka sumber eksternal tidak dianggap menyelesaikan sesi doa di aplikasi.

Untuk menerbitkan rekaman: pilih entri yang sesuai dalam panel admin, isi teks dari sumber, atribusi dan tautan sumber, unggah berkas audio berizin, isi durasi/lisensi/atribusi rekaman, lalu tandai telah ditinjau setelah pemeriksaan kurator. Sumber penelitian belum mengubah status `reviewed` dan belum mengaktifkan rekaman agama secara otomatis. Pemutar, jeda/lanjut, pembatalan, penanganan autoplay yang ditolak, dan pencatatan setelah selesai sudah diimplementasikan.

## Rekaman yang disediakan pada 2 Oktober

Tiga berkas asli sekarang disertakan dalam `apps/api/data/prayer-audio`, dengan
metadata dan checksum dalam `prayer-audio-candidates.json`:

| Entri tujuan | Rekaman | Bahasa / durasi | Lisensi |
| --- | --- | --- | --- |
| Katolik / Bapa Kami | [Pater Noster oleh Dan Palraz](https://commons.wikimedia.org/wiki/File:Pater-Noster.ogg) | Latin, 28,288 detik | CC0 1.0 |
| Hindu / Gayatri | [Gayatri oleh Wilfredor](https://commons.wikimedia.org/wiki/File:Gayatri_mantra.ogg) | Sanskerta, 20,924 detik | CC0 1.0 |
| Buddha / Metta | [Karaṇīya Mettā Sutta oleh monks of Metta Forest Monastery](https://www.dhammatalks.org/chant_index.html) | Pali, 143,543 detik | CC BY-NC 4.0, dengan batas penjualan yang dijelaskan penyedia |

Di `/admin`, pilih entri tersebut pada **Kurasi doa dan audio**. Pratinjau audio,
bahasa, atribusi, lisensi, dan catatan pencocokan naskah langsung tersedia.
**Gunakan rekaman ini** memasang audio sebagai draf dan menarik persetujuan
sebelumnya. Untuk rekaman Buddha, kurator juga harus menyatakan penggunaan
nonkomersial. Setelah audio dipasang, cocokkan naskah dan terjemahan, isi sumber
serta catatan pemeriksaan, dan gunakan **Simpan kurasi** setelah peninjauan.

Ada perbedaan yang perlu ditangani saat peninjauan: audio Bapa Kami berbahasa
Latin sementara draf katalog berbahasa Indonesia; rekaman Metta merupakan
sutta lengkap sementara draf sebelumnya hanya ringkasan tiga kalimat. Catatan
ini tampil di panel admin. Berkas Gayatri juga perlu dicocokkan termasuk
penutupnya. Belum ada berkas baru yang ditandai telah ditinjau.

Setelah kurasi, audio bawaan diputar melalui API pada origin yang sama dan tidak
memerlukan object storage. Unggahan rekaman lain tetap memakai object storage.
Pratinjau sumber tidak mencatat doa; pencatatan memerlukan sesi doa untuk ucapan
publik dan tetap menunggu durasi serta penyelesaian pemutaran di antarmuka.
