package app

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/google/uuid"
)

const origin = "http://localhost:3000"

type harness struct {
	t   *testing.T
	app *App
	h   http.Handler
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	dir := t.TempDir()
	conf := &Config{
		Environment: "test", AppOrigin: origin, JWTSecret: "test-only-random-looking-secret-not-production-abcdef",
		AccessMinutes: 10, RefreshDays: 30, MaxUploadBytes: 10 * 1024 * 1024,
		DatabasePath: filepath.Join(dir, "test.db"), StorageDir: filepath.Join(dir, "storage"),
	}
	// UNTUKMU_TEST_DATABASE_URL runs the suite on PostgreSQL inside a
	// throwaway schema, using the direct (non-pooler) endpoint.
	if url := os.Getenv("UNTUKMU_TEST_DATABASE_URL"); url != "" {
		url = strings.Replace(url, "-pooler.", ".", 1)
		schema := "untukmu_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")[:12]
		testSchema = ""
		admin, err := openPostgres(url)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := admin.Exec("CREATE SCHEMA " + schema); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			admin.Exec("DROP SCHEMA " + schema + " CASCADE")
			admin.Close()
		})
		testSchema, conf.DatabaseURL = schema, url
	}
	api, err := New(conf, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { api.Close() })
	return &harness{t: t, app: api, h: api.Handler()}
}

type response struct {
	Status int
	Body   []byte
	Header http.Header
	cookie []*http.Cookie
}

func (r response) json(t *testing.T) map[string]any {
	t.Helper()
	var value map[string]any
	if err := json.Unmarshal(r.Body, &value); err != nil {
		t.Fatalf("bukan objek JSON (%d): %s", r.Status, r.Body)
	}
	return value
}

func (r response) list(t *testing.T) []map[string]any {
	t.Helper()
	var value []map[string]any
	if err := json.Unmarshal(r.Body, &value); err != nil {
		t.Fatalf("bukan daftar JSON (%d): %s", r.Status, r.Body)
	}
	return value
}

func (h *harness) do(method, path string, body any, headers map[string]string) response {
	h.t.Helper()
	var reader io.Reader
	if body != nil {
		encoded, _ := json.Marshal(body)
		reader = bytes.NewReader(encoded)
	}
	request := httptest.NewRequest(method, path, reader)
	request.Header.Set("Origin", origin)
	request.Header.Set("Content-Type", "application/json")
	for key, value := range headers {
		if value == "" {
			request.Header.Del(key)
		} else {
			request.Header.Set(key, value)
		}
	}
	recorder := httptest.NewRecorder()
	h.h.ServeHTTP(recorder, request)
	result := recorder.Result()
	return response{Status: result.StatusCode, Body: recorder.Body.Bytes(), Header: result.Header,
		cookie: result.Cookies()}
}

func expect(t *testing.T, r response, status int) {
	t.Helper()
	if r.Status != status {
		t.Fatalf("status %d, diharapkan %d: %s", r.Status, status, r.Body)
	}
}

func b64(size int) string {
	raw := make([]byte, size)
	rand.Read(raw)
	return base64.StdEncoding.EncodeToString(raw)
}

func testKeyRecord() map[string]any {
	return map[string]any{
		"v": 2, "kdf": "Argon2id", "memory": 65536, "iter": 3, "parallelism": 1, "salt": b64(16),
		"wrapped":         map[string]string{"iv": b64(12), "ct": b64(48)},
		"wrappedRecovery": map[string]string{"iv": b64(12), "ct": b64(48)},
	}
}

func (h *harness) account(email string) map[string]string {
	h.t.Helper()
	r := h.do("POST", "/api/v1/auth/register", map[string]any{
		"email": email, "password": "test-credential-derived-client-side", "encryption_record": testKeyRecord(),
	}, nil)
	expect(h.t, r, 201)
	return map[string]string{"Authorization": "Bearer " + r.json(h.t)["access_token"].(string)}
}

func (h *harness) galaxy(auth map[string]string) string {
	h.t.Helper()
	r := h.do("POST", "/api/v1/constellations", map[string]any{
		"target_kind": "sahabat", "target_label": "Sahabat", "color": "#ffd9a0",
	}, auth)
	expect(h.t, r, 201)
	return r.json(h.t)["id"].(string)
}

