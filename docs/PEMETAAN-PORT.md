# Pemetaan sumber ke implementasi

| Sumber ZIP | Implementasi |
| --- | --- |
| `index.html`, kamera dan shader | `scripts/prepare-engine.mjs`, `features/galaxy/FiberBridge.tsx`, iframe `GalaxyEngine` |
| `untukmu/untukmu.css` | disalin byte-identik; tambahan fokus aksesibilitas disisipkan terpisah |
| `um-ui.js` | transformasi AST `port-react-ui.mjs`, React roots `PreservedScreens.tsx`; adapter social/prayers/advanced |
| `um-store.js` | digantikan `src/lib/api/store.ts`; FastAPI dan PostgreSQL; tidak ada IndexedDB produksi |
| `um-crypto.js` | digantikan `src/lib/crypto/vault.ts`, Worker Argon2id; AES-GCM dan recovery penuh |
| `um-galaksi.js` | algoritme visual asli, data nyata, multi-target dan debu berdasarkan catatan doa |
| `um-sky.js` | disalin identik |
| `um-doa.js` | disalin identik; katalog runtime diganti isi API yang dikurasi, struktur tujuh tradisi tetap |
| `um-i18n.js` | disalin identik; locale aktif dikunci `id` sesuai lingkup kerja |
| `images`, `vendor`, `audio` dan berkas pendukung | disalin seluruhnya; tidak ada audio doa baru dalam arsip sumber |
| `um-tests.js` | 33 assertion prototipe dijalankan pada fixture asli; pembetulan Float32/constructor hanya pada harness |
| lisensi dan atribusi | dipertahankan; root `THIRD-PARTY-NOTICES.md` disalin identik; perbedaan penyebutan lisensi dicatat terpisah |

Markup layar inti dan konstanta kamera dipertahankan; tombol akun, kategori khusus, lampiran, beberapa tujuan, kurasi, recovery, ekspor, dan status moderasi merupakan penambahan. Tombol reset data contoh diubah menjadi penghapusan pesan/tujuan akun dengan konfirmasi dan autentikasi ulang. Foto/lampiran tetap tersedia untuk ekspor setelah penghapusan tersebut.

Paket asli dapat dibuka sendiri dari `referensi/Untukmu-asli.zip` untuk pembandingan. Data contoh hanya ada di prototipe dan test harness. Tampilan produksi menyesuaikan data akun nyata.
