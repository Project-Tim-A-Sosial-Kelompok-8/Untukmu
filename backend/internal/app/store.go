package app

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/stdlib"
	"modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"
)

// Store runs the same SQL on SQLite (local development and tests) and on
// PostgreSQL (Neon in production). Queries are written with `?` placeholders
// and rewritten to `$n` for PostgreSQL.
type Store struct {
	db *sql.DB
	PG bool
}

// Tx is a transaction on a Store.
type Tx struct {
	tx *sql.Tx
	pg bool
}

func isPostgresURL(value string) bool {
	return strings.HasPrefix(value, "postgres://") || strings.HasPrefix(value, "postgresql://") ||
		strings.HasPrefix(value, "postgresql+asyncpg://")
}

// testSchema confines a test run to its own schema. Neon ignores the
// search_path startup parameter, so it is set on every new connection.
var testSchema string

func openPostgres(url string) (*sql.DB, error) {
	url = strings.Replace(url, "postgresql+asyncpg://", "postgresql://", 1)
	config, err := pgx.ParseConfig(url)
	if err != nil {
		return nil, errors.New("DATABASE_URL PostgreSQL tidak valid")
	}
	// Neon's pooler (PgBouncer, transaction mode) does not keep named prepared
	// statements across transactions, so every query uses an unnamed statement.
	config.DefaultQueryExecMode = pgx.QueryExecModeExec
	var options []stdlib.OptionOpenDB
	if testSchema != "" {
		schema := testSchema
		options = append(options, stdlib.OptionAfterConnect(func(ctx context.Context, conn *pgx.Conn) error {
			_, err := conn.Exec(ctx, "SET search_path TO "+schema)
			return err
		}))
	}
	db := stdlib.OpenDB(*config, options...)
	db.SetMaxOpenConns(10)
	return db, nil
}

func rebind(query string) string {
	var out strings.Builder
	n := 0
	for _, r := range query {
		if r == '?' {
			n++
			out.WriteString("$" + strconv.Itoa(n))
			continue
		}
		out.WriteRune(r)
	}
	return out.String()
}

func (s *Store) q(query string) string {
	if s.PG {
		return rebind(query)
	}
	return query
}

func (s *Store) ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error) {
	return s.db.ExecContext(ctx, s.q(query), args...)
}

func (s *Store) QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	return s.db.QueryContext(ctx, s.q(query), args...)
}

func (s *Store) QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row {
	return s.db.QueryRowContext(ctx, s.q(query), args...)
}

func (s *Store) Exec(query string, args ...any) (sql.Result, error) {
	return s.ExecContext(context.Background(), query, args...)
}

func (s *Store) QueryRow(query string, args ...any) *sql.Row {
	return s.QueryRowContext(context.Background(), query, args...)
}

func (s *Store) PingContext(ctx context.Context) error { return s.db.PingContext(ctx) }

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) BeginTx(ctx context.Context) (*Tx, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	return &Tx{tx: tx, pg: s.PG}, nil
}

func (t *Tx) q(query string) string {
	if t.pg {
		return rebind(query)
	}
	return query
}

func (t *Tx) ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error) {
	return t.tx.ExecContext(ctx, t.q(query), args...)
}

func (t *Tx) QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	return t.tx.QueryContext(ctx, t.q(query), args...)
}

func (t *Tx) QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row {
	return t.tx.QueryRowContext(ctx, t.q(query), args...)
}

func (t *Tx) Commit() error { return t.tx.Commit() }

func (t *Tx) Rollback() error { return t.tx.Rollback() }

// lock adds a row lock on PostgreSQL; SQLite transactions already hold the
// database write lock from their first statement.
func (s *Store) lock() string {
	if s.PG {
		return " FOR UPDATE"
	}
	return ""
}

// flag stores booleans as 0/1 integers on both databases.
func flag(value bool) int {
	if value {
		return 1
	}
	return 0
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	var sqliteErr *sqlite.Error
	if errors.As(err, &sqliteErr) {
		code := sqliteErr.Code()
		return code == sqlite3.SQLITE_CONSTRAINT_UNIQUE || code == sqlite3.SQLITE_CONSTRAINT_PRIMARYKEY
	}
	return false
}

func isConstraintViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return strings.HasPrefix(pgErr.Code, "23")
	}
	var sqliteErr *sqlite.Error
	if errors.As(err, &sqliteErr) {
		return sqliteErr.Code()&0xff == sqlite3.SQLITE_CONSTRAINT
	}
	return false
}
