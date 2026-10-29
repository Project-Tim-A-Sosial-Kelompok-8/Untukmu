package app

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/argon2"
)

func (a *App) digest(value string) string {
	mac := hmac.New(sha256.New, []byte(a.Conf.JWTSecret))
	mac.Write([]byte(value))
	return hex.EncodeToString(mac.Sum(nil))
}

func sha256Hex(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func randomToken() string {
	raw := make([]byte, 32)
	rand.Read(raw)
	return base64.RawURLEncoding.EncodeToString(raw)
}

func safeEqual(a, b string) bool { return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1 }

// clientIP trusts X-Forwarded-For only when the direct peer is a configured
// proxy (the Next.js server or Caddy), walking right-to-left past trusted hops.
func (a *App) clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if !a.trusted(host) {
		return host
	}
	hops := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
	for i := len(hops) - 1; i >= 0; i-- {
		hop := strings.TrimSpace(hops[i])
		if hop == "" {
			continue
		}
		if !a.trusted(hop) {
			return hop
		}
		host = hop
	}
	return host
}

func (a *App) trusted(address string) bool {
	ip := net.ParseIP(address)
	if ip == nil {
		return false
	}
	for _, network := range a.Conf.TrustedProxies {
		if network.Contains(ip) {
			return true
		}
	}
	return false
}

func (c *Ctx) ipKey() string { return c.A.digest(c.A.clientIP(c.R)) }

func (c *Ctx) secureRequest() bool {
	return c.A.Conf.Environment == "production" || c.R.TLS != nil ||
		(c.A.trustedPeer(c.R) && c.R.Header.Get("X-Forwarded-Proto") == "https")
}

func (a *App) trustedPeer(r *http.Request) bool {
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	return a.trusted(host)
}

// throttle applies a one-minute sliding window per scope and identity.
func (c *Ctx) throttle(scope string, limit int, identity string) error {
	subject := c.ipKey()
	if identity != "" {
		subject = c.A.digest(identity)
	}
	if !c.A.Memory.Allow("rate:"+scope+":"+subject, limit, time.Minute) {
		return &apiError{
			Status:  http.StatusTooManyRequests,
			Detail:  "Terlalu banyak permintaan. Coba satu menit lagi.",
			Headers: map[string]string{"Retry-After": "60"},
		}
	}
	return nil
}

func (c *Ctx) verifyOrigin() error {
	// Cookie-bearing requests require an explicit, exact trusted origin.
	if c.R.Header.Get("Origin") != c.A.Conf.AppOrigin {
		return fail(http.StatusForbidden, "Asal permintaan tidak diizinkan.")
	}
	return nil
}

func (c *Ctx) verifyTurnstile(token *string, action string) error {
	conf := c.A.Conf
	if conf.Environment != "production" && conf.TurnstileSecret == "" {
		return nil
	}
	if token == nil || *token == "" {
		return invalid("Verifikasi anti-bot diperlukan.")
	}
	verify := c.A.Turnstile
	if verify == nil {
		verify = c.A.siteverify
	}
	result, err := verify(c.ctx(), *token)
	if err != nil {
		return fail(http.StatusServiceUnavailable, "Verifikasi anti-bot belum tersedia.")
	}
	success, _ := result["success"].(bool)
	gotAction, _ := result["action"].(string)
	hostname, _ := result["hostname"].(string)
	if !success || gotAction != action || (conf.TurnstileHostname != "" && hostname != conf.TurnstileHostname) {
		return fail(http.StatusForbidden, "Verifikasi anti-bot gagal.")
	}
	return nil
}

var turnstileClient = &http.Client{Timeout: 10 * time.Second}

func (a *App) siteverify(ctx context.Context, token string) (map[string]any, error) {
	form := url.Values{"secret": {a.Conf.TurnstileSecret}, "response": {token}}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://challenges.cloudflare.com/turnstile/v0/siteverify", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := turnstileClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode >= 400 {
		return nil, fmt.Errorf("turnstile status %d", response.StatusCode)
	}
	var result map[string]any
	return result, json.NewDecoder(response.Body).Decode(&result)
}