func privateMessage(galaxy, visibility string) map[string]any {
	identifier := uuid.NewString()
	return map[string]any{
		"id": identifier, "constellation_ids": []string{galaxy}, "visibility": visibility, "tags": []string{"#Kenangan"},
		"payload": map[string]any{
			"v": 2, "alg": "A256GCM", "mode": "private", "iv": b64(12), "ct": b64(64),
			"aad": "untukmu:message:v2:" + identifier + ":" + visibility,
		},
	}
}

func publicMessage(galaxy, text string) map[string]any {
	return map[string]any{
		"id": uuid.NewString(), "constellation_ids": []string{galaxy}, "visibility": "public_anon",
		"public_body": text, "mood": "Gratitude", "tags": []string{"Doa"},
	}
}

func (h *harness) admin(email string) map[string]string {
	h.t.Helper()
	auth := h.account(email)
	if _, err := h.app.DB.Exec("UPDATE users SET role = 'admin' WHERE email = ?", email); err != nil {
		h.t.Fatal(err)
	}
	return auth
}

func TestSessionLifecycle(t *testing.T) {
	h := newHarness(t)
	r := h.do("POST", "/api/v1/auth/register", map[string]any{
		"email": "First@Example.com", "password": "test-credential-derived-client-side", "encryption_record": testKeyRecord(),
	}, nil)
	expect(t, r, 201)
	if len(r.cookie) != 1 || r.cookie[0].Name != "um_refresh" || !r.cookie[0].HttpOnly ||
		r.cookie[0].SameSite != http.SameSiteStrictMode || r.cookie[0].Path != "/api/v1/auth" {
		t.Fatalf("cookie refresh tidak aman: %+v", r.cookie)
	}
	refresh := r.cookie[0].Value
	auth := map[string]string{"Authorization": "Bearer " + r.json(t)["access_token"].(string)}
	me := h.do("GET", "/api/v1/users/me", nil, auth).json(t)
	if me["email"] != "first@example.com" || me["role"] != "user" || me["recovery_ready"] != false {
		t.Fatalf("profil salah: %v", me)
	}
	expect(t, h.do("POST", "/api/v1/auth/register", map[string]any{
		"email": "first@example.com", "password": "test-credential-derived-client-side", "encryption_record": testKeyRecord(),
	}, nil), 409)

	status := h.do("GET", "/api/v1/auth/status", nil, map[string]string{"Cookie": "um_refresh=" + refresh}).json(t)
	if status["authenticated"] != true {
		t.Fatalf("status cookie: %v", status)
	}
	expect(t, h.do("POST", "/api/v1/auth/refresh", nil, map[string]string{
		"Cookie": "um_refresh=" + refresh, "Origin": "http://evil.example",
	}), 403)
	rotated := h.do("POST", "/api/v1/auth/refresh", nil, map[string]string{"Cookie": "um_refresh=" + refresh})
	expect(t, rotated, 200)
	// Reusing the previous refresh token revokes the session.
	expect(t, h.do("POST", "/api/v1/auth/refresh", nil, map[string]string{"Cookie": "um_refresh=" + refresh}), 401)
	expect(t, h.do("POST", "/api/v1/auth/refresh", nil,
		map[string]string{"Cookie": "um_refresh=" + rotated.cookie[0].Value}), 401)
	expect(t, h.do("GET", "/api/v1/users/me", nil, auth), 401)

	login := h.do("POST", "/api/v1/auth/login", map[string]any{
		"email": "first@example.com", "password": "test-credential-derived-client-side",
	}, nil)
	expect(t, login, 200)
	expect(t, h.do("POST", "/api/v1/auth/login", map[string]any{
		"email": "first@example.com", "password": "wrong-password",
	}, nil), 401)
	auth = map[string]string{"Authorization": "Bearer " + login.json(t)["access_token"].(string)}
	sessions := h.do("GET", "/api/v1/auth/sessions", nil, auth).list(t)
	if len(sessions) != 1 {
		t.Fatalf("sesi aktif: %v", sessions)
	}
	expect(t, h.do("POST", "/api/v1/auth/logout", nil, map[string]string{"Cookie": "um_refresh=" + login.cookie[0].Value}), 204)
	expect(t, h.do("GET", "/api/v1/users/me", nil, auth), 401)
}

