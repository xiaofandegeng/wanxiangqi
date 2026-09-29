-- 0002_v3.sql · 真实数据与统计链路整改 (任务书 v3, 2026-09-29)
-- 纯结构演进 (DDL)：新表 + 增列 + 唯一约束替换 + 移除造默认值。
-- 本迁移不修改任何存量数据；数据修正统一由 backend/scripts/quarantine_records.mjs
-- 在备份与 dry-run 保护下执行 (任务书 P0-B：迁移与数据修正分离)。

-- ============================================================
-- 1. 数据来源注册表 (P1-B：来源/类型/能力/授权依据/状态/时间/错误)
-- ============================================================
CREATE TABLE IF NOT EXISTS data_sources (
    source_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    type VARCHAR(64) NOT NULL,
    url TEXT,
    capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
    license_note TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'UNCONFIGURED',
    note TEXT,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    last_success_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_data_sources_status CHECK (status IN
        ('ACTIVE', 'READY', 'UNCONFIGURED', 'UNAVAILABLE', 'BLOCKED', 'FAILED'))
);

-- 来源种子（与任务书 §3 调研结论一致；状态只能由真实接入动作改变）
INSERT INTO data_sources (source_id, name, type, url, capabilities, license_note, status, note) VALUES
    ('src-manual-review',
     '截图/材料人工校对录入工作台',
     'MANUAL_REVIEW', 'internal://evidence-workbench',
     '["player_identity","match_details","evidence_chain"]'::jsonb, NULL,
     'ACTIVE', '本人材料 → 人工核验 → 入库；唯一当前可用的真实数据路径'),
    ('src-hokace-wiki',
     'hokace.wiki 第三方阵容汇总',
     'THIRD_PARTY_AGGREGATE', 'https://hokace.wiki/zh/lineups/',
     '["lineup_aggregate"]'::jsonb, '第三方汇总，再利用许可待核实',
     'READY', '页面可读（快照 v2609、7 日窗口）；仅作阵容汇总，不得当作个人战绩'),
    ('src-kohcamp-official',
     '腾讯王者营地官方战绩网关',
     'OFFICIAL_MATCH_FEED', NULL,
     '[]'::jsonb, NULL,
     'UNCONFIGURED', 'URL 与 OPENID 声明仅为代码假设；未确认开放 API 与访问资格，禁止 ACTIVE (任务书 §3.1)'),
    ('src-official-helper',
     '官方战绩小助手 (wxq.qq.com)',
     'OFFICIAL_API', 'https://wxq.qq.com/',
     '["player_identity","match_details"]'::jsonb, NULL,
     'UNAVAILABLE', '官网本次读取失败；需本人账号授权材料，未确认第三方公开接口'),
    ('src-datatft-platform',
     '万象棋大数据公开数据平台 (datawxq.com / api.datatft.com)',
     'BIG_DATA_AGGREGATE', 'https://www.datawxq.com/',
     '["player_identity","tournament_details","lineup_aggregate"]'::jsonb, 'API 契约与授权范围未核实',
     'UNCONFIGURED', '有请求实现 ≠ 获准接入；未确认契约前不扩展批量采集 (任务书 §3.2)')
ON CONFLICT (source_id) DO NOTHING;

