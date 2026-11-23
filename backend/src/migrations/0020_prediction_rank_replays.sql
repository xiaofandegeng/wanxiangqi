CREATE TABLE prediction_rank_replays (
 match_id TEXT NOT NULL,
 material_sha256 TEXT NOT NULL,
 model_version TEXT NOT NULL,
 training_hash TEXT NOT NULL,
 banned_faction TEXT NOT NULL,
 players JSONB NOT NULL CHECK (jsonb_array_length(players)=6),
 generated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (match_id, material_sha256),
 FOREIGN KEY (match_id, material_sha256)
   REFERENCES prediction_catalog_rank_evidence(match_id, material_sha256)
);