func TestValidationAndPrivacyBoundary(t *testing.T) {
	h := newHarness(t)
	auth := h.account("first@example.com")
	galaxy := h.galaxy(auth)

	extra := privateMessage(galaxy, "private")
	extra["public_body"] = "bocor"
	r := h.do("POST", "/api/v1/messages", extra, auth)
	expect(t, r, 422)
	if strings.Contains(string(r.Body), "bocor") {
		t.Fatal("isi pesan dipantulkan dalam galat")
	}
	wrongAAD := privateMessage(galaxy, "private")
	wrongAAD["payload"].(map[string]any)["aad"] = "untukmu:message:v2:other:private"
	expect(t, h.do("POST", "/api/v1/messages", wrongAAD, auth), 422)
	expect(t, h.do("POST", "/api/v1/messages", map[string]any{"unknown": true}, auth), 422)

	message := privateMessage(galaxy, "private")
	created := h.do("POST", "/api/v1/messages", message, auth)
	expect(t, created, 201)
	view := created.json(t)
	if view["public_body"] != nil || view["visibility"] != "private" || view["payload"].(map[string]any)["ct"] == nil {
		t.Fatalf("pesan privat: %v", view)
	}
	if tags := view["tags"].([]any); len(tags) != 1 || tags[0] != "kenangan" {
		t.Fatalf("tag tidak dinormalisasi: %v", tags)
	}
	expect(t, h.do("POST", "/api/v1/messages", message, auth), 409)

	other := h.account("second@example.com")
	expect(t, h.do("GET", "/api/v1/messages/"+message["id"].(string), nil, other), 404)
	expect(t, h.do("GET", "/api/v1/messages/"+message["id"].(string), nil, nil), 401)
	expect(t, h.do("GET", "/api/v1/constellations/"+galaxy, nil, other), 404)
	expect(t, h.do("DELETE", "/api/v1/constellations/"+galaxy, nil, auth), 409)

	expect(t, h.do("POST", "/api/v1/messages", message, map[string]string{
		"Authorization": auth["Authorization"], "Origin": "http://evil.example",
	}), 403)
	big := strings.Repeat("a", maxRequestBytes+10)
	expect(t, h.do("POST", "/api/v1/messages", map[string]any{"x": big}, auth), 413)

	listed := h.do("GET", "/api/v1/constellations/"+galaxy+"/messages", nil, auth).list(t)
	if len(listed) != 1 {
		t.Fatalf("pesan galaksi: %v", listed)
	}
	summary := h.do("GET", "/api/v1/dashboard/summary", nil, auth).json(t)
	// One galaxy is created with the account, one was added above.
	if summary["messages"].(float64) != 1 || summary["constellations"].(float64) != 2 {
		t.Fatalf("ringkasan: %v", summary)
	}
	expect(t, h.do("DELETE", "/api/v1/messages/"+message["id"].(string), nil, auth), 204)
	expect(t, h.do("DELETE", "/api/v1/constellations/"+galaxy, nil, auth), 204)
}

