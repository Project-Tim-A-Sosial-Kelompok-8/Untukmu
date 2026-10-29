package app

import (
	"context"
	"log/slog"
	"net/http"
	"time"
)

const (
	maxRequestBytes = 200000
	maxAudioBytes   = 30 * 1024 * 1024
)

func New(conf *Config, logger *slog.Logger) (*App, error) {
	db, err := OpenStore(conf)
	if err != nil {
		return nil, err
	}
	storage, err := NewStorage(conf.StorageDir, conf.JWTSecret)
	if err != nil {
		db.Close()
		return nil, err
	}
	return &App{Conf: conf, DB: db, Memory: NewMemory(), Storage: storage, Log: logger}, nil
}

func (a *App) Close() error { return a.DB.Close() }

func (a *App) health(c *Ctx) (any, error) {
	if err := a.DB.PingContext(c.ctx()); err != nil {
		return nil, fail(http.StatusServiceUnavailable, "Layanan belum siap.")
	}
	var one int
	if err := a.DB.QueryRowContext(c.ctx(), "SELECT 1").Scan(&one); err != nil {
		return nil, fail(http.StatusServiceUnavailable, "Layanan belum siap.")
	}
	return map[string]any{"status": "ok", "phase": 5}, nil
}

func (a *App) capabilities(c *Ctx) (any, error) {
	return map[string]any{
		"phase":              5,
		"public_messages":    true,
		"unlisted_messages":  true,
		"prayers":            true,
		"moderation":         true,
		"multi_target":       true,
		"scheduled_messages": true,
		"encrypted_sharing":  true,
		"product_metrics":    true,
	}, nil
}

// Handler returns the complete HTTP API.
func (a *App) Handler() http.Handler {
	mux := http.NewServeMux()
	route := func(pattern string, status int, handler Handler) {
		method, path, _ := cut(pattern)
		mux.Handle(method+" /api/v1"+path, a.wrap(status, handler))
	}
	const ok, created, empty = http.StatusOK, http.StatusCreated, http.StatusNoContent

	route("GET /health", ok, a.health)
	route("GET /capabilities", ok, a.capabilities)

	// Akun dan sesi
	route("GET /auth/status", ok, a.authStatus)
	route("POST /auth/register", created, a.register)
	route("POST /auth/login", ok, a.login)
	route("POST /auth/refresh", ok, a.refresh)
	route("POST /auth/logout", empty, a.logout)
	route("GET /auth/sessions", ok, a.listSessions)
	route("DELETE /auth/sessions/{session_id}", empty, a.revokeSession)
	route("GET /users/me", ok, a.me)
	route("PATCH /users/me/settings", ok, a.updateSettings)
	route("POST /auth/recovery/enable", ok, a.enableRecovery)
	route("POST /users/me/clear", empty, a.clearData)
	route("DELETE /users/me", empty, a.deleteAccount)
	route("POST /auth/recovery/begin", ok, a.recoveryBegin)
	route("POST /auth/recovery/finish", ok, a.recoveryFinish)
	route("GET /users/me/export", ok, a.export)

	// Galaksi dan pesan
	route("GET /constellations", ok, a.listGalaxies)
	route("POST /constellations", created, a.createGalaxy)
	route("GET /constellations/{galaxy_id}", ok, a.getGalaxy)
	route("PATCH /constellations/{galaxy_id}", ok, a.patchGalaxy)
	route("DELETE /constellations/{galaxy_id}", empty, a.deleteGalaxy)
	route("GET /constellations/{galaxy_id}/messages", ok, a.galaxyMessages)
	route("POST /messages", created, a.createMessage)
	route("GET /messages/{message_id}", ok, a.getMessage)
	route("PATCH /messages/{message_id}", ok, a.editMessage)
	route("DELETE /messages/{message_id}", empty, a.deleteMessage)

	// Workspace: bintang di sekitar Bima Sakti
	route("GET /workspaces/me", ok, a.myWorkspace)
	route("PATCH /workspaces/me", ok, a.updateWorkspace)
	route("GET /explore/workspaces", ok, a.exploreWorkspaces)
	route("GET /explore/workspaces/{workspace_id}", ok, a.workspaceDetail)
	route("GET /explore/workspaces/{workspace_id}/messages", ok, a.workspaceMessages)

	// Dashboard
	route("GET /dashboard/prayers-received", ok, a.prayersReceived)
	route("GET /dashboard/summary", ok, a.summary)
	route("GET /dashboard/messages", ok, a.myMessages)

	// Unggahan terenkripsi
	route("POST /uploads/presign", created, a.presignUpload)
	route("POST /uploads/{upload_id}/complete", ok, a.completeUpload)
	route("GET /uploads/{upload_id}", ok, a.downloadUpload)
	mux.HandleFunc("POST /api/v1/storage/upload", a.Storage.HandleUpload)
	mux.HandleFunc("GET /api/v1/storage/object", a.Storage.HandleDownload)

	// Sosial dan moderasi
	route("GET /explore/constellations", ok, a.exploreGalaxies)
	route("GET /explore/messages", ok, a.exploreMessages)
	route("GET /explore/constellations/{galaxy_id}/messages", ok, a.exploreGalaxyMessages)
	route("GET /explore", ok, a.explore)
	route("POST /messages/{message_id}/empathy", ok, a.empathy)
	route("POST /reports", created, a.report)
	route("POST /users/blocks", created, a.block)
	route("GET /users/blocks", ok, a.listBlocks)
	route("DELETE /users/blocks/{block_id}", empty, a.unblock)
	route("GET /admin/moderation/queue", ok, a.moderationQueue)
	route("POST /admin/moderation/{message_id}/decision", ok, a.decide)

	// Doa dan kurasi
	route("GET /prayers/traditions", ok, a.traditions)
	route("GET /prayers/audio/{identifier}", ok, a.originalRecording)
	route("GET /prayers/{tradition}/{prayer_id}/audio/preview", ok, a.publicPreview)
	route("GET /admin/prayers/{tradition}/{prayer_id}/audio/preview", ok, a.adminPreview)
	route("GET /admin/prayers", ok, a.adminCatalog)
	route("PUT /admin/prayers/{tradition}/{prayer_id}", ok, a.curate)
	route("POST /admin/prayers/{tradition}/{prayer_id}/audio/presign", ok, a.audioPresign)
	route("POST /admin/prayers/{tradition}/{prayer_id}/audio/complete", ok, a.audioComplete)
	route("POST /messages/{message_id}/prayers/start", ok, a.startPrayer)
	route("POST /messages/{message_id}/prayers", ok, a.finishPrayer)

	// Tautan terbatas
	route("POST /messages/{message_id}/share", ok, a.rotateShare)
	route("DELETE /messages/{message_id}/share", empty, a.revokeShare)
	route("GET /shared/{message_id}", ok, a.readShared)

	// Metrik
	route("GET /admin/metrics", ok, a.productMetrics)
	route("GET /admin/users", ok, a.registeredUsers)

	mux.HandleFunc("GET /metrics", a.metricsHandler())
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "Not Found"})
	})
	return a.privacy(a.observe(mux))
}

