package app

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// Sosial dan moderasi.

// visibleFilter selects approved, released public messages not hidden by a block.
func visibleFilter(user *User) (string, []any) {
	condition := `messages.visibility = 'public_anon' AND messages.moderation_status = 'approved'
		AND (messages.release_at IS NULL OR messages.release_at <= ?)`
	args := []any{now()}
	if user != nil {
		condition += ` AND NOT EXISTS (SELECT 1 FROM blocks WHERE
			(blocks.blocker_id = ? AND blocks.blocked_id = messages.author_id)
			OR (blocks.blocked_id = ? AND blocks.blocker_id = messages.author_id))`
		args = append(args, user.ID, user.ID)
	}
	return condition, args
}

func (a *App) readablePublic(ctx context.Context, q querier, identifier string, user *User) (*Message, error) {
	filter, args := visibleFilter(user)
	row, err := getMessage(ctx, q, "messages.id = ? AND "+filter, append([]any{identifier}, args...)...)
	if err != nil {
		return nil, err
	}
	if row == nil {
		return nil, fail(http.StatusNotFound,
			"Ucapan belum tersedia untuk dukungan publik. Pilih pesan publik yang lolos moderasi dan sudah dibuka.")
	}
	return row, nil
}

func (a *App) publicView(row *Message, user *User) (map[string]any, error) {
	body, err := a.openPublic(row.ID, row.PublicBody.String)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"id":                row.ID,
		"entry_type":        row.EntryType,
		"visibility":        row.Visibility,
		"public_body":       body,
		"date_label":        nullable(row.DateLabel),
		"mood":              moodValue(row.Mood),
		"tags":              storedTags(row.Tags),
		"created_at":        row.CreatedAt,
		"prayer_count":      row.PrayerCount,
		"empathy_count":     row.EmpathyCount,
		"is_mine":           sameUser(user, row.AuthorID),
		"author_deleted":    !row.AuthorID.Valid,
		"constellation_ids": []string{},
		"attachment_ids":    []string{},
		"moderation_status": "approved",
	}, nil
}

// publicGalaxyView never publishes the recipient's name, a custom category,
// or the owner's encrypted photo associated with its galaxy.
func publicGalaxyView(row *Constellation, total int, user *User) map[string]any {
	view := galaxyView(row)
	view["target_label"] = "Galaksi anonim"
	view["custom_category"] = nil
	view["visual_type"] = "light_symbol"
	view["visual_ref"] = nil
	view["is_mine"] = sameUser(user, row.OwnerID)
	view["public_message_count"] = total
	return view
}

func publicGalaxies(user *User) (string, []any) {
	filter, args := visibleFilter(user)
	return "SELECT " + constellationColumns + `, COUNT(messages.id) FROM constellations
		JOIN message_constellations ON message_constellations.constellation_id = constellations.id
		JOIN messages ON messages.id = message_constellations.message_id
		WHERE ` + filter, args
}

func (a *App) publicMessageViews(ctx context.Context, rows []*Message, user *User) ([]map[string]any, error) {
	identifiers := make([]string, len(rows))
	for i, row := range rows {
		identifiers[i] = row.ID
	}
	targets, err := links(ctx, a.DB, `SELECT message_id, constellation_id FROM message_constellations
		WHERE message_id IN (?) ORDER BY constellation_id`, identifiers)
	if err != nil {
		return nil, err
	}
	result := []map[string]any{}
	for _, row := range rows {
		view, err := a.publicView(row, user)
		if err != nil {
			return nil, err
		}
		view["constellation_ids"] = orEmpty(targets[row.ID])
		result = append(result, view)
	}
	return result, nil
}

