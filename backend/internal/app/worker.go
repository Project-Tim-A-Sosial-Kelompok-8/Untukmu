package app

import (
	"context"
	"time"
)

// Durable public-only initial checks and storage cleanup, run inside the API process.

// automaticBacklog lists legacy pending messages that may have been scanned by
// an older worker. It never overrides a human decision, an open report, or a flagged review.
const automaticBacklog = `SELECT ` + messageColumns + ` FROM messages
	WHERE messages.visibility = 'public_anon' AND messages.moderation_status = 'pending'
	AND messages.moderation_flags = '[]'
	AND NOT EXISTS (SELECT 1 FROM moderation_decisions WHERE moderation_decisions.message_id = messages.id)
	AND NOT EXISTS (SELECT 1 FROM reports WHERE reports.message_id = messages.id AND reports.status = 'open')
	ORDER BY messages.created_at LIMIT 50`

func (a *App) scanPending(ctx context.Context) (int, error) {
	total := 0
	err := a.tx(ctx, func(tx *Tx) error {
		rows, err := queryMessages(ctx, tx, automaticBacklog)
		if err != nil {
			return err
		}
		for _, row := range rows {
			if err := a.checkPublic(ctx, tx, row, nil); err != nil {
				return err
			}
			if err := row.save(ctx, tx, false); err != nil {
				return err
			}
		}
		total = len(rows)
		return nil
	})
	return total, err
}

func (a *App) cleanDeletedUploads(ctx context.Context) (int, error) {
	rows, err := a.DB.QueryContext(ctx, "SELECT id, storage_key FROM storage_deletions ORDER BY created_at LIMIT 50")
	if err != nil {
		return 0, err
	}
	type deletion struct{ id, key string }
	var pending []deletion
	for rows.Next() {
		var item deletion
		if err := rows.Scan(&item.id, &item.key); err != nil {
			rows.Close()
			return 0, err
		}
		pending = append(pending, item)
	}
	rows.Close()
	for _, item := range pending {
		if err := a.Storage.Delete(item.key); err != nil {
			return 0, err
		}
		if _, err := a.DB.ExecContext(ctx, "DELETE FROM storage_deletions WHERE id = ?", item.id); err != nil {
			return 0, err
		}
	}
	return len(pending), nil
}

// RunWorker loops until ctx is cancelled.
func (a *App) RunWorker(ctx context.Context) {
	sweep := time.NewTicker(time.Minute)
	defer sweep.Stop()
	for {
		if _, err := a.cleanDeletedUploads(ctx); err != nil && ctx.Err() == nil {
			a.Log.Warn("storage deletion retry; no content logged")
		}
		count, err := a.scanPending(ctx)
		if err != nil && ctx.Err() == nil {
			a.Log.Warn("moderation worker retry; no content logged")
		}
		if count > 0 {
			a.Memory.Incr("feed:version")
		}
		if count >= 50 && err == nil {
			continue
		}
		select {
		case <-ctx.Done():
			return
		case <-a.Memory.notify:
		case <-sweep.C:
			a.Memory.sweep(time.Minute)
		case <-time.After(5 * time.Second):
		}
	}
}
