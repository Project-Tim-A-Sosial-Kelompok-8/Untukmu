package app

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

// Request bodies. Unknown fields are rejected by decode(); each validate()
// mirrors the constraints of the previous Pydantic schemas.

func length(value string) int { return utf8.RuneCountInString(value) }

func checkLength(v *validation, value string, minimum, maximum int, loc ...any) {
	n := length(value)
	if n < minimum {
		v.add(fmt.Sprintf("Minimal %d karakter.", minimum), loc...)
	} else if n > maximum {
		v.add(fmt.Sprintf("Maksimal %d karakter.", maximum), loc...)
	}
}

func checkOptionalLength(v *validation, value *string, maximum int, loc ...any) {
	if value != nil && length(*value) > maximum {
		v.add(fmt.Sprintf("Maksimal %d karakter.", maximum), loc...)
	}
}

func required[T any](v *validation, value *T, loc ...any) bool {
	if value == nil {
		v.add("Kolom wajib diisi.", loc...)
		return false
	}
	return true
}

func validB64(value string, size int) bool {
	raw, err := base64.StdEncoding.DecodeString(value)
	return err == nil && (size < 0 || len(raw) == size)
}

func oneOf(value string, options ...string) bool {
	for _, option := range options {
		if value == option {
			return true
		}
	}
	return false
}

func deref(value *string, fallback string) string {
	if value == nil {
		return fallback
	}
	return *value
}

var (
	verifierPattern  = regexp.MustCompile(`^[A-Za-z0-9+/]{43}=$`)
	challengePattern = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)
	colorPattern     = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	reviewPattern    = regexp.MustCompile(`^[a-f0-9]{64}$`)
	emailLocal       = regexp.MustCompile(`^[\p{L}\p{N}!#$%&'*+/=?^_` + "`" + `{|}~-]+(\.[\p{L}\p{N}!#$%&'*+/=?^_` + "`" + `{|}~-]+)*$`)
	emailLabel       = regexp.MustCompile(`^[\p{L}\p{N}]([\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?$`)
)

var specialUseDomains = map[string]bool{
	"arpa": true, "invalid": true, "local": true, "localhost": true, "onion": true, "test": true,
}

// validEmail returns the lowercase address when it is syntactically deliverable.
func validEmail(v *validation, value *string, loc ...any) string {
	if !required(v, value, loc...) {
		return ""
	}
	address := strings.TrimSpace(*value)
	local, domain, found := strings.Cut(address, "@")
	labels := strings.Split(domain, ".")
	ok := found && len(address) <= 254 && length(local) <= 64 && emailLocal.MatchString(local) && len(labels) >= 2
	for _, label := range labels {
		ok = ok && emailLabel.MatchString(label)
	}
	if ok {
		tld := strings.ToLower(labels[len(labels)-1])
		ok = !specialUseDomains[tld] && strings.Trim(tld, "0123456789") != ""
	}
	if !ok {
		v.add("Alamat surel tidak valid.", loc...)
		return ""
	}
	return strings.ToLower(address)
}

// ---- Encryption records ----

type wrappedKey struct {
	IV *string `json:"iv"`
	CT *string `json:"ct"`
}

type keyRecord struct {
	V               *int        `json:"v"`
	KDF             *string     `json:"kdf"`
	Memory          *int        `json:"memory"`
	Iter            *int        `json:"iter"`
	Parallelism     *int        `json:"parallelism"`
	Salt            *string     `json:"salt"`
	Wrapped         *wrappedKey `json:"wrapped"`
	WrappedRecovery *wrappedKey `json:"wrappedRecovery"`
}

func checkInt(v *validation, value *int, expected int, loc ...any) {
	if value != nil && *value != expected {
		v.add(fmt.Sprintf("Nilai wajib %d.", expected), loc...)
	}
}

