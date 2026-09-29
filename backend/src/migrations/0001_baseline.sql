-- 0001_baseline.sql · v3 迁移基线 (2026-09-29)
-- 内容 = 原 backend/src/schema.sql 原样封存（v2 现网结构），不含任何数据变更。
-- v3 的结构演进全部在后续编号迁移中追加；本文件仅作为迁移历史的起点。

-- 王者万象棋数据站 - 生产级 PostgreSQL 数据库表结构定义与迁移脚本 (v2)
-- 包含 6 席位对决表、逐局事实流水表、选手表、第三方阵容快照表、证据存证与审计表

CREATE TABLE IF NOT EXISTS players (
    id VARCHAR(64) PRIMARY KEY,
    nickname VARCHAR(64) NOT NULL,
    platform VARCHAR(32) DEFAULT 'DEFAULT',
    server_zone VARCHAR(64) DEFAULT '手Q1区',
    rank_score INTEGER DEFAULT 10000,
    rank_text VARCHAR(32) DEFAULT '最强王者',
    title VARCHAR(64) DEFAULT '',
    commander VARCHAR(32) DEFAULT '通用',
    style VARCHAR(64) DEFAULT '常规',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_players_nickname ON players(nickname);
CREATE INDEX IF NOT EXISTS idx_players_rank_score ON players(rank_score DESC);

CREATE TABLE IF NOT EXISTS evidences (
    id VARCHAR(64) PRIMARY KEY,
    sha256 VARCHAR(64) UNIQUE NOT NULL,
    source_id VARCHAR(64) NOT NULL,
    captured_at TIMESTAMP WITH TIME ZONE NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE,
    verified_by VARCHAR(64),
    status VARCHAR(32) DEFAULT 'VERIFIED',
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
    id VARCHAR(64) PRIMARY KEY,
    mode VARCHAR(32) DEFAULT 'RANKED_DIAMOND',
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    title VARCHAR(128) NOT NULL,
    status VARCHAR(32) DEFAULT 'AUDITED',
    evidence_id VARCHAR(64) REFERENCES evidences(id) ON DELETE SET NULL,
    verified_at TIMESTAMP WITH TIME ZONE,
    verified_by VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_scheduled_at ON events(scheduled_at DESC);

CREATE TABLE IF NOT EXISTS event_participants (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(64) REFERENCES events(id) ON DELETE CASCADE,
    slot SMALLINT NOT NULL CHECK (slot BETWEEN 1 AND 6),
    player_id VARCHAR(64) REFERENCES players(id) ON DELETE CASCADE,
    nickname VARCHAR(64) NOT NULL,
    rank_score INTEGER DEFAULT 10000,
    odds NUMERIC(6, 2) DEFAULT 5.00,
    support_count INTEGER DEFAULT 0,
    final_rank SMALLINT NOT NULL CHECK (final_rank BETWEEN 1 AND 6),
    commander VARCHAR(32) DEFAULT '通用',
    lineup VARCHAR(64) DEFAULT '常规',
    CONSTRAINT uq_event_slot UNIQUE (event_id, slot)
);

CREATE TABLE IF NOT EXISTS matches (
    id VARCHAR(64) PRIMARY KEY,
    player_id VARCHAR(64) REFERENCES players(id) ON DELETE CASCADE,
    match_time TIMESTAMP WITH TIME ZONE NOT NULL,
    available_at TIMESTAMP WITH TIME ZONE NOT NULL, -- 双时间截点核心字段 (防未来信息泄漏 F10)
    mode VARCHAR(32) DEFAULT 'RANKED_DIAMOND',
    final_rank SMALLINT NOT NULL CHECK (final_rank BETWEEN 1 AND 6), -- 严格名次约束 (F08)
    commander VARCHAR(32) DEFAULT '通用',
    lineup VARCHAR(64) DEFAULT '未识别',
    rounds_survived SMALLINT DEFAULT 20,
    three_stars JSONB DEFAULT '[]'::jsonb,
    verified BOOLEAN DEFAULT FALSE,
    evidence_id VARCHAR(64) REFERENCES evidences(id) ON DELETE SET NULL,
    batch_id VARCHAR(64),
    revision INTEGER DEFAULT 1,
    source_record_key VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_player_match_time UNIQUE (player_id, match_time)
);

CREATE INDEX IF NOT EXISTS idx_matches_player_cutoff ON matches(player_id, match_time, available_at) WHERE verified = TRUE;
CREATE INDEX IF NOT EXISTS idx_matches_batch ON matches(batch_id);

CREATE TABLE IF NOT EXISTS lineup_snapshots (
    id VARCHAR(64) PRIMARY KEY,
    source_id VARCHAR(64) NOT NULL,
    lineup_name VARCHAR(64) NOT NULL,
    tier VARCHAR(16) DEFAULT 'T1',
    commander VARCHAR(32) DEFAULT '通用',
    core_heroes JSONB DEFAULT '[]'::jsonb,
    sample_count INTEGER NOT NULL CHECK (sample_count >= 0),
    win_rate NUMERIC(5, 4) NOT NULL CHECK (win_rate BETWEEN 0 AND 1),
    top3_rate NUMERIC(5, 4) NOT NULL CHECK (top3_rate BETWEEN 0 AND 1),
    avg_rank NUMERIC(4, 2) NOT NULL CHECK (avg_rank BETWEEN 1 AND 6),
    snapshot_version VARCHAR(32) DEFAULT 'v2609',
    window_text VARCHAR(64) DEFAULT '近 7 日实战聚合',
    scope VARCHAR(64) DEFAULT '全服王者段位',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS import_batches (
    batch_id VARCHAR(64) PRIMARY KEY,
    source VARCHAR(64) DEFAULT 'MANUAL_IMPORT',
    total_records INTEGER NOT NULL,
    inserted INTEGER NOT NULL,
    updated INTEGER DEFAULT 0,
    duplicates INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
