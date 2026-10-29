package app

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// Curated public prayer content and durable, idempotent acknowledgements.

func revision(row *PrayerContent) string {
	encoded, _ := json.Marshal([]any{row.Content, nullable(row.AudioKey), row.AudioMeta, row.Reviewed})
	return sha256Hex(string(encoded))
}

func number(value any, fallback float64) float64 {
	if parsed, ok := value.(float64); ok {
		return parsed
	}
	return fallback
}

func durationSeconds(row *PrayerContent) float64 {
	if row.AudioKey.Valid {
		return number(row.AudioMeta["duration_seconds"], 30)
	}
	return number(row.Content["detik"], 30)
}

func text(value any) string {
	if parsed, ok := value.(string); ok {
		return parsed
	}
	return ""
}

func prayerEntry(ctx context.Context, q querier, identifier string, lock ...string) (*PrayerContent, error) {
	row, err := scanPrayer(q.QueryRowContext(ctx, "SELECT "+prayerColumns+" FROM prayer_contents WHERE id = ?"+
		strings.Join(lock, ""), identifier))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fail(http.StatusNotFound, "Entri doa tidak ditemukan.")
	}
	return row, err
}

// playbackURL resolves only a catalogue recording, without creating a prayer session.
func (a *App) playbackURL(row *PrayerContent) (string, error) {
	if !row.AudioKey.Valid {
		return "", fail(http.StatusConflict, "Audio doa belum tersedia.")
	}
	key := row.AudioKey.String
	if strings.HasPrefix(key, "bundled:") {
		return "", fail(http.StatusConflict, "Rekaman lama telah dilepas. Pasang dan tinjau rekaman asli.")
	}
	if strings.HasPrefix(key, recordingPrefix) {
		if _, _, ok := recordingFile(strings.TrimPrefix(key, recordingPrefix)); !ok {
			return "", fail(http.StatusServiceUnavailable, "Rekaman doa belum tersedia. Coba lagi nanti.")
		}
		return audioURL(row.AudioKey).(string), nil
	}
	return a.Storage.PresignGet(key, 20*time.Minute), nil
}

func previewURL(row *PrayerContent) any {
	if url := audioURL(row.AudioKey); url != nil {
		return url
	}
	return "/api/v1/prayers/" + row.ID + "/audio/preview"
}

func merge(maps ...map[string]any) map[string]any {
	result := map[string]any{}
	for _, item := range maps {
		for key, value := range item {
			result[key] = value
		}
	}
	return result
}

func (a *App) traditions(c *Ctx) (any, error) {
	rows, err := allPrayers(c.ctx(), a.DB)
	if err != nil {
		return nil, err
	}
	result := []map[string]any{}
	for _, tradition := range catalog {
		entries := []map[string]any{}
		for _, entry := range tradition.Entries {
			row, ok := rows[tradition.ID+"/"+entry.ID]
			if !ok || !row.Reviewed || !row.AudioKey.Valid {
				continue
			}
			entries = append(entries, merge(entry.Raw, row.Content, map[string]any{
				"reviewed":          row.Reviewed,
				"audio":             true,
				"audio_preview_url": previewURL(row),
				"audio_attribution": row.AudioMeta["attribution"],
				"audio_license":     row.AudioMeta["license"],
				"audio_license_url": row.AudioMeta["license_url"],
				"audio_source_url":  row.AudioMeta["page"],
				"audio_language":    row.AudioMeta["language"],
				"detik":             durationSeconds(row),
			}))
		}
		result = append(result, merge(tradition.Raw, map[string]any{"entri": entries}))
	}
	return result, nil
}

func (a *App) originalRecording(c *Ctx) (any, error) {
	identifier := c.R.PathValue("identifier")
	if _, ok := recordings[identifier]; !ok {
		return nil, fail(http.StatusNotFound, "Rekaman doa tidak ditemukan.")
	}
	body, contentType, ok := recordingFile(identifier)
	if !ok {
		return nil, fail(http.StatusServiceUnavailable, "Berkas rekaman belum tersedia.")
	}
	c.W.Header().Set("Content-Type", contentType)
	http.ServeContent(c.W, c.R, "", time.Time{}, bytes.NewReader(body))
	return handled, nil
}

func catalogPath(c *Ctx) string {
	return c.R.PathValue("tradition") + "/" + c.R.PathValue("prayer_id")
}

