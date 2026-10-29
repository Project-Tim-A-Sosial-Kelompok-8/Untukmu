package app

import (
	"context"
	"net/http"
)

// Akun dan sesi.

func userView(user *User) map[string]any {
	return map[string]any{
		"id":                         user.ID,
		"email":                      user.Email,
		"display_name":               user.DisplayName,
		"role":                       user.Role,
		"recovery_ready":             user.RecoveryAuthHash.Valid && user.RecoveryAuthHash.String != "",
		"encryption_record":          jsonValue(user.EncryptionRecord),
		"default_message_visibility": user.DefaultMessageVisibility,
		"profile_visibility":         user.ProfileVisibility,
		"preferences":                jsonValue(nullString(user.Preferences)),
		"created_at":                 user.CreatedAt,
	}
}

func (a *App) invalidate(userID any) {
	if id, ok := userID.(string); ok {
		a.Memory.Delete("summary:" + id)
	}
	a.Memory.Incr("feed:version")
}

func authorID(message *Message) any { return nullable(message.AuthorID) }

func (a *App) authStatus(c *Ctx) (any, error) {
	cookie, err := c.R.Cookie("um_refresh")
	if err != nil || cookie.Value == "" {
		return map[string]bool{"authenticated": false}, nil
	}
	claims, err := a.decodeToken(cookie.Value, "refresh")
	if err != nil {
		return map[string]bool{"authenticated": false}, nil
	}
	session, err := getSession(c.ctx(), a.DB, "id = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > ?",
		claims.SessionID, claims.Subject, now())
	if err != nil {
		return nil, err
	}
	return map[string]bool{
		"authenticated": session != nil && safeEqual(session.RefreshTokenHash, a.digest(cookie.Value)),
	}, nil
}

func (a *App) register(c *Ctx) (any, error) {
	var body registerInput
	if err := decode(c, &body); err != nil {
		return nil, err
	}
	if err := body.validate(); err != nil {
		return nil, err
	}
	if err := c.throttle("register", 5, ""); err != nil {
		return nil, err
	}
	if err := c.verifyTurnstile(body.TurnstileToken, "register"); err != nil {
		return nil, err
	}
	instant := now()
	user := &User{
		ID:               uid(),
		Email:            body.email,
		PasswordHash:     hashPassword(*body.Password),
		DisplayName:      "Anonim",
		Role:             "user",
		EncryptionRecord: nullString(body.EncryptionRecord.dump()),
		CreatedAt:        instant,
	}
	if body.RecoveryVerifier != nil {
		user.RecoveryAuthHash = nullString(hashPassword(*body.RecoveryVerifier))
	}
	if body.DisplayName != nil {
		user.DisplayName = trimSpace(*body.DisplayName)
	}
	var tokens map[string]any
	err := a.tx(c.ctx(), func(tx *Tx) error {
		_, err := tx.ExecContext(c.ctx(), `INSERT INTO users (id, email, password_hash, recovery_auth_hash, display_name,
			role, encryption_record, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'user', ?, ?, ?)`,
			user.ID, user.Email, user.PasswordHash, user.RecoveryAuthHash, user.DisplayName, user.EncryptionRecord,
			instant, instant)
		if isUniqueViolation(err) {
			return fail(http.StatusConflict, "Alamat surel sudah terdaftar.")
		}
		if err != nil {
			return err
		}
		// Every new account starts with its own workspace and a first galaxy.
		if err := createWorkspace(c.ctx(), tx, user.ID, user.DisplayName, false); err != nil {
			return err
		}
		if err := createFirstGalaxy(c.ctx(), tx, user.ID); err != nil {
			return err
		}
		tokens, err = c.newSession(c.ctx(), tx, user)
		return err
	})
	return tokens, err
}

func (a *App) login(c *Ctx) (any, error) {
	var body loginInput
	if err := decode(c, &body); err != nil {
		return nil, err
	}
	if err := body.validate(); err != nil {
		return nil, err
	}
	if err := c.throttle("login-ip", 15, ""); err != nil {
		return nil, err
	}
	if err := c.throttle("login-account", 8, body.email); err != nil {
		return nil, err
	}
	user, err := getUser(c.ctx(), a.DB, "email = ?", body.email)
	if err != nil {
		return nil, err
	}
	// Run Argon2 for unknown users too, reducing timing-based account enumeration.
	if user == nil {
		hashPassword(*body.Password)
		return nil, fail(http.StatusUnauthorized, "Surel atau kata sandi tidak cocok.")
	}
	if !checkPassword(user.PasswordHash, *body.Password) {
		return nil, fail(http.StatusUnauthorized, "Surel atau kata sandi tidak cocok.")
	}
	var tokens map[string]any
	err = a.tx(c.ctx(), func(tx *Tx) error {
		tokens, err = c.newSession(c.ctx(), tx, user)
		return err
	})
	return tokens, err
}

