package app

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"
)

// Workspaces: every account owns one. In the hub view each workspace is a star
// around the Milky Way; inside it live the owner's galaxies. Others may enter a
// workspace only when its owner made it public, and even then they see only
// galaxy shapes, names and approved public messages — never private content,
// photos or attachments.

type Workspace struct {
	ID         string
	OwnerID    string
	Name       string
	Visibility string
	CreatedAt  string
}

const workspaceColumns = "workspaces.id, workspaces.owner_id, workspaces.name, workspaces.visibility, workspaces.created_at"

func scanWorkspace(row interface{ Scan(...any) error }, extra ...any) (*Workspace, error) {
	var w Workspace
	if err := row.Scan(append([]any{&w.ID, &w.OwnerID, &w.Name, &w.Visibility, &w.CreatedAt}, extra...)...); err != nil {
		return nil, err
	}
	return &w, nil
}

func workspaceName(displayName string) string {
	name := strings.TrimSpace(displayName)
	if name == "" || name == "Anonim" {
		return "Ruang tanpa nama"
	}
	return "Ruang " + name
}

func createWorkspace(ctx context.Context, q querier, ownerID, displayName string, public bool) error {
	visibility := "private"
	if public {
		visibility = "public"
	}
	instant := now()
	_, err := q.ExecContext(ctx, `INSERT INTO workspaces (id, owner_id, name, visibility, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (owner_id) DO NOTHING`,
		uid(), ownerID, workspaceName(displayName), visibility, instant, instant)
	return err
}

// createFirstGalaxy gives a new account a galaxy to write into right away.
func createFirstGalaxy(ctx context.Context, q querier, ownerID string) error {
	_, err := q.ExecContext(ctx, `INSERT INTO constellations (id, owner_id, target_kind, target_label, custom_category,
		visual_type, visual_ref, kind, color, radius, particle_count, created_at)
		VALUES (?, ?, 'diri_sendiri', 'Galaksi pertamaku', NULL, 'light_symbol', NULL, 'spiral', '#ffd9a0', 140, 8500, ?)`,
		uid(), ownerID, now())
	return err
}