func TestPublicMessagesModerationAndSupport(t *testing.T) {
	h := newHarness(t)
	author := h.account("author@example.com")
	galaxy := h.galaxy(author)
	clean := publicMessage(galaxy, "Terima kasih untuk semuanya.")
	created := h.do("POST", "/api/v1/messages", clean, author).json(t)
	if created["moderation_status"] != "approved" || created["mood"] != "syukur" {
		t.Fatalf("pesan publik: %v", created)
	}
	spam := publicMessage(galaxy, "http://a http://b https://c")
	if status := h.do("POST", "/api/v1/messages", spam, author).json(t)["moderation_status"]; status != "pending" {
		t.Fatalf("spam lolos: %v", status)
	}
	var stored string
	h.app.DB.QueryRow("SELECT public_body FROM messages WHERE id = ?", clean["id"]).Scan(&stored)
	if !strings.HasPrefix(stored, "v1:") || strings.Contains(stored, "Terima") {
		t.Fatal("teks publik tidak dienkripsi saat disimpan")
	}

	feed := h.do("GET", "/api/v1/explore?mood=gratitude&tag=%23doa", nil, nil).list(t)
	if len(feed) != 1 || feed[0]["public_body"] != "Terima kasih untuk semuanya." || feed[0]["is_mine"] != false {
		t.Fatalf("jelajah: %v", feed)
	}
	galaxies := h.do("GET", "/api/v1/explore/constellations", nil, nil).list(t)
	if len(galaxies) != 1 || galaxies[0]["target_label"] != "Galaksi anonim" || galaxies[0]["public_message_count"].(float64) != 1 {
		t.Fatalf("galaksi publik: %v", galaxies)
	}
	expect(t, h.do("GET", "/api/v1/explore?sort=random", nil, nil), 422)

	visitor := h.account("visitor@example.com")
	path := "/api/v1/messages/" + clean["id"].(string)
	first := h.do("POST", path+"/empathy", map[string]any{}, visitor).json(t)
	second := h.do("POST", path+"/empathy", map[string]any{}, visitor).json(t)
	if first["added"] != true || second["added"] != false || second["empathy_count"].(float64) != 1 {
		t.Fatalf("empati: %v %v", first, second)
	}
	expect(t, h.do("POST", "/api/v1/reports", map[string]any{"message_id": clean["id"], "reason": "Tidak pantas"}, visitor), 201)

	expect(t, h.do("GET", "/api/v1/admin/moderation/queue", nil, visitor), 403)
	admin := h.admin("admin@example.com")
	queue := h.do("GET", "/api/v1/admin/moderation/queue", nil, admin).list(t)
	if len(queue) != 2 {
		t.Fatalf("antrean moderasi: %v", queue)
	}
	for _, item := range queue {
		if item["id"] == clean["id"] && len(item["reports"].([]any)) != 1 {
			t.Fatalf("laporan tidak tampil: %v", item)
		}
	}
	decision := map[string]any{"decision": "remove", "review_token": strings.Repeat("0", 64)}
	expect(t, h.do("POST", "/api/v1/admin/moderation/"+clean["id"].(string)+"/decision", decision, admin), 409)
	decision["review_token"] = queue[0]["review_token"]
	expect(t, h.do("POST", "/api/v1/admin/moderation/"+queue[0]["id"].(string)+"/decision", decision, admin), 200)

	// Blocking hides the author from the blocker.
	remaining := h.do("GET", "/api/v1/explore/messages", nil, visitor).list(t)
	if len(remaining) != 0 {
		expect(t, h.do("POST", "/api/v1/users/blocks", map[string]any{"message_id": remaining[0]["id"]}, visitor), 201)
		if len(h.do("GET", "/api/v1/explore/messages", nil, visitor).list(t)) != 0 {
			t.Fatal("blokir tidak menyembunyikan penulis")
		}
	}
	metrics := h.do("GET", "/api/v1/admin/metrics?days=30", nil, admin).json(t)
	if metrics["total_users"].(float64) != 3 || metrics["created_messages"].(float64) != 2 {
		t.Fatalf("metrik: %v", metrics)
	}
	users := h.do("GET", "/api/v1/admin/users?q=AUTHOR", nil, admin).json(t)
	if users["total"].(float64) != 1 {
		t.Fatalf("pencarian pengguna: %v", users)
	}
}

func TestPrayerFlow(t *testing.T) {
	h := newHarness(t)
	author := h.account("author@example.com")
	galaxy := h.galaxy(author)
	message := publicMessage(galaxy, "Mohon doanya.")
	expect(t, h.do("POST", "/api/v1/messages", message, author), 201)

	traditions := h.do("GET", "/api/v1/prayers/traditions", nil, nil).list(t)
	available := 0
	for _, tradition := range traditions {
		for _, entry := range tradition["entri"].([]any) {
			item := entry.(map[string]any)
			if item["reviewed"] != true || item["audio"] != true {
				t.Fatalf("katalog publik memuat entri belum dikurasi: %v", item)
			}
			available++
		}
	}
	if available == 0 {
		t.Fatal("katalog doa kosong")
	}
	audio := h.do("GET", "/api/v1/prayers/audio/pater-noster", nil, nil)
	expect(t, audio, 200)
	if audio.Header.Get("Content-Type") != "audio/ogg" || len(audio.Body) != 256327 {
		t.Fatalf("rekaman: %s %d", audio.Header.Get("Content-Type"), len(audio.Body))
	}

	visitor := h.account("visitor@example.com")
	path := "/api/v1/messages/" + message["id"].(string) + "/prayers"
	expect(t, h.do("POST", path+"/start", map[string]any{"catalog_id": "islam/rabbana-atina"}, visitor), 409)
	start := h.do("POST", path+"/start", map[string]any{"catalog_id": "kristen/bapa-kami-latin"}, visitor).json(t)
	token := start["playback_token"].(string)
	if start["audio_url"] != "/api/v1/prayers/audio/pater-noster" || start["seconds"].(float64) != 29 {
		t.Fatalf("mulai doa: %v", start)
	}
	expect(t, h.do("POST", path, map[string]any{"playback_token": token}, visitor), 409)
	// Simulate the prayer having been listened to completely.
	key := prayerTokenKey(token)
	saved, _ := h.app.Memory.Get(key)
	var state prayerSession
	json.Unmarshal([]byte(saved), &state)
	state.Started -= 60
	encoded, _ := json.Marshal(state)
	h.app.Memory.Set(key, string(encoded), 0)

	expect(t, h.do("POST", path, map[string]any{"playback_token": token}, author), 403)
	done := h.do("POST", path, map[string]any{"playback_token": token}, visitor).json(t)
	again := h.do("POST", path, map[string]any{"playback_token": token}, visitor).json(t)
	if done["added"] != true || again["added"] != false || again["prayer_count"].(float64) != 1 {
		t.Fatalf("doa: %v %v", done, again)
	}
	received := h.do("GET", "/api/v1/dashboard/prayers-received", nil, author).list(t)
	if len(received) != 1 || received[0]["prayer_type"] != "bapa-kami-latin" {
		t.Fatalf("doa diterima: %v", received)
	}
}

