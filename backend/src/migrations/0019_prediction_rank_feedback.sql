CREATE TABLE prediction_prematch_forecasts (
 id TEXT PRIMARY KEY,
 model_version TEXT NOT NULL,
 banned_faction TEXT,
 players JSONB NOT NULL CHECK (jsonb_array_length(players)=6),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX prediction_prematch_forecasts_time ON prediction_prematch_forecasts(recorded_at);

CREATE TABLE prediction_catalog_rank_evidence (
 match_id TEXT NOT NULL REFERENCES prediction_catalog_matches(id),
 material_sha256 TEXT NOT NULL REFERENCES prediction_catalog_materials(sha256),
 ranks SMALLINT[] NOT NULL CHECK (
  array_ndims(ranks)=1 AND array_lower(ranks,1)=1 AND cardinality(ranks)=6
  AND ranks @> ARRAY[1,2,3,4,5,6]::SMALLINT[]
 ),
 available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (match_id, material_sha256)
);