func (a *App) refresh(c *Ctx) (any, error) {
	if err := c.verifyOrigin(); err != nil {
		return nil, err
	}
	if err := c.throttle("refresh", 40, ""); err != nil {
		return nil, err
	}
	cookie, err := c.R.Cookie("um_refresh")
	if err != nil || cookie.Value == "" {
		return nil, fail(http.StatusUnauthorized, "Silakan masuk terlebih dahulu.")
	}
	claims, err := a.decodeToken(cookie.Value, "refresh")
	if err != nil {
		return nil, err
	}
	var tokens map[string]any
	reused := false
	err = a.tx(c.ctx(), func(tx *Tx) error {
		session, err := getSession(c.ctx(), tx, "id = ? AND user_id = ? AND expires_at > ?"+a.DB.lock(),
			claims.SessionID, claims.Subject, now())
		if err != nil {
			return err
		}
		if session == nil || session.RevokedAt.Valid {
			return fail(http.StatusUnauthorized, "Sesi sudah berakhir.")
		}
		if !safeEqual(session.RefreshTokenHash, a.digest(cookie.Value)) {
			reused = true
			_, err := tx.ExecContext(c.ctx(), "UPDATE sessions SET revoked_at = ? WHERE id = ?", now(), session.ID)
			return err
		}
		user, err := getUser(c.ctx(), tx, "id = ?", session.UserID)
		if err != nil {
			return err
		}
		if user == nil {
			return fail(http.StatusUnauthorized, "Akun tidak ditemukan.")
		}
		tokens, err = c.credentials(c.ctx(), tx, user, session)
		return err
	})
	if err == nil && reused {
		return nil, fail(http.StatusUnauthorized, "Token dipakai ulang. Sesi telah dicabut.")
	}
	return tokens, err
}

func (a *App) logout(c *Ctx) (any, error) {
	if err := c.verifyOrigin(); err != nil {
		return nil, err
	}
	if err := c.throttle("logout", 40, ""); err != nil {
		return nil, err
	}
	if cookie, err := c.R.Cookie("um_refresh"); err == nil && cookie.Value != "" {
		if claims, err := a.decodeToken(cookie.Value, "refresh"); err == nil {
			if _, err := a.DB.ExecContext(c.ctx(), "UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ?",
				now(), claims.SessionID, claims.Subject); err != nil {
				return nil, err
			}
		}
	}
	c.deleteRefreshCookie()
	return nil, nil
}

func (a *App) listSessions(c *Ctx) (any, error) {
	user, err := c.currentUser()
	if err != nil {
		return nil, err
	}
	rows, err := a.DB.QueryContext(c.ctx(), "SELECT "+sessionColumns+` FROM sessions
		WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_seen_at DESC`, user.ID, now())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []map[string]any{}
	for rows.Next() {
		session, err := scanSession(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, map[string]any{
			"id": session.ID, "user_agent": session.UserAgent, "created_at": session.CreatedAt,
			"last_seen_at": session.LastSeenAt,
		})
	}
	return result, rows.Err()
}

func (a *App) revokeSession(c *Ctx) (any, error) {
	identifier, err := pathUUID(c, "session_id")
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
	result, err := a.DB.ExecContext(c.ctx(), "UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ?",
		now(), identifier, user.ID)
	if err != nil {
		return nil, err
	}
	if changed, _ := result.RowsAffected(); changed == 0 {
		return nil, fail(http.StatusNotFound, "Sesi tidak ditemukan.")
	}
	return nil, nil
}

func (a *App) me(c *Ctx) (any, error) {
	user, err := c.currentUser()
	if err != nil {
		return nil, err
	}
	return userView(user), nil
}

func (a *App) updateSettings(c *Ctx) (any, error) {
	var body settingsInput
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
	user.DefaultMessageVisibility = deref(body.DefaultMessageVisibility, "private")
	user.ProfileVisibility = deref(body.ProfileVisibility, "private")
	user.Preferences = "{}"
	if _, err := a.ensureWorkspace(c.ctx(), user); err != nil {
		return nil, err
	}
	err = a.tx(c.ctx(), func(tx *Tx) error {
		if _, err := tx.ExecContext(c.ctx(), `UPDATE users SET default_message_visibility = ?, profile_visibility = ?,
			preferences = '{}', updated_at = ? WHERE id = ?`,
			user.DefaultMessageVisibility, user.ProfileVisibility, now(), user.ID); err != nil {
			return err
		}
		_, err := tx.ExecContext(c.ctx(), "UPDATE workspaces SET visibility = ?, updated_at = ? WHERE owner_id = ?",
			user.ProfileVisibility, now(), user.ID)
		return err
	})
	if err != nil {
		return nil, err
	}
	return userView(user), nil
}