func (h *harness) upload(signed map[string]any, payload []byte) response {
	h.t.Helper()
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	for key, value := range signed["fields"].(map[string]any) {
		form.WriteField(key, value.(string))
	}
	part, _ := form.CreateFormFile("file", "encrypted.bin")
	part.Write(payload)
	form.Close()
	request := httptest.NewRequest("POST", signed["url"].(string), &body)
	request.Header.Set("Content-Type", form.FormDataContentType())
	request.Header.Set("Origin", origin)
	recorder := httptest.NewRecorder()
	h.h.ServeHTTP(recorder, request)
	return response{Status: recorder.Code, Body: recorder.Body.Bytes()}
}

func TestEncryptedUploadsAndSharing(t *testing.T) {
	h := newHarness(t)
	auth := h.account("first@example.com")
	identifier := uuid.NewString()
	payload := make([]byte, 64)
	rand.Read(payload)
	presign := h.do("POST", "/api/v1/uploads/presign", map[string]any{
		"id": identifier, "byte_size": len(payload), "iv": b64(12), "aad": "untukmu:upload:v2:" + identifier,
	}, auth)
	expect(t, presign, 201)
	signed := presign.json(t)["upload"].(map[string]any)
	expect(t, h.do("POST", "/api/v1/uploads/"+identifier+"/complete", nil, auth), 409)
	expect(t, h.upload(signed, payload[:10]), 400)
	tampered := map[string]any{"url": signed["url"], "fields": map[string]any{}}
	for key, value := range signed["fields"].(map[string]any) {
		tampered["fields"].(map[string]any)[key] = value
	}
	tampered["fields"].(map[string]any)["key"] = "other/" + identifier + ".enc"
	expect(t, h.upload(tampered, payload), 403)
	expect(t, h.upload(signed, payload), 204)
	expect(t, h.do("POST", "/api/v1/uploads/"+identifier+"/complete", nil, auth), 200)
	info := h.do("GET", "/api/v1/uploads/"+identifier, nil, auth).json(t)
	download := h.do("GET", info["url"].(string), nil, nil)
	expect(t, download, 200)
	if !bytes.Equal(download.Body, payload) {
		t.Fatal("isi unduhan berbeda")
	}
	expect(t, h.do("GET", info["url"].(string)+"0", nil, nil), 403)

	galaxy := h.galaxy(auth)
	photo := h.do("POST", "/api/v1/constellations", map[string]any{
		"target_kind": "pasangan", "target_label": "Kamu", "visual_type": "photo", "visual_ref": identifier,
	}, auth)
	expect(t, photo, 201)

	message := privateMessage(galaxy, "unlisted")
	message["attachment_ids"] = []string{identifier}
	expect(t, h.do("POST", "/api/v1/messages", message, auth), 201)
	id := message["id"].(string)
	share := map[string]any{"payload": map[string]any{
		"v": 2, "alg": "A256GCM", "mode": "private", "iv": b64(12), "ct": b64(64), "aad": "untukmu:share:v1:" + id,
	}}
	link := h.do("POST", "/api/v1/messages/"+id+"/share", share, auth).json(t)
	token := link["token"].(string)
	shared := h.do("GET", "/api/v1/shared/"+id, nil, map[string]string{"X-Share-Token": token})
	expect(t, shared, 200)
	expect(t, h.do("GET", "/api/v1/shared/"+id, nil, map[string]string{"X-Share-Token": "wrong"}), 404)
	expect(t, h.do("DELETE", "/api/v1/messages/"+id+"/share", nil, auth), 204)
	expect(t, h.do("GET", "/api/v1/shared/"+id, nil, map[string]string{"X-Share-Token": token}), 404)

	exported := h.do("GET", "/api/v1/users/me/export", nil, auth).json(t)
	if len(exported["uploads"].([]any)) != 1 || len(exported["messages"].([]any)) != 1 {
		t.Fatalf("ekspor: %v", exported)
	}

	expect(t, h.do("DELETE", "/api/v1/users/me", map[string]any{
		"password": "test-credential-derived-client-side", "content_action": "delete",
	}, auth), 204)
	if _, err := h.app.cleanDeletedUploads(t.Context()); err != nil {
		t.Fatal(err)
	}
	var remaining int
	h.app.DB.QueryRow("SELECT COUNT(*) FROM uploads").Scan(&remaining)
	if remaining != 0 {
		t.Fatal("unggahan akun terhapus masih tersimpan")
	}
	expect(t, h.do("GET", info["url"].(string), nil, nil), 404)
}