func (w *wrappedKey) validate(v *validation, loc ...any) {
	if !required(v, w, loc...) {
		return
	}
	if required(v, w.IV, append(loc, "iv")...) && !validB64(*w.IV, 12) {
		v.add("Panjang wajib 12 byte.", append(loc, "iv")...)
	}
	if required(v, w.CT, append(loc, "ct")...) && (len(*w.CT) != 64 || !validB64(*w.CT, 48)) {
		v.add("Panjang wajib 48 byte.", append(loc, "ct")...)
	}
}

func (k *keyRecord) validate(v *validation, loc ...any) {
	if !required(v, k, loc...) {
		return
	}
	checkInt(v, k.V, 2, append(loc, "v")...)
	if k.KDF != nil && *k.KDF != "Argon2id" {
		v.add("Nilai wajib Argon2id.", append(loc, "kdf")...)
	}
	checkInt(v, k.Memory, 65536, append(loc, "memory")...)
	checkInt(v, k.Iter, 3, append(loc, "iter")...)
	checkInt(v, k.Parallelism, 1, append(loc, "parallelism")...)
	if required(v, k.Salt, append(loc, "salt")...) && !validB64(*k.Salt, 16) {
		v.add("Panjang wajib 16 byte.", append(loc, "salt")...)
	}
	k.Wrapped.validate(v, append(loc, "wrapped")...)
	k.WrappedRecovery.validate(v, append(loc, "wrappedRecovery")...)
}

// dump returns the canonical stored form with every default filled in.
func (k *keyRecord) dump() string {
	encoded, _ := json.Marshal(map[string]any{
		"v": 2, "kdf": "Argon2id", "memory": 65536, "iter": 3, "parallelism": 1, "salt": *k.Salt,
		"wrapped":         map[string]string{"iv": *k.Wrapped.IV, "ct": *k.Wrapped.CT},
		"wrappedRecovery": map[string]string{"iv": *k.WrappedRecovery.IV, "ct": *k.WrappedRecovery.CT},
	})
	return string(encoded)
}

type cipherInput struct {
	V    *int    `json:"v"`
	Alg  *string `json:"alg"`
	Mode *string `json:"mode"`
	IV   *string `json:"iv"`
	CT   *string `json:"ct"`
	AAD  *string `json:"aad"`
}

func (p *cipherInput) validate(v *validation, loc ...any) {
	if !required(v, p, loc...) {
		return
	}
	checkInt(v, p.V, 2, append(loc, "v")...)
	if p.Alg != nil && *p.Alg != "A256GCM" {
		v.add("Nilai wajib A256GCM.", append(loc, "alg")...)
	}
	if p.Mode != nil && *p.Mode != "private" {
		v.add("Nilai wajib private.", append(loc, "mode")...)
	}
	if required(v, p.IV, append(loc, "iv")...) && !validB64(*p.IV, 12) {
		v.add("Panjang wajib 12 byte.", append(loc, "iv")...)
	}
	if required(v, p.CT, append(loc, "ct")...) {
		checkLength(v, *p.CT, 24, 100000, append(loc, "ct")...)
		raw, err := base64.StdEncoding.DecodeString(*p.CT)
		if err != nil {
			v.add("Base64 tidak valid.", append(loc, "ct")...)
		} else if len(raw) < 17 {
			v.add("Ciphertext harus memuat isi dan tag GCM.", append(loc, "ct")...)
		}
	}
	if required(v, p.AAD, append(loc, "aad")...) {
		checkLength(v, *p.AAD, 0, 100, append(loc, "aad")...)
	}
}

func (p *cipherInput) meta() map[string]any {
	return map[string]any{"v": 2, "alg": "A256GCM", "mode": "private", "aad": *p.AAD}
}

func (p *cipherInput) dump() string {
	full := p.meta()
	full["iv"], full["ct"] = *p.IV, *p.CT
	encoded, _ := json.Marshal(full)
	return string(encoded)
}

// ---- Accounts ----

type registerInput struct {
	RecoveryVerifier *string    `json:"recovery_verifier"`
	Email            *string    `json:"email"`
	Password         *string    `json:"password"`
	DisplayName      *string    `json:"display_name"`
	EncryptionRecord *keyRecord `json:"encryption_record"`
	TurnstileToken   *string    `json:"turnstile_token"`
	email            string
}

