package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"
)

// App holds the shared dependencies of every handler.
type App struct {
	Conf    *Config
	DB      *Store
	Memory  *Memory
	Storage *Storage
	Log     *slog.Logger
	// Turnstile can be replaced in tests.
	Turnstile func(ctx context.Context, token string) (map[string]any, error)
}

// apiError renders as FastAPI-compatible {"detail": ...}.
type apiError struct {
	Status  int
	Detail  any
	Headers map[string]string
}

func (e *apiError) Error() string { return fmt.Sprint(e.Detail) }

func fail(status int, message string) error { return &apiError{Status: status, Detail: message} }

// Ctx is the per-request state passed to handlers.
type Ctx struct {
	A          *App
	W          http.ResponseWriter
	R          *http.Request
	user       *User
	userLoaded bool
}

func (c *Ctx) ctx() context.Context { return c.R.Context() }

// handled is returned by handlers that wrote their own response.
type handledResponse struct{}

var handled = handledResponse{}

type Handler func(c *Ctx) (any, error)

func writeJSON(w http.ResponseWriter, status int, value any) {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write(buffer.Bytes())
}

func (a *App) wrap(status int, handler Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c := &Ctx{A: a, W: w, R: r}
		value, err := handler(c)
		if err != nil {
			a.writeError(w, r, err)
			return
		}
		if _, ok := value.(handledResponse); ok {
			return
		}
		if status == http.StatusNoContent {
			w.WriteHeader(status)
			return
		}
		writeJSON(w, status, value)
	}
}

func (a *App) writeError(w http.ResponseWriter, r *http.Request, err error) {
	var api *apiError
	if errors.As(err, &api) {
		for key, value := range api.Headers {
			w.Header().Set(key, value)
		}
		writeJSON(w, api.Status, map[string]any{"detail": api.Detail})
		return
	}
	// Never log request bodies or message data; the error type is enough.
	a.Log.Error("request failed", "method", r.Method, "route", r.Pattern, "error_type", fmt.Sprintf("%T", err))
	reportError(err)
	writeJSON(w, http.StatusInternalServerError, map[string]any{"detail": "Terjadi kesalahan pada server."})
}

// ---- Validation ----

type fieldError struct {
	Loc  []any  `json:"loc"`
	Msg  string `json:"msg"`
	Type string `json:"type"`
}

type validation []fieldError

func (v *validation) add(message string, loc ...any) {
	*v = append(*v, fieldError{Loc: append([]any{"body"}, loc...), Msg: message, Type: "value_error"})
}

func (v *validation) check(ok bool, message string, loc ...any) {
	if !ok {
		v.add(message, loc...)
	}
}

func (v validation) err() error {
	if len(v) == 0 {
		return nil
	}
	return &apiError{Status: http.StatusUnprocessableEntity, Detail: []fieldError(v)}
}

func invalid(message string, loc ...any) error {
	var v validation
	v.add(message, loc...)
	return v.err()
}

func invalidParam(kind, name, message string) error {
	return &apiError{Status: http.StatusUnprocessableEntity, Detail: []fieldError{{
		Loc: []any{kind, name}, Msg: message, Type: "value_error",
	}}}
}

// decode reads a strict JSON object: unknown fields are rejected and
// submitted values are never echoed in the error.
func decode(c *Ctx, target any) error {
	body, err := io.ReadAll(io.LimitReader(c.R.Body, maxRequestBytes+1))
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) || len(body) > maxRequestBytes {
		return fail(http.StatusRequestEntityTooLarge, "Permintaan terlalu besar.")
	}
	if err != nil {
		return invalid("Isi permintaan tidak terbaca.")
	}
	if len(bytes.TrimSpace(body)) == 0 {
		return invalid("Isi permintaan wajib diisi.")
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		var typeErr *json.UnmarshalTypeError
		switch {
		case errors.As(err, &typeErr):
			return invalid("Tipe nilai tidak valid.", splitLoc(strings.Split(typeErr.Field, "."))...)
		case strings.HasPrefix(err.Error(), "json: unknown field "):
			field := strings.Trim(strings.TrimPrefix(err.Error(), "json: unknown field "), `"`)
			return invalid("Kolom tambahan tidak diizinkan.", field)
		default:
			return invalid("JSON tidak valid.")
		}
	}
	if decoder.More() {
		return invalid("JSON tidak valid.")
	}
	return nil
}

func splitLoc(parts []string) []any {
	result := make([]any, len(parts))
	for i, part := range parts {
		result[i] = part
	}
	return result
}

// pathUUID parses a UUID path parameter into its canonical lowercase form.
func pathUUID(c *Ctx, name string) (string, error) {
	parsed, err := uuid.Parse(c.R.PathValue(name))
	if err != nil {
		return "", invalidParam("path", name, "UUID tidak valid.")
	}
	return parsed.String(), nil
}

func parseUUID(value string) (string, bool) {
	parsed, err := uuid.Parse(value)
	if err != nil {
		return "", false
	}
	return parsed.String(), true
}

func queryInt(c *Ctx, name string, fallback, minimum, maximum int) (int, error) {
	raw := c.R.URL.Query().Get(name)
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, invalidParam("query", name, "Nilai wajib berupa bilangan bulat.")
	}
	if value < minimum || value > maximum {
		return 0, invalidParam("query", name, fmt.Sprintf("Nilai wajib antara %d dan %d.", minimum, maximum))
	}
	return value, nil
}

func queryString(c *Ctx, name string, maxLength int) (string, error) {
	value := c.R.URL.Query().Get(name)
	if len([]rune(value)) > maxLength {
		return "", invalidParam("query", name, fmt.Sprintf("Maksimal %d karakter.", maxLength))
	}
	return value, nil
}

// ---- Transactions ----

func (a *App) tx(ctx context.Context, work func(tx *Tx) error) error {
	tx, err := a.DB.BeginTx(ctx)
	if err != nil {
		return err
	}
	if err := work(tx); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}

func exists(ctx context.Context, q querier, query string, args ...any) (bool, error) {
	var found bool
	err := q.QueryRowContext(ctx, "SELECT EXISTS ("+query+")", args...).Scan(&found)
	return found, err
}

func count(ctx context.Context, q querier, query string, args ...any) (int, error) {
	var total int
	err := q.QueryRowContext(ctx, query, args...).Scan(&total)
	return total, err
}