func (a *App) enableRecovery(c *Ctx) (any, error) {
	var body credentialInput
	if err := decode(c, &body); err != nil {
		return nil, err
	}
	if err := body.validate(true, false); err != nil {
		return nil, err
	}
	user, err := c.currentUser()
	if err != nil {
		return nil, err
	}
	if err := c.throttle("recovery-enable", 5, user.ID); err != nil {
		return nil, err
	}
	if !checkPassword(user.PasswordHash, *body.Password) {
		return nil, fail(http.StatusUnauthorized, "Kata sandi tidak cocok.")
	}
	if _, err := a.DB.ExecContext(c.ctx(), "UPDATE users SET recovery_auth_hash = ?, updated_at = ? WHERE id = ?",
		hashPassword(*body.RecoveryVerifier), now(), user.ID); err != nil {
		return nil, err
	}
	return map[string]bool{"enabled": true}, nil
}

func (a *App) clearData(c *Ctx) (any, error) {
	var body credentialInput
	if err := decode(c, &body); err != nil {
		return nil, err
	}
	if err := body.validate(false, false); err != nil {
		return nil, err
	}
	user, err := c.currentUser()
	if err != nil {
		return nil, err
	}
	if err := c.throttle("clear", 3, user.ID); err != nil {
		return nil, err
	}
	if !checkPassword(user.PasswordHash, *body.Password) {
		return nil, fail(http.StatusUnauthorized, "Kata sandi tidak cocok.")
	}
	err = a.tx(c.ctx(), func(tx *Tx) error {
		if _, err := tx.ExecContext(c.ctx(), "DELETE FROM messages WHERE author_id = ?", user.ID); err != nil {
			return err
		}
		_, err := tx.ExecContext(c.ctx(), "DELETE FROM constellations WHERE owner_id = ?", user.ID)
		return err
	})
	if err != nil {
		return nil, err
	}
	a.invalidate(user.ID)
	return nil, nil
}

func queueStorageDeletions(ctx context.Context, tx *Tx, owner string) error {
	rows, err := tx.QueryContext(ctx, "SELECT storage_key FROM uploads WHERE owner_id = ?", owner)
	if err != nil {
		return err
	}
	var keys []string
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			rows.Close()
			return err
		}
		keys = append(keys, key)
	}
	rows.Close()
	for _, key := range keys {
		if _, err := tx.ExecContext(ctx, `INSERT INTO storage_deletions (id, storage_key, created_at) VALUES (?, ?, ?)
			ON CONFLICT (storage_key) DO NOTHING`, uid(), key, now()); err != nil {
			return err
		}
	}
	return nil
}

func (a *App) deleteAccount(c *Ctx) (any, error) {
	var body credentialInput
	if err := decode(c, &body); err != nil {
		return nil, err
	}
	if err := body.validate(false, true); err != nil {
		return nil, err
	}
	user, err := c.currentUser()
	if err != nil {
		return nil, err
	}
	if err := c.verifyOrigin(); err != nil {
		return nil, err
	}
	if err := c.throttle("delete-account", 3, user.ID); err != nil {
		return nil, err
	}
	if !checkPassword(user.PasswordHash, *body.Password) {
		return nil, fail(http.StatusForbidden, "Kata sandi tidak cocok. Akun belum dihapus.")
	}
	err = a.tx(c.ctx(), func(tx *Tx) error {
		var statements []string
		if *body.ContentAction == "delete" {
			if err := queueStorageDeletions(c.ctx(), tx, user.ID); err != nil {
				return err
			}
			statements = []string{
				"DELETE FROM messages WHERE author_id = ?",
				"DELETE FROM constellations WHERE owner_id = ?",
				"DELETE FROM uploads WHERE owner_id = ?",
			}
		} else {
			// Preserve ciphertext and public moderation decisions without retaining
			// credentials or transferring ownership to an account with the same email.
			// Old restricted links cannot be managed after deletion, so revoke them.
			statements = []string{
				"UPDATE messages SET author_id = NULL, share_token_hash = NULL WHERE author_id = ?",
				"UPDATE constellations SET owner_id = NULL WHERE owner_id = ?",
				"UPDATE uploads SET owner_id = NULL WHERE owner_id = ?",
			}
		}
		statements = append(statements, "DELETE FROM users WHERE id = ?")
		for _, statement := range statements {
			if _, err := tx.ExecContext(c.ctx(), statement, user.ID); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	c.deleteRefreshCookie()
	a.invalidate(user.ID)
	a.Memory.Notify()
	return nil, nil
}
