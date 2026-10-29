package app

import (
	"context"
	"database/sql"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schemaSQL string

// schemaVersion 2 adds workspaces: every account owns one, shown as a star
// around the Milky Way and enterable by others when it is public.
const schemaVersion = 2

// timeLayout is fixed-width UTC so stored values sort lexicographically.
const timeLayout = "2006-01-02T15:04:05.000000Z"

func ts(t time.Time) string { return t.UTC().Format(timeLayout) }

func now() string { return ts(time.Now()) }

func parseTS(value string) time.Time {
	parsed, err := time.Parse(timeLayout, value)
	if err != nil {
		parsed, _ = time.Parse(time.RFC3339Nano, value)
	}
	return parsed
}

func uid() string { return uuid.NewString() }

// querier is satisfied by both *Store and *Tx.
type querier interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// OpenStore connects to PostgreSQL when DATABASE_URL is set, otherwise to the
// SQLite file at DATABASE_PATH, and brings the schema up to date.
func OpenStore(conf *Config) (*Store, error) {
	var store *Store
	if conf.DatabaseURL != "" {
		db, err := openPostgres(conf.DatabaseURL)
		if err != nil {
			return nil, err
		}
		store = &Store{db: db, PG: true}
	} else {
		db, err := openSQLite(conf.DatabasePath)
		if err != nil {
			return nil, err
		}
		store = &Store{db: db}
	}
	if err := store.migrate(); err != nil {
		store.Close()
		return nil, err
	}
	return store, nil
}

func openSQLite(path string) (*sql.DB, error) {
	if path != ":memory:" {
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			return nil, err
		}
	}
	params := url.Values{}
	params.Add("_pragma", "foreign_keys(1)")
	params.Add("_pragma", "busy_timeout(10000)")
	params.Add("_pragma", "journal_mode(WAL)")
	params.Add("_pragma", "synchronous(NORMAL)")
	// Every transaction takes the write lock up front, matching the row locks
	// (SELECT ... FOR UPDATE) used on PostgreSQL.
	params.Set("_txlock", "immediate")
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(path)+"?"+params.Encode())
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(8)
	db.SetConnMaxIdleTime(5 * time.Minute)
	return db, nil
}

func (s *Store) version() (int, error) {
	var version int
	if !s.PG {
		return version, s.db.QueryRow("PRAGMA user_version").Scan(&version)
	}
	if _, err := s.db.Exec("CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER NOT NULL)"); err != nil {
		return 0, err
	}
	err := s.db.QueryRow("SELECT version FROM schema_meta LIMIT 1").Scan(&version)
	if errors.Is(err, sql.ErrNoRows) {
		_, err = s.db.Exec("INSERT INTO schema_meta (version) VALUES (0)")
	}
	return version, err
}

func (s *Store) setVersion(version int) error {
	var err error
	if s.PG {
		_, err = s.db.Exec("UPDATE schema_meta SET version = $1", version)
	} else {
		_, err = s.db.Exec(fmt.Sprintf("PRAGMA user_version = %d", version))
	}
	return err
}

func (s *Store) migrate() error {
	version, err := s.version()
	if err != nil {
		return fmt.Errorf("database tidak dapat dibaca: %w", err)
	}
	if version > schemaVersion {
		return fmt.Errorf("skema database versi %d lebih baru dari aplikasi (%d)", version, schemaVersion)
	}
	// Statements are idempotent (IF NOT EXISTS) and run one at a time, because
	// PostgreSQL's extended protocol accepts a single statement per call.
	for _, statement := range strings.Split(schemaSQL, ";") {
		if strings.TrimSpace(stripComments(statement)) == "" {
			continue
		}
		if _, err := s.db.Exec(statement); err != nil {
			return fmt.Errorf("migrasi skema gagal: %w", err)
		}
	}
	if err := s.seedCatalog(); err != nil {
		return err
	}
	if err := s.backfillWorkspaces(); err != nil {
		return err
	}
	return s.setVersion(schemaVersion)
}