func getWorkspace(ctx context.Context, q querier, where string, args ...any) (*Workspace, error) {
	row, err := scanWorkspace(q.QueryRowContext(ctx, "SELECT "+workspaceColumns+" FROM workspaces WHERE "+where, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return row, err
}

// workspaceCounts returns galaxy and visible public message counts per owner.
func (a *App) workspaceCounts(ctx context.Context, owners []string, user *User) (map[string][2]int, error) {
	result := map[string][2]int{}
	if len(owners) == 0 {
		return result, nil
	}
	rows, err := a.DB.QueryContext(ctx, `SELECT owner_id, COUNT(*) FROM constellations
		WHERE owner_id IN (`+placeholders(len(owners))+`) GROUP BY owner_id`, anySlice(owners)...)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var owner string
		var n int
		if err := rows.Scan(&owner, &n); err != nil {
			rows.Close()
			return nil, err
		}
		counts := result[owner]
		counts[0] = n
		result[owner] = counts
	}
	rows.Close()
	filter, args := visibleFilter(user)
	rows, err = a.DB.QueryContext(ctx, `SELECT messages.author_id, COUNT(*) FROM messages
		WHERE messages.author_id IN (`+placeholders(len(owners))+`) AND `+filter+` GROUP BY messages.author_id`,
		append(anySlice(owners), args...)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var owner string
		var n int
		if err := rows.Scan(&owner, &n); err != nil {
			return nil, err
		}
		counts := result[owner]
		counts[1] = n
		result[owner] = counts
	}
	return result, rows.Err()
}

func workspaceView(w *Workspace, user *User, counts [2]int) map[string]any {
	mine := user != nil && user.ID == w.OwnerID
	if !mine && w.Visibility != "public" {
		// A locked star: its existence is visible, nothing about it is.
		return map[string]any{"id": w.ID, "is_mine": false, "locked": true, "visibility": "private",
			"name": nil, "constellation_count": nil, "public_message_count": nil, "created_at": w.CreatedAt}
	}
	return map[string]any{
		"id": w.ID, "is_mine": mine, "locked": false, "visibility": w.Visibility, "name": w.Name,
		"constellation_count": counts[0], "public_message_count": counts[1], "created_at": w.CreatedAt,
	}
}

func (a *App) myWorkspace(c *Ctx) (any, error) {
	user, err := c.currentUser()
	if err != nil {
		return nil, err
	}
	w, err := a.ensureWorkspace(c.ctx(), user)
	if err != nil {
		return nil, err
	}
	counts, err := a.workspaceCounts(c.ctx(), []string{user.ID}, user)
	if err != nil {
		return nil, err
	}
	return workspaceView(w, user, counts[user.ID]), nil
}

func (a *App) ensureWorkspace(ctx context.Context, user *User) (*Workspace, error) {
	if err := createWorkspace(ctx, a.DB, user.ID, user.DisplayName, user.ProfileVisibility == "public"); err != nil {
		return nil, err
	}
	return getWorkspace(ctx, a.DB, "owner_id = ?", user.ID)
}

type workspaceInput struct {
	Name       *string `json:"name"`
	Visibility *string `json:"visibility"`
}

func (b *workspaceInput) validate() error {
	var v validation
	if b.Name != nil {
		checkLength(&v, strings.TrimSpace(*b.Name), 1, 60, "name")
	}
	if b.Visibility != nil && !oneOf(*b.Visibility, "private", "public") {
		v.add("Visibilitas wajib private atau public.", "visibility")
	}
	return v.err()
}

func (a *App) updateWorkspace(c *Ctx) (any, error) {
	var body workspaceInput
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
	w, err := a.ensureWorkspace(c.ctx(), user)
	if err != nil {
		return nil, err
	}
	if body.Name != nil {
		w.Name = strings.TrimSpace(*body.Name)
	}
	if body.Visibility != nil {
		w.Visibility = *body.Visibility
	}
	err = a.tx(c.ctx(), func(tx *Tx) error {
		if _, err := tx.ExecContext(c.ctx(), "UPDATE workspaces SET name = ?, visibility = ?, updated_at = ? WHERE id = ?",
			w.Name, w.Visibility, now(), w.ID); err != nil {
			return err
		}
		// The account setting "profil publik" and the workspace stay one choice.
		_, err := tx.ExecContext(c.ctx(), "UPDATE users SET profile_visibility = ?, updated_at = ? WHERE id = ?",
			w.Visibility, now(), user.ID)
		return err
	})
	if err != nil {
		return nil, err
	}
	a.invalidate(user.ID)
	counts, err := a.workspaceCounts(c.ctx(), []string{user.ID}, user)
	if err != nil {
		return nil, err
	}
	return workspaceView(w, user, counts[user.ID]), nil
}

func (a *App) exploreWorkspaces(c *Ctx) (any, error) {
	user, err := c.optionalUser()
	if err != nil {
		return nil, err
	}
	offset, limit, err := paging(c, 300, 500, 100000)
	if err != nil {
		return nil, err
	}
	if user != nil {
		if _, err := a.ensureWorkspace(c.ctx(), user); err != nil {
			return nil, err
		}
	}
	rows, err := a.DB.QueryContext(c.ctx(), "SELECT "+workspaceColumns+
		" FROM workspaces ORDER BY workspaces.created_at, workspaces.id LIMIT ? OFFSET ?", limit, offset)
	if err != nil {
		return nil, err
	}
	var list []*Workspace
	var visible []string
	for rows.Next() {
		w, err := scanWorkspace(rows)
		if err != nil {
			rows.Close()
			return nil, err
		}
		list = append(list, w)
		if w.Visibility == "public" || (user != nil && user.ID == w.OwnerID) {
			visible = append(visible, w.OwnerID)
		}
	}
	rows.Close()
	counts, err := a.workspaceCounts(c.ctx(), visible, user)
	if err != nil {
		return nil, err
	}
	result := []map[string]any{}
	for _, w := range list {
		result = append(result, workspaceView(w, user, counts[w.OwnerID]))
	}
	return result, nil
}

// enterableWorkspace returns a workspace the viewer may enter: their own, or a public one.
func (a *App) enterableWorkspace(c *Ctx, user *User) (*Workspace, error) {
	identifier, err := pathUUID(c, "workspace_id")
	if err != nil {
		return nil, err
	}
	w, err := getWorkspace(c.ctx(), a.DB, "id = ?", identifier)
	if err != nil {
		return nil, err
	}
	if w == nil || (w.Visibility != "public" && (user == nil || user.ID != w.OwnerID)) {
		return nil, fail(http.StatusNotFound, "Ruang tidak ditemukan atau masih privat.")
	}
	return w, nil
}

func (a *App) workspaceDetail(c *Ctx) (any, error) {
	user, err := c.optionalUser()
	if err != nil {
		return nil, err
	}
	w, err := a.enterableWorkspace(c, user)
	if err != nil {
		return nil, err
	}
	galaxies, err := queryGalaxies(c.ctx(), a.DB, "SELECT "+constellationColumns+
		" FROM constellations WHERE owner_id = ? ORDER BY created_at, id", w.OwnerID)
	if err != nil {
		return nil, err
	}
	mine := user != nil && user.ID == w.OwnerID
	filter, args := visibleFilter(user)
	publicCounts := map[string]int{}
	rows, err := a.DB.QueryContext(c.ctx(), `SELECT message_constellations.constellation_id, COUNT(*) FROM messages
		JOIN message_constellations ON message_constellations.message_id = messages.id
		JOIN constellations ON constellations.id = message_constellations.constellation_id
		WHERE constellations.owner_id = ? AND `+filter+` GROUP BY message_constellations.constellation_id`,
		append([]any{w.OwnerID}, args...)...)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var id string
		var n int
		if err := rows.Scan(&id, &n); err != nil {
			rows.Close()
			return nil, err
		}
		publicCounts[id] = n
	}
	rows.Close()
	views := []map[string]any{}
	total := 0
	for _, g := range galaxies {
		view := galaxyView(g)
		view["is_mine"] = mine
		view["public_message_count"] = publicCounts[g.ID]
		total += publicCounts[g.ID]
		if !mine {
			// Photos are encrypted for the owner; categories stay private.
			view["visual_type"], view["visual_ref"], view["custom_category"] = "light_symbol", nil, nil
		}
		views = append(views, view)
	}
	result := workspaceView(w, user, [2]int{len(galaxies), total})
	result["constellations"] = views
	return result, nil
}