func (a *App) publicPreview(c *Ctx) (any, error) {
	identifier := catalogPath(c)
	if _, ok := catalogEntries[identifier]; !ok {
		return nil, fail(http.StatusNotFound, "Rekaman doa tidak ditemukan.")
	}
	row, err := prayerEntry(c.ctx(), a.DB, identifier)
	if err != nil {
		return nil, err
	}
	if !row.Reviewed || !row.AudioKey.Valid {
		return nil, fail(http.StatusNotFound, "Rekaman doa tidak ditemukan.")
	}
	if err := c.throttle("prayer-preview", 30, c.visitorIdentity(nil)); err != nil {
		return nil, err
	}
	target, err := a.playbackURL(row)
	if err != nil {
		return nil, err
	}
	http.Redirect(c.W, c.R, target, http.StatusTemporaryRedirect)
	return handled, nil
}

func (a *App) adminPreview(c *Ctx) (any, error) {
	admin, err := c.adminUser()
	if err != nil {
		return nil, err
	}
	identifier := catalogPath(c)
	if _, ok := catalogEntries[identifier]; !ok {
		return nil, fail(http.StatusNotFound, "Entri doa tidak ditemukan.")
	}
	if err := c.throttle("curation-preview", 30, admin.ID); err != nil {
		return nil, err
	}
	row, err := prayerEntry(c.ctx(), a.DB, identifier)
	if err != nil {
		return nil, err
	}
	target, err := a.playbackURL(row)
	if err != nil {
		return nil, err
	}
	return map[string]any{"audio_url": target, "seconds": durationSeconds(row)}, nil
}

func (a *App) adminCatalog(c *Ctx) (any, error) {
	if _, err := c.adminUser(); err != nil {
		return nil, err
	}
	rows, err := allPrayers(c.ctx(), a.DB)
	if err != nil {
		return nil, err
	}
	result := []map[string]any{}
	for _, identifier := range catalogOrder {
		row, ok := rows[identifier]
		if !ok {
			continue
		}
		ref := catalogEntries[identifier]
		label, _ := ref.Tradition.Raw["label"].(map[string]any)
		name, _ := ref.Entry.Raw["nama"].(map[string]any)
		result = append(result, map[string]any{
			"id":              identifier,
			"tradition":       ref.Tradition.ID,
			"tradition_label": label["id"],
			"catalog_title":   name["id"],
			// Curator edits, including intentional null text, take precedence over defaults.
			"content":            merge(ref.Entry.Raw, row.Content, map[string]any{"detik": durationSeconds(row)}),
			"reviewed":           row.Reviewed,
			"audio_meta":         row.AudioMeta,
			"has_audio":          row.AudioKey.Valid,
			"publicly_available": row.Reviewed && row.AudioKey.Valid,
			"audio_preview_url":  audioURL(row.AudioKey),
			"reviewed_at":        nullable(row.ReviewedAt),
		})
	}
	return result, nil
}

func localized(value *string) any {
	if value == nil || *value == "" {
		return nil
	}
	return map[string]string{"id": *value}
}

func (a *App) curate(c *Ctx) (any, error) {
	var body prayerContentInput
	if err := decode(c, &body); err != nil {
		return nil, err
	}
	if err := body.validate(); err != nil {
		return nil, err
	}
	admin, err := c.adminUser()
	if err != nil {
		return nil, err
	}
	if err := c.throttle("curation", 30, admin.ID); err != nil {
		return nil, err
	}
	var row *PrayerContent
	reviewed := body.Reviewed != nil && *body.Reviewed
	err = a.tx(c.ctx(), func(tx *Tx) error {
		if row, err = prayerEntry(c.ctx(), tx, catalogPath(c), a.DB.lock()); err != nil {
			return err
		}
		if reviewed && !row.AudioKey.Valid {
			return fail(http.StatusConflict, "Pasang rekaman doa sebelum menyetujui kurasi.")
		}
		seconds := float64(*body.DurationSeconds)
		if row.AudioKey.Valid {
			seconds = number(row.AudioMeta["duration_seconds"], seconds)
		}
		row.Content = map[string]any{
			"id":          c.R.PathValue("prayer_id"),
			"nama":        map[string]string{"id": *body.Title},
			"teks":        localized(body.Text),
			"arti":        localized(body.Translation),
			"sumber":      *body.SourceAttribution,
			"source_url":  deref(body.SourceURL, ""),
			"review_note": deref(body.ReviewNote, ""),
			"detik":       seconds,
		}
		row.Reviewed, row.ReviewedBy, row.ReviewedAt = reviewed, nullString(admin.ID), nullString(now())
		return row.save(c.ctx(), tx)
	})
	if err != nil {
		return nil, err
	}
	return map[string]any{"id": row.ID, "reviewed": row.Reviewed}, nil
}

