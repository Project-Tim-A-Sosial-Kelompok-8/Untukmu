BEGIN;

CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL, 
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- Running upgrade  -> 0001_foundation

CREATE TABLE users (
    id VARCHAR(36) NOT NULL, 
    email VARCHAR(254) NOT NULL, 
    password_hash TEXT NOT NULL, 
    display_name VARCHAR(80) NOT NULL, 
    role VARCHAR(10) NOT NULL, 
    encryption_record JSONB, 
    default_message_visibility VARCHAR(20) NOT NULL, 
    profile_visibility VARCHAR(20) NOT NULL, 
    preferences JSONB NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT user_role CHECK (role IN ('user','admin')), 
    UNIQUE (email)
);

CREATE TABLE blocks (
    id VARCHAR(36) NOT NULL, 
    blocker_id VARCHAR(36) NOT NULL, 
    blocked_id VARCHAR(36) NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT block_other_user CHECK (blocker_id <> blocked_id), 
    FOREIGN KEY(blocked_id) REFERENCES users (id) ON DELETE CASCADE, 
    FOREIGN KEY(blocker_id) REFERENCES users (id) ON DELETE CASCADE, 
    UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX ix_blocks_blocker_id ON blocks (blocker_id);

CREATE TABLE messages (
    id VARCHAR(36) NOT NULL, 
    author_id VARCHAR(36) NOT NULL, 
    ciphertext TEXT, 
    iv VARCHAR(24), 
    kdf_salt VARCHAR(64), 
    encryption_meta JSONB, 
    public_body TEXT, 
    share_token_hash VARCHAR(64), 
    visibility VARCHAR(20) NOT NULL, 
    moderation_status VARCHAR(20) NOT NULL, 
    mood VARCHAR(40), 
    tags JSONB NOT NULL, 
    date_label DATE, 
    prayer_count INTEGER NOT NULL, 
    empathy_count INTEGER NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT message_privacy_boundary CHECK ((visibility = 'public_anon' AND public_body IS NOT NULL AND ciphertext IS NULL) OR (visibility IN ('private','unlisted') AND public_body IS NULL AND ciphertext IS NOT NULL AND iv IS NOT NULL)), 
    CONSTRAINT message_visibility CHECK (visibility IN ('private','public_anon','unlisted')), 
    FOREIGN KEY(author_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_messages_author_id ON messages (author_id);

CREATE INDEX ix_messages_explore ON messages (visibility, moderation_status, created_at, id);

CREATE TABLE sessions (
    id VARCHAR(36) NOT NULL, 
    user_id VARCHAR(36) NOT NULL, 
    refresh_token_hash VARCHAR(64) NOT NULL, 
    user_agent VARCHAR(400) NOT NULL, 
    ip_hash VARCHAR(64) NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    revoked_at TIMESTAMP WITH TIME ZONE, 
    PRIMARY KEY (id), 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_sessions_user_id ON sessions (user_id);

CREATE TABLE uploads (
    id VARCHAR(36) NOT NULL, 
    owner_id VARCHAR(36) NOT NULL, 
    storage_key VARCHAR(200) NOT NULL, 
    byte_size INTEGER NOT NULL, 
    encryption_meta JSONB NOT NULL, 
    complete BOOLEAN NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(owner_id) REFERENCES users (id) ON DELETE CASCADE, 
    UNIQUE (storage_key)
);

CREATE INDEX ix_uploads_owner_id ON uploads (owner_id);

CREATE TABLE constellations (
    id VARCHAR(36) NOT NULL, 
    owner_id VARCHAR(36) NOT NULL, 
    target_kind VARCHAR(30) NOT NULL, 
    target_label VARCHAR(100) NOT NULL, 
    custom_category VARCHAR(80), 
    visual_type VARCHAR(20) NOT NULL, 
    visual_ref VARCHAR(36), 
    kind VARCHAR(20) NOT NULL, 
    color VARCHAR(7) NOT NULL, 
    radius INTEGER NOT NULL, 
    particle_count INTEGER NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(owner_id) REFERENCES users (id) ON DELETE CASCADE, 
    FOREIGN KEY(visual_ref) REFERENCES uploads (id) ON DELETE SET NULL
);

CREATE INDEX ix_constellations_owner_id ON constellations (owner_id);

CREATE TABLE message_attachments (
    id VARCHAR(36) NOT NULL, 
    message_id VARCHAR(36) NOT NULL, 
    upload_id VARCHAR(36) NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(message_id) REFERENCES messages (id) ON DELETE CASCADE, 
    FOREIGN KEY(upload_id) REFERENCES uploads (id) ON DELETE CASCADE
);

CREATE INDEX ix_message_attachments_message_id ON message_attachments (message_id);

CREATE TABLE prayers (
    id VARCHAR(36) NOT NULL, 
    message_id VARCHAR(36) NOT NULL, 
    visitor_hash VARCHAR(64) NOT NULL, 
    tradition VARCHAR(20) NOT NULL, 
    prayer_type VARCHAR(80) NOT NULL, 
    played_audio_ref VARCHAR(300), 
    source_attribution TEXT NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(message_id) REFERENCES messages (id) ON DELETE CASCADE
);

CREATE INDEX ix_prayers_message_id ON prayers (message_id);

CREATE TABLE reports (
    id VARCHAR(36) NOT NULL, 
    message_id VARCHAR(36) NOT NULL, 
    reporter_id VARCHAR(36), 
    reason VARCHAR(1000) NOT NULL, 
    status VARCHAR(20) NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    reviewed_at TIMESTAMP WITH TIME ZONE, 
    PRIMARY KEY (id), 
    FOREIGN KEY(message_id) REFERENCES messages (id) ON DELETE CASCADE, 
    FOREIGN KEY(reporter_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX ix_reports_message_id ON reports (message_id);

CREATE TABLE message_constellations (
    message_id VARCHAR(36) NOT NULL, 
    constellation_id VARCHAR(36) NOT NULL, 
    PRIMARY KEY (message_id, constellation_id), 
    FOREIGN KEY(constellation_id) REFERENCES constellations (id) ON DELETE CASCADE, 
    FOREIGN KEY(message_id) REFERENCES messages (id) ON DELETE CASCADE
);

CREATE INDEX ix_message_constellations_constellation_id ON message_constellations (constellation_id);

INSERT INTO alembic_version (version_num) VALUES ('0001_foundation') RETURNING alembic_version.version_num;

-- Running upgrade 0001_foundation -> 0002_social

ALTER TABLE messages ADD COLUMN moderation_flags JSONB DEFAULT '[]' NOT NULL;

ALTER TABLE messages ADD COLUMN moderation_checked_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE empathies (
    id VARCHAR(36) NOT NULL, 
    message_id VARCHAR(36) NOT NULL, 
    visitor_hash VARCHAR(64) NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT unique_empathy UNIQUE (message_id, visitor_hash), 
    FOREIGN KEY(message_id) REFERENCES messages (id) ON DELETE CASCADE
);

CREATE INDEX ix_empathies_message_id ON empathies (message_id);

CREATE TABLE moderation_decisions (
    id VARCHAR(36) NOT NULL, 
    message_id VARCHAR(36) NOT NULL, 
    reviewer_id VARCHAR(36) NOT NULL, 
    decision VARCHAR(20) NOT NULL, 
    reason VARCHAR(1000) NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(message_id) REFERENCES messages (id) ON DELETE CASCADE, 
    FOREIGN KEY(reviewer_id) REFERENCES users (id) ON DELETE RESTRICT
);

CREATE INDEX ix_moderation_decisions_message_id ON moderation_decisions (message_id);

UPDATE alembic_version SET version_num='0002_social' WHERE alembic_version.version_num = '0001_foundation';

-- Running upgrade 0002_social -> 0003_prayers

CREATE TABLE prayer_contents (
    id VARCHAR(100) NOT NULL, 
    tradition VARCHAR(20) NOT NULL, 
    content JSONB NOT NULL, 
    reviewed BOOLEAN NOT NULL, 
    reviewed_by VARCHAR(36), 
    reviewed_at TIMESTAMP WITH TIME ZONE, 
    audio_key VARCHAR(250), 
    audio_meta JSONB NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(reviewed_by) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX ix_prayer_contents_tradition ON prayer_contents (tradition);

INSERT INTO prayer_contents (id, tradition, content, reviewed, audio_meta) VALUES ('islam/rabbana-atina', 'islam', '{"id": "rabbana-atina", "nama": {"id": "Doa kebaikan dunia dan akhirat", "en": "Prayer for good in both worlds"}, "teks": {"id": "Rabbana atina fid-dunya hasanah wa fil-akhirati hasanah wa qina ‘adzaban-nar.", "en": "Rabbana atina fid-dunya hasanah wa fil-akhirati hasanah wa qina ‘adzaban-nar."}, "arti": {"id": "Tuhan kami, berilah kami kebaikan di dunia dan kebaikan di akhirat, dan lindungilah kami dari azab neraka.", "en": "Our Lord, give us good in this world and good in the Hereafter, and protect us from the punishment of the Fire."}, "sumber": "QS Al-Baqarah 2:201", "reviewed": false, "audio": null, "detik": 20}', false, '{}');

INSERT INTO prayer_contents (id, tradition, content, reviewed, audio_meta) VALUES ('islam/inna-lillahi', 'islam', '{"id": "inna-lillahi", "nama": {"id": "Doa untuk yang ditinggalkan", "en": "Prayer for the bereaved"}, "teks": {"id": "Inna lillahi wa inna ilaihi raji‘un. Allahummaghfir lahu warhamhu.", "en": "Inna lillahi wa inna ilaihi raji‘un. Allahummaghfir lahu warhamhu."}, "arti": {"id": "Sesungguhnya kami milik Allah, dan kepada-Nya kami kembali. Ya Allah, ampunilah dia dan rahmatilah dia.", "en": "Indeed we belong to God, and to Him we return. O God, forgive him and have mercy on him."}, "sumber": "QS Al-Baqarah 2:156 dan doa jenazah yang masyhur", "reviewed": false, "audio": null, "detik": 25}', false, '{}');

INSERT INTO prayer_contents (id, tradition, content, reviewed, audio_meta) VALUES ('kristen/bapa-kami', 'kristen', '{"id": "bapa-kami", "nama": {"id": "Doa Bapa Kami", "en": "The Lord’s Prayer"}, "teks": {"id": "Bapa kami yang di sorga, dikuduskanlah nama-Mu. Datanglah Kerajaan-Mu, jadilah kehendak-Mu di bumi seperti di sorga. Berikanlah kami pada hari ini makanan kami yang secukupnya, dan ampunilah kami akan kesalahan kami, seperti kami juga mengampuni orang yang bersalah kepada kami. Dan janganlah membawa kami ke dalam pencobaan, tetapi lepaskanlah kami daripada yang jahat. Amin.", "en": "Our Father in heaven, hallowed be your name. Your kingdom come, your will be done, on earth as it is in heaven. Give us today our daily bread. Forgive us our debts, as we also have forgiven our debtors. And lead us not into temptation, but deliver us from evil. Amen."}, "sumber": "Matius 6:9–13", "reviewed": false, "audio": null, "detik": 35}', false, '{}');

INSERT INTO prayer_contents (id, tradition, content, reviewed, audio_meta) VALUES ('kristen/mazmur-23', 'kristen', '{"id": "mazmur-23", "nama": {"id": "Mazmur 23", "en": "Psalm 23"}, "teks": {"id": "Tuhan adalah gembalaku, takkan kekurangan aku. Ia membaringkan aku di padang yang berumput hijau, Ia membimbing aku ke air yang tenang; Ia menyegarkan jiwaku. Sekalipun aku berjalan dalam lembah kekelaman, aku tidak takut bahaya, sebab Engkau besertaku.", "en": "The Lord is my shepherd, I lack nothing. He makes me lie down in green pastures, he leads me beside quiet waters, he refreshes my soul. Even though I walk through the darkest valley, I will fear no evil, for you are with me."}, "sumber": "Mazmur 23:1–4", "reviewed": false, "audio": null, "detik": 30}', false, '{}');

INSERT INTO prayer_contents (id, tradition, content, reviewed, audio_meta) VALUES ('katolik/bapa-kami-katolik', 'katolik', '{"id": "bapa-kami-katolik", "nama": {"id": "Doa Bapa Kami", "en": "The Lord’s Prayer"}, "teks": {"id": "Bapa kami yang ada di surga, dimuliakanlah nama-Mu. Datanglah kerajaan-Mu, jadilah kehendak-Mu di atas bumi seperti di dalam surga. Berilah kami rezeki pada hari ini, dan ampunilah kesalahan kami, seperti kami pun mengampuni yang bersalah kepada kami. Dan janganlah masukkan kami ke dalam pencobaan, tetapi bebaskanlah kami dari yang jahat. Amin.", "en": "Our Father, who art in heaven, hallowed be thy name. Thy kingdom come, thy will be done, on earth as it is in heaven. Give us this day our daily bread, and forgive us our trespasses, as we forgive those who trespass against us. And lead us not into temptation, but deliver us from evil. Amen."}, "sumber": "Matius 6:9–13 (rumusan liturgi Katolik)", "reviewed": false, "audio": null, "detik": 35}', false, '{}');

INSERT INTO prayer_contents (id, tradition, content, reviewed, audio_meta) VALUES ('katolik/salam-maria', 'katolik', '{"id": "salam-maria", "nama": {"id": "Salam Maria", "en": "Hail Mary"}, "teks": {"id": "Salam Maria, penuh rahmat, Tuhan sertamu. Terpujilah engkau di antara wanita, dan terpujilah buah tubuhmu, Yesus. Santa Maria, bunda Allah, doakanlah kami yang berdosa ini, sekarang dan pada waktu kami mati. Amin.", "en": "Hail Mary, full of grace, the Lord is with thee. Blessed art thou among women, and blessed is the fruit of thy womb, Jesus. Holy Mary, Mother of God, pray for us sinners, now and at the hour of our death. Amen."}, "sumber": "Doa devosional Katolik (berbasis Lukas 1:28, 1:42)", "reviewed": false, "audio": null, "detik": 25}', false, '{}');

INSERT INTO prayer_contents (id, tradition, content, reviewed, audio_meta) VALUES ('hindu/gayatri', 'hindu', '{"id": "gayatri", "nama": {"id": "Mantram Gayatri", "en": "Gayatri Mantra"}, "teks": {"id": "Om Bhur Bhuvah Svah\\nTat Savitur Varenyam\\nBhargo Devasya Dhimahi\\nDhiyo Yo Nah Pracodayat\\nOm Santih Santih Santih Om.", "en": "Om Bhur Bhuvah Svah\\nTat Savitur Varenyam\\nBhargo Devasya Dhimahi\\nDhiyo Yo Nah Pracodayat\\nOm Santih Santih Santih Om."}, "arti": {"id": "Semoga cahaya Ilahi menerangi budi kami, dan semoga damai menyertai semua.", "en": "May the divine light illumine our understanding, and may peace attend all beings."}, "sumber": "Rgveda 3.62.10", "reviewed": false, "audio": null, "detik": 25}', false, '{}');

INSERT INTO prayer_contents (id, tradition, content, reviewed, audio_meta) VALUES ('hindu/santih', 'hindu', '{"id": "santih", "nama": {"id": "Doa damai", "en": "Prayer of peace"}, "teks": {"id": "Om Santih Santih Santih Om.", "en": "Om Santih Santih Santih Om."}, "arti": {"id": "Damai, damai, damai — bagi alam, bagi sesama, bagi diri sendiri.", "en": "Peace, peace, peace — for nature, for others, for oneself."}, "sumber": "Mantram penutup upacara Hindu", "reviewed": false, "audio": null, "detik": 15}', false, '{}');

INSERT INTO prayer_contents (id, tradition, content, reviewed, audio_meta) VALUES ('buddha/namo-tassa', 'buddha', '{"id": "namo-tassa", "nama": {"id": "Penghormatan kepada Buddha", "en": "Homage to the Buddha"}, "teks": {"id": "Namo Tassa Bhagavato Arahato Samma Sambuddhassa. (tiga kali)", "en": "Namo Tassa Bhagavato Arahato Samma Sambuddhassa. (three times)"}, "arti": {"id": "Terpujilah Dia, Yang Mahasuci, Yang telah mencapai penerangan sempurna.", "en": "Homage to the Blessed One, the Worthy One, the Fully Enlightened One."}, "sumber": "Rumusan penghormatan (Pali) yang lazim", "reviewed": false, "audio": null, "detik": 20}', false, '{}');

INSERT INTO prayer_contents (id, tradition, content, reviewed, audio_meta) VALUES ('buddha/metta', 'buddha', '{"id": "metta", "nama": {"id": "Pemancaran cinta kasih", "en": "Loving-kindness"}, "teks": {"id": "Semoga semua makhluk berbahagia.\\nSemoga semua makhluk bebas dari penderitaan.\\nSemoga semua makhluk hidup dalam damai.", "en": "May all beings be happy.\\nMay all beings be free from suffering.\\nMay all beings live in peace."}, "sumber": "Rumusan metta (Karaniya Metta Sutta, Khuddaka Nikaya)", "reviewed": false, "audio": null, "detik": 25}', false, '{}');

INSERT INTO prayer_contents (id, tradition, content, reviewed, audio_meta) VALUES ('konghucu/ren', 'konghucu', '{"id": "ren", "nama": {"id": "Renungan kebaikan", "en": "Reflection on goodness"}, "teks": {"id": "己所不欲，勿施於人。\\n(Jǐ suǒ bù yù, wù shī yú rén.)", "en": "己所不欲，勿施於人。\\n(Jǐ suǒ bù yù, wù shī yú rén.)"}, "arti": {"id": "Apa yang tidak engkau kehendaki bagi dirimu, jangan lakukan kepada orang lain.", "en": "What you do not wish for yourself, do not do to others."}, "sumber": "Lunyu (Analects) XV:24", "reviewed": false, "audio": null, "detik": 20}', false, '{}');

INSERT INTO prayer_contents (id, tradition, content, reviewed, audio_meta) VALUES ('konghucu/sembahyang-tian', 'konghucu', '{"id": "sembahyang-tian", "nama": {"id": "Sembahyang kepada Tian", "en": "Reverence to Tian"}, "teks": null, "arti": null, "sumber": "PERLU DIISI — rujuk kitab Si Shu / sumber majelis Konghucu", "reviewed": false, "audio": null, "detik": 20}', false, '{}');

INSERT INTO prayer_contents (id, tradition, content, reviewed, audio_meta) VALUES ('umum/hening', 'umum', '{"id": "hening", "nama": {"id": "Hening sejenak", "en": "A moment of silence"}, "teks": {"id": "Tidak ada kata yang perlu diucapkan. Duduklah tenang, dan arahkan pikiranmu kepada orang yang kau tuju.", "en": "No words are needed. Sit quietly, and turn your thoughts to the person this is for."}, "sumber": "Tidak terikat tradisi — untuk siapa pun", "reviewed": true, "audio": null, "detik": 30}', true, '{}');

CREATE UNIQUE INDEX unique_prayer_visitor ON prayers (message_id, visitor_hash);

UPDATE alembic_version SET version_num='0003_prayers' WHERE alembic_version.version_num = '0002_social';

-- Running upgrade 0003_prayers -> 0004_recovery

ALTER TABLE users ADD COLUMN recovery_auth_hash TEXT;

UPDATE alembic_version SET version_num='0004_recovery' WHERE alembic_version.version_num = '0003_prayers';

-- Running upgrade 0004_recovery -> 0005_written_prayers

ALTER TABLE messages ADD COLUMN entry_type VARCHAR(20) DEFAULT 'message' NOT NULL CONSTRAINT message_entry_type CHECK (entry_type IN ('message','prayer'));

UPDATE messages SET entry_type = 'prayer' WHERE jsonb_array_length(tags) = 2 AND tags @> '["doa"]'::jsonb
            AND tags ?| ARRAY['umum','islam','kristen','katolik','hindu','buddha','konghucu'];

UPDATE alembic_version SET version_num='0005_written_prayers' WHERE alembic_version.version_num = '0004_recovery';

COMMIT;

