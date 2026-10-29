package app

import (
	"database/sql"
	"encoding/json"
	"io/fs"
	"path"

	"github.com/Project-Tim-A-Sosial-Kelompok-8/Untukmu/backend/data"
)

// Pinned, original recordings with explicit source and license metadata.
const recordingPrefix = "recording-v1:"

type catalogEntry struct {
	ID          string
	RecordingID string
	Reviewed    bool
	Raw         map[string]any
}

type catalogTradition struct {
	ID      string
	Raw     map[string]any
	Entries []catalogEntry
}

type recordingInfo struct {
	File string
	Raw  json.RawMessage
	Meta map[string]any
}

type catalogRef struct {
	Tradition *catalogTradition
	Entry     *catalogEntry
}

var (
	catalog        []catalogTradition
	catalogEntries = map[string]catalogRef{}
	catalogOrder   []string
	recordings     = map[string]recordingInfo{}
)

func init() {
	raw, err := data.Files.ReadFile("prayers-v1.json")
	if err != nil {
		panic(err)
	}
	var traditions []map[string]any
	if err := json.Unmarshal(raw, &traditions); err != nil {
		panic(err)
	}
	for _, tradition := range traditions {
		item := catalogTradition{ID: tradition["id"].(string), Raw: tradition}
		for _, value := range tradition["entri"].([]any) {
			entry := value.(map[string]any)
			recording, _ := entry["recording_id"].(string)
			reviewed, _ := entry["reviewed"].(bool)
			item.Entries = append(item.Entries, catalogEntry{
				ID: entry["id"].(string), RecordingID: recording, Reviewed: reviewed, Raw: entry,
			})
		}
		catalog = append(catalog, item)
	}
	for i := range catalog {
		for j := range catalog[i].Entries {
			identifier := catalog[i].ID + "/" + catalog[i].Entries[j].ID
			catalogEntries[identifier] = catalogRef{&catalog[i], &catalog[i].Entries[j]}
			catalogOrder = append(catalogOrder, identifier)
		}
	}
	manifest, err := data.Files.ReadFile("prayer-audio/manifest.json")
	if err != nil {
		panic(err)
	}
	var entries map[string]json.RawMessage
	if err := json.Unmarshal(manifest, &entries); err != nil {
		panic(err)
	}
	for identifier, value := range entries {
		var meta map[string]any
		json.Unmarshal(value, &meta)
		file, _ := meta["file"].(string)
		recordings[identifier] = recordingInfo{File: file, Raw: value, Meta: meta}
	}
}

func recordingFile(identifier string) ([]byte, string, bool) {
	info, ok := recordings[identifier]
	if !ok || info.File == "" {
		return nil, "", false
	}
	body, err := fs.ReadFile(data.Files, path.Join("prayer-audio", info.File))
	if err != nil {
		return nil, "", false
	}
	contentType := "audio/mpeg"
	if path.Ext(info.File) == ".ogg" {
		contentType = "audio/ogg"
	}
	return body, contentType, true
}

func audioURL(key sql.NullString) any {
	if key.Valid && len(key.String) > len(recordingPrefix) && key.String[:len(recordingPrefix)] == recordingPrefix {
		identifier := key.String[len(recordingPrefix):]
		if _, ok := recordings[identifier]; ok {
			return "/api/v1/prayers/audio/" + identifier
		}
	}
	return nil
}