func (a *App) audioPresign(c *Ctx) (any, error) {
	var body prayerAudioInput
	if err := decode(c, &body); err != nil {
		return nil, err
	}
	if err := body.validate(); err != nil {
		return nil, err
	}
	admin, err := c.adminUser()
	if err != nil {
		return nil, err
	}
	if err := c.throttle("curation-audio-presign", 10, admin.ID); err != nil {
		return nil, err
	}
	var signed map[string]any
	err = a.tx(c.ctx(), func(tx *Tx) error {
		row, err := prayerEntry(c.ctx(), tx, catalogPath(c), a.DB.lock())
		if err != nil {
			return err
		}
		key := fmt.Sprintf("curated/%s/%s", row.ID, uid())
		signed = a.Storage.PresignPost(key, *body.ContentType, *body.ByteSize, 5*time.Minute)
		row.AudioMeta = merge(row.AudioMeta, map[string]any{"pending": map[string]any{
			"byte_size": *body.ByteSize, "content_type": *body.ContentType, "license": *body.License,
			"attribution": *body.Attribution, "duration_seconds": *body.DurationSeconds, "key": key,
		}})
		return row.save(c.ctx(), tx)
	})
	if err != nil {
		return nil, err
	}
	return map[string]any{"upload": signed}, nil
}

func (a *App) audioComplete(c *Ctx) (any, error) {
	admin, err := c.adminUser()
	if err != nil {
		return nil, err
	}
	if err := c.throttle("curation-audio-complete", 10, admin.ID); err != nil {
		return nil, err
	}
	var row *PrayerContent
	err = a.tx(c.ctx(), func(tx *Tx) error {
		if row, err = prayerEntry(c.ctx(), tx, catalogPath(c), a.DB.lock()); err != nil {
			return err
		}
		pending, ok := row.AudioMeta["pending"].(map[string]any)
		if !ok || len(pending) == 0 {
			return fail(http.StatusConflict, "Tidak ada unggahan yang menunggu pemeriksaan.")
		}
		key := text(pending["key"])
		info, err := a.Storage.Head(key)
		if err != nil {
			return fail(http.StatusConflict, "Unggahan audio belum tersedia.")
		}
		if float64(info.Size) != number(pending["byte_size"], -1) || info.ContentType != text(pending["content_type"]) {
			return fail(http.StatusUnprocessableEntity, "Metadata audio tidak cocok.")
		}
		delete(pending, "key")
		row.AudioKey, row.AudioMeta = nullString(key), pending
		row.Reviewed, row.ReviewedBy, row.ReviewedAt = false, sql.NullString{}, sql.NullString{}
		return row.save(c.ctx(), tx)
	})
	if err != nil {
		return nil, err
	}
	return map[string]any{"id": row.ID, "reviewed": false}, nil
}

type prayerSession struct {
	MessageID string  `json:"message_id"`
	Identity  string  `json:"identity"`
	CatalogID string  `json:"catalog_id"`
	Started   float64 `json:"started"`
	Seconds   float64 `json:"seconds"`
	Revision  string  `json:"revision"`
}

func prayerTokenKey(token string) string { return "prayer-session:" + sha256Hex(token) }

func unixSeconds() float64 { return float64(time.Now().UnixNano()) / 1e9 }

