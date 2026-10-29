package app

import (
	"encoding/json"
	"strings"
	"time"
)

// Dashboard, ekspor data milik pengguna dan metrik keberhasilan (PRD 16).

func (a *App) prayersReceived(c *Ctx) (any, error) {
	user, err := c.currentUser()
	if err != nil {
		return nil, err
	}
	limit, err := queryInt(c, "limit", 100, 1, 200)
	if err != nil {
		return nil, err
	}
	rows, err := a.DB.QueryContext(c.ctx(), `SELECT prayers.id, prayers.message_id, prayers.tradition,
		prayers.prayer_type, prayers.created_at, prayers.source_attribution FROM prayers
		JOIN messages ON messages.id = prayers.message_id WHERE messages.author_id = ?
		ORDER BY prayers.created_at DESC LIMIT ?`, user.ID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []map[string]string{}
	for rows.Next() {
		var id, message, tradition, kind, created, source string
		if err := rows.Scan(&id, &message, &tradition, &kind, &created, &source); err != nil {
			return nil, err
		}
		result = append(result, map[string]string{
			"id": id, "message_id": message, "tradition": tradition, "prayer_type": kind, "created_at": created,
			"source_attribution": source,
		})
	}
	return result, rows.Err()
}

func (a *App) summary(c *Ctx) (any, error) {
	user, err := c.currentUser()
	if err != nil {
		return nil, err
	}
	if cached, ok := a.Memory.Get("summary:" + user.ID); ok {
		return json.RawMessage(cached), nil
	}
	ctx := c.ctx()
	galaxies, err := count(ctx, a.DB, "SELECT COUNT(*) FROM constellations WHERE owner_id = ?", user.ID)
	if err != nil {
		return nil, err
	}
	rows, err := a.DB.QueryContext(ctx,
		"SELECT visibility, COUNT(*) FROM messages WHERE author_id = ? GROUP BY visibility", user.ID)
	if err != nil {
		return nil, err
	}
	byVisibility, total := map[string]int{}, 0
	for rows.Next() {
		var visibility string
		var n int
		if err := rows.Scan(&visibility, &n); err != nil {
			rows.Close()
			return nil, err
		}
		byVisibility[visibility] = n
		total += n
	}
	rows.Close()
	received, err := count(ctx, a.DB, "SELECT COALESCE(SUM(prayer_count), 0) FROM messages WHERE author_id = ?", user.ID)
	if err != nil {
		return nil, err
	}
	given, err := count(ctx, a.DB, "SELECT COUNT(*) FROM prayers WHERE visitor_hash = ?", c.visitorIdentity(user))
	if err != nil {
		return nil, err
	}
	encoded, _ := json.Marshal(map[string]any{
		"constellations":   galaxies,
		"targets":          galaxies,
		"messages":         total,
		"entries":          total,
		"prayers_received": received,
		"prayers_given":    given,
		"by_visibility":    byVisibility,
	})
	a.Memory.Set("summary:"+user.ID, string(encoded), 30*time.Second)
	return json.RawMessage(encoded), nil
}

func (a *App) myMessages(c *Ctx) (any, error) {
	user, err := c.currentUser()
	if err != nil {
		return nil, err
	}
	offset, limit, err := paging(c, 100, 200, unbounded)
	if err != nil {
		return nil, err
	}
	rows, err := queryMessages(c.ctx(), a.DB, "SELECT "+messageColumns+
		" FROM messages WHERE author_id = ? ORDER BY created_at, id LIMIT ? OFFSET ?", user.ID, limit, offset)
	if err != nil {
		return nil, err
	}
	return a.messageViews(c.ctx(), a.DB, rows)
}

func (a *App) export(c *Ctx) (any, error) {
	user, err := c.currentUser()
	if err != nil {
		return nil, err
	}
	if err := c.throttle("export", 3, user.ID); err != nil {
		return nil, err
	}
	ctx := c.ctx()
	galaxies, err := queryGalaxies(ctx, a.DB, "SELECT "+constellationColumns+" FROM constellations WHERE owner_id = ?",
		user.ID)
	if err != nil {
		return nil, err
	}
	galaxyViews := []map[string]any{}
	for _, row := range galaxies {
		galaxyViews = append(galaxyViews, galaxyView(row))
	}
	messages, err := queryMessages(ctx, a.DB, "SELECT "+messageColumns+" FROM messages WHERE author_id = ?", user.ID)
	if err != nil {
		return nil, err
	}
	messageViews, err := a.messageViews(ctx, a.DB, messages)
	if err != nil {
		return nil, err
	}
	rows, err := a.DB.QueryContext(ctx, "SELECT "+uploadColumns+" FROM uploads WHERE owner_id = ? AND complete = 1",
		user.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	uploads := []map[string]any{}
	for rows.Next() {
		upload, err := scanUpload(rows)
		if err != nil {
			return nil, err
		}
		uploads = append(uploads, map[string]any{
			"id": upload.ID, "byte_size": upload.ByteSize, "encryption_meta": json.RawMessage(upload.EncryptionMeta),
		})
	}
	return map[string]any{
		"format":         "untukmu-source-v1",
		"account":        userView(user),
		"constellations": galaxyViews,
		"messages":       messageViews,
		"uploads":        uploads,
	}, rows.Err()
}

func ratio(part, whole int) any {
	if whole == 0 {
		return nil
	}
	return float64(part) / float64(whole)
}

func (a *App) productMetrics(c *Ctx) (any, error) {
	admin, err := c.adminUser()
	if err != nil {
		return nil, err
	}
	days, err := queryInt(c, "days", 30, 7, 365)
	if err != nil {
		return nil, err
	}
	ctx := c.ctx()
	instant := time.Now()
	since, until := ts(instant.Add(-time.Duration(days)*24*time.Hour)), ts(instant)
	registered, err := count(ctx, a.DB, "SELECT COUNT(*) FROM users WHERE created_at >= ? AND created_at <= ?",
		since, until)
	if err != nil {
		return nil, err
	}
	totalUsers, err := count(ctx, a.DB, "SELECT COUNT(*) FROM users")
	if err != nil {
		return nil, err
	}
	// Count stored message IDs directly. One message may belong to several
	// galaxies; joining their links would inflate these product aggregates.
	var total, byAdmin, private, public, unlisted, active, deleted int
	err = a.DB.QueryRowContext(ctx, `SELECT COUNT(id),
		COUNT(CASE WHEN author_id = ? THEN 1 END),
		COUNT(CASE WHEN visibility = 'private' THEN 1 END),
		COUNT(CASE WHEN visibility = 'public_anon' THEN 1 END),
		COUNT(CASE WHEN visibility = 'unlisted' THEN 1 END),
		COUNT(CASE WHEN author_id IS NOT NULL THEN 1 END),
		COUNT(CASE WHEN author_id IS NULL THEN 1 END)
		FROM messages WHERE created_at >= ? AND created_at <= ?`, admin.ID, since, until).
		Scan(&total, &byAdmin, &private, &public, &unlisted, &active, &deleted)
	if err != nil {
		return nil, err
	}
	publicFilter := `FROM messages WHERE visibility = 'public_anon' AND moderation_status = 'approved'
		AND created_at >= ? AND created_at <= ? AND (release_at IS NULL OR release_at <= ?)`
	totalPublic, err := count(ctx, a.DB, "SELECT COUNT(*) "+publicFilter, since, until, until)
	if err != nil {
		return nil, err
	}
	supported, err := count(ctx, a.DB, "SELECT COUNT(*) "+publicFilter+
		" AND EXISTS (SELECT 1 FROM prayers WHERE prayers.message_id = messages.id)", since, until, until)
	if err != nil {
		return nil, err
	}
	handled, err := count(ctx, a.DB, "SELECT COUNT(*) FROM reports WHERE status = 'reviewed' AND reviewed_at >= ?",
		since)
	if err != nil {
		return nil, err
	}
	rows, err := a.DB.QueryContext(ctx, `SELECT users.created_at, MAX(sessions.last_seen_at) FROM users
		LEFT JOIN sessions ON sessions.user_id = users.id
		WHERE users.created_at >= ? AND users.created_at <= ? GROUP BY users.id, users.created_at`,
		since, ts(instant.Add(-7*24*time.Hour)))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	eligible, returned := 0, 0
	for rows.Next() {
		var created string
		var lastSeen *string
		if err := rows.Scan(&created, &lastSeen); err != nil {
			return nil, err
		}
		eligible++
		if lastSeen != nil && !parseTS(*lastSeen).Before(parseTS(created).Add(7*24*time.Hour)) {
			returned++
		}
	}
	return map[string]any{
		"days":                        days,
		"scope":                       "all_accounts",
		"period_start":                since,
		"period_end":                  until,
		"message_count_scope":         "retained_messages_created_in_period",
		"total_users":                 totalUsers,
		"registered_users":            registered,
		"created_messages":            total,
		"admin_created_messages":      byAdmin,
		"messages_by_visibility":      map[string]int{"private": private, "public_anon": public, "unlisted": unlisted},
		"messages_by_author_status":   map[string]int{"active_account": active, "deleted_account": deleted},
		"public_messages":             totalPublic,
		"public_messages_with_prayer": supported,
		"prayer_support_ratio":        ratio(supported, totalPublic),
		"retention_7d_eligible":       eligible,
		"retention_7d_returned":       returned,
		"retention_7d_ratio":          ratio(returned, eligible),
		"reviewed_reports":            handled,
		"security_audit": "Audit berkala harus dicatat oleh pemeriksa; metrik ini tidak menyimpulkan ada " +
			"atau tidaknya kebocoran.",
	}, rows.Err()
}

func likeEscape(value string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(value)
}

func (a *App) registeredUsers(c *Ctx) (any, error) {
	if _, err := c.adminUser(); err != nil {
		return nil, err
	}
	offset, limit, err := paging(c, 50, 100, 100000)
	if err != nil {
		return nil, err
	}
	q, err := queryString(c, "q", 254)
	if err != nil {
		return nil, err
	}
	search := strings.ToLower(strings.TrimSpace(q))
	where, args := "", []any{}
	if search != "" {
		pattern := "%" + likeEscape(search) + "%"
		where = ` WHERE lower(users.email) LIKE ? ESCAPE '\' OR lower(users.display_name) LIKE ? ESCAPE '\'`
		args = append(args, pattern, pattern)
	}
	total, err := count(c.ctx(), a.DB, "SELECT COUNT(*) FROM users"+where, args...)
	if err != nil {
		return nil, err
	}
	rows, err := a.DB.QueryContext(c.ctx(), `SELECT users.id, users.email, users.display_name, users.role,
		users.created_at, COALESCE(counts.message_count, 0), COALESCE(counts.private, 0),
		COALESCE(counts.public_anon, 0), COALESCE(counts.unlisted, 0)
		FROM users LEFT JOIN (
			SELECT author_id, COUNT(id) AS message_count,
				COUNT(CASE WHEN visibility = 'private' THEN 1 END) AS private,
				COUNT(CASE WHEN visibility = 'public_anon' THEN 1 END) AS public_anon,
				COUNT(CASE WHEN visibility = 'unlisted' THEN 1 END) AS unlisted
			FROM messages WHERE author_id IS NOT NULL GROUP BY author_id
		) AS counts ON counts.author_id = users.id`+where+`
		ORDER BY users.created_at DESC, users.id LIMIT ? OFFSET ?`, append(args, limit, offset)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, email, name, role, created string
		var messages, private, public, unlisted int
		if err := rows.Scan(&id, &email, &name, &role, &created, &messages, &private, &public, &unlisted); err != nil {
			return nil, err
		}
		items = append(items, map[string]any{
			"id": id, "email": email, "display_name": name, "role": role, "created_at": created,
			"message_count":          messages,
			"messages_by_visibility": map[string]int{"private": private, "public_anon": public, "unlisted": unlisted},
		})
	}
	return map[string]any{
		"total": total, "offset": offset, "limit": limit, "message_count_scope": "all_time_retained", "items": items,
	}, rows.Err()
}
