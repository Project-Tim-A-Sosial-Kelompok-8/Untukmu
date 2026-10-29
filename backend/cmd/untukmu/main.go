// Command untukmu runs the Untukmu API and its operator tasks.
//
//	untukmu [serve]          menjalankan API dan worker latar
//	untukmu make-admin EMAIL memberi peran administrator
//	untukmu init-env         membuat .env dengan rahasia acak
//	untukmu seed-demo [hapus] mengisi/menghapus 50 ruang demo (49 publik, 1 privat)
package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/Project-Tim-A-Sosial-Kelompok-8/Untukmu/backend/internal/app"
)

func main() {
	command := "serve"
	if len(os.Args) > 1 {
		command = os.Args[1]
	}
	var err error
	switch command {
	case "serve":
		err = serve()
	case "make-admin":
		if len(os.Args) != 3 {
			err = errors.New("Pemakaian: untukmu make-admin EMAIL")
			break
		}
		err = makeAdmin(os.Args[2])
	case "init-env":
		err = initEnv()
	case "seed-demo":
		err = seedDemo(len(os.Args) > 2 && os.Args[2] == "hapus")
	default:
		err = fmt.Errorf("perintah tidak dikenal: %s (serve, make-admin, init-env, seed-demo)", command)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func load() (*app.Config, error) {
	app.LoadEnvFile(".env", filepath.Join("..", ".env"))
	return app.LoadConfig()
}

func serve() error {
	conf, err := load()
	if err != nil {
		return err
	}
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	if err := app.ConfigureSentry(conf); err != nil {
		logger.Warn("Sentry tidak aktif", "error", err)
	}
	api, err := app.New(conf, logger)
	if err != nil {
		return err
	}
	defer api.Close()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	return api.Serve(ctx)
}

func makeAdmin(email string) error {
	conf, err := load()
	if err != nil {
		return err
	}
	db, err := app.OpenStore(conf)
	if err != nil {
		return err
	}
	defer db.Close()
	result, err := db.Exec("UPDATE users SET role = 'admin' WHERE email = ?", strings.ToLower(strings.TrimSpace(email)))
	if err != nil {
		return err
	}
	if changed, _ := result.RowsAffected(); changed != 1 {
		return errors.New("Akun belum terdaftar. Buat akun di aplikasi terlebih dahulu.")
	}
	fmt.Println("Peran administrator berhasil diberikan.")
	return nil
}

func seedDemo(remove bool) error {
	conf, err := load()
	if err != nil {
		return err
	}
	api, err := app.New(conf, slog.New(slog.NewTextHandler(os.Stderr, nil)))
	if err != nil {
		return err
	}
	defer api.Close()
	n, err := api.SeedDemo(context.Background(), 50, 1, remove)
	if err != nil {
		return err
	}
	if remove {
		fmt.Println(n, "akun demo dihapus.")
	} else {
		fmt.Println(n, "akun demo dibuat (49 ruang publik, 1 privat; akun yang sudah ada dilewati).")
	}
	return nil
}

func randomHex(size int) string {
	raw := make([]byte, size)
	rand.Read(raw)
	return hex.EncodeToString(raw)
}

// initEnv creates local secrets without overwriting an existing environment file.
func initEnv() error {
	root := "."
	if _, err := os.Stat(".env.example"); err != nil {
		root = ".."
	}
	template, err := os.ReadFile(filepath.Join(root, ".env.example"))
	if err != nil {
		return errors.New("Jalankan dari akar proyek atau folder backend: .env.example tidak ditemukan.")
	}
	target := filepath.Join(root, ".env")
	if _, err := os.Stat(target); err == nil {
		return errors.New(".env sudah ada; tidak diubah.")
	}
	key := make([]byte, 32)
	rand.Read(key)
	values := map[string]string{
		"JWT_SECRET":             randomHex(48),
		"CONTENT_ENCRYPTION_KEY": base64.URLEncoding.EncodeToString(key),
		"METRICS_TOKEN":          randomHex(32),
	}
	lines := strings.Split(strings.ReplaceAll(string(template), "\r\n", "\n"), "\n")
	for i, line := range lines {
		name, _, _ := strings.Cut(line, "=")
		if value, ok := values[name]; ok && !strings.HasPrefix(line, "#") {
			lines[i] = name + "=" + value
		}
	}
	if err := os.WriteFile(target, []byte(strings.TrimRight(strings.Join(lines, "\n"), "\n")+"\n"), 0o600); err != nil {
		return err
	}
	fmt.Println(".env lokal berhasil dibuat. Jangan masukkan ke repositori.")
	return nil
}