// ---- Argon2id (PHC string format, compatible with argon2-cffi) ----

const (
	argonTime    = 3
	argonMemory  = 64 * 1024
	argonThreads = 1
	argonKeyLen  = 32
)

// Each hash needs 64 MiB; bound concurrency so bursts cannot exhaust memory.
var argonSlots = make(chan struct{}, 4)

func hashPassword(password string) string {
	argonSlots <- struct{}{}
	defer func() { <-argonSlots }()
	salt := make([]byte, 16)
	rand.Read(salt)
	key := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s", argon2.Version, argonMemory, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key))
}

func checkPassword(encoded, password string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false
	}
	var version int
	var memory, iterations uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return false
	}
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iterations, &threads); err != nil {
		return false
	}
	if memory > 1024*1024 || iterations > 16 || threads == 0 {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false
	}
	expected, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(expected) == 0 {
		return false
	}
	argonSlots <- struct{}{}
	defer func() { <-argonSlots }()
	actual := argon2.IDKey([]byte(password), salt, iterations, memory, threads, uint32(len(expected)))
	return subtle.ConstantTimeCompare(actual, expected) == 1
}

// ---- Tokens and sessions ----

type tokenClaims struct {
	Type      string `json:"type"`
	SessionID string `json:"sid"`
	jwt.RegisteredClaims
}

func (a *App) tokenFor(userID, sessionID, kind string, lifetime time.Duration) string {
	instant := time.Now()
	claims := tokenClaims{
		Type:      kind,
		SessionID: sessionID,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			ID:        uid(),
			IssuedAt:  jwt.NewNumericDate(instant),
			ExpiresAt: jwt.NewNumericDate(instant.Add(lifetime)),
			Issuer:    "untukmu",
			Audience:  jwt.ClaimStrings{"untukmu-web"},
		},
	}
	signed, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(a.Conf.JWTSecret))
	return signed
}

func (a *App) decodeToken(token, kind string) (*tokenClaims, error) {
	claims := &tokenClaims{}
	parsed, err := jwt.ParseWithClaims(token, claims, func(*jwt.Token) (any, error) {
		return []byte(a.Conf.JWTSecret), nil
	},
		jwt.WithValidMethods([]string{"HS256"}),
		jwt.WithIssuer("untukmu"),
		jwt.WithAudience("untukmu-web"),
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
	)
	if err != nil || !parsed.Valid || claims.Type != kind || claims.Subject == "" || claims.SessionID == "" ||
		claims.ID == "" || claims.IssuedAt == nil {
		return nil, fail(http.StatusUnauthorized, "Sesi tidak berlaku. Silakan masuk kembali.")
	}
	return claims, nil
}

func (c *Ctx) setRefreshCookie(token string) {
	http.SetCookie(c.W, &http.Cookie{
		Name:     "um_refresh",
		Value:    token,
		Path:     "/api/v1/auth",
		MaxAge:   c.A.Conf.RefreshDays * 86400,
		Expires:  time.Now().Add(time.Duration(c.A.Conf.RefreshDays) * 24 * time.Hour),
		HttpOnly: true,
		Secure:   c.A.Conf.Environment == "production",
		SameSite: http.SameSiteStrictMode,
	})
}

func (c *Ctx) deleteRefreshCookie() {
	http.SetCookie(c.W, &http.Cookie{
		Name:     "um_refresh",
		Value:    "",
		Path:     "/api/v1/auth",
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
		Secure:   c.secureRequest(),
		SameSite: http.SameSiteStrictMode,
	})
}