func stripComments(statement string) string {
	var kept []string
	for _, line := range strings.Split(statement, "\n") {
		if !strings.HasPrefix(strings.TrimSpace(line), "--") {
			kept = append(kept, line)
		}
	}
	return strings.Join(kept, "\n")
}

// seedCatalog inserts catalogue entries that do not exist yet. Curator edits survive.
func (s *Store) seedCatalog() error {
	for _, tradition := range catalog {
		for _, entry := range tradition.Entries {
			identifier := tradition.ID + "/" + entry.ID
			content, _ := json.Marshal(entry.Raw)
			meta := json.RawMessage("{}")
			var audioKey any
			if recording, ok := recordings[entry.RecordingID]; ok && entry.RecordingID != "" {
				meta = recording.Raw
				audioKey = recordingPrefix + entry.RecordingID
			}
			if _, err := s.Exec(
				`INSERT INTO prayer_contents (id, tradition, content, reviewed, audio_key, audio_meta)
				 VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
				identifier, tradition.ID, string(content), flag(entry.Reviewed), audioKey, string(meta),
			); err != nil {
				return err
			}
		}
	}
	return nil
}

// backfillWorkspaces gives accounts created before schema v2 their workspace.
func (s *Store) backfillWorkspaces() error {
	rows, err := s.QueryContext(context.Background(), `SELECT users.id, users.display_name, users.profile_visibility
		FROM users WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE workspaces.owner_id = users.id)`)
	if err != nil {
		return err
	}
	type pending struct{ id, name, visibility string }
	var missing []pending
	for rows.Next() {
		var item pending
		if err := rows.Scan(&item.id, &item.name, &item.visibility); err != nil {
			rows.Close()
			return err
		}
		missing = append(missing, item)
	}
	rows.Close()
	for _, item := range missing {
		if err := createWorkspace(context.Background(), s, item.id, item.name, item.visibility == "public"); err != nil {
			return err
		}
	}
	return nil
}

func placeholders(count int) string {
	return strings.TrimSuffix(strings.Repeat("?,", count), ",")
}

func anySlice(values []string) []any {
	result := make([]any, len(values))
	for i, value := range values {
		result[i] = value
	}
	return result
}

// ---- Rows ----

type User struct {
	ID                       string
	Email                    string
	PasswordHash             string
	RecoveryAuthHash         sql.NullString
	DisplayName              string
	Role                     string
	EncryptionRecord         sql.NullString
	DefaultMessageVisibility string
	ProfileVisibility        string
	Preferences              string
	CreatedAt                string
	UpdatedAt                string
}

const userColumns = `id, email, password_hash, recovery_auth_hash, display_name, role, encryption_record,
	default_message_visibility, profile_visibility, preferences, created_at, updated_at`

func scanUser(row interface{ Scan(...any) error }) (*User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.RecoveryAuthHash, &u.DisplayName, &u.Role,
		&u.EncryptionRecord, &u.DefaultMessageVisibility, &u.ProfileVisibility, &u.Preferences, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func getUser(ctx context.Context, q querier, where string, args ...any) (*User, error) {
	user, err := scanUser(q.QueryRowContext(ctx, "SELECT "+userColumns+" FROM users WHERE "+where, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return user, err
}

type Session struct {
	ID               string
	UserID           string
	RefreshTokenHash string
	UserAgent        string
	IPHash           string
	CreatedAt        string
	LastSeenAt       string
	ExpiresAt        string
	RevokedAt        sql.NullString
}

const sessionColumns = "id, user_id, refresh_token_hash, user_agent, ip_hash, created_at, last_seen_at, expires_at, revoked_at"

func scanSession(row interface{ Scan(...any) error }) (*Session, error) {
	var s Session
	err := row.Scan(&s.ID, &s.UserID, &s.RefreshTokenHash, &s.UserAgent, &s.IPHash, &s.CreatedAt, &s.LastSeenAt,
		&s.ExpiresAt, &s.RevokedAt)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func getSession(ctx context.Context, q querier, where string, args ...any) (*Session, error) {
	session, err := scanSession(q.QueryRowContext(ctx, "SELECT "+sessionColumns+" FROM sessions WHERE "+where, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return session, err
}

type Constellation struct {
	ID             string
	OwnerID        sql.NullString
	TargetKind     string
	TargetLabel    string
	CustomCategory sql.NullString
	VisualType     string
	VisualRef      sql.NullString
	Kind           string
	Color          string
	Radius         int
	ParticleCount  int
	CreatedAt      string
}

const constellationColumns = `constellations.id, constellations.owner_id, constellations.target_kind,
	constellations.target_label, constellations.custom_category, constellations.visual_type,
	constellations.visual_ref, constellations.kind, constellations.color, constellations.radius,
	constellations.particle_count, constellations.created_at`

func scanConstellation(row interface{ Scan(...any) error }, extra ...any) (*Constellation, error) {
	var c Constellation
	dest := []any{&c.ID, &c.OwnerID, &c.TargetKind, &c.TargetLabel, &c.CustomCategory, &c.VisualType, &c.VisualRef,
		&c.Kind, &c.Color, &c.Radius, &c.ParticleCount, &c.CreatedAt}
	if err := row.Scan(append(dest, extra...)...); err != nil {
		return nil, err
	}
	return &c, nil
}

type Message struct {
	ID                  string
	AuthorID            sql.NullString
	EntryType           string
	Ciphertext          sql.NullString
	IV                  sql.NullString
	KdfSalt             sql.NullString
	EncryptionMeta      sql.NullString
	PublicBody          sql.NullString
	ShareTokenHash      sql.NullString
	SharePayload        sql.NullString
	ReleaseAt           sql.NullString
	Visibility          string
	ModerationStatus    string
	ModerationFlags     string
	ModerationCheckedAt sql.NullString
	Mood                sql.NullString
	Tags                string
	DateLabel           sql.NullString
	PrayerCount         int
	EmpathyCount        int
	CreatedAt           string
}

const messageColumns = `messages.id, messages.author_id, messages.entry_type, messages.ciphertext, messages.iv,
	messages.kdf_salt, messages.encryption_meta, messages.public_body, messages.share_token_hash,
	messages.share_payload, messages.release_at, messages.visibility, messages.moderation_status,
	messages.moderation_flags, messages.moderation_checked_at, messages.mood, messages.tags, messages.date_label,
	messages.prayer_count, messages.empathy_count, messages.created_at`

func scanMessage(row interface{ Scan(...any) error }) (*Message, error) {
	var m Message
	err := row.Scan(&m.ID, &m.AuthorID, &m.EntryType, &m.Ciphertext, &m.IV, &m.KdfSalt, &m.EncryptionMeta,
		&m.PublicBody, &m.ShareTokenHash, &m.SharePayload, &m.ReleaseAt, &m.Visibility, &m.ModerationStatus,
		&m.ModerationFlags, &m.ModerationCheckedAt, &m.Mood, &m.Tags, &m.DateLabel, &m.PrayerCount, &m.EmpathyCount,
		&m.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func queryMessages(ctx context.Context, q querier, query string, args ...any) ([]*Message, error) {
	rows, err := q.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []*Message
	for rows.Next() {
		message, err := scanMessage(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, message)
	}
	return result, rows.Err()
}

func getMessage(ctx context.Context, q querier, where string, args ...any) (*Message, error) {
	rows, err := queryMessages(ctx, q, "SELECT "+messageColumns+" FROM messages WHERE "+where+" LIMIT 1", args...)
	if err != nil || len(rows) == 0 {
		return nil, err
	}
	return rows[0], nil
}

func (m *Message) save(ctx context.Context, q querier, insert bool) error {
	values := []any{m.AuthorID, m.EntryType, m.Ciphertext, m.IV, m.KdfSalt, m.EncryptionMeta, m.PublicBody,
		m.ShareTokenHash, m.SharePayload, m.ReleaseAt, m.Visibility, m.ModerationStatus, m.ModerationFlags,
		m.ModerationCheckedAt, m.Mood, m.Tags, m.DateLabel}
	if insert {
		_, err := q.ExecContext(ctx, `INSERT INTO messages (author_id, entry_type, ciphertext, iv, kdf_salt,
			encryption_meta, public_body, share_token_hash, share_payload, release_at, visibility, moderation_status,
			moderation_flags, moderation_checked_at, mood, tags, date_label, prayer_count, empathy_count, created_at, id)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			append(values, m.PrayerCount, m.EmpathyCount, m.CreatedAt, m.ID)...)
		return err
	}
	_, err := q.ExecContext(ctx, `UPDATE messages SET author_id = ?, entry_type = ?, ciphertext = ?, iv = ?,
		kdf_salt = ?, encryption_meta = ?, public_body = ?, share_token_hash = ?, share_payload = ?, release_at = ?,
		visibility = ?, moderation_status = ?, moderation_flags = ?, moderation_checked_at = ?, mood = ?, tags = ?,
		date_label = ? WHERE id = ?`, append(values, m.ID)...)
	return err
}