func (a *App) workspaceMessages(c *Ctx) (any, error) {
	user, err := c.optionalUser()
	if err != nil {
		return nil, err
	}
	w, err := a.enterableWorkspace(c, user)
	if err != nil {
		return nil, err
	}
	offset, limit, err := paging(c, 200, 500, 100000)
	if err != nil {
		return nil, err
	}
	filter, args := visibleFilter(user)
	query := "SELECT " + messageColumns + " FROM messages WHERE messages.author_id = ? AND " + filter
	params := append([]any{w.OwnerID}, args...)
	if galaxy := c.R.URL.Query().Get("constellation_id"); galaxy != "" {
		parsed, ok := parseUUID(galaxy)
		if !ok {
			return nil, invalidParam("query", "constellation_id", "UUID tidak valid.")
		}
		query += ` AND EXISTS (SELECT 1 FROM message_constellations WHERE message_constellations.message_id = messages.id
			AND message_constellations.constellation_id = ?)`
		params = append(params, parsed)
	}
	rows, err := queryMessages(c.ctx(), a.DB, query+" ORDER BY messages.created_at, messages.id LIMIT ? OFFSET ?",
		append(params, limit, offset)...)
	if err != nil {
		return nil, err
	}
	return a.publicMessageViews(c.ctx(), rows, user)
}
