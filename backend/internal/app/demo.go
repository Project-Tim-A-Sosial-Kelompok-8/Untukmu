package app

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	mrand "math/rand/v2"
	"time"
)

// Demo data: accounts whose workspaces fill the Milky Way so the hub can be
// previewed. Demo accounts cannot sign in (their password hash is not a valid
// Argon2 hash) and are recognisable by their e-mail domain, so they can be
// removed again with SeedDemo(..., remove=true).

const demoDomain = "@contoh.untukmu.id"

var demoNames = []string{
	"Rani", "Bima", "Sekar", "Arya", "Nadia", "Laras", "Dimas", "Ayu", "Bayu", "Citra",
	"Damar", "Elok", "Fajar", "Gita", "Hana", "Indra", "Jelita", "Kirana", "Lintang", "Mega",
	"Nanda", "Oki", "Putri", "Raka", "Sinta", "Tegar", "Umi", "Wulan", "Yoga", "Zahra",
	"Adit", "Bunga", "Candra", "Dewi", "Eka", "Fikri", "Galih", "Hesti", "Ilham", "Juwita",
	"Kemal", "Lestari", "Mahesa", "Nirmala", "Pandu", "Ratih", "Satria", "Tiara", "Utari", "Wira",
}

var demoTargets = []struct{ kind, label string }{
	{"orang_tua", "Untuk Ibu"}, {"orang_tua", "Untuk Bapak"}, {"sahabat", "Sahabat SMA"},
	{"pasangan", "Kamu yang jauh"}, {"saudara", "Adik kecil"}, {"seseorang", "Seseorang di stasiun"},
	{"diri_sendiri", "Aku lima tahun lagi"}, {"seseorang", "Guru pertamaku"}, {"sahabat", "Teman kos"},
	{"orang_tua", "Nenek di kampung"},
}

var demoMessages = []string{
	"Terima kasih sudah menunggu di depan pagar setiap sore.",
	"Aku masih menyimpan surat yang kau selipkan di buku itu.",
	"Semoga hari ini kamu tidak terlalu keras pada dirimu sendiri.",
	"Maaf aku pergi tanpa sempat berpamitan dengan benar.",
	"Lagu yang kita dengar di perjalanan pulang masih kuputar.",
	"Kalau nanti kita bertemu lagi, aku ingin mendengar ceritamu dulu.",
	"Rumah terasa lebih sepi, tapi tamannya tetap kusiram.",
	"Aku sudah belajar memasak sayur asem seperti buatanmu.",
	"Terima kasih telah percaya saat aku sendiri ragu.",
	"Semoga kamu menemukan tempat yang membuatmu tenang.",
	"Aku bangga pada langkah kecil yang kamu ambil tahun ini.",
	"Hujan pertama bulan ini membuatku teringat padamu.",
}

var demoKinds = []string{"spiral", "spiral", "ellipsoid", "irregular"}
var demoColors = []string{"#ffd9a0", "#ff9ec4", "#8fd8c8", "#9fc3f2", "#ffb36b", "#c9a7ff", "#7fd1ff", "#ff8f8f", "#e2b26a"}

func demoB64(n int) string {
	raw := make([]byte, n)
	rand.Read(raw)
	return base64.StdEncoding.EncodeToString(raw)
}

