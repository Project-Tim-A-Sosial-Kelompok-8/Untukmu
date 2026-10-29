// Command api is the entrypoint used by Vercel's Go runtime.
//
// It serves the same API as `untukmu serve`; the operator subcommands
// (make-admin, init-env, seed-demo) stay in cmd/untukmu so the serverless
// entrypoint remains small and predictable.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/Project-Tim-A-Sosial-Kelompok-8/Untukmu/backend/internal/app"
)

func main() {
	app.LoadEnvFile(".env", filepath.Join("..", ".env"))
	conf, err := app.LoadConfig()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	if err := app.ConfigureSentry(conf); err != nil {
		logger.Warn("Sentry tidak aktif", "error", err)
	}
	api, err := app.New(conf, logger)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer api.Close()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := api.Serve(ctx); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
