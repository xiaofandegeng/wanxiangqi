-- 王者万象棋王牌对决数据站 - 核心 DDL 架构设计 (Schema)
-- 字符集编码: UTF-8
-- 适用数据库: PostgreSQL 14+
-- 包含：核心实体表、审计字段、外键级联、检查约束与联合唯一索引

-- 依赖 enums.sql
-- \i enums.sql

-- ========================================================
-- 1. 证据存证表 (evidence)
-- 原图 SHA-256 去重，杜绝伪造与重复提交
-- ========================================================
CREATE TABLE IF NOT EXISTS evidence (
    id VARCHAR(64) PRIMARY KEY,
    sha256 CHAR(64) NOT NULL,
    file_path VARCHAR(512) NOT NULL,
    file_size_bytes BIGINT,
    evidence_type evidence_type_enum NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status evidence_status_enum NOT NULL DEFAULT 'UNVERIFIED',
    verified_at TIMESTAMPTZ,
    verified_by VARCHAR(64),
    ocr_raw_text TEXT,
    ocr_payload JSONB,
    audit_note TEXT,
    
    CONSTRAINT uk_evidence_sha256 UNIQUE (sha256),
    CONSTRAINT chk_verified_timing CHECK (verified_at IS NULL OR verified_at >= captured_at)
);

CREATE INDEX IF NOT EXISTS idx_evidence_type_status ON evidence (evidence_type, status);
CREATE INDEX IF NOT EXISTS idx_evidence_captured_at ON evidence (captured_at);