func TestDeleteAccountKeepsAnonymousContent(t *testing.T) {
	h := newHarness(t)
	auth := h.account("first@example.com")
	galaxy := h.galaxy(auth)
	message := publicMessage(galaxy, "Tetap ada.")
	expect(t, h.do("POST", "/api/v1/messages", message, auth), 201)
	expect(t, h.do("DELETE", "/api/v1/users/me", map[string]any{
		"password": "salah", "content_action": "keep",
	}, auth), 403)
	expect(t, h.do("DELETE", "/api/v1/users/me", map[string]any{
		"password": "test-credential-derived-client-side", "content_action": "keep",
	}, auth), 204)
	feed := h.do("GET", "/api/v1/explore/messages", nil, nil).list(t)
	if len(feed) != 1 || feed[0]["author_deleted"] != true {
		t.Fatalf("konten anonim: %v", feed)
	}
	again := h.account("first@example.com")
	if len(h.do("GET", "/api/v1/dashboard/messages", nil, again).list(t)) != 0 {
		t.Fatal("kepemilikan berpindah ke akun baru dengan surel sama")
	}
}

func TestRecovery(t *testing.T) {
	h := newHarness(t)
	verifier := base64.StdEncoding.EncodeToString(make([]byte, 32))
	r := h.do("POST", "/api/v1/auth/register", map[string]any{
		"email": "first@example.com", "password": "test-credential-derived-client-side",
		"encryption_record": testKeyRecord(), "recovery_verifier": verifier,
	}, nil)
	expect(t, r, 201)
	expect(t, h.do("POST", "/api/v1/auth/recovery/begin", map[string]any{
		"email": "first@example.com", "recovery_verifier": base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{1}, 32)),
	}, nil), 401)
	begin := h.do("POST", "/api/v1/auth/recovery/begin", map[string]any{
		"email": "first@example.com", "recovery_verifier": verifier,
	}, nil).json(t)
	finish := map[string]any{
		"challenge": begin["challenge"], "password": "a-brand-new-password-123", "encryption_record": testKeyRecord(),
		"recovery_verifier": base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{2}, 32)),
	}
	expect(t, h.do("POST", "/api/v1/auth/recovery/finish", finish, nil), 200)
	expect(t, h.do("POST", "/api/v1/auth/recovery/finish", finish, nil), 401)
	expect(t, h.do("GET", "/api/v1/users/me", nil, map[string]string{
		"Authorization": "Bearer " + r.json(t)["access_token"].(string),
	}), 401)
	expect(t, h.do("POST", "/api/v1/auth/login", map[string]any{
		"email": "first@example.com", "password": "a-brand-new-password-123",
	}, nil), 200)
}