func (b *registerInput) validate() error {
	var v validation
	if b.RecoveryVerifier != nil && !verifierPattern.MatchString(*b.RecoveryVerifier) {
		v.add("Format kode pemulihan tidak valid.", "recovery_verifier")
	}
	b.email = validEmail(&v, b.Email, "email")
	if required(&v, b.Password, "password") {
		checkLength(&v, *b.Password, 12, 256, "password")
	}
	if b.DisplayName != nil {
		checkLength(&v, *b.DisplayName, 1, 80, "display_name")
	}
	b.EncryptionRecord.validate(&v, "encryption_record")
	checkOptionalLength(&v, b.TurnstileToken, 2048, "turnstile_token")
	return v.err()
}

type loginInput struct {
	Email    *string `json:"email"`
	Password *string `json:"password"`
	email    string
}

func (b *loginInput) validate() error {
	var v validation
	b.email = validEmail(&v, b.Email, "email")
	if required(&v, b.Password, "password") {
		checkLength(&v, *b.Password, 1, 256, "password")
	}
	return v.err()
}

type credentialInput struct {
	Password         *string `json:"password"`
	RecoveryVerifier *string `json:"recovery_verifier"`
	ContentAction    *string `json:"content_action"`
}

func (b *credentialInput) validate(verifier, action bool) error {
	var v validation
	if required(&v, b.Password, "password") {
		checkLength(&v, *b.Password, 1, 256, "password")
	}
	if verifier {
		if required(&v, b.RecoveryVerifier, "recovery_verifier") && !verifierPattern.MatchString(*b.RecoveryVerifier) {
			v.add("Format kode pemulihan tidak valid.", "recovery_verifier")
		}
	} else if b.RecoveryVerifier != nil {
		v.add("Kolom tambahan tidak diizinkan.", "recovery_verifier")
	}
	if action {
		if required(&v, b.ContentAction, "content_action") && !oneOf(*b.ContentAction, "keep", "delete") {
			v.add("Pilih keep atau delete.", "content_action")
		}
	} else if b.ContentAction != nil {
		v.add("Kolom tambahan tidak diizinkan.", "content_action")
	}
	return v.err()
}

type settingsInput struct {
	DefaultMessageVisibility *string `json:"default_message_visibility"`
	ProfileVisibility        *string `json:"profile_visibility"`
}

func (b *settingsInput) validate() error {
	var v validation
	if b.DefaultMessageVisibility != nil && !oneOf(*b.DefaultMessageVisibility, "private", "public_anon", "unlisted") {
		v.add("Pilihan visibilitas tidak valid.", "default_message_visibility")
	}
	if b.ProfileVisibility != nil && !oneOf(*b.ProfileVisibility, "private", "public") {
		v.add("Pilihan visibilitas tidak valid.", "profile_visibility")
	}
	return v.err()
}

type recoveryInput struct {
	Email            *string    `json:"email"`
	RecoveryVerifier *string    `json:"recovery_verifier"`
	TurnstileToken   *string    `json:"turnstile_token"`
	Challenge        *string    `json:"challenge"`
	Password         *string    `json:"password"`
	EncryptionRecord *keyRecord `json:"encryption_record"`
	email            string
}

func (b *recoveryInput) validate(finish bool) error {
	var v validation
	if required(&v, b.RecoveryVerifier, "recovery_verifier") && !verifierPattern.MatchString(*b.RecoveryVerifier) {
		v.add("Format kode pemulihan tidak valid.", "recovery_verifier")
	}
	if !finish {
		b.email = validEmail(&v, b.Email, "email")
		checkOptionalLength(&v, b.TurnstileToken, 2048, "turnstile_token")
		for name, value := range map[string]bool{
			"challenge": b.Challenge != nil, "password": b.Password != nil, "encryption_record": b.EncryptionRecord != nil,
		} {
			v.check(!value, "Kolom tambahan tidak diizinkan.", name)
		}
		return v.err()
	}
	if required(&v, b.Challenge, "challenge") && !challengePattern.MatchString(*b.Challenge) {
		v.add("Format tantangan tidak valid.", "challenge")
	}
	if required(&v, b.Password, "password") {
		checkLength(&v, *b.Password, 12, 256, "password")
	}
	b.EncryptionRecord.validate(&v, "encryption_record")
	v.check(b.Email == nil, "Kolom tambahan tidak diizinkan.", "email")
	v.check(b.TurnstileToken == nil, "Kolom tambahan tidak diizinkan.", "turnstile_token")
	return v.err()
}

