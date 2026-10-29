package app

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// Pemulihan akun, tautan terbatas dan unggahan terenkripsi.

type recoveryState struct {
	UserID  string `json:"user_id"`
	Version string `json:"version"`
}

func recoveryKey(token string) string { return "recovery:" + sha256Hex(token) }

func (a *App) recoveryBegin(c *Ctx) (any, error) {
	var body recoveryInput
	if err := decode(c, &body); err != nil {
		return nil, err
	}
	if err := body.validate(false); err != nil {
		return nil, err
	}
	if err := c.throttle("recovery-ip", 5, ""); err != nil {
		return nil, err
	}
	if err := c.throttle("recovery-email", 5, body.email); err != nil {
		return nil, err
	}
	if err := c.verifyTurnstile(body.TurnstileToken, "recovery"); err != nil {
		return nil, err
	}
	user, err := getUser(c.ctx(), a.DB, "email = ?", body.email)
	if err != nil {
		return nil, err
	}
	if user == nil || !user.RecoveryAuthHash.Valid || user.RecoveryAuthHash.String == "" {
		hashPassword(*body.RecoveryVerifier)
		return nil, fail(http.StatusUnauthorized, "Surel atau kode pemulihan tidak cocok.")
	}
	if !checkPassword(user.RecoveryAuthHash.String, *body.RecoveryVerifier) {
		return nil, fail(http.StatusUnauthorized, "Surel atau kode pemulihan tidak cocok.")
	}
	token := randomToken()
	state, _ := json.Marshal(recoveryState{UserID: user.ID, Version: sha256Hex(user.RecoveryAuthHash.String)})
	a.Memory.Set(recoveryKey(token), string(state), 5*time.Minute)
	return map[string]any{"challenge": token, "encryption_record": jsonValue(user.EncryptionRecord)}, nil
}

func (a *App) recoveryFinish(c *Ctx) (any, error) {
	var body recoveryInput
	if err := decode(c, &body); err != nil {
		return nil, err
	}
	if err := body.validate(true); err != nil {
		return nil, err
	}
	if err := c.throttle("recovery-finish", 10, ""); err != nil {
		return nil, err
	}
	saved, ok := a.Memory.Get(recoveryKey(*body.Challenge))
	if !ok {
		return nil, fail(http.StatusUnauthorized, "Sesi pemulihan tidak berlaku.")
	}
	var state recoveryState
	json.Unmarshal([]byte(saved), &state)
	password, verifier := hashPassword(*body.Password), hashPassword(*body.RecoveryVerifier)
	var tokens map[string]any
	err := a.tx(c.ctx(), func(tx *Tx) error {
		user, err := getUser(c.ctx(), tx, "id = ?"+a.DB.lock(), state.UserID)
		if err != nil {
			return err
		}
		if user == nil || !user.RecoveryAuthHash.Valid || user.RecoveryAuthHash.String == "" ||
			!safeEqual(state.Version, sha256Hex(user.RecoveryAuthHash.String)) {
			return fail(http.StatusUnauthorized, "Sesi pemulihan sudah dipakai.")
		}
		user.PasswordHash, user.RecoveryAuthHash = password, nullString(verifier)
		user.EncryptionRecord = nullString(body.EncryptionRecord.dump())
		if _, err := tx.ExecContext(c.ctx(), `UPDATE users SET password_hash = ?, recovery_auth_hash = ?,
			encryption_record = ?, updated_at = ? WHERE id = ?`,
			user.PasswordHash, user.RecoveryAuthHash, user.EncryptionRecord, now(), user.ID); err != nil {
			return err
		}
		if _, err := tx.ExecContext(c.ctx(), "UPDATE sessions SET revoked_at = ? WHERE user_id = ?", now(),
			user.ID); err != nil {
			return err
		}
		tokens, err = c.newSession(c.ctx(), tx, user)
		return err
	})
	if err != nil {
		return nil, err
	}
	a.Memory.Delete(recoveryKey(*body.Challenge))
	return tokens, nil
}

func (a *App) rotateShare(c *Ctx) (any, error) {
	identifier, err := pathUUID(c, "message_id")
	if err != nil {
		return nil, err
	}
	var body shareInput
	if err := decode(c, &body); err != nil {
		return nil, err
	}
	var v validation
	body.Payload.validate(&v, "payload")
	if err := v.err(); err != nil {
		return nil, err
	}
	user, err := c.currentUser()
	if err != nil {
		return nil, err
	}
	if err := c.throttle("share", 10, user.ID); err != nil {
		return nil, err
	}
	token := randomToken()
	err = a.tx(c.ctx(), func(tx *Tx) error {
		row, err := ownedMessage(c.ctx(), tx, identifier, user.ID)
		if err != nil {
			return err
		}
		if row.Visibility != "unlisted" {
			return fail(http.StatusConflict, "Tautan tersedia untuk pesan berstatus tautan terbatas.")
		}
		if *body.Payload.AAD != fmt.Sprintf("untukmu:share:v1:%s", row.ID) {
			return fail(http.StatusUnprocessableEntity, "Konteks enkripsi tautan tidak cocok.")
		}
		_, err = tx.ExecContext(c.ctx(), "UPDATE messages SET share_token_hash = ?, share_payload = ? WHERE id = ?",
			a.digest(token), body.Payload.dump(), row.ID)
		return err
	})
	if err != nil {
		return nil, err
	}
	return map[string]string{"id": identifier, "token": token}, nil
}

