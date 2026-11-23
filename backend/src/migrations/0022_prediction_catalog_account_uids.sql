CREATE TABLE prediction_catalog_account_uids (
 profile_id TEXT PRIMARY KEY REFERENCES prediction_catalog_players(id),
 platform TEXT NOT NULL,
 region TEXT NOT NULL,
 uid TEXT NOT NULL,
 evidence_id TEXT NOT NULL REFERENCES evidences(id),
 review_note TEXT NOT NULL,
 available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX prediction_catalog_account_uids_lookup
 ON prediction_catalog_account_uids (platform,region,uid);