// ---- Galaxies and messages ----

type galaxyInput struct {
	TargetKind     *string `json:"target_kind"`
	TargetLabel    *string `json:"target_label"`
	CustomCategory *string `json:"custom_category"`
	VisualType     *string `json:"visual_type"`
	VisualRef      *string `json:"visual_ref"`
	Kind           *string `json:"kind"`
	Color          *string `json:"color"`
	Radius         *int    `json:"radius"`
	ParticleCount  *int    `json:"particle_count"`
	visualRef      any
}

func (b *galaxyInput) validate() error {
	var v validation
	if required(&v, b.TargetKind, "target_kind") &&
		!oneOf(*b.TargetKind, "orang_tua", "saudara", "sahabat", "pasangan", "seseorang", "diri_sendiri", "custom") {
		v.add("Jenis tujuan tidak valid.", "target_kind")
	}
	if required(&v, b.TargetLabel, "target_label") {
		checkLength(&v, *b.TargetLabel, 1, 100, "target_label")
	}
	checkOptionalLength(&v, b.CustomCategory, 80, "custom_category")
	visualType := deref(b.VisualType, "light_symbol")
	v.check(oneOf(visualType, "photo", "light_symbol"), "Jenis visual tidak valid.", "visual_type")
	if b.VisualRef != nil {
		if parsed, ok := parseUUID(*b.VisualRef); ok {
			b.visualRef = parsed
		} else {
			v.add("UUID tidak valid.", "visual_ref")
		}
	}
	v.check(oneOf(deref(b.Kind, "spiral"), "spiral", "ellipsoid", "irregular"), "Bentuk galaksi tidak valid.", "kind")
	v.check(colorPattern.MatchString(deref(b.Color, "#ffd9a0")), "Warna wajib heksadesimal #RRGGBB.", "color")
	if b.Radius != nil && *b.Radius != 110 && *b.Radius != 140 && *b.Radius != 175 {
		v.add("Radius wajib 110, 140, atau 175.", "radius")
	}
	if b.ParticleCount != nil && (*b.ParticleCount < 1 || *b.ParticleCount > 10000) {
		v.add("Jumlah partikel wajib 1–10000.", "particle_count")
	}
	if len(v) == 0 {
		switch {
		case visualType == "photo" && b.VisualRef == nil:
			v.add("Foto wajib memiliki referensi unggahan terenkripsi.")
		case visualType == "light_symbol" && b.VisualRef != nil:
			v.add("Simbol cahaya tidak memakai foto.")
		case strings.TrimSpace(*b.TargetLabel) == "":
			v.add("Nama tujuan wajib diisi.")
		}
	}
	return v.err()
}

type messageInput struct {
	ID               *string      `json:"id"`
	EntryType        *string      `json:"entry_type"`
	ConstellationIDs []string     `json:"constellation_ids"`
	Mood             *string      `json:"mood"`
	Tags             []string     `json:"tags"`
	DateLabel        *string      `json:"date_label"`
	ReleaseAt        *string      `json:"release_at"`
	AttachmentIDs    []string     `json:"attachment_ids"`
	Visibility       *string      `json:"visibility"`
	Payload          *cipherInput `json:"payload"`
	PublicBody       *string      `json:"public_body"`
	TurnstileToken   *string      `json:"turnstile_token"`

	id          string
	targets     []string
	attachments []string
	mood        sql.NullString
	tags        []string
	dateLabel   sql.NullString
	releaseAt   sql.NullString
}