// SeedDemo creates `total` demo accounts, the last `private` of them with a
// private workspace, or removes every demo account when remove is true.
func (a *App) SeedDemo(ctx context.Context, total, private int, remove bool) (int, error) {
	if remove {
		var n int
		err := a.tx(ctx, func(tx *Tx) error {
			pattern := "%" + demoDomain
			for _, statement := range []string{
				"DELETE FROM messages WHERE author_id IN (SELECT id FROM users WHERE email LIKE ?)",
				"DELETE FROM constellations WHERE owner_id IN (SELECT id FROM users WHERE email LIKE ?)",
			} {
				if _, err := tx.ExecContext(ctx, statement, pattern); err != nil {
					return err
				}
			}
			result, err := tx.ExecContext(ctx, "DELETE FROM users WHERE email LIKE ?", pattern)
			if err != nil {
				return err
			}
			changed, _ := result.RowsAffected()
			n = int(changed)
			return nil
		})
		a.invalidate(nil)
		return n, err
	}
	rng := mrand.New(mrand.NewPCG(20261027, 50))
	created := 0
	start := time.Now().Add(-time.Duration(total) * 36 * time.Hour)
	for i := 0; i < total; i++ {
		name := demoNames[i%len(demoNames)]
		if i >= len(demoNames) {
			name = fmt.Sprintf("%s %d", name, i/len(demoNames)+1)
		}
		email := fmt.Sprintf("demo%02d%s", i+1, demoDomain)
		public := i < total-private
		instant := ts(start.Add(time.Duration(i) * 36 * time.Hour))
		record, _ := json.Marshal(map[string]any{
			"v": 2, "kdf": "Argon2id", "memory": 65536, "iter": 3, "parallelism": 1, "salt": demoB64(16),
			"wrapped":         map[string]string{"iv": demoB64(12), "ct": demoB64(48)},
			"wrappedRecovery": map[string]string{"iv": demoB64(12), "ct": demoB64(48)},
		})
		visibility := "private"
		if public {
			visibility = "public"
		}
		err := a.tx(ctx, func(tx *Tx) error {
			exists, err := exists(ctx, tx, "SELECT 1 FROM users WHERE email = ?", email)
			if err != nil || exists {
				return err
			}
			userID := uid()
			if _, err := tx.ExecContext(ctx, `INSERT INTO users (id, email, password_hash, display_name, role,
				encryption_record, profile_visibility, created_at, updated_at)
				VALUES (?, ?, '!demo-tidak-bisa-masuk', ?, 'user', ?, ?, ?, ?)`,
				userID, email, name, string(record), visibility, instant, instant); err != nil {
				return err
			}
			if err := createWorkspace(ctx, tx, userID, name, public); err != nil {
				return err
			}
			galaxies := 1 + rng.IntN(3)
			for g := 0; g < galaxies; g++ {
				target := demoTargets[rng.IntN(len(demoTargets))]
				galaxyID := uid()
				if _, err := tx.ExecContext(ctx, `INSERT INTO constellations (id, owner_id, target_kind, target_label,
					custom_category, visual_type, visual_ref, kind, color, radius, particle_count, created_at)
					VALUES (?, ?, ?, ?, NULL, 'light_symbol', NULL, ?, ?, ?, 8500, ?)`,
					galaxyID, userID, target.kind, target.label, demoKinds[rng.IntN(len(demoKinds))],
					demoColors[rng.IntN(len(demoColors))], []int{110, 140, 175}[rng.IntN(3)], instant); err != nil {
					return err
				}
				messages := 1 + rng.IntN(2)
				for m := 0; m < messages; m++ {
					row := &Message{
						ID: uid(), AuthorID: nullString(userID), EntryType: "message", Visibility: "public_anon",
						ModerationStatus: "approved", ModerationFlags: "[]", ModerationCheckedAt: nullString(instant),
						Tags: `["kenangan"]`, CreatedAt: instant,
					}
					row.PublicBody = nullString(a.sealPublic(row.ID, demoMessages[rng.IntN(len(demoMessages))]))
					if err := row.save(ctx, tx, true); err != nil {
						return err
					}
					if _, err := tx.ExecContext(ctx,
						"INSERT INTO message_constellations (message_id, constellation_id) VALUES (?, ?)",
						row.ID, galaxyID); err != nil {
						return err
					}
				}
			}
			created++
			return nil
		})
		if err != nil {
			return created, err
		}
	}
	a.invalidate(nil)
	return created, nil
}
