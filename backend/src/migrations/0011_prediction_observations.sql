-- 第三方资料单独留存；不写 prediction_matches，不进入逐场统计与模型。
CREATE TABLE prediction_observations (
 id TEXT PRIMARY KEY,
 source_key TEXT NOT NULL UNIQUE,
 payload_hash TEXT NOT NULL,
 kind TEXT NOT NULL CHECK (kind IN ('ROSTER_WINNER','PLAYER_AGGREGATE')),
 payload JSONB NOT NULL,
 evidence_id TEXT NOT NULL REFERENCES evidences(id),
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','VERIFIED','QUARANTINED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 verified_at TIMESTAMPTZ,
 verified_by TEXT,
 quarantined_at TIMESTAMPTZ,
 quarantined_by TEXT,
 CHECK (status<>'VERIFIED' OR verified_at IS NOT NULL)
);
CREATE INDEX prediction_observations_evidence ON prediction_observations(evidence_id);