var naiveLayouts = []string{"2006-01-02T15:04:05.999999999", "2006-01-02T15:04", "2006-01-02 15:04:05.999999999"}
var zonedLayouts = []string{time.RFC3339Nano, "2006-01-02T15:04Z07:00", "2006-01-02 15:04:05.999999999Z07:00"}

func (b *messageInput) validate() error {
	var v validation
	if required(&v, b.ID, "id") {
		if parsed, ok := parseUUID(*b.ID); ok {
			b.id = parsed
		} else {
			v.add("UUID tidak valid.", "id")
		}
	}
	if b.EntryType != nil && *b.EntryType != "message" {
		v.add("Jenis entri wajib message.", "entry_type")
	}
	if b.ConstellationIDs == nil {
		v.add("Kolom wajib diisi.", "constellation_ids")
	} else if len(b.ConstellationIDs) < 1 || len(b.ConstellationIDs) > 10 {
		v.add("Pilih 1–10 tujuan.", "constellation_ids")
	} else {
		seen := map[string]bool{}
		for i, raw := range b.ConstellationIDs {
			parsed, ok := parseUUID(raw)
			if !ok {
				v.add("UUID tidak valid.", "constellation_ids", i)
				continue
			}
			if seen[parsed] {
				v.add("Tujuan tidak boleh berulang.", "constellation_ids")
			}
			seen[parsed] = true
			b.targets = append(b.targets, parsed)
		}
	}
	if b.Mood != nil {
		checkLength(&v, *b.Mood, 0, 40, "mood")
		if mood := normalizeMood(*b.Mood); mood != "" {
			b.mood = sql.NullString{String: mood, Valid: true}
		}
	}
	if len(b.Tags) > 5 {
		v.add("Maksimal 5 tag.", "tags")
	} else {
		b.tags = normalizeTags(b.Tags)
		for _, tag := range b.tags {
			if tag == "" || length(tag) > 50 {
				v.add("Tag wajib 1–50 karakter.", "tags")
				break
			}
		}
	}
	if b.DateLabel != nil {
		if _, err := time.Parse("2006-01-02", *b.DateLabel); err != nil {
			v.add("Tanggal wajib berformat YYYY-MM-DD.", "date_label")
		} else {
			b.dateLabel = sql.NullString{String: *b.DateLabel, Valid: true}
		}
	}
	if b.ReleaseAt != nil {
		b.releaseAt = parseRelease(&v, *b.ReleaseAt)
	}
	if len(b.AttachmentIDs) > 5 {
		v.add("Maksimal 5 lampiran.", "attachment_ids")
	}
	for i, raw := range b.AttachmentIDs {
		if parsed, ok := parseUUID(raw); ok {
			b.attachments = append(b.attachments, parsed)
		} else {
			v.add("UUID tidak valid.", "attachment_ids", i)
		}
	}
	if !required(&v, b.Visibility, "visibility") {
		return v.err()
	}
	switch *b.Visibility {
	case "private", "unlisted":
		v.check(b.PublicBody == nil, "Kolom tambahan tidak diizinkan.", "public_body")
		v.check(b.TurnstileToken == nil, "Kolom tambahan tidak diizinkan.", "turnstile_token")
		b.Payload.validate(&v, "payload")
		if len(v) == 0 && *b.Payload.AAD != fmt.Sprintf("untukmu:message:v2:%s:%s", b.id, *b.Visibility) {
			v.add("AAD tidak cocok dengan identitas pesan.")
		}
	case "public_anon":
		v.check(b.Payload == nil, "Kolom tambahan tidak diizinkan.", "payload")
		if required(&v, b.PublicBody, "public_body") {
			checkLength(&v, *b.PublicBody, 1, 40000, "public_body")
			v.check(strings.TrimSpace(*b.PublicBody) != "", "Pesan tidak boleh kosong.", "public_body")
		}
		checkOptionalLength(&v, b.TurnstileToken, 2048, "turnstile_token")
	default:
		v.add("Visibilitas wajib private, public_anon, atau unlisted.", "visibility")
	}
	return v.err()
}