func cut(pattern string) (string, string, bool) {
	for i := 0; i < len(pattern); i++ {
		if pattern[i] == ' ' {
			return pattern[:i], pattern[i+1:], true
		}
	}
	return "", pattern, false
}

// privacy rejects cross-origin writes and oversized bodies, and marks every
// response as private and uncacheable.
func (a *App) privacy(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		limit := int64(maxRequestBytes)
		if r.URL.Path == "/api/v1/storage/upload" {
			limit = max(a.Conf.MaxUploadBytes, maxAudioBytes) + 1<<20
		}
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
		default:
			if origin, sent := r.Header["Origin"]; sent && (len(origin) != 1 || origin[0] != a.Conf.AppOrigin) {
				writeJSON(w, http.StatusForbidden, map[string]string{"detail": "Asal permintaan tidak diizinkan."})
				return
			}
		}
		if r.ContentLength > limit {
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"detail": "Permintaan terlalu besar."})
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, limit)
		headers := w.Header()
		headers.Set("Cache-Control", "no-store")
		headers.Set("X-Content-Type-Options", "nosniff")
		headers.Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}

// Serve runs the API and background worker until ctx is cancelled.
func (a *App) Serve(ctx context.Context) error {
	server := &http.Server{
		Addr:              a.Conf.ListenAddr,
		Handler:           a.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	go a.RunWorker(ctx)
	errs := make(chan error, 1)
	go func() { errs <- server.ListenAndServe() }()
	database := "sqlite:" + a.Conf.DatabasePath
	if a.DB.PG {
		database = "postgresql"
	}
	a.Log.Info("Untukmu API berjalan", "address", a.Conf.ListenAddr, "environment", a.Conf.Environment,
		"database", database)
	select {
	case err := <-errs:
		return err
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return server.Shutdown(shutdown)
	}
}