func (a *App) revokeShare(c *Ctx) (any, error) {
	identifier, err := pathUUID(c, "message_id")
	if err != nil {
		return nil, err
	}
	user, err := c.currentUser()
	if err != nil {
		return nil, err
	}
	if err := c.throttle("share", 10, user.ID); err != nil {
		return nil, err
	}
	if _, err := ownedMessage(c.ctx(), a.DB, identifier, user.ID); err != nil {
		return nil, err
	}
	_, err = a.DB.ExecContext(c.ctx(), "UPDATE messages SET share_token_hash = NULL, share_payload = NULL WHERE id = ?",
		identifier)
	return nil, err
}

func (a *App) readShared(c *Ctx) (any, error) {
	identifier, err := pathUUID(c, "message_id")
	if err != nil {
		return nil, err
	}
	token := c.R.Header.Get("X-Share-Token")
	if length(token) > 100 {
		return nil, invalidParam("header", "x-share-token", "Maksimal 100 karakter.")
	}
	if err := c.throttle("shared-read", 60, ""); err != nil {
		return nil, err
	}
	row, err := getMessage(c.ctx(), a.DB,
		"id = ? AND visibility = 'unlisted' AND (release_at IS NULL OR release_at <= ?)", identifier, now())
	if err != nil {
		return nil, err
	}
	if row == nil || !row.ShareTokenHash.Valid || row.ShareTokenHash.String == "" || !row.SharePayload.Valid ||
		!safeEqual(row.ShareTokenHash.String, a.digest(token)) {
		return nil, fail(http.StatusNotFound, "Tautan tidak berlaku atau pesan belum waktunya dibuka.")
	}
	return map[string]any{"id": row.ID, "payload": json.RawMessage(row.SharePayload.String), "created_at": row.CreatedAt},
		nil
}

func (a *App) presignUpload(c *Ctx) (any, error) {
	var body uploadInput
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
	if err := c.throttle("uploads", 10, user.ID); err != nil {
		return nil, err
	}
	if *body.ByteSize > a.Conf.MaxUploadBytes {
		return nil, fail(http.StatusRequestEntityTooLarge, "Ukuran unggahan melebihi batas.")
	}
	key := fmt.Sprintf("%s/%s.enc", user.ID, body.id)
	meta, _ := json.Marshal(map[string]any{"v": 2, "alg": "A256GCM", "iv": *body.IV, "aad": *body.AAD})
	_, err = a.DB.ExecContext(c.ctx(), `INSERT INTO uploads (id, owner_id, storage_key, byte_size, encryption_meta,
		complete, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)`, body.id, user.ID, key, *body.ByteSize, string(meta), now())
	if isUniqueViolation(err) {
		return nil, fail(http.StatusConflict, "Identitas unggahan sudah dipakai.")
	}
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"id":         body.id,
		"upload":     a.Storage.PresignPost(key, "application/octet-stream", *body.ByteSize, 5*time.Minute),
		"expires_in": 300,
	}, nil
}

func (a *App) completeUpload(c *Ctx) (any, error) {
	identifier, err := pathUUID(c, "upload_id")
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
	row, err := ownedUpload(c.ctx(), a.DB, identifier, user.ID)
	if err != nil {
		return nil, err
	}
	info, err := a.Storage.Head(row.StorageKey)
	if err != nil {
		return nil, fail(http.StatusConflict, "Objek unggahan belum tersedia.")
	}
	if info.Size != row.ByteSize || info.ContentType != "application/octet-stream" {
		return nil, fail(http.StatusUnprocessableEntity, "Metadata unggahan tidak cocok.")
	}
	if _, err := a.DB.ExecContext(c.ctx(), "UPDATE uploads SET complete = 1 WHERE id = ?", row.ID); err != nil {
		return nil, err
	}
	return map[string]any{"id": row.ID, "complete": true}, nil
}

func (a *App) downloadUpload(c *Ctx) (any, error) {
	identifier, err := pathUUID(c, "upload_id")
	if err != nil {
		return nil, err
	}
	user, err := c.currentUser()
	if err != nil {
		return nil, err
	}
	row, err := ownedUpload(c.ctx(), a.DB, identifier, user.ID)
	if err != nil {
		return nil, err
	}
	if !row.Complete {
		return nil, fail(http.StatusConflict, "Unggahan belum selesai.")
	}
	return map[string]any{
		"id": row.ID, "url": a.Storage.PresignGet(row.StorageKey, time.Minute),
		"encryption_meta": json.RawMessage(row.EncryptionMeta),
	}, nil
}
