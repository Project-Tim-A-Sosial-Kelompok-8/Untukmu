package app

import (
	"bufio"
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Config mirrors the environment variables documented in .env.example.
type Config struct {
	Environment       string
	AppOrigin         string
	JWTSecret         string
	PublicContentKey  string
	AccessMinutes     int
	RefreshDays       int
	TurnstileSecret   string
	TurnstileHostname string
	MaxUploadBytes    int64
	SentryDSN         string
	MetricsToken      string
	DatabaseURL       string
	DatabasePath      string
	StorageDir        string
	ListenAddr        string
	TrustedProxies    []*net.IPNet
}

// LoadEnvFile reads KEY=VALUE pairs without overriding variables already set.
// The first existing path wins, so backend/.env may shadow the project .env.
func LoadEnvFile(paths ...string) {
	for _, path := range paths {
		file, err := os.Open(path)
		if err != nil {
			continue
		}
		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			key, value, found := strings.Cut(line, "=")
			if !found {
				continue
			}
			key = strings.TrimSpace(strings.TrimPrefix(key, "export "))
			value = strings.TrimSpace(value)
			if len(value) >= 2 && (value[0] == '"' || value[0] == '\'') && value[len(value)-1] == value[0] {
				value = value[1 : len(value)-1]
			}
			if _, exists := os.LookupEnv(key); !exists {
				os.Setenv(key, value)
			}
		}
		file.Close()
		return
	}
}

func env(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok && value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) (int, error) {
	value := env(key, "")
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("%s wajib berupa angka", key)
	}
	return parsed, nil
}

// defaultListenAddr follows the PORT variable injected by Vercel (and most
// container hosts) while keeping the local development default unchanged.
func defaultListenAddr() string {
	if port := os.Getenv("PORT"); port != "" {
		return "0.0.0.0:" + port
	}
	return "127.0.0.1:8000"
}

func LoadConfig() (*Config, error) {
	conf := &Config{
		Environment:       env("ENVIRONMENT", "development"),
		AppOrigin:         env("APP_ORIGIN", "http://localhost:3000"),
		JWTSecret:         env("JWT_SECRET", ""),
		PublicContentKey:  env("CONTENT_ENCRYPTION_KEY", env("PUBLIC_CONTENT_KEY", "")),
		TurnstileSecret:   env("TURNSTILE_SECRET", ""),
		TurnstileHostname: env("TURNSTILE_HOSTNAME", ""),
		SentryDSN:         env("SENTRY_DSN", ""),
		MetricsToken:      env("METRICS_TOKEN", ""),
		DatabaseURL:       env("DATABASE_URL", ""),
		DatabasePath:      env("DATABASE_PATH", filepath.Join("var", "untukmu.db")),
		StorageDir:        env("STORAGE_DIR", filepath.Join("var", "storage")),
		ListenAddr:        env("LISTEN_ADDR", defaultListenAddr()),
	}
	var err error
	if conf.AccessMinutes, err = envInt("ACCESS_MINUTES", 10); err != nil {
		return nil, err
	}
	if conf.RefreshDays, err = envInt("REFRESH_DAYS", 30); err != nil {
		return nil, err
	}
	maxUpload, err := envInt("MAX_UPLOAD_BYTES", 10*1024*1024)
	if err != nil {
		return nil, err
	}
	conf.MaxUploadBytes = int64(maxUpload)
	for _, item := range strings.Split(env("TRUSTED_PROXIES", "127.0.0.1/8,::1/128"), ",") {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if !strings.Contains(item, "/") {
			if strings.Contains(item, ":") {
				item += "/128"
			} else {
				item += "/32"
			}
		}
		_, network, err := net.ParseCIDR(item)
		if err != nil {
			return nil, fmt.Errorf("TRUSTED_PROXIES tidak valid: %s", item)
		}
		conf.TrustedProxies = append(conf.TrustedProxies, network)
	}
	return conf, conf.validate()
}

func (conf *Config) validate() error {
	switch conf.Environment {
	case "development", "test", "production":
	default:
		return errors.New("ENVIRONMENT wajib development, test, atau production")
	}
	if conf.MetricsToken != "" && len(conf.MetricsToken) < 32 {
		return errors.New("METRICS_TOKEN wajib minimal 32 karakter")
	}
	if len(conf.JWTSecret) < 32 {
		return errors.New("JWT_SECRET wajib acak dan minimal 32 karakter")
	}
	if conf.Environment == "production" {
		if !strings.HasPrefix(conf.AppOrigin, "https://") {
			return errors.New("APP_ORIGIN produksi wajib HTTPS")
		}
		if conf.TurnstileSecret == "" || conf.TurnstileHostname == "" {
			return errors.New("Turnstile wajib dikonfigurasi pada produksi")
		}
		if conf.PublicContentKey == "" {
			return errors.New("CONTENT_ENCRYPTION_KEY wajib disetel pada produksi")
		}
	}
	if conf.DatabaseURL != "" && !isPostgresURL(conf.DatabaseURL) {
		return errors.New("DATABASE_URL wajib berupa URL PostgreSQL (postgresql://...)")
	}
	if conf.PublicContentKey != "" {
		raw, err := base64.URLEncoding.DecodeString(conf.PublicContentKey)
		if err != nil || len(raw) != 32 {
			return errors.New("CONTENT_ENCRYPTION_KEY wajib 32 byte base64url")
		}
	}
	return nil
}