type Upload struct {
	ID             string
	OwnerID        sql.NullString
	StorageKey     string
	ByteSize       int64
	EncryptionMeta string
	Complete       bool
	CreatedAt      string
}

const uploadColumns = "id, owner_id, storage_key, byte_size, encryption_meta, complete, created_at"

func scanUpload(row interface{ Scan(...any) error }) (*Upload, error) {
	var u Upload
	if err := row.Scan(&u.ID, &u.OwnerID, &u.StorageKey, &u.ByteSize, &u.EncryptionMeta, &u.Complete, &u.CreatedAt); err != nil {
		return nil, err
	}
	return &u, nil
}

type PrayerContent struct {
	ID         string
	Tradition  string
	Content    map[string]any
	Reviewed   bool
	ReviewedBy sql.NullString
	ReviewedAt sql.NullString
	AudioKey   sql.NullString
	AudioMeta  map[string]any
	rawContent string
	rawMeta    string
}

const prayerColumns = "id, tradition, content, reviewed, reviewed_by, reviewed_at, audio_key, audio_meta"

func scanPrayer(row interface{ Scan(...any) error }) (*PrayerContent, error) {
	var p PrayerContent
	if err := row.Scan(&p.ID, &p.Tradition, &p.rawContent, &p.Reviewed, &p.ReviewedBy, &p.ReviewedAt, &p.AudioKey,
		&p.rawMeta); err != nil {
		return nil, err
	}
	p.Content, p.AudioMeta = map[string]any{}, map[string]any{}
	json.Unmarshal([]byte(p.rawContent), &p.Content)
	json.Unmarshal([]byte(p.rawMeta), &p.AudioMeta)
	return &p, nil
}