func (a *App) exploreGalaxies(c *Ctx) (any, error) {
	user, err := c.optionalUser()
	if err != nil {
		return nil, err
	}
	offset, limit, err := paging(c, 100, 200, 100000)
	if err != nil {
		return nil, err
	}
	query, args := publicGalaxies(user)
	rows, err := a.DB.QueryContext(c.ctx(), query+` GROUP BY constellations.id
		ORDER BY MAX(messages.created_at) DESC, constellations.id LIMIT ? OFFSET ?`, append(args, limit, offset)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []map[string]any{}
	for rows.Next() {
		var total int
		row, err := scanConstellation(rows, &total)
		if err != nil {
			return nil, err
		}
		result = append(result, publicGalaxyView(row, total, user))
	}
	return result, rows.Err()
}

func (a *App) exploreMessages(c *Ctx) (any, error) {
	user, err := c.optionalUser()
	if err != nil {
		return nil, err
	}
	offset, limit, err := paging(c, 100, 200, 100000)
	if err != nil {
		return nil, err
	}
	filter, args := visibleFilter(user)
	rows, err := queryMessages(c.ctx(), a.DB, "SELECT "+messageColumns+" FROM messages WHERE "+filter+
		" ORDER BY messages.created_at DESC, messages.id LIMIT ? OFFSET ?", append(args, limit, offset)...)
	if err != nil {
		return nil, err
	}
	return a.publicMessageViews(c.ctx(), rows, user)
}

func (a *App) exploreGalaxyMessages(c *Ctx) (any, error) {
	identifier, err := pathUUID(c, "galaxy_id")
	if err != nil {
		return nil, err
	}
	user, err := c.optionalUser()
	if err != nil {
		return nil, err
	}
	offset, limit, err := paging(c, 100, 200, 100000)
	if err != nil {
		return nil, err
	}
	query, args := publicGalaxies(user)
	available, err := exists(c.ctx(), a.DB, query+" AND constellations.id = ? GROUP BY constellations.id",
		append(args, identifier)...)
	if err != nil {
		return nil, err
	}
	if !available {
		return nil, fail(http.StatusNotFound, "Galaksi publik tidak ditemukan.")
	}
	filter, args := visibleFilter(user)
	rows, err := queryMessages(c.ctx(), a.DB, "SELECT "+messageColumns+` FROM messages
		JOIN message_constellations ON message_constellations.message_id = messages.id
		WHERE message_constellations.constellation_id = ? AND `+filter+
		" ORDER BY messages.created_at, messages.id LIMIT ? OFFSET ?",
		append(append([]any{identifier}, args...), limit, offset)...)
	if err != nil {
		return nil, err
	}
	result := []map[string]any{}
	for _, row := range rows {
		view, err := a.publicView(row, user)
		if err != nil {
			return nil, err
		}
		view["constellation_ids"] = []string{identifier}
		result = append(result, view)
	}
	return result, nil
}

var sortPattern = regexp.MustCompile(`^(new|prayers)$`)

func (a *App) explore(c *Ctx) (any, error) {
	user, err := c.optionalUser()
	if err != nil {
		return nil, err
	}
	offset, limit, err := paging(c, 30, 100, 100000)
	if err != nil {
		return nil, err
	}
	sort := c.R.URL.Query().Get("sort")
	if sort == "" {
		sort = "new"
	}
	if !sortPattern.MatchString(sort) {
		return nil, invalidParam("query", "sort", "Urutan wajib new atau prayers.")
	}
	moodText, err := queryString(c, "mood", 40)
	if err != nil {
		return nil, err
	}
	tagText, err := queryString(c, "tag", 50)
	if err != nil {
		return nil, err
	}
	mood, tag := normalizeMood(moodText), normalizeTag(tagText)
	version, _ := a.Memory.Get("feed:version")
	cacheKey, _ := json.Marshal([]any{version, userID(user), offset, limit, sort, mood, tag})
	if saved, ok := a.Memory.Get("feed:" + string(cacheKey)); ok {
		return json.RawMessage(saved), nil
	}
	filter, args := visibleFilter(user)
	query := "SELECT " + messageColumns + " FROM messages WHERE " + filter
	if mood != "" {
		values := moodValues(mood)
		query += " AND lower(trim(messages.mood)) IN (" + placeholders(len(values)) + ")"
		args = append(args, anySlice(values)...)
	}
	if tag != "" {
		elements := "json_each(messages.tags) AS tag"
		if a.DB.PG {
			elements = "json_array_elements_text(messages.tags::json) AS tag(value)"
		}
		query += ` AND EXISTS (SELECT 1 FROM ` + elements + `
			WHERE tag.value = ? OR lower(trim(ltrim(trim(tag.value), '#'))) = ?)`
		args = append(args, tag, tag)
	}
	rows, err := queryMessages(c.ctx(), a.DB, query+" ORDER BY messages.created_at DESC, messages.id LIMIT ? OFFSET ?",
		append(args, limit, offset)...)
	if err != nil {
		return nil, err
	}
	result := []map[string]any{}
	for _, row := range rows {
		view, err := a.publicView(row, user)
		if err != nil {
			return nil, err
		}
		result = append(result, view)
	}
	encoded, _ := json.Marshal(result)
	a.Memory.Set("feed:"+string(cacheKey), string(encoded), 20*time.Second)
	return json.RawMessage(encoded), nil
}

func decodeAction(c *Ctx, kind string) (*publicActionInput, error) {
	var body publicActionInput
	if err := decode(c, &body); err != nil {
		return nil, err
	}
	return &body, body.validate(kind)
}

func (a *App) empathy(c *Ctx) (any, error) {
	identifier, err := pathUUID(c, "message_id")
	if err != nil {
		return nil, err
	}
	body, err := decodeAction(c, "empathy")
	if err != nil {
		return nil, err
	}
	user, err := c.optionalUser()
	if err != nil {
		return nil, err
	}
	identity := c.visitorIdentity(user)
	if err := c.throttle("empathy", 20, identity); err != nil {
		return nil, err
	}
	if user == nil {
		if err := c.verifyTurnstile(body.TurnstileToken, "empathy"); err != nil {
			return nil, err
		}
	}
	var row *Message
	added := false
	err = a.tx(c.ctx(), func(tx *Tx) error {
		if row, err = a.readablePublic(c.ctx(), tx, identifier, user); err != nil {
			return err
		}
		result, err := tx.ExecContext(c.ctx(), `INSERT INTO empathies (id, message_id, visitor_hash, created_at)
			VALUES (?, ?, ?, ?) ON CONFLICT (message_id, visitor_hash) DO NOTHING`, uid(), row.ID, identity, now())
		if err != nil {
			return err
		}
		if changed, _ := result.RowsAffected(); changed == 1 {
			added = true
			if _, err := tx.ExecContext(c.ctx(), "UPDATE messages SET empathy_count = empathy_count + 1 WHERE id = ?",
				row.ID); err != nil {
				return err
			}
		}
		return tx.QueryRowContext(c.ctx(), "SELECT empathy_count FROM messages WHERE id = ?", row.ID).
			Scan(&row.EmpathyCount)
	})
	if err != nil {
		return nil, err
	}
	a.invalidate(authorID(row))
	return map[string]any{"added": added, "empathy_count": row.EmpathyCount}, nil
}

func (a *App) report(c *Ctx) (any, error) {
	body, err := decodeAction(c, "report")
	if err != nil {
		return nil, err
	}
	user, err := c.optionalUser()
	if err != nil {
		return nil, err
	}
	if err := c.throttle("report", 5, c.visitorIdentity(user)); err != nil {
		return nil, err
	}
	if user == nil {
		if err := c.verifyTurnstile(body.TurnstileToken, "report"); err != nil {
			return nil, err
		}
	}
	row, err := a.readablePublic(c.ctx(), a.DB, body.messageID, user)
	if err != nil {
		return nil, err
	}
	identifier := uid()
	if _, err := a.DB.ExecContext(c.ctx(), `INSERT INTO reports (id, message_id, reporter_id, reason, status, created_at)
		VALUES (?, ?, ?, ?, 'open', ?)`, identifier, row.ID, userID(user), strings.TrimSpace(*body.Reason), now()); err != nil {
		return nil, err
	}
	return map[string]string{"id": identifier, "status": "open"}, nil
}

func (a *App) block(c *Ctx) (any, error) {
	var body blockInput
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
	message, err := a.readablePublic(c.ctx(), a.DB, body.messageID, user)
	if err != nil {
		return nil, err
	}
	if !message.AuthorID.Valid {
		return nil, fail(http.StatusConflict,
			"Akun penulis sudah dihapus. Konten tetap dapat dilaporkan kepada moderator.")
	}
	if message.AuthorID.String == user.ID {
		return nil, fail(http.StatusUnprocessableEntity, "Akun sendiri tidak dapat diblokir.")
	}
	identifier, created := uid(), now()
	_, err = a.DB.ExecContext(c.ctx(), "INSERT INTO blocks (id, blocker_id, blocked_id, created_at) VALUES (?, ?, ?, ?)",
		identifier, user.ID, message.AuthorID.String, created)
	if isConstraintViolation(err) {
		return nil, fail(http.StatusConflict, "Pengguna sudah diblokir.")
	}
	if err != nil {
		return nil, err
	}
	a.invalidate(user.ID)
	return map[string]string{"id": identifier, "created_at": created}, nil
}

func (a *App) listBlocks(c *Ctx) (any, error) {
	user, err := c.currentUser()
	if err != nil {
		return nil, err
	}
	rows, err := a.DB.QueryContext(c.ctx(),
		"SELECT id, created_at FROM blocks WHERE blocker_id = ? ORDER BY created_at DESC", user.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []map[string]string{}
	for rows.Next() {
		var identifier, created string
		if err := rows.Scan(&identifier, &created); err != nil {
			return nil, err
		}
		result = append(result, map[string]string{"id": identifier, "created_at": created})
	}
	return result, rows.Err()
}

func (a *App) unblock(c *Ctx) (any, error) {
	identifier, err := pathUUID(c, "block_id")
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
	result, err := a.DB.ExecContext(c.ctx(), "DELETE FROM blocks WHERE id = ? AND blocker_id = ?", identifier, user.ID)
	if err != nil {
		return nil, err
	}
	if changed, _ := result.RowsAffected(); changed == 0 {
		return nil, fail(http.StatusNotFound, "Pemblokiran tidak ditemukan.")
	}
	a.invalidate(user.ID)
	return nil, nil
}

func reviewToken(row *Message) string {
	if row.PublicBody.Valid {
		return sha256Hex(row.PublicBody.String)
	}
	return sha256Hex(row.Ciphertext.String)
}

func (a *App) moderationQueue(c *Ctx) (any, error) {
	if _, err := c.adminUser(); err != nil {
		return nil, err
	}
	offset, limit, err := paging(c, 50, 100, unbounded)
	if err != nil {
		return nil, err
	}
	rows, err := queryMessages(c.ctx(), a.DB, "SELECT "+messageColumns+` FROM messages
		WHERE messages.visibility = 'public_anon' AND (messages.moderation_status = 'pending' OR EXISTS (
			SELECT 1 FROM reports WHERE reports.message_id = messages.id AND reports.status = 'open'))
		ORDER BY messages.created_at, messages.id LIMIT ? OFFSET ?`, limit, offset)
	if err != nil {
		return nil, err
	}
	result := []map[string]any{}
	for _, row := range rows {
		view, err := a.publicView(row, nil)
		if err != nil {
			return nil, err
		}
		reports, err := a.openReports(c.ctx(), row.ID)
		if err != nil {
			return nil, err
		}
		view["moderation_status"] = row.ModerationStatus
		view["flags"] = json.RawMessage(row.ModerationFlags)
		view["checked_at"] = nullable(row.ModerationCheckedAt)
		view["review_token"] = reviewToken(row)
		view["reports"] = reports
		result = append(result, view)
	}
	return result, nil
}

func (a *App) openReports(ctx context.Context, messageID string) ([]map[string]string, error) {
	rows, err := a.DB.QueryContext(ctx, "SELECT id, reason FROM reports WHERE message_id = ? AND status = 'open'",
		messageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []map[string]string{}
	for rows.Next() {
		var identifier, reason string
		if err := rows.Scan(&identifier, &reason); err != nil {
			return nil, err
		}
		result = append(result, map[string]string{"id": identifier, "reason": reason})
	}
	return result, rows.Err()
}

var decisionStatus = map[string]string{"approve": "approved", "reject": "rejected", "remove": "removed"}

func (a *App) decide(c *Ctx) (any, error) {
	identifier, err := pathUUID(c, "message_id")
	if err != nil {
		return nil, err
	}
	var body decisionInput
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
	if err := c.throttle("moderation", 60, admin.ID); err != nil {
		return nil, err
	}
	var row *Message
	err = a.tx(c.ctx(), func(tx *Tx) error {
		rows, err := queryMessages(c.ctx(), tx, "SELECT "+messageColumns+
			" FROM messages WHERE id = ? AND visibility = 'public_anon'"+a.DB.lock(), identifier)
		if err != nil {
			return err
		}
		if len(rows) == 1 {
			row = rows[0]
		}
		if row == nil {
			return fail(http.StatusNotFound, "Konten publik tidak ditemukan.")
		}
		if !safeEqual(*body.ReviewToken, reviewToken(row)) {
			return fail(http.StatusConflict, "Pesan berubah. Muat ulang antrean lalu tinjau kembali.")
		}
		row.ModerationStatus = decisionStatus[*body.Decision]
		instant := now()
		for _, statement := range []struct {
			query string
			args  []any
		}{
			{"UPDATE messages SET moderation_status = ? WHERE id = ?", []any{row.ModerationStatus, row.ID}},
			{`INSERT INTO moderation_decisions (id, message_id, reviewer_id, decision, reason, created_at)
				VALUES (?, ?, ?, ?, ?, ?)`, []any{uid(), row.ID, admin.ID, *body.Decision, deref(body.Reason, ""), instant}},
			{"UPDATE reports SET status = 'reviewed', reviewed_at = ? WHERE message_id = ? AND status = 'open'",
				[]any{instant, row.ID}},
		} {
			if _, err := tx.ExecContext(c.ctx(), statement.query, statement.args...); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	a.invalidate(authorID(row))
	return map[string]string{"id": row.ID, "moderation_status": row.ModerationStatus}, nil
}