func parseRelease(v *validation, value string) sql.NullString {
	for _, layout := range zonedLayouts {
		if parsed, err := time.Parse(layout, value); err == nil {
			return sql.NullString{String: ts(parsed), Valid: true}
		}
	}
	for _, layout := range naiveLayouts {
		if _, err := time.Parse(layout, value); err == nil {
			v.add("Waktu pembukaan wajib menyertakan zona waktu.", "release_at")
			return sql.NullString{}
		}
	}
	v.add("Format waktu tidak valid.", "release_at")
	return sql.NullString{}
}

type shareInput struct {
	Payload *cipherInput `json:"payload"`
}

type uploadInput struct {
	ID       *string `json:"id"`
	ByteSize *int64  `json:"byte_size"`
	IV       *string `json:"iv"`
	AAD      *string `json:"aad"`
	id       string
}

func (b *uploadInput) validate() error {
	var v validation
	if required(&v, b.ID, "id") {
		if parsed, ok := parseUUID(*b.ID); ok {
			b.id = parsed
		} else {
			v.add("UUID tidak valid.", "id")
		}
	}
	if required(&v, b.ByteSize, "byte_size") && (*b.ByteSize < 17 || *b.ByteSize > 10*1024*1024) {
		v.add("Ukuran wajib 17 byte hingga 10 MiB.", "byte_size")
	}
	if required(&v, b.IV, "iv") && !validB64(*b.IV, 12) {
		v.add("Panjang wajib 12 byte.", "iv")
	}
	if required(&v, b.AAD, "aad") {
		checkLength(&v, *b.AAD, 0, 100, "aad")
	}
	if len(v) == 0 && *b.AAD != "untukmu:upload:v2:"+b.id {
		v.add("AAD unggahan tidak sesuai.")
	}
	return v.err()
}

// ---- Social, moderation and prayers ----

type publicActionInput struct {
	TurnstileToken *string `json:"turnstile_token"`
	MessageID      *string `json:"message_id"`
	Reason         *string `json:"reason"`
	CatalogID      *string `json:"catalog_id"`
	messageID      string
}

// validate checks the action-specific fields; others must be absent.
func (b *publicActionInput) validate(kind string) error {
	var v validation
	checkOptionalLength(&v, b.TurnstileToken, 2048, "turnstile_token")
	if kind == "report" {
		if required(&v, b.MessageID, "message_id") {
			if parsed, ok := parseUUID(*b.MessageID); ok {
				b.messageID = parsed
			} else {
				v.add("UUID tidak valid.", "message_id")
			}
		}
		if required(&v, b.Reason, "reason") {
			checkLength(&v, *b.Reason, 3, 1000, "reason")
		}
	} else {
		v.check(b.MessageID == nil, "Kolom tambahan tidak diizinkan.", "message_id")
		v.check(b.Reason == nil, "Kolom tambahan tidak diizinkan.", "reason")
	}
	if kind == "prayer" {
		if required(&v, b.CatalogID, "catalog_id") {
			checkLength(&v, *b.CatalogID, 3, 100, "catalog_id")
		}
	} else {
		v.check(b.CatalogID == nil, "Kolom tambahan tidak diizinkan.", "catalog_id")
	}
	return v.err()
}

type blockInput struct {
	MessageID *string `json:"message_id"`
	messageID string
}

func (b *blockInput) validate() error {
	var v validation
	if required(&v, b.MessageID, "message_id") {
		if parsed, ok := parseUUID(*b.MessageID); ok {
			b.messageID = parsed
		} else {
			v.add("UUID tidak valid.", "message_id")
		}
	}
	return v.err()
}

type decisionInput struct {
	Decision    *string `json:"decision"`
	Reason      *string `json:"reason"`
	ReviewToken *string `json:"review_token"`
}