-- ============================================================
-- 2. 原始材料存证 (P1-B：来源/记录键/获取时间/内容哈希/存储位置/解析器版本)
-- ============================================================
CREATE TABLE IF NOT EXISTS raw_materials (
    id BIGSERIAL PRIMARY KEY,
    source_id VARCHAR(64) NOT NULL REFERENCES data_sources(source_id),
    record_key VARCHAR(256) NOT NULL,
    fetched_at TIMESTAMP WITH TIME ZONE NOT NULL,
    content_sha256 VARCHAR(64) NOT NULL,
    storage_uri TEXT,
    parser_version VARCHAR(32),
    content_type VARCHAR(64),
    size_bytes BIGINT,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_raw_materials_source_key ON raw_materials(source_id, record_key);
CREATE INDEX IF NOT EXISTS idx_raw_materials_sha ON raw_materials(content_sha256);

-- ============================================================
-- 3. 玩家身份与昵称 (P1-B/V08：稳定身份映射，不靠昵称合并)
-- ============================================================
CREATE TABLE IF NOT EXISTS player_identities (
    id BIGSERIAL PRIMARY KEY,
    player_id VARCHAR(64) NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    source_id VARCHAR(64) NOT NULL REFERENCES data_sources(source_id),
    external_player_id VARCHAR(128) NOT NULL,
    platform VARCHAR(64),
    server_zone VARCHAR(64),
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_player_identities UNIQUE (source_id, external_player_id)
);

CREATE INDEX IF NOT EXISTS idx_player_identities_player ON player_identities(player_id);

CREATE TABLE IF NOT EXISTS player_nicknames (
    id BIGSERIAL PRIMARY KEY,
    player_id VARCHAR(64) NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    nickname VARCHAR(64) NOT NULL,
    source_id VARCHAR(64) REFERENCES data_sources(source_id),
    observed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_player_nicknames_player ON player_nicknames(player_id, nickname);

-- ============================================================
-- 4. 同步任务台账 (P1-C/P2-B：范围/游标/起止/计数/状态/错误)
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_jobs (
    id BIGSERIAL PRIMARY KEY,
    source_id VARCHAR(64) NOT NULL REFERENCES data_sources(source_id),
    job_type VARCHAR(64) NOT NULL,
    scope TEXT,
    cursor_state JSONB,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    finished_at TIMESTAMP WITH TIME ZONE,
    fetched_count INTEGER NOT NULL DEFAULT 0,
    inserted_count INTEGER NOT NULL DEFAULT 0,
    duplicate_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'RUNNING',
    error_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_sync_jobs_status CHECK (status IN
        ('RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED'))
);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_source ON sync_jobs(source_id, started_at DESC);

-- ============================================================
-- 5. matches：来源追溯 + 记录版本 (V13 SCD-2) + 隔离标记
-- ============================================================
ALTER TABLE matches
    ADD COLUMN IF NOT EXISTS source_id VARCHAR(64) REFERENCES data_sources(source_id),
    ADD COLUMN IF NOT EXISTS external_match_id VARCHAR(128),
    ADD COLUMN IF NOT EXISTS external_player_id VARCHAR(128),
    ADD COLUMN IF NOT EXISTS record_key VARCHAR(256),
    ADD COLUMN IF NOT EXISTS player_count SMALLINT,
    ADD COLUMN IF NOT EXISTS game_version VARCHAR(32),
    ADD COLUMN IF NOT EXISTS record_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS synthetic BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS quarantine_reason TEXT,
    ADD COLUMN IF NOT EXISTS verified_by VARCHAR(64),
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS operator VARCHAR(64);

-- 存量行无 CHECK 兼容问题时收紧状态枚举
ALTER TABLE matches
    ADD CONSTRAINT chk_matches_record_status CHECK (record_status IN
        ('ACTIVE', 'PENDING', 'SUPERSEDED', 'QUARANTINED', 'REVOKED'));

-- V13 关键：uq_player_match_time 阻断记录版本历史与跨来源同刻记录 → 移除
ALTER TABLE matches DROP CONSTRAINT IF EXISTS uq_player_match_time;

-- 版本唯一性：同一稳定键同一 revision 仅一行；每键仅一个当前版 (superseded_at IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_matches_record_key_revision
    ON matches(record_key, revision) WHERE record_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_matches_record_key_current
    ON matches(record_key) WHERE record_key IS NOT NULL AND superseded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_matches_record_status ON matches(record_status) WHERE record_status <> 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_matches_effective_stats
    ON matches(player_id, match_time, available_at)
    WHERE verified = TRUE AND record_status = 'ACTIVE' AND synthetic = FALSE;

-- 移除造默认值 (P1-B：未知保持 NULL，禁止伪装确定事实)
ALTER TABLE matches ALTER COLUMN mode DROP DEFAULT;
ALTER TABLE matches ALTER COLUMN commander DROP DEFAULT;
ALTER TABLE matches ALTER COLUMN lineup DROP DEFAULT;
ALTER TABLE matches ALTER COLUMN rounds_survived DROP DEFAULT;

-- ============================================================
-- 6. players：天梯/赛事属性分列，未知为 NULL (F06)
-- ============================================================
ALTER TABLE players
    ADD COLUMN IF NOT EXISTS ladder_score INTEGER,
    ADD COLUMN IF NOT EXISTS ladder_source VARCHAR(64),
    ADD COLUMN IF NOT EXISTS ladder_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS tournament_points INTEGER,
    ADD COLUMN IF NOT EXISTS tournament_rank INTEGER,
    ADD COLUMN IF NOT EXISTS tournament_name VARCHAR(128),
    ADD COLUMN IF NOT EXISTS tournament_at TIMESTAMP WITH TIME ZONE;

-- rank_score/rank_text 现存量全部为推导/默认填充值（数据修正见隔离工具）；
-- 此处仅移除默认值，防止未来插入继续造数
ALTER TABLE players ALTER COLUMN rank_score DROP DEFAULT;
ALTER TABLE players ALTER COLUMN rank_text DROP DEFAULT;
ALTER TABLE players ALTER COLUMN platform DROP DEFAULT;
ALTER TABLE players ALTER COLUMN server_zone DROP DEFAULT;
ALTER TABLE players ALTER COLUMN title DROP DEFAULT;
ALTER TABLE players ALTER COLUMN commander DROP DEFAULT;
ALTER TABLE players ALTER COLUMN style DROP DEFAULT;

-- ============================================================
-- 7. lineup_snapshots：来源口径字段 (P2-B/V14) + 允许缺失
-- ============================================================
ALTER TABLE lineup_snapshots
    ADD COLUMN IF NOT EXISTS structure_key VARCHAR(128),
    ADD COLUMN IF NOT EXISTS window_start TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS window_end TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS sample_unit VARCHAR(64),
    ADD COLUMN IF NOT EXISTS rate_unit VARCHAR(16),
    ADD COLUMN IF NOT EXISTS data_cutoff_at TIMESTAMP WITH TIME ZONE;

-- 缺失指标必须可存 NULL (F09：缺失率/均名/样本量不得补 0、3.5、固定文案)
ALTER TABLE lineup_snapshots ALTER COLUMN win_rate DROP NOT NULL;
ALTER TABLE lineup_snapshots ALTER COLUMN top3_rate DROP NOT NULL;
ALTER TABLE lineup_snapshots ALTER COLUMN avg_rank DROP NOT NULL;
ALTER TABLE lineup_snapshots ALTER COLUMN tier DROP DEFAULT;
ALTER TABLE lineup_snapshots ALTER COLUMN commander DROP DEFAULT;
ALTER TABLE lineup_snapshots ALTER COLUMN snapshot_version DROP DEFAULT;
ALTER TABLE lineup_snapshots ALTER COLUMN window_text DROP DEFAULT;
ALTER TABLE lineup_snapshots ALTER COLUMN scope DROP DEFAULT;

-- ============================================================
-- 8. 其余表移除造默认值（核验状态必须由动作授予，不得默认 VERIFIED/AUDITED）
-- ============================================================
ALTER TABLE evidences ALTER COLUMN status DROP DEFAULT;
ALTER TABLE events ALTER COLUMN mode DROP DEFAULT;
ALTER TABLE events ALTER COLUMN status DROP DEFAULT;
ALTER TABLE event_participants ALTER COLUMN rank_score DROP DEFAULT;
ALTER TABLE event_participants ALTER COLUMN odds DROP DEFAULT;
ALTER TABLE event_participants ALTER COLUMN support_count DROP DEFAULT;
ALTER TABLE event_participants ALTER COLUMN commander DROP DEFAULT;
ALTER TABLE event_participants ALTER COLUMN lineup DROP DEFAULT;
