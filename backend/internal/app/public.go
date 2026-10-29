package app

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"regexp"
	"strings"

	"golang.org/x/text/unicode/norm"
)

// ---- Canonical labels shared by message validation and public filters ----

var moodAliases = map[string]string{
	"longing":   "rindu",
	"gratitude": "syukur",
	"regret":    "sesal",
	"anger":     "marah",
	"calm":      "tenang",
	"tender":    "haru",
	"proud":     "bangga",
	"grief":     "kehilangan",
}

func normalizeMood(value string) string {
	value = strings.ToLower(strings.TrimSpace(norm.NFKC.String(value)))
	if alias, ok := moodAliases[value]; ok {
		return alias
	}
	return value
}

func moodValues(value string) []string {
	canonical := normalizeMood(value)
	values := []string{canonical}
	for alias, mood := range moodAliases {
		if mood == canonical {
			values = append(values, alias)
		}
	}
	return values
}

func normalizeTag(value string) string {
	value = strings.TrimSpace(norm.NFKC.String(value))
	return strings.ToLower(strings.TrimSpace(strings.TrimLeft(value, "#")))
}

func normalizeTags(values []string) []string {
	seen := map[string]bool{}
	result := []string{}
	for _, value := range values {
		tag := normalizeTag(value)
		if !seen[tag] {
			seen[tag] = true
			result = append(result, tag)
		}
	}
	return result
}

func storedTags(raw string) []string {
	var tags []string
	json.Unmarshal([]byte(raw), &tags)
	return normalizeTags(tags)
}

func moodValue(value sql.NullString) any {
	if !value.Valid {
		return nil
	}
	if mood := normalizeMood(value.String); mood != "" {
		return mood
	}
	return nil
}

// ---- Server-only encryption for intentionally public text ----
// Never handles private payloads.

func (a *App) contentKey() []byte {
	if a.Conf.PublicContentKey != "" {
		key, _ := base64.URLEncoding.DecodeString(a.Conf.PublicContentKey)
		return key
	}
	mac := hmac.New(sha256.New, []byte(a.Conf.JWTSecret))
	mac.Write([]byte("untukmu:public-at-rest:v1"))
	return mac.Sum(nil)
}

func (a *App) publicCipher() cipher.AEAD {
	block, _ := aes.NewCipher(a.contentKey())
	aead, _ := cipher.NewGCM(block)
	return aead
}

func (a *App) sealPublic(identifier, text string) string {
	iv := make([]byte, 12)
	rand.Read(iv)
	sealed := a.publicCipher().Seal(iv, iv, []byte(text), []byte("public:"+identifier))
	return "v1:" + base64.URLEncoding.EncodeToString(sealed)
}

func (a *App) openPublic(identifier, envelope string) (string, error) {
	if !strings.HasPrefix(envelope, "v1:") {
		return "", errors.New("format konten publik tidak dikenal")
	}
	raw, err := base64.URLEncoding.DecodeString(envelope[3:])
	if err != nil || len(raw) < 12 {
		return "", errors.New("konten publik rusak")
	}
	plain, err := a.publicCipher().Open(nil, raw[:12], raw[12:], []byte("public:"+identifier))
	return string(plain), err
}

// ---- Initial checks for intentionally public text; flagged cases go to an admin ----

var (
	linkPattern   = regexp.MustCompile(`(?i)https?://`)
	markupPattern = regexp.MustCompile(`(?i)<\s*(script|iframe)\b`)
)

func excessiveRepetition(text string) bool {
	var previous rune
	run := 0
	for _, current := range text {
		if current == previous && current != '\n' {
			run++
			if run > 30 {
				return true
			}
		} else {
			previous, run = current, 1
		}
	}
	return false
}

func spamFlags(text string) []string {
	flags := []string{}
	if len(linkPattern.FindAllStringIndex(text, -1)) >= 3 {
		flags = append(flags, "banyak_tautan")
	}
	if excessiveRepetition(text) {
		flags = append(flags, "pengulangan_berlebihan")
	}
	if markupPattern.MatchString(text) {
		flags = append(flags, "markup_mencurigakan")
	}
	return flags
}

// checkPublic sets the moderation state of a public message before it is saved.
func (a *App) checkPublic(ctx context.Context, q querier, row *Message, previousStatus *string) error {
	if row.Visibility != "public_anon" {
		return nil
	}
	text, err := a.openPublic(row.ID, row.PublicBody.String)
	if err != nil {
		return err
	}
	flags := spamFlags(text)
	reported, err := exists(ctx, q, "SELECT 1 FROM reports WHERE message_id = ? AND status = 'open'", row.ID)
	if err != nil {
		return err
	}
	latest := ""
	if previousStatus != nil {
		err := q.QueryRowContext(ctx, `SELECT decision FROM moderation_decisions WHERE message_id = ?
			ORDER BY created_at DESC, id DESC LIMIT 1`, row.ID).Scan(&latest)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
	}
	if reported || (previousStatus != nil && (*previousStatus == "rejected" || *previousStatus == "removed")) ||
		latest == "reject" || latest == "remove" {
		flags = append(flags, "memerlukan_peninjauan_ulang")
	}
	encoded, _ := json.Marshal(flags)
	row.ModerationFlags = string(encoded)
	row.ModerationCheckedAt = nullString(now())
	row.ModerationStatus = "approved"
	if len(flags) > 0 {
		row.ModerationStatus = "pending"
	}
	return nil
}
