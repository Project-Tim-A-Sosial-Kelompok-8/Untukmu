-- Untukmu schema v2, shared by SQLite and PostgreSQL. Times are UTC text in a
-- fixed-width format so that ordering and comparisons work lexicographically.
-- Booleans are stored as 0/1 integers.
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    recovery_auth_hash TEXT,
    display_name TEXT NOT NULL DEFAULT 'Anonim',
    role TEXT NOT NULL DEFAULT 'user' CONSTRAINT user_role CHECK (role IN ('user', 'admin')),
    encryption_record TEXT,
    default_message_visibility TEXT NOT NULL DEFAULT 'private',
    profile_visibility TEXT NOT NULL DEFAULT 'private',
    preferences TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- One workspace per account: a star around the Milky Way holding the owner's
-- galaxies. Others may enter it only when visibility is 'public'.
CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'private'
        CONSTRAINT workspace_visibility CHECK (visibility IN ('private', 'public')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_workspaces_visibility ON workspaces(visibility, created_at);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL,
    user_agent TEXT NOT NULL DEFAULT '',
    ip_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY,
    owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    storage_key TEXT NOT NULL UNIQUE,
    byte_size INTEGER NOT NULL,
    encryption_meta TEXT NOT NULL,
    complete INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_uploads_owner_id ON uploads(owner_id);

CREATE TABLE IF NOT EXISTS storage_deletions (
    id TEXT PRIMARY KEY,
    storage_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS constellations (
    id TEXT PRIMARY KEY,
    owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    target_kind TEXT NOT NULL,
    target_label TEXT NOT NULL,
    custom_category TEXT,
    visual_type TEXT NOT NULL DEFAULT 'light_symbol',
    visual_ref TEXT REFERENCES uploads(id) ON DELETE SET NULL,
    kind TEXT NOT NULL DEFAULT 'spiral',
    color TEXT NOT NULL DEFAULT '#ffd9a0',
    radius INTEGER NOT NULL DEFAULT 140,
    particle_count INTEGER NOT NULL DEFAULT 8500,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_constellations_owner_id ON constellations(owner_id);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    entry_type TEXT NOT NULL DEFAULT 'message'
        CONSTRAINT message_entry_type CHECK (entry_type IN ('message', 'prayer')),
    ciphertext TEXT,
    iv TEXT,
    kdf_salt TEXT,
    encryption_meta TEXT,
    public_body TEXT,
    share_token_hash TEXT,
    share_payload TEXT,
    release_at TEXT,
    visibility TEXT NOT NULL DEFAULT 'private'
        CONSTRAINT message_visibility CHECK (visibility IN ('private', 'public_anon', 'unlisted')),
    moderation_status TEXT NOT NULL DEFAULT 'not_applicable',
    moderation_flags TEXT NOT NULL DEFAULT '[]',
    moderation_checked_at TEXT,
    mood TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    date_label TEXT,
    prayer_count INTEGER NOT NULL DEFAULT 0,
    empathy_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    CONSTRAINT message_privacy_boundary CHECK (
        (visibility = 'public_anon' AND public_body IS NOT NULL AND ciphertext IS NULL)
        OR (visibility IN ('private', 'unlisted') AND public_body IS NULL AND ciphertext IS NOT NULL AND iv IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_messages_author_id ON messages(author_id);
CREATE INDEX IF NOT EXISTS ix_messages_release_at ON messages(release_at);
CREATE INDEX IF NOT EXISTS ix_messages_explore ON messages(visibility, moderation_status, created_at, id);

CREATE TABLE IF NOT EXISTS message_constellations (
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    constellation_id TEXT NOT NULL REFERENCES constellations(id) ON DELETE CASCADE,
    PRIMARY KEY (message_id, constellation_id)
);
CREATE INDEX IF NOT EXISTS ix_message_constellations_constellation_id ON message_constellations(constellation_id);

CREATE TABLE IF NOT EXISTS message_attachments (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    upload_id TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_message_attachments_message_id ON message_attachments(message_id);

CREATE TABLE IF NOT EXISTS prayers (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    visitor_hash TEXT NOT NULL,
    tradition TEXT NOT NULL,
    prayer_type TEXT NOT NULL,
    played_audio_ref TEXT,
    source_attribution TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_prayers_message_id ON prayers(message_id);
CREATE UNIQUE INDEX IF NOT EXISTS unique_prayer_visitor ON prayers(message_id, visitor_hash);

CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL,
    reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_reports_message_id ON reports(message_id);

CREATE TABLE IF NOT EXISTS blocks (
    id TEXT PRIMARY KEY,
    blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    UNIQUE (blocker_id, blocked_id),
    CONSTRAINT block_other_user CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS ix_blocks_blocker_id ON blocks(blocker_id);

CREATE TABLE IF NOT EXISTS empathies (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    visitor_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    CONSTRAINT unique_empathy UNIQUE (message_id, visitor_hash)
);
CREATE INDEX IF NOT EXISTS ix_empathies_message_id ON empathies(message_id);

CREATE TABLE IF NOT EXISTS moderation_decisions (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    reviewer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    decision TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_moderation_decisions_message_id ON moderation_decisions(message_id);

CREATE TABLE IF NOT EXISTS prayer_contents (
    id TEXT PRIMARY KEY,
    tradition TEXT NOT NULL,
    content TEXT NOT NULL,
    reviewed INTEGER NOT NULL DEFAULT 0,
    reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TEXT,
    audio_key TEXT,
    audio_meta TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS ix_prayer_contents_tradition ON prayer_contents(tradition);
