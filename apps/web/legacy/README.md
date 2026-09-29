## 👥 Panduan Kerjasama untuk Tim A Kelompok 8

**Project Manager:** Hanung  
**Anggota Tim:** Yoga, Cania, Tarisa, Adit, Farid, Maherul

Panduan ini wajib diikuti semua kontributor agar riwayat git tetap rapi dan review mudah.

### 1. Format Branch
`<type>/<nama>/<pekerjaan>`

| Bagian | Aturan | Contoh |
|--------|--------|--------|
| `<type>` | Jenis pekerjaan. Pilih salah satu di bawah | `feat`, `fix`, `chore` |
| `<nama>` | Nama panggilan / username GitHub, huruf kecil, tanpa spasi, kebab-case | `hanung`, `winda`, `yoga` |
| `<pekerjaan>` | Deskripsi singkat pekerjaan, kebab-case, 2–4 kata, tanpa spasi | `filter-kategori`, `perbaiki-proxy-api` |

**Daftar `<type>` yang diizinkan:**
- `feat` / `feature` — fitur baru
- `fix` — perbaikan bug
- `chore` — tooling, deps, config, build
- `docs` — dokumentasi
- `refactor` — refactor tanpa ubah behavior
- `style` — styling/UI saja
- `test` — tambah/perbaiki test

**Contoh benar:**
- `feat/hanung/filter-kategori`
- `feat/winda/tambah-rating`
- `fix/yoga/proxy-api-error`
- `chore/adit/update-deps`
- `docs/tarisa/panduan-branch`
- `refactor/farid/optimasi-query`

**Contoh salah:**
- `Feat/Hanung/Filter Kategori`   # jangan pakai huruf besar & spasi
- `feature-hanung-filter`         # harus pakai slash /
- `feat/hanung/`                  # pekerjaan tidak boleh kosong

### 2. Alur Kerja (Workflow)
```bash
# 1. Sync main terbaru
git checkout main
git pull origin main

# 2. Buat branch baru sesuai format
git checkout -b feat/hanung/nama-pekerjaan

# 3. Kerjakan, lalu commit dengan pesan jelas
git add .
git commit -m "feat: tambah filter kategori wifi"

# 4. Push branch ke remote
git push -u origin feat/hanung/nama-pekerjaan

# 5. Buka Pull Request (PR) di GitHub: base = main, compare = branch kamu
# 6. Tunggu CI lolos (lint, test, build) dan minta 1 review
# 7. Setelah di-approve -> Squash and merge -> hapus branch
```

**Aturan penting:**
- Selalu branch dari `main` terbaru. Jangan branch dari branch orang lain tanpa koordinasi.
- Satu branch = satu pekerjaan/fitur. Jangan campur banyak fitur dalam satu branch.
- Jangan push langsung ke `main`. Semua perubahan wajib lewat PR.
- Selalu `git pull --rebase origin main` jika main sudah maju saat kamu masih mengerjakan branch.
- Hapus branch setelah PR di-merge (`git branch -d feat/hanung/nama-pekerjaan`).

### 3. Aturan Commit & Pull Request
**Commit message** (disarankan Conventional Commits):
- `feat: tambah filter kategori wifi`
- `fix: perbaiki proxy /api di production`
- `chore: update deps Next 16`
- `docs: tambah panduan kerjasama di README`

**Judul PR:** jelas dan pakai prefix yang sama, contoh `feat(hanung): filter kategori wifi`

**Deskripsi PR wajib isi:**
1. Apa yang diubah (what)
2. Kenapa diubah (why)
3. Cara test manual (jika perlu)
4. Screenshot (untuk perubahan UI)

**Checklist sebelum minta review:**
- [ ] `npm run lint` lolos
- [ ] `npm run test` lolos (jika ada test)
- [ ] `npm run build` berhasil
- [ ] Tidak ada `console.log` tertinggal
- [ ] Sudah test manual di `http://localhost:3000`

### 4. Review & Merge
- Minimal 1 approval sebelum merge.
- CI di `.github/workflows/ci.yml` wajib hijau (lint, test, build).
- Merge strategy: **Squash and merge** agar riwayat main tetap bersih.
- Konflik? Rebase dari main dulu, jangan merge main ke branch kamu.

### 5. Penamaan Lain
- **Issue branch opsional:** boleh tambah nomor issue di pekerjaan, contoh `feat/hanung/12-filter-kategori` jika pakai GitHub Issues.
- **Hotfix urgent:** `fix/nama/hotfix-nama-bug` lalu PR langsung dengan label `urgent`.
