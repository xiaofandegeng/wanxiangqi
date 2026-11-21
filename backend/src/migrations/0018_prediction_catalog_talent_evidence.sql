CREATE TABLE prediction_catalog_talent_evidence (
 match_id TEXT NOT NULL REFERENCES prediction_catalog_matches(id),
 material_sha256 TEXT NOT NULL REFERENCES prediction_catalog_materials(sha256),
 game_version TEXT NOT NULL CHECK (length(trim(game_version)) BETWEEN 1 AND 80),
 reviewed_at TIMESTAMPTZ NOT NULL,
 available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 seat_talents JSONB NOT NULL CHECK (jsonb_typeof(seat_talents) = 'array' AND jsonb_array_length(seat_talents) = 6),
 PRIMARY KEY (match_id, material_sha256, reviewed_at)
);