// credentials rotates the refresh token of session and returns a new access token.
func (c *Ctx) credentials(ctx context.Context, q querier, user *User, session *Session) (map[string]any, error) {
	conf := c.A.Conf
	refresh := c.A.tokenFor(user.ID, session.ID, "refresh", time.Duration(conf.RefreshDays)*24*time.Hour)
	instant := time.Now()
	_, err := q.ExecContext(ctx,
		"UPDATE sessions SET refresh_token_hash = ?, last_seen_at = ?, expires_at = ? WHERE id = ?",
		c.A.digest(refresh), ts(instant), ts(instant.Add(time.Duration(conf.RefreshDays)*24*time.Hour)), session.ID)
	if err != nil {
		return nil, err
	}
	c.setRefreshCookie(refresh)
	return map[string]any{
		"access_token": c.A.tokenFor(user.ID, session.ID, "access", time.Duration(conf.AccessMinutes)*time.Minute),
		"token_type":   "bearer",
		"expires_in":   conf.AccessMinutes * 60,
	}, nil
}

func (c *Ctx) newSession(ctx context.Context, q querier, user *User) (map[string]any, error) {
	agent := []rune(c.R.Header.Get("User-Agent"))
	if len(agent) > 400 {
		agent = agent[:400]
	}
	instant := now()
	session := &Session{ID: uid(), UserID: user.ID}
	_, err := q.ExecContext(ctx, `INSERT INTO sessions (id, user_id, refresh_token_hash, user_agent, ip_hash,
		created_at, last_seen_at, expires_at) VALUES (?, ?, '', ?, ?, ?, ?, ?)`,
		session.ID, user.ID, string(agent), c.ipKey(), instant, instant,
		ts(time.Now().Add(time.Duration(c.A.Conf.RefreshDays)*24*time.Hour)))
	if err != nil {
		return nil, err
	}
	return c.credentials(ctx, q, user, session)
}

func bearerToken(r *http.Request) (string, bool) {
	scheme, token, found := strings.Cut(r.Header.Get("Authorization"), " ")
	if !found || !strings.EqualFold(scheme, "bearer") || strings.TrimSpace(token) == "" {
		return "", false
	}
	return strings.TrimSpace(token), true
}

func (c *Ctx) currentUser() (*User, error) {
	if c.userLoaded {
		return c.user, nil
	}
	token, ok := bearerToken(c.R)
	if !ok {
		return nil, fail(http.StatusUnauthorized, "Silakan masuk terlebih dahulu.")
	}
	claims, err := c.A.decodeToken(token, "access")
	if err != nil {
		return nil, err
	}
	live, err := exists(c.ctx(), c.A.DB,
		"SELECT 1 FROM sessions WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > ?",
		claims.SessionID, claims.Subject, now())
	if err != nil {
		return nil, err
	}
	if !live {
		return nil, fail(http.StatusUnauthorized, "Sesi sudah berakhir.")
	}
	user, err := getUser(c.ctx(), c.A.DB, "id = ?", claims.Subject)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, fail(http.StatusUnauthorized, "Akun tidak ditemukan.")
	}
	c.user, c.userLoaded = user, true
	return user, nil
}

// optionalUser returns nil for guests but rejects an invalid bearer token.
func (c *Ctx) optionalUser() (*User, error) {
	if _, ok := bearerToken(c.R); !ok {
		return nil, nil
	}
	return c.currentUser()
}

func (c *Ctx) adminUser() (*User, error) {
	user, err := c.currentUser()
	if err != nil {
		return nil, err
	}
	if user.Role != "admin" {
		return nil, fail(http.StatusForbidden, "Akses administrator diperlukan.")
	}
	return user, nil
}

func (c *Ctx) visitorIdentity(user *User) string {
	if user != nil {
		return c.A.digest("user:" + user.ID)
	}
	return c.A.digest("visitor:" + c.ipKey())
}

func userID(user *User) any {
	if user == nil {
		return nil
	}
	return user.ID
}

func sameUser(user *User, id sql.NullString) bool {
	return user != nil && id.Valid && id.String == user.ID
}
