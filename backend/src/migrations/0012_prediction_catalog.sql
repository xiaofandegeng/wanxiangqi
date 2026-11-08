-- 私有来源研究库：昵称只是来源内检索句柄，不是已确认真人身份。
CREATE TABLE prediction_catalog_sources (
 url TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('DISCOVERED','TRANSCRIBED')),
 note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE prediction_catalog_materials (
 sha256 TEXT PRIMARY KEY CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 source_url TEXT NOT NULL REFERENCES prediction_catalog_sources(url),
 content BYTEA NOT NULL, size_bytes INTEGER NOT NULL CHECK(size_bytes>0),
 mime_type TEXT NOT NULL, CHECK(octet_length(content)=size_bytes)
);
CREATE TABLE prediction_catalog_players (
 id TEXT PRIMARY KEY, author TEXT NOT NULL, nickname TEXT NOT NULL,
 identity_status TEXT NOT NULL DEFAULT 'SOURCE_NICKNAME_ONLY' CHECK(identity_status='SOURCE_NICKNAME_ONLY'),
 UNIQUE(author,nickname)
);
CREATE TABLE prediction_catalog_matches (
 id TEXT PRIMARY KEY, source_url TEXT NOT NULL REFERENCES prediction_catalog_sources(url),
 material_sha256 TEXT NOT NULL REFERENCES prediction_catalog_materials(sha256),
 payload_hash TEXT NOT NULL, day DATE NOT NULL, ordinal INTEGER NOT NULL CHECK(ordinal>0),
 author TEXT NOT NULL, ban TEXT, winner_build TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'TRANSCRIBED' CHECK(status IN ('TRANSCRIBED','QUARANTINED')),
 UNIQUE(author,day,ordinal)
);
CREATE TABLE prediction_catalog_plays (
 match_id TEXT NOT NULL REFERENCES prediction_catalog_matches(id),
 slot INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 6),
 player_id TEXT NOT NULL REFERENCES prediction_catalog_players(id),
 build_label TEXT NOT NULL, winner BOOLEAN NOT NULL,
 PRIMARY KEY(match_id,slot), UNIQUE(match_id,player_id)
);
CREATE UNIQUE INDEX prediction_catalog_single_winner ON prediction_catalog_plays(match_id) WHERE winner;
CREATE INDEX prediction_catalog_player_plays ON prediction_catalog_plays(player_id);
CREATE TABLE prediction_catalog_claims (
 id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES prediction_catalog_players(id),
 source_url TEXT NOT NULL REFERENCES prediction_catalog_sources(url),
 material_sha256 TEXT NOT NULL REFERENCES prediction_catalog_materials(sha256), payload_hash TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('COMMANDER_AUTHOR_CLAIM','BUILD_AUTHOR_CLAIM')),
 text TEXT NOT NULL, window_start DATE NOT NULL, window_end DATE NOT NULL,
 aggregate JSONB, CHECK(window_end>=window_start)
);
COMMENT ON TABLE prediction_catalog_claims IS '来源作者评价与原汇总，不等于已证实擅长；不参与prediction_matches和模型';