func (a *App) startPrayer(c *Ctx) (any, error) {
	identifier, err := pathUUID(c, "message_id")
	if err != nil {
		return nil, err
	}
	body, err := decodeAction(c, "prayer")
	if err != nil {
		return nil, err
	}
	user, err := c.optionalUser()
	if err != nil {
		return nil, err
	}
	identity := c.visitorIdentity(user)
	if err := c.throttle("prayer-start", 10, identity); err != nil {
		return nil, err
	}
	if user == nil {
		if err := c.verifyTurnstile(body.TurnstileToken, "prayer"); err != nil {
			return nil, err
		}
	}
	message, err := a.readablePublic(c.ctx(), a.DB, identifier, user)
	if err != nil {
		return nil, err
	}
	if _, ok := catalogEntries[*body.CatalogID]; !ok {
		return nil, fail(http.StatusConflict, "Pilihan doa ini sudah tidak digunakan. Pilih doa dari katalog terbaru.")
	}
	row, err := prayerEntry(c.ctx(), a.DB, *body.CatalogID)
	if err != nil {
		return nil, err
	}
	if !row.Reviewed {
		return nil, fail(http.StatusConflict, "Entri ini menunggu kurasi.")
	}
	if !row.AudioKey.Valid {
		return nil, fail(http.StatusConflict, "Audio doa belum tersedia. Pilih doa yang memiliki rekaman terkurasi.")
	}
	token := randomToken()
	seconds := durationSeconds(row)
	target, err := a.playbackURL(row)
	if err != nil {
		return nil, err
	}
	state, _ := json.Marshal(prayerSession{
		MessageID: message.ID, Identity: identity, CatalogID: row.ID, Started: unixSeconds(), Seconds: seconds,
		Revision: revision(row),
	})
	a.Memory.Set(prayerTokenKey(token), string(state), time.Duration(int(seconds)+300)*time.Second)
	return map[string]any{
		"playback_token":     token,
		"seconds":            seconds,
		"audio_url":          target,
		"source_attribution": text(row.Content["sumber"]),
		"audio_attribution":  row.AudioMeta["attribution"],
	}, nil
}

func (a *App) finishPrayer(c *Ctx) (any, error) {
	identifier, err := pathUUID(c, "message_id")
	if err != nil {
		return nil, err
	}
	var body prayerFinishInput
	if err := decode(c, &body); err != nil {
		return nil, err
	}
	if err := body.validate(); err != nil {
		return nil, err
	}
	user, err := c.optionalUser()
	if err != nil {
		return nil, err
	}
	identity := c.visitorIdentity(user)
	if err := c.throttle("prayer-finish", 20, identity); err != nil {
		return nil, err
	}
	message, err := a.readablePublic(c.ctx(), a.DB, identifier, user)
	if err != nil {
		return nil, err
	}
	saved, ok := a.Memory.Get(prayerTokenKey(*body.PlaybackToken))
	if !ok {
		return nil, fail(http.StatusConflict, "Sesi doa kedaluwarsa. Mulai kembali.")
	}
	var state prayerSession
	json.Unmarshal([]byte(saved), &state)
	if state.MessageID != message.ID || !safeEqual(state.Identity, identity) {
		return nil, fail(http.StatusForbidden, "Sesi doa tidak cocok.")
	}
	if unixSeconds()-state.Started < state.Seconds {
		return nil, fail(http.StatusConflict, "Waktu doa belum selesai.")
	}
	added := false
	err = a.tx(c.ctx(), func(tx *Tx) error {
		row, err := prayerEntry(c.ctx(), tx, state.CatalogID)
		if err != nil {
			return err
		}
		if _, known := catalogEntries[row.ID]; !row.Reviewed || !row.AudioKey.Valid || !known ||
			!safeEqual(state.Revision, revision(row)) {
			return fail(http.StatusConflict, "Isi doa berubah. Mulai kembali.")
		}
		source := text(row.Content["sumber"]) + " · " + text(row.AudioMeta["attribution"])
		_, prayerType, _ := strings.Cut(row.ID, "/")
		result, err := tx.ExecContext(c.ctx(), `INSERT INTO prayers (id, message_id, visitor_hash, tradition,
			prayer_type, played_audio_ref, source_attribution, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (message_id, visitor_hash) DO NOTHING`,
			uid(), message.ID, identity, row.Tradition, prayerType, row.AudioKey, source, now())
		if err != nil {
			return err
		}
		if changed, _ := result.RowsAffected(); changed == 1 {
			added = true
			if _, err := tx.ExecContext(c.ctx(), "UPDATE messages SET prayer_count = prayer_count + 1 WHERE id = ?",
				message.ID); err != nil {
				return err
			}
		}
		return tx.QueryRowContext(c.ctx(), "SELECT prayer_count FROM messages WHERE id = ?", message.ID).
			Scan(&message.PrayerCount)
	})
	if err != nil {
		return nil, err
	}
	a.invalidate(authorID(message))
	if user != nil && !sameUser(user, message.AuthorID) {
		a.Memory.Delete("summary:" + user.ID)
	}
	// Retain the bounded session until expiry so retries after a lost response are idempotent.
	return map[string]any{"added": added, "prayer_count": message.PrayerCount}, nil
}