func TestRateLimitAndHealth(t *testing.T) {
	h := newHarness(t)
	expect(t, h.do("GET", "/api/v1/health", nil, nil), 200)
	expect(t, h.do("GET", "/api/v1/missing", nil, nil), 404)
	for i := 0; i < 15; i++ {
		h.do("POST", "/api/v1/auth/login", map[string]any{"email": "x@example.com", "password": "x"}, nil)
	}
	limited := h.do("POST", "/api/v1/auth/login", map[string]any{"email": "x@example.com", "password": "x"}, nil)
	expect(t, limited, 429)
	if limited.Header.Get("Retry-After") != "60" || limited.Header.Get("Cache-Control") != "no-store" {
		t.Fatalf("header: %v", limited.Header)
	}
	expect(t, h.do("GET", "/metrics", nil, nil), 404)
}

func TestPasswordHashFormat(t *testing.T) {
	encoded := hashPassword("rahasia")
	if !strings.HasPrefix(encoded, "$argon2id$v=19$m=65536,t=3,p=1$") || !checkPassword(encoded, "rahasia") ||
		checkPassword(encoded, "lain") {
		t.Fatalf("hash argon2id: %s", encoded)
	}
}

func TestWorkspaces(t *testing.T) {
	h := newHarness(t)
	owner := h.account("owner@example.com")
	visitor := h.account("visitor@example.com")

	mine := h.do("GET", "/api/v1/workspaces/me", nil, owner).json(t)
	if mine["visibility"] != "private" || mine["constellation_count"].(float64) != 1 || mine["is_mine"] != true {
		t.Fatalf("ruang baru: %v", mine)
	}
	galaxies := h.do("GET", "/api/v1/constellations", nil, owner).list(t)
	if len(galaxies) != 1 || galaxies[0]["target_label"] != "Galaksi pertamaku" {
		t.Fatalf("galaksi pertama: %v", galaxies)
	}
	id := mine["id"].(string)

	list := h.do("GET", "/api/v1/explore/workspaces", nil, visitor).list(t)
	if len(list) != 2 {
		t.Fatalf("daftar ruang: %v", list)
	}
	for _, item := range list {
		if item["id"] == id && (item["locked"] != true || item["name"] != nil) {
			t.Fatalf("ruang privat bocor: %v", item)
		}
	}
	expect(t, h.do("GET", "/api/v1/explore/workspaces/"+id, nil, visitor), 404)
	expect(t, h.do("GET", "/api/v1/explore/workspaces/"+id, nil, nil), 404)
	expect(t, h.do("GET", "/api/v1/explore/workspaces/"+id, nil, owner), 200)

	galaxy := galaxies[0]["id"].(string)
	private := privateMessage(galaxy, "private")
	expect(t, h.do("POST", "/api/v1/messages", private, owner), 201)
	public := publicMessage(galaxy, "Halo dari ruangku.")
	expect(t, h.do("POST", "/api/v1/messages", public, owner), 201)

	expect(t, h.do("PATCH", "/api/v1/workspaces/me", map[string]any{"visibility": "secret"}, owner), 422)
	updated := h.do("PATCH", "/api/v1/workspaces/me", map[string]any{"visibility": "public", "name": "Taman Bintang"}, owner).json(t)
	if updated["visibility"] != "public" || updated["name"] != "Taman Bintang" {
		t.Fatalf("ubah ruang: %v", updated)
	}
	if h.do("GET", "/api/v1/users/me", nil, owner).json(t)["profile_visibility"] != "public" {
		t.Fatal("pengaturan profil tidak ikut berubah")
	}

	detail := h.do("GET", "/api/v1/explore/workspaces/"+id, nil, nil).json(t)
	shown := detail["constellations"].([]any)
	if detail["name"] != "Taman Bintang" || len(shown) != 1 || detail["is_mine"] != false {
		t.Fatalf("isi ruang publik: %v", detail)
	}
	if g := shown[0].(map[string]any); g["visual_ref"] != nil || g["public_message_count"].(float64) != 1 {
		t.Fatalf("galaksi di ruang publik: %v", g)
	}
	messages := h.do("GET", "/api/v1/explore/workspaces/"+id+"/messages?constellation_id="+galaxy, nil, visitor).list(t)
	if len(messages) != 1 || messages[0]["public_body"] != "Halo dari ruangku." {
		t.Fatalf("pesan ruang publik hanya boleh yang publik: %v", messages)
	}

	// The settings switch closes the workspace again.
	expect(t, h.do("PATCH", "/api/v1/users/me/settings", map[string]any{"profile_visibility": "private"}, owner), 200)
	expect(t, h.do("GET", "/api/v1/explore/workspaces/"+id, nil, visitor), 404)
}