func allPrayers(ctx context.Context, q querier) (map[string]*PrayerContent, error) {
	rows, err := q.QueryContext(ctx, "SELECT "+prayerColumns+" FROM prayer_contents")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := map[string]*PrayerContent{}
	for rows.Next() {
		row, err := scanPrayer(rows)
		if err != nil {
			return nil, err
		}
		result[row.ID] = row
	}
	return result, rows.Err()
}

func (p *PrayerContent) save(ctx context.Context, q querier) error {
	content, _ := json.Marshal(p.Content)
	meta, _ := json.Marshal(p.AudioMeta)
	_, err := q.ExecContext(ctx, `UPDATE prayer_contents SET content = ?, reviewed = ?, reviewed_by = ?, reviewed_at = ?,
		audio_key = ?, audio_meta = ? WHERE id = ?`,
		string(content), flag(p.Reviewed), p.ReviewedBy, p.ReviewedAt, p.AudioKey, string(meta), p.ID)
	return err
}

func nullString(value string) sql.NullString {
	return sql.NullString{String: value, Valid: true}
}

// jsonValue renders a stored JSON column, or null when absent.
func jsonValue(value sql.NullString) json.RawMessage {
	if !value.Valid || value.String == "" {
		return json.RawMessage("null")
	}
	return json.RawMessage(value.String)
}

func nullable(value sql.NullString) any {
	if !value.Valid {
		return nil
	}
	return value.String
}
