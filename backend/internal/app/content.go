package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

// Galaksi dan pesan privat.

func trimSpace(value string) string { return strings.TrimSpace(value) }

// owned loads a row of table only when it belongs to userID.
func owned[T any](ctx context.Context, q querier, table, ownerColumn, columns string,
	scan func(interface{ Scan(...any) error }) (T, error), identifier, userID string) (T, error) {
	row, err := scan(q.QueryRowContext(ctx, "SELECT "+columns+" FROM "+table+" WHERE "+table+".id = ? AND "+
		table+"."+ownerColumn+" = ?", identifier, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return row, fail(http.StatusNotFound, "Data tidak ditemukan.")
	}
	return row, err
}

func ownedGalaxy(ctx context.Context, q querier, identifier, userID string) (*Constellation, error) {
	return owned(ctx, q, "constellations", "owner_id", constellationColumns,
		func(row interface{ Scan(...any) error }) (*Constellation, error) { return scanConstellation(row) },
		identifier, userID)
}

func ownedMessage(ctx context.Context, q querier, identifier, userID string) (*Message, error) {
	return owned(ctx, q, "messages", "author_id", messageColumns, scanMessage, identifier, userID)
}

func ownedUpload(ctx context.Context, q querier, identifier, userID string) (*Upload, error) {
	return owned(ctx, q, "uploads", "owner_id", uploadColumns, scanUpload, identifier, userID)
}

func galaxyView(row *Constellation) map[string]any {
	return map[string]any{
		"id":              row.ID,
		"target_kind":     row.TargetKind,
		"target_label":    row.TargetLabel,
		"custom_category": nullable(row.CustomCategory),
		"visual_type":     row.VisualType,
		"visual_ref":      nullable(row.VisualRef),
		"kind":            row.Kind,
		"color":           row.Color,
		"radius":          row.Radius,
		"particle_count":  row.ParticleCount,
		"created_at":      row.CreatedAt,
	}
}

func queryGalaxies(ctx context.Context, q querier, query string, args ...any) ([]*Constellation, error) {
	rows, err := q.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []*Constellation
	for rows.Next() {
		row, err := scanConstellation(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, row)
	}
	return result, rows.Err()
}

func paging(c *Ctx, defaultLimit, maxLimit, maxOffset int) (int, int, error) {
	offset, err := queryInt(c, "offset", 0, 0, maxOffset)
	if err != nil {
		return 0, 0, err
	}
	limit, err := queryInt(c, "limit", defaultLimit, 1, maxLimit)
	return offset, limit, err
}

const unbounded = int(^uint(0) >> 1)

func (a *App) listGalaxies(c *Ctx) (any, error) {
	user, err := c.currentUser()
	if err != nil {
		return nil, err
	}
	offset, limit, err := paging(c, 100, 200, unbounded)
	if err != nil {
		return nil, err
	}
	rows, err := queryGalaxies(c.ctx(), a.DB, "SELECT "+constellationColumns+` FROM constellations
		WHERE owner_id = ? ORDER BY created_at DESC, id LIMIT ? OFFSET ?`, user.ID, limit, offset)
	if err != nil {
		return nil, err
	}
	result := []map[string]any{}
	for _, row := range rows {
		result = append(result, galaxyView(row))
	}
	return result, nil
}

func (a *App) verifyPhoto(c *Ctx, q querier, body *galaxyInput, user *User) error {
	if body.visualRef == nil {
		return nil
	}
	upload, err := ownedUpload(c.ctx(), q, body.visualRef.(string), user.ID)
	if err != nil {
		return err
	}
	if !upload.Complete {
		return fail(http.StatusConflict, "Unggahan foto belum selesai.")
	}
	return nil
}

func (body *galaxyInput) apply(row *Constellation) {
	row.TargetKind = *body.TargetKind
	row.TargetLabel = *body.TargetLabel
	row.CustomCategory = sql.NullString{}
	if body.CustomCategory != nil {
		row.CustomCategory = nullString(*body.CustomCategory)
	}
	row.VisualType = deref(body.VisualType, "light_symbol")
	row.VisualRef = sql.NullString{}
	if body.visualRef != nil {
		row.VisualRef = nullString(body.visualRef.(string))
	}
	row.Kind = deref(body.Kind, "spiral")
	row.Color = deref(body.Color, "#ffd9a0")
	row.Radius, row.ParticleCount = 140, 8500
	if body.Radius != nil {
		row.Radius = *body.Radius
	}
	if body.ParticleCount != nil {
		row.ParticleCount = *body.ParticleCount
	}
}

func (a *App) createGalaxy(c *Ctx) (any, error) {
	var body galaxyInput
	if err := decode(c, &body); err != nil {
		return nil, err
	}
	if err := body.validate(); err != nil {
		return nil, err
	}
	user, err := c.currentUser()
	if err != nil {
		return nil, err
	}
	if err := c.throttle("constellations", 20, user.ID); err != nil {
		return nil, err
	}
	row := &Constellation{ID: uid(), OwnerID: nullString(user.ID), CreatedAt: now()}
	body.apply(row)
	err = a.tx(c.ctx(), func(tx *Tx) error {
		if err := a.verifyPhoto(c, tx, &body, user); err != nil {
			return err
		}
		_, err := tx.ExecContext(c.ctx(), `INSERT INTO constellations (id, owner_id, target_kind, target_label,
			custom_category, visual_type, visual_ref, kind, color, radius, particle_count, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, row.ID, row.OwnerID, row.TargetKind, row.TargetLabel,
			row.CustomCategory, row.VisualType, row.VisualRef, row.Kind, row.Color, row.Radius, row.ParticleCount,
			row.CreatedAt)
		return err
	})
	if err != nil {
		return nil, err
	}
	a.invalidate(user.ID)
	return galaxyView(row), nil
}

func (a *App) getGalaxy(c *Ctx) (any, error) {
	identifier, err := pathUUID(c, "galaxy_id")
	if err != nil {
		return nil, err
	}
	user, err := c.currentUser()
	if err != nil {
		return nil, err
	}
	row, err := ownedGalaxy(c.ctx(), a.DB, identifier, user.ID)
	if err != nil {
		return nil, err
	}
	return galaxyView(row), nil
}

func (a *App) patchGalaxy(c *Ctx) (any, error) {
	identifier, err := pathUUID(c, "galaxy_id")
	if err != nil {
		return nil, err
	}
	var body galaxyInput
	if err := decode(c, &body); err != nil {
		return nil, err
	}
	if err := body.validate(); err != nil {
		return nil, err
	}
	user, err := c.currentUser()
	if err != nil {
		return nil, err
	}
	if err := c.throttle("write", 60, user.ID); err != nil {
		return nil, err
	}
	var row *Constellation
	err = a.tx(c.ctx(), func(tx *Tx) error {
		if row, err = ownedGalaxy(c.ctx(), tx, identifier, user.ID); err != nil {
			return err
		}
		if err := a.verifyPhoto(c, tx, &body, user); err != nil {
			return err
		}
		body.apply(row)
		_, err := tx.ExecContext(c.ctx(), `UPDATE constellations SET target_kind = ?, target_label = ?,
			custom_category = ?, visual_type = ?, visual_ref = ?, kind = ?, color = ?, radius = ?, particle_count = ?
			WHERE id = ?`, row.TargetKind, row.TargetLabel, row.CustomCategory, row.VisualType, row.VisualRef, row.Kind,
			row.Color, row.Radius, row.ParticleCount, row.ID)
		return err
	})
	if err != nil {
		return nil, err
	}
	return galaxyView(row), nil
}

func (a *App) deleteGalaxy(c *Ctx) (any, error) {
	identifier, err := pathUUID(c, "galaxy_id")
	if err != nil {
		return nil, err
	}
	user, err := c.currentUser()
	if err != nil {
		return nil, err
	}
	if err := c.throttle("write", 60, user.ID); err != nil {
		return nil, err
	}
	err = a.tx(c.ctx(), func(tx *Tx) error {
		row, err := ownedGalaxy(c.ctx(), tx, identifier, user.ID)
		if err != nil {
			return err
		}
		// Do not orphan messages or silently delete them when a galaxy is removed.
		used, err := exists(c.ctx(), tx, "SELECT 1 FROM message_constellations WHERE constellation_id = ?", row.ID)
		if err != nil {
			return err
		}
		if used {
			return fail(http.StatusConflict, "Hapus pesan di galaksi terlebih dahulu.")
		}
		_, err = tx.ExecContext(c.ctx(), "DELETE FROM constellations WHERE id = ?", row.ID)
		return err
	})
	if err != nil {
		return nil, err
	}
	a.invalidate(user.ID)
	return nil, nil
}

// links returns message id -> linked ids for a two-column link table.
func links(ctx context.Context, q querier, query string, identifiers []string) (map[string][]string, error) {
	result := map[string][]string{}
	if len(identifiers) == 0 {
		return result, nil
	}
	rows, err := q.QueryContext(ctx, strings.Replace(query, "(?)", "("+placeholders(len(identifiers))+")", 1),
		anySlice(identifiers)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var message, linked string
		if err := rows.Scan(&message, &linked); err != nil {
			return nil, err
		}
		result[message] = append(result[message], linked)
	}
	return result, rows.Err()
}

func orEmpty(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}

func (a *App) messageViews(ctx context.Context, q querier, rows []*Message) ([]map[string]any, error) {
	result := []map[string]any{}
	identifiers := make([]string, len(rows))
	for i, row := range rows {
		identifiers[i] = row.ID
	}
	targets, err := links(ctx, q, "SELECT message_id, constellation_id FROM message_constellations WHERE message_id IN (?)",
		identifiers)
	if err != nil {
		return nil, err
	}
	attachments, err := links(ctx, q, "SELECT message_id, upload_id FROM message_attachments WHERE message_id IN (?)",
		identifiers)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		meta := map[string]any{}
		if row.EncryptionMeta.Valid {
			json.Unmarshal([]byte(row.EncryptionMeta.String), &meta)
		}
		serverSealed := meta["alg"] == "server-A256GCM"
		var body any
		if row.Visibility == "public_anon" {
			text, err := a.openPublic(row.ID, row.PublicBody.String)
			if err != nil {
				return nil, err
			}
			body = text
		} else if serverSealed {
			text, err := a.openPublic(row.ID, row.Ciphertext.String)
			if err != nil {
				return nil, err
			}
			body = text
		}
		payload := map[string]any{}
		for key, value := range meta {
			payload[key] = value
		}
		payload["ct"], payload["iv"] = nullable(row.Ciphertext), nullable(row.IV)
		result = append(result, map[string]any{
			"id":                      row.ID,
			"entry_type":              row.EntryType,
			"constellation_ids":       orEmpty(targets[row.ID]),
			"visibility":              row.Visibility,
			"public_body":             body,
			"needs_client_encryption": serverSealed,
			"is_mine":                 true,
			"empathy_count":           row.EmpathyCount,
			"payload":                 payload,
			"date_label":              nullable(row.DateLabel),
			"release_at":              nullable(row.ReleaseAt),
			"mood":                    nullable(row.Mood),
			"tags":                    json.RawMessage(row.Tags),
			"prayer_count":            row.PrayerCount,
			"created_at":              row.CreatedAt,
			"attachment_ids":          orEmpty(attachments[row.ID]),
			"moderation_status":       row.ModerationStatus,
		})
	}
	return result, nil
}

func (a *App) validateTargets(c *Ctx, q querier, body *messageInput, user *User) error {
	for _, identifier := range body.targets {
		if _, err := ownedGalaxy(c.ctx(), q, identifier, user.ID); err != nil {
			return err
		}
	}
	for _, identifier := range body.attachments {
		upload, err := ownedUpload(c.ctx(), q, identifier, user.ID)
		if err != nil {
			return err
		}
		if !upload.Complete {
			return fail(http.StatusConflict, "Unggahan lampiran belum selesai.")
		}
	}
	return nil
}

func (a *App) applyMessage(row *Message, body *messageInput, user *User) {
	row.ShareTokenHash, row.SharePayload = sql.NullString{}, sql.NullString{}
	row.Visibility = *body.Visibility
	row.Ciphertext, row.IV, row.KdfSalt, row.EncryptionMeta = sql.NullString{}, sql.NullString{}, sql.NullString{},
		sql.NullString{}
	if body.Payload != nil {
		row.Ciphertext, row.IV = nullString(*body.Payload.CT), nullString(*body.Payload.IV)
		var record map[string]any
		json.Unmarshal([]byte(user.EncryptionRecord.String), &record)
		if salt, ok := record["salt"].(string); ok {
			row.KdfSalt = nullString(salt)
		}
		meta, _ := json.Marshal(body.Payload.meta())
		row.EncryptionMeta = nullString(string(meta))
	}
	row.PublicBody = sql.NullString{}
	row.ModerationStatus = "not_applicable"
	if row.Visibility == "public_anon" {
		row.PublicBody = nullString(a.sealPublic(row.ID, *body.PublicBody))
		row.ModerationStatus = "pending"
	}
	row.ModerationFlags, row.ModerationCheckedAt = "[]", sql.NullString{}
	tags, _ := json.Marshal(body.tags)
	row.Mood, row.Tags, row.DateLabel, row.ReleaseAt = body.mood, string(tags), body.dateLabel, body.releaseAt
}

func replaceLinks(ctx context.Context, q querier, row *Message, body *messageInput) error {
	for _, statement := range []string{
		"DELETE FROM message_constellations WHERE message_id = ?",
		"DELETE FROM message_attachments WHERE message_id = ?",
	} {
		if _, err := q.ExecContext(ctx, statement, row.ID); err != nil {
			return err
		}
	}
	for _, target := range body.targets {
		if _, err := q.ExecContext(ctx, "INSERT INTO message_constellations (message_id, constellation_id) VALUES (?, ?)",
			row.ID, target); err != nil {
			return err
		}
	}
	for _, upload := range body.attachments {
		if _, err := q.ExecContext(ctx, `INSERT INTO message_attachments (id, message_id, upload_id, created_at)
			VALUES (?, ?, ?, ?)`, uid(), row.ID, upload, now()); err != nil {
			return err
		}
	}
	return nil
}

func decodeMessage(c *Ctx) (*messageInput, error) {
	var body messageInput
	if err := decode(c, &body); err != nil {
		return nil, err
	}
	return &body, body.validate()
}

func (a *App) createMessage(c *Ctx) (any, error) {
	body, err := decodeMessage(c)
	if err != nil {
		return nil, err
	}
	user, err := c.currentUser()
	if err != nil {
		return nil, err
	}
	if err := c.throttle("messages", 15, user.ID); err != nil {
		return nil, err
	}
	if err := a.validateTargets(c, a.DB, body, user); err != nil {
		return nil, err
	}
	if *body.Visibility == "public_anon" {
		if err := c.verifyTurnstile(body.TurnstileToken, "publish"); err != nil {
			return nil, err
		}
	}
	row := &Message{ID: body.id, AuthorID: nullString(user.ID), EntryType: "message", CreatedAt: now()}
	a.applyMessage(row, body, user)
	var view []map[string]any
	err = a.tx(c.ctx(), func(tx *Tx) error {
		if err := a.validateTargets(c, tx, body, user); err != nil {
			return err
		}
		if err := a.checkPublic(c.ctx(), tx, row, nil); err != nil {
			return err
		}
		if err := row.save(c.ctx(), tx, true); err != nil {
			if isUniqueViolation(err) {
				return fail(http.StatusConflict, "Identitas pesan sudah dipakai.")
			}
			return err
		}
		if err := replaceLinks(c.ctx(), tx, row, body); err != nil {
			return err
		}
		view, err = a.messageViews(c.ctx(), tx, []*Message{row})
		return err
	})
	if err != nil {
		return nil, err
	}
	a.invalidate(user.ID)
	return view[0], nil
}

func (a *App) getMessage(c *Ctx) (any, error) {
	identifier, err := pathUUID(c, "message_id")
	if err != nil {
		return nil, err
	}
	user, err := c.optionalUser()
	if err != nil {
		return nil, err
	}
	row, err := getMessage(c.ctx(), a.DB, "id = ?", identifier)
	if err != nil {
		return nil, err
	}
	if row != nil && sameUser(user, row.AuthorID) {
		views, err := a.messageViews(c.ctx(), a.DB, []*Message{row})
		if err != nil {
			return nil, err
		}
		return views[0], nil
	}
	if user == nil && (row == nil || row.Visibility != "public_anon" || row.ModerationStatus != "approved") {
		return nil, fail(http.StatusUnauthorized, "Silakan masuk terlebih dahulu.")
	}
	public, err := a.readablePublic(c.ctx(), a.DB, identifier, user)
	if err != nil {
		return nil, err
	}
	return a.publicView(public, user)
}

func (a *App) editMessage(c *Ctx) (any, error) {
	identifier, err := pathUUID(c, "message_id")
	if err != nil {
		return nil, err
	}
	body, err := decodeMessage(c)
	if err != nil {
		return nil, err
	}
	user, err := c.currentUser()
	if err != nil {
		return nil, err
	}
	if err := c.throttle("write", 60, user.ID); err != nil {
		return nil, err
	}
	if _, err := ownedMessage(c.ctx(), a.DB, identifier, user.ID); err != nil {
		return nil, err
	}
	if identifier != body.id {
		return nil, fail(http.StatusUnprocessableEntity, "Identitas pesan tidak cocok.")
	}
	if err := a.validateTargets(c, a.DB, body, user); err != nil {
		return nil, err
	}
	if *body.Visibility == "public_anon" {
		if err := c.verifyTurnstile(body.TurnstileToken, "publish"); err != nil {
			return nil, err
		}
	}
	var view []map[string]any
	err = a.tx(c.ctx(), func(tx *Tx) error {
		row, err := ownedMessage(c.ctx(), tx, identifier, user.ID)
		if err != nil {
			return err
		}
		if err := a.validateTargets(c, tx, body, user); err != nil {
			return err
		}
		previous := row.ModerationStatus
		a.applyMessage(row, body, user)
		if err := a.checkPublic(c.ctx(), tx, row, &previous); err != nil {
			return err
		}
		if err := row.save(c.ctx(), tx, false); err != nil {
			return err
		}
		if err := replaceLinks(c.ctx(), tx, row, body); err != nil {
			return err
		}
		view, err = a.messageViews(c.ctx(), tx, []*Message{row})
		return err
	})
	if err != nil {
		return nil, err
	}
	a.invalidate(user.ID)
	return view[0], nil
}

func (a *App) deleteMessage(c *Ctx) (any, error) {
	identifier, err := pathUUID(c, "message_id")
	if err != nil {
		return nil, err
	}
	user, err := c.currentUser()
	if err != nil {
		return nil, err
	}
	if err := c.throttle("write", 60, user.ID); err != nil {
		return nil, err
	}
	result, err := a.DB.ExecContext(c.ctx(), "DELETE FROM messages WHERE id = ? AND author_id = ?", identifier, user.ID)
	if err != nil {
		return nil, err
	}
	if changed, _ := result.RowsAffected(); changed == 0 {
		return nil, fail(http.StatusNotFound, "Data tidak ditemukan.")
	}
	a.invalidate(user.ID)
	return nil, nil
}

func (a *App) galaxyMessages(c *Ctx) (any, error) {
	identifier, err := pathUUID(c, "galaxy_id")
	if err != nil {
		return nil, err
	}
	user, err := c.currentUser()
	if err != nil {
		return nil, err
	}
	offset, limit, err := paging(c, 100, 200, unbounded)
	if err != nil {
		return nil, err
	}
	if _, err := ownedGalaxy(c.ctx(), a.DB, identifier, user.ID); err != nil {
		return nil, err
	}
	rows, err := queryMessages(c.ctx(), a.DB, "SELECT "+messageColumns+` FROM messages
		JOIN message_constellations ON message_constellations.message_id = messages.id
		WHERE message_constellations.constellation_id = ? AND messages.author_id = ?
		ORDER BY messages.created_at, messages.id LIMIT ? OFFSET ?`, identifier, user.ID, limit, offset)
	if err != nil {
		return nil, err
	}
	return a.messageViews(c.ctx(), a.DB, rows)
}
