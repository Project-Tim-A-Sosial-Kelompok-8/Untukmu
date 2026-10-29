// Package data embeds the curated prayer catalogue and the pinned original recordings.
package data

import "embed"

//go:embed prayers-v1.json prayer-audio
var Files embed.FS
