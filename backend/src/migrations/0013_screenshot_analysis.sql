-- 首次补记可见时刻按迁移时刻保守处理，绝不回填比赛日期。
ALTER TABLE prediction_catalog_players ADD COLUMN available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp();
ALTER TABLE prediction_catalog_matches ADD COLUMN available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp();
ALTER TABLE prediction_catalog_claims ADD COLUMN available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp();
CREATE TABLE prediction_screenshot_drafts (
 id TEXT PRIMARY KEY,evidence_id TEXT NOT NULL REFERENCES evidences(id),evidence_sha256 TEXT NOT NULL,
 feature_cutoff TIMESTAMPTZ NOT NULL,ocr JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE prediction_screenshot_analyses (
 id TEXT PRIMARY KEY,draft_id TEXT NOT NULL REFERENCES prediction_screenshot_drafts(id),
 request JSONB NOT NULL,result JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
