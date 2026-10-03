-- ============================================================
-- 回滚脚本 · 0007 + 0006 → 恢复至 0005 状态
-- ============================================================
-- 用途：业务库执行 0006/0007 后如需回退，在【已备份的隔离副本】先演练本脚本，
--   确认通过后按 M5-1 流程执行。本脚本不在 migrate.mjs 自动链路中。
-- 行为：
--   1) archive_legacy 中被移出的业务表全部移回 public；
--   2) 归档的旧个人/赛事 evidences 行还原至 public.evidences；
--   3) 重建被摘除的 matches/events → evidences 外键；
--   4) data_sources 状态与说明还原（去掉 RETIRED 状态值）；
--   5) 删除 0006 全部内容模型表及 lineup_snapshots 补字段；
--   6) 清除 schema_migrations 中 0006/0007 记录，使迁移可重新应用。
-- 注意：若 0006/0007 之后业务库已写入新内容数据，本脚本会连带丢弃——
--   执行前必须 pg_dump 备份（M5-1 流程要求）。

BEGIN;

-- 1) 业务表移回 public
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'archive_legacy' AND (
            tablename IN (
                'players', 'player_identities', 'player_nicknames',
                'events', 'event_participants', 'matches', 'import_batches'
            )
            OR tablename LIKE 'quarantine\_backup%' ESCAPE '\'
        )
    LOOP
        EXECUTE format('ALTER TABLE archive_legacy.%I SET SCHEMA public', t);
    END LOOP;
END $$;

-- 2) 归档证据行还原
INSERT INTO public.evidences
SELECT * FROM archive_legacy.evidences
ON CONFLICT DO NOTHING;

DROP TABLE IF EXISTS archive_legacy.evidences;

-- 3) 重建外键（列存在才建；空库新装路径无历史表则为空操作）
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'matches'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'evidence_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'matches_evidence_id_fkey'
    ) THEN
        ALTER TABLE public.matches
            ADD CONSTRAINT matches_evidence_id_fkey
            FOREIGN KEY (evidence_id) REFERENCES evidences(id) ON DELETE SET NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'events'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'evidence_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'events_evidence_id_fkey'
    ) THEN
        ALTER TABLE public.events
            ADD CONSTRAINT events_evidence_id_fkey
            FOREIGN KEY (evidence_id) REFERENCES evidences(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 4) data_sources 还原（状态值集合回到 0002；去掉 v6 标记说明）
UPDATE data_sources SET status = 'UNCONFIGURED',
    note = REPLACE(note, '；[v6 2026-10-03] 玩家战绩数据链路退役：仅历史留档，不再同步', ''),
    updated_at = CURRENT_TIMESTAMP
WHERE source_id = 'src-kohcamp-official';

UPDATE data_sources SET status = 'UNAVAILABLE',
    note = REPLACE(note, '；[v6 2026-10-03] 玩家战绩数据链路退役：仅历史留档，不再同步', ''),
    updated_at = CURRENT_TIMESTAMP
WHERE source_id = 'src-official-helper';

UPDATE data_sources
SET note = REPLACE(note, '；[v6 2026-10-03] 保持隔离：个人对局接口不得使用；如作阵容统计来源须先完成来源验证', ''),
    updated_at = CURRENT_TIMESTAMP
WHERE source_id = 'src-datatft-platform';

ALTER TABLE data_sources DROP CONSTRAINT chk_data_sources_status;
ALTER TABLE data_sources ADD CONSTRAINT chk_data_sources_status CHECK (status IN
    ('ACTIVE', 'READY', 'UNCONFIGURED', 'UNAVAILABLE', 'BLOCKED', 'FAILED'));

-- 5) 删除 0006 内容模型
DROP TABLE IF EXISTS content_impacts;
DROP TABLE IF EXISTS patch_notes;
DROP TABLE IF EXISTS content_review_log;
DROP TABLE IF EXISTS content_references;
DROP TABLE IF EXISTS scenarios;
DROP TABLE IF EXISTS lesson_dependencies;
DROP TABLE IF EXISTS lesson_revisions;
DROP TABLE IF EXISTS lessons;
DROP TABLE IF EXISTS lineup_snapshot_links;
DROP TABLE IF EXISTS lineup_components;
DROP TABLE IF EXISTS lineup_revisions;
DROP TABLE IF EXISTS lineups;
DROP TABLE IF EXISTS mechanic_revisions;
DROP TABLE IF EXISTS mechanics;
DROP TABLE IF EXISTS catalog_entity_revisions;
DROP TABLE IF EXISTS catalog_entities;
DROP TABLE IF EXISTS game_versions;

ALTER TABLE lineup_snapshots DROP COLUMN IF EXISTS mode;
ALTER TABLE lineup_snapshots DROP COLUMN IF EXISTS raw_metrics;

-- 5b) 撤销 0008 官网内容来源登记（纯 INSERT 的逆操作；
--     其 raw_materials 存证行随来源删除一并清理，回到 0005 无此来源状态）
DELETE FROM raw_materials WHERE source_id = 'src-wxq-official';
DELETE FROM sync_jobs WHERE source_id = 'src-wxq-official';
DELETE FROM data_sources WHERE source_id = 'src-wxq-official';

-- 6) 迁移台账回到 0005；归档 schema 必须已空（RESTRICT：有残留即失败暴露）
DELETE FROM schema_migrations WHERE filename IN
    ('0006_v6_content_models.sql', '0007_v6_archive_legacy.sql',
     '0008_v6_official_content_source.sql');

DROP SCHEMA IF EXISTS archive_legacy RESTRICT;

COMMIT;
