-- Commander attributions reviewed against the original match material.
CREATE TABLE prediction_catalog_commander_evidence (
 match_id TEXT NOT NULL,
 slot INTEGER NOT NULL,
 material_sha256 TEXT NOT NULL REFERENCES prediction_catalog_materials(sha256),
 commander TEXT NOT NULL CHECK (length(trim(commander)) BETWEEN 1 AND 80),
 review_note TEXT NOT NULL,
 available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (match_id,slot),
 FOREIGN KEY (match_id,slot) REFERENCES prediction_catalog_plays(match_id,slot)
);