-- ========================================================
-- 2. 玩家档案表 (player)
-- 独立内部唯一主键，不以游戏昵称作为主键（支持改名历史）
-- ========================================================
CREATE TABLE IF NOT EXISTS player (
    id VARCHAR(64) PRIMARY KEY,
    platform VARCHAR(32) NOT NULL DEFAULT 'WECHAT', -- WECHAT / QQ
    server_zone VARCHAR(32) NOT NULL DEFAULT 'DEFAULT',
    official_uid VARCHAR(64),                        -- 官方稳定唯一ID（若能获取）
    last_nickname VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_player_platform_official_uid 
    ON player (platform, official_uid) 
    WHERE official_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_player_last_nickname ON player (last_nickname);

-- 玩家昵称更迭审计历史
CREATE TABLE IF NOT EXISTS player_nickname_history (
    id BIGSERIAL PRIMARY KEY,
    player_id VARCHAR(64) NOT NULL REFERENCES player(id) ON DELETE CASCADE,
    nickname VARCHAR(64) NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    evidence_id VARCHAR(64) REFERENCES evidence(id)
);

CREATE INDEX IF NOT EXISTS idx_nickname_history_player ON player_nickname_history (player_id, observed_at DESC);

-- ========================================================
-- 3. 场次表 (event)
-- 记录每日王牌对决场次，唯一约束防止重复建场
-- ========================================================
CREATE TABLE IF NOT EXISTS event (
    id VARCHAR(64) PRIMARY KEY,
    mode event_mode_enum NOT NULL DEFAULT 'DIAMOND',
    scheduled_at TIMESTAMPTZ NOT NULL,
    platform VARCHAR(32) NOT NULL DEFAULT 'DEFAULT',
    game_version VARCHAR(32) NOT NULL,
    status event_status_enum NOT NULL DEFAULT 'PENDING_COLLECTION',
    official_event_code VARCHAR(64),
    bet_closed_at TIMESTAMPTZ,
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uk_event_mode_time_platform UNIQUE (mode, scheduled_at, platform),
    CONSTRAINT chk_event_lifecycle CHECK (
        (status = 'PENDING_COLLECTION') OR
        (status = 'PENDING_VERIFY') OR
        (status = 'PREDICTABLE') OR
        (status = 'BET_CLOSED' AND bet_closed_at IS NOT NULL) OR
        (status = 'SETTLED' AND settled_at IS NOT NULL) OR
        (status = 'AUDITED' AND settled_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_event_scheduled_at ON event (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_event_status ON event (status);

-- ========================================================
-- 4. 参赛者席位记录表 (participant)
-- 每场固定 6 个席位 (slot: 1~6)，赛前赛后全周期跟踪
-- ========================================================
CREATE TABLE IF NOT EXISTS participant (
    id VARCHAR(64) PRIMARY KEY,
    event_id VARCHAR(64) NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    slot SMALLINT NOT NULL CHECK (slot BETWEEN 1 AND 6),
    player_id VARCHAR(64) REFERENCES player(id),
    temp_identity_key VARCHAR(64),                   -- 临时未知选手识别码
    nickname_at_match VARCHAR(64) NOT NULL,          -- 该场观测到的选手昵称
    rank_text VARCHAR(32) NOT NULL,                  -- 段位原文 (如: 万象宗师 III)
    rank_score INTEGER CHECK (rank_score IS NULL OR rank_score >= 0),
    spectator_count INTEGER,                         -- 观战人数
    readiness_count INTEGER,                         -- 备战人数
    final_rank SMALLINT CHECK (final_rank IS NULL OR (final_rank BETWEEN 1 AND 6)),
    commander_name VARCHAR(32),                      -- 局内所用棋手
    favorite_lineup VARCHAR(64),                     -- 常用阵容
    pre_evidence_id VARCHAR(64) REFERENCES evidence(id),
    post_evidence_id VARCHAR(64) REFERENCES evidence(id),
    source_type source_type_enum NOT NULL DEFAULT 'MANUAL_SCREENSHOT',
    confidence NUMERIC(4, 3) NOT NULL DEFAULT 1.000 CHECK (confidence BETWEEN 0 AND 1),

    CONSTRAINT uk_participant_event_slot UNIQUE (event_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_participant_event ON participant (event_id);
CREATE INDEX IF NOT EXISTS idx_participant_player ON participant (player_id);

-- ========================================================
-- 5. 选手历史对局记录表 (match_history)
-- 严格用于计算赛前画像特征，查询时必须以 match_time 进行切片防泄漏
-- ========================================================
CREATE TABLE IF NOT EXISTS match_history (
    id VARCHAR(64) PRIMARY KEY,
    player_id VARCHAR(64) NOT NULL REFERENCES player(id) ON DELETE CASCADE,
    source_match_id VARCHAR(64),
    mode event_mode_enum NOT NULL DEFAULT 'DIAMOND',
    match_time TIMESTAMPTZ NOT NULL,
    final_rank SMALLINT NOT NULL CHECK (final_rank BETWEEN 1 AND 6),
    commander_name VARCHAR(32),
    lineup_summary VARCHAR(128),
    heroes_detail JSONB,
    source_type source_type_enum NOT NULL DEFAULT 'MANUAL_SCREENSHOT',
    evidence_id VARCHAR(64) REFERENCES evidence(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_match_history_player_time 
    ON match_history (player_id, match_time DESC);

-- ========================================================
-- 6. 支持热度与赔率快照表 (support_snapshot)
-- 记录房间内选手对比进度条及界面显示赔率
-- ========================================================
CREATE TABLE IF NOT EXISTS support_snapshot (
    id VARCHAR(64) PRIMARY KEY,
    event_id VARCHAR(64) NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    participant_id VARCHAR(64) NOT NULL REFERENCES participant(id) ON DELETE CASCADE,
    slot SMALLINT NOT NULL CHECK (slot BETWEEN 1 AND 6),
    observation_time TIMESTAMPTZ NOT NULL,
    ratio_percent NUMERIC(5, 2) CHECK (ratio_percent IS NULL OR (ratio_percent >= 0 AND ratio_percent <= 100)),
    odds_display NUMERIC(8, 3) CHECK (odds_display IS NULL OR odds_display > 0),
    support_amount NUMERIC(12, 2) CHECK (support_amount IS NULL OR support_amount >= 0),
    support_players_count INTEGER CHECK (support_players_count IS NULL OR support_players_count >= 0),
    evidence_id VARCHAR(64) REFERENCES evidence(id),
    rules_version VARCHAR(32) NOT NULL DEFAULT 'v1.0'
);

CREATE INDEX IF NOT EXISTS idx_support_snapshot_event ON support_snapshot (event_id, observation_time);

-- ========================================================
-- 7. 赛前预测发布表 (forecast)
-- 模型预测第一名概率快照，六人概率和严格归一化为 1.0 (100%)
-- ========================================================
CREATE TABLE IF NOT EXISTS forecast (
    id VARCHAR(64) PRIMARY KEY,
    event_id VARCHAR(64) NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    model_version VARCHAR(64) NOT NULL,
    as_of TIMESTAMPTZ NOT NULL,                       -- 数据计算截点时间
    sample_size INTEGER NOT NULL DEFAULT 0 CHECK (sample_size >= 0),
    coverage_rate NUMERIC(4, 3) NOT NULL CHECK (coverage_rate BETWEEN 0 AND 1),
    probabilities JSONB NOT NULL,                    -- 格式: {"1": 0.32, "2": 0.14, "3": 0.25, "4": 0.08, "5": 0.15, "6": 0.06}
    features_snapshot JSONB,                         -- 当时输入的特征快照
    status forecast_status_enum NOT NULL DEFAULT 'ACTIVE',
    reason_comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uk_forecast_event_model UNIQUE (event_id, model_version)
);

CREATE INDEX IF NOT EXISTS idx_forecast_event ON forecast (event_id);

-- ========================================================
-- 8. 真实支持记录表 (wager_record) - 用于硬门槛 B 结算复算
-- 仅存储自愿用于规则校验的样本，不公开发布个人财务信息
-- ========================================================
CREATE TABLE IF NOT EXISTS wager_record (
    id VARCHAR(64) PRIMARY KEY,
    event_id VARCHAR(64) NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    participant_id VARCHAR(64) NOT NULL REFERENCES participant(id),
    invest_amount NUMERIC(12, 2) NOT NULL CHECK (invest_amount > 0),
    wager_time TIMESTAMPTZ NOT NULL,
    odds_recorded NUMERIC(8, 3) NOT NULL,
    actual_payout NUMERIC(12, 2),                    -- 赛后真实到账数额 (含本金或净收益)
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    evidence_id VARCHAR(64) REFERENCES evidence(id),
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_wager_event ON wager_record (event_id);

-- ========================================================
-- 9. 数据源注册表 (data_source) - 遵循 v2 规范
-- 声明来源能力 (player_identity, lineup_aggregate 等)
-- ========================================================
CREATE TABLE IF NOT EXISTS data_source (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    type VARCHAR(64) NOT NULL,
    url VARCHAR(512),
    capabilities JSONB NOT NULL DEFAULT '[]',
    sync_interval_seconds INTEGER DEFAULT 3600,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    last_attempt_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    data_as_of TIMESTAMPTZ,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ========================================================
-- 10. 采集任务执行运行记录 (ingestion_run)
-- ========================================================
CREATE TABLE IF NOT EXISTS ingestion_run (
    id VARCHAR(64) PRIMARY KEY,
    source_id VARCHAR(64) NOT NULL REFERENCES data_source(id) ON DELETE CASCADE,
    batch_id VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'RUNNING',
    records_read INTEGER NOT NULL DEFAULT 0,
    records_inserted INTEGER NOT NULL DEFAULT 0,
    records_updated INTEGER NOT NULL DEFAULT 0,
    records_duplicates INTEGER NOT NULL DEFAULT 0,
    cursor_state VARCHAR(256),
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ingestion_source ON ingestion_run (source_id, started_at DESC);

-- ========================================================
-- 11. 原始材料存证表 (raw_record)
-- 保存上游原始 JSON/HTML 及内容哈希，确保证据链可溯源
-- ========================================================
CREATE TABLE IF NOT EXISTS raw_record (
    id VARCHAR(64) PRIMARY KEY,
    source_id VARCHAR(64) NOT NULL REFERENCES data_source(id),
    content_hash CHAR(64) NOT NULL,
    raw_payload JSONB NOT NULL,
    parser_version VARCHAR(32) NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_raw_record_hash ON raw_record (content_hash);

-- ========================================================
-- 12. 第三方阵容环境快照大盘表 (lineup_stat_snapshot)
-- 明确来源快照版本，与选手个人逐局事实严格隔离
-- ========================================================
CREATE TABLE IF NOT EXISTS lineup_stat_snapshot (
    id VARCHAR(64) PRIMARY KEY,
    source_id VARCHAR(64) NOT NULL REFERENCES data_source(id),
    lineup_name VARCHAR(128) NOT NULL,
    tier VARCHAR(16) NOT NULL,
    commander VARCHAR(64) NOT NULL,
    core_heroes JSONB NOT NULL,
    sample_count INTEGER NOT NULL DEFAULT 0 CHECK (sample_count >= 0),
    win_rate NUMERIC(5, 4) NOT NULL CHECK (win_rate BETWEEN 0 AND 1),
    top3_rate NUMERIC(5, 4) NOT NULL CHECK (top3_rate BETWEEN 0 AND 1),
    avg_rank NUMERIC(4, 2) NOT NULL CHECK (avg_rank BETWEEN 1 AND 8),
    snapshot_version VARCHAR(64) NOT NULL,
    window_text VARCHAR(64) NOT NULL DEFAULT '近 7 日',
    scope VARCHAR(64) NOT NULL DEFAULT '全服王者段位',
    observed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uk_lineup_snapshot UNIQUE (source_id, lineup_name, snapshot_version)
);

CREATE INDEX IF NOT EXISTS idx_lineup_snapshot_version ON lineup_stat_snapshot (snapshot_version);
