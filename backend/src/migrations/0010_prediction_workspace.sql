-- v7 独立内部研究工作台。不读取 archive_legacy，不自动恢复历史赛果。
CREATE TABLE prediction_matches (
 id TEXT PRIMARY KEY,
 source_key TEXT NOT NULL UNIQUE,
 payload_hash TEXT NOT NULL,
 mode TEXT NOT NULL CHECK (mode IN ('WANXIANG','DIAMOND')),
 played_at TIMESTAMPTZ NOT NULL,
 evidence_id TEXT NOT NULL REFERENCES evidences(id),
 evidence_locator TEXT NOT NULL,
 version TEXT NOT NULL,
 platform TEXT NOT NULL,
 region TEXT NOT NULL,
 seats JSONB NOT NULL CHECK (jsonb_array_length(seats)=6),
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','VERIFIED','QUARANTINED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 verified_at TIMESTAMPTZ,
 verified_by TEXT,
 quarantined_at TIMESTAMPTZ,
 quarantined_by TEXT,
 CHECK (status<>'VERIFIED' OR verified_at IS NOT NULL)
);
CREATE INDEX prediction_matches_time ON prediction_matches(played_at);
CREATE TABLE prediction_runs (
 id TEXT PRIMARY KEY,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 payload JSONB NOT NULL
);

CREATE UNIQUE INDEX prediction_match_natural_key ON prediction_matches(mode,platform,region,played_at) WHERE status<>'QUARANTINED';