func (b *decisionInput) validate() error {
	var v validation
	if required(&v, b.Decision, "decision") && !oneOf(*b.Decision, "approve", "reject", "remove") {
		v.add("Keputusan wajib approve, reject, atau remove.", "decision")
	}
	checkOptionalLength(&v, b.Reason, 1000, "reason")
	if required(&v, b.ReviewToken, "review_token") && !reviewPattern.MatchString(*b.ReviewToken) {
		v.add("Token peninjauan tidak valid.", "review_token")
	}
	return v.err()
}

type prayerFinishInput struct {
	PlaybackToken *string `json:"playback_token"`
}

func (b *prayerFinishInput) validate() error {
	var v validation
	if required(&v, b.PlaybackToken, "playback_token") {
		checkLength(&v, *b.PlaybackToken, 40, 80, "playback_token")
	}
	return v.err()
}

type prayerContentInput struct {
	Title             *string `json:"title"`
	Text              *string `json:"text"`
	Translation       *string `json:"translation"`
	SourceAttribution *string `json:"source_attribution"`
	SourceURL         *string `json:"source_url"`
	ReviewNote        *string `json:"review_note"`
	Reviewed          *bool   `json:"reviewed"`
	DurationSeconds   *int    `json:"duration_seconds"`
}

func (b *prayerContentInput) validate() error {
	var v validation
	if required(&v, b.Title, "title") {
		checkLength(&v, *b.Title, 1, 120, "title")
	}
	checkOptionalLength(&v, b.Text, 10000, "text")
	checkOptionalLength(&v, b.Translation, 10000, "translation")
	if required(&v, b.SourceAttribution, "source_attribution") {
		checkLength(&v, *b.SourceAttribution, 3, 1000, "source_attribution")
	}
	checkOptionalLength(&v, b.SourceURL, 1000, "source_url")
	checkOptionalLength(&v, b.ReviewNote, 1000, "review_note")
	if required(&v, b.DurationSeconds, "duration_seconds") && (*b.DurationSeconds < 5 || *b.DurationSeconds > 900) {
		v.add("Durasi wajib 5–900 detik.", "duration_seconds")
	}
	if len(v) == 0 {
		sourceURL := deref(b.SourceURL, "")
		if sourceURL != "" && !strings.HasPrefix(sourceURL, "https://") {
			v.add("Tautan sumber wajib HTTPS.")
		} else if b.Reviewed != nil && *b.Reviewed &&
			(deref(b.Text, "") == "" || length(strings.TrimSpace(deref(b.ReviewNote, ""))) < 3 || sourceURL == "") {
			v.add("Kurasi memerlukan teks, tautan sumber, dan catatan peninjauan.")
		}
	}
	return v.err()
}

type prayerAudioInput struct {
	ByteSize        *int64  `json:"byte_size"`
	ContentType     *string `json:"content_type"`
	License         *string `json:"license"`
	Attribution     *string `json:"attribution"`
	DurationSeconds *int    `json:"duration_seconds"`
}

func (b *prayerAudioInput) validate() error {
	var v validation
	if required(&v, b.ByteSize, "byte_size") && (*b.ByteSize < 100 || *b.ByteSize > 30*1024*1024) {
		v.add("Ukuran audio wajib 100 byte hingga 30 MiB.", "byte_size")
	}
	if required(&v, b.ContentType, "content_type") &&
		!oneOf(*b.ContentType, "audio/mpeg", "audio/ogg", "audio/wav", "audio/mp4") {
		v.add("Format audio tidak didukung.", "content_type")
	}
	if required(&v, b.License, "license") {
		checkLength(&v, *b.License, 3, 500, "license")
	}
	if required(&v, b.Attribution, "attribution") {
		checkLength(&v, *b.Attribution, 3, 1000, "attribution")
	}
	if required(&v, b.DurationSeconds, "duration_seconds") && (*b.DurationSeconds < 5 || *b.DurationSeconds > 900) {
		v.add("Durasi wajib 5–900 detik.", "duration_seconds")
	}
	return v.err()
}
