-- ============================================================
-- 0007 · v6 旧业务数据归档：赛事/玩家/对局/导入 退出活动 schema
-- ============================================================
-- 对照 docs/v6旧功能删除与数据归档对照表.md §4：
--   A=整体归档  P=继续使用（标记调整）  拆分=按行归档
-- 处置：
--   1) players / player_identities / player_nicknames / events /
--      event_participants / matches / import_batches / quarantine_backup_*
--      → 移入 schema archive_legacy（整表移动，数据与约束原样保留，可审查回滚）。
--   2) evidences 拆分：旧个人/赛事材料行（kind 为空或
--      PERSONAL_SCREENSHOT / SIX_SEAT_SHEET）复制到 archive_legacy.evidences
--      后从活动表删除；表结构保留承接内容素材（content_references 引用）。
--      evidence_blobs 为内容寻址原件库，整体保留；归档行对应 blob 成为
--      孤儿 blob，保留供审计，不在本迁移删除。
--   3) 移表后先摘除归档表指向 public.evidences 的外键（防止活动表删行时
--      ON DELETE SET NULL 抹掉归档对局的证据引用），再执行活动表删除。
--   4) data_sources 继续使用：新增 RETIRED 状态；旧官方个人来源
--      src-kohcamp-official / src-official-helper 标 RETIRED；
--      src-datatft-platform 保持隔离（UNCONFIGURED），仅更新说明；
--      src-hokace-wiki（阵容统计）/ src-manual-review（内容素材）不变。
-- 本迁移只做结构搬移与状态标记，不删除任何历史数据。
-- 回滚脚本：backend/src/migrations-rollback/0007_rollback_v6_archive_legacy.sql
--   （连同 0006 内容表一并回退至 0005 状态；隔离库演练见 M1-8）。

-- ------------------------------------------------------------
-- 1. 归档 schema
-- ------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS archive_legacy;

COMMENT ON SCHEMA archive_legacy IS 'v2–v5 赛事/玩家战绩/对局流水 业务数据受控归档（2026-10-03 v6 转型）：只读留档，不再被应用读写；回滚见 migrations-rollback/0007';

-- ------------------------------------------------------------
-- 2. 整表移入归档 schema（存在才移动：空库/新库无历史表数据也需可执行）
-- ------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND (
            tablename IN (
                'players', 'player_identities', 'player_nicknames',
                'events', 'event_participants', 'matches', 'import_batches'
            )
            OR tablename LIKE 'quarantine\_backup%' ESCAPE '\'
        )
    LOOP
        EXECUTE format('ALTER TABLE public.%I SET SCHEMA archive_legacy', t);
    END LOOP;
END $$;

-- 归档表不再参与活动库写入：摘除指向 public.evidences 的外键
-- （保留列值本身作为历史引用，仅解除强制完整性）
ALTER TABLE archive_legacy.matches   DROP CONSTRAINT IF EXISTS matches_evidence_id_fkey;
ALTER TABLE archive_legacy.events    DROP CONSTRAINT IF EXISTS events_evidence_id_fkey;

-- ------------------------------------------------------------
-- 3. evidences 拆分：旧个人/赛事材料行 → archive_legacy.evidences
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS archive_legacy.evidences (LIKE public.evidences INCLUDING ALL);

INSERT INTO archive_legacy.evidences
SELECT e.*
FROM public.evidences e
WHERE e.kind IS NULL OR e.kind IN ('PERSONAL_SCREENSHOT', 'SIX_SEAT_SHEET')
ON CONFLICT DO NOTHING;

DELETE FROM public.evidences e
WHERE e.kind IS NULL OR e.kind IN ('PERSONAL_SCREENSHOT', 'SIX_SEAT_SHEET');

COMMENT ON TABLE archive_legacy.evidences IS 'v2–v5 个人/赛事材料证据归档（自 public.evidences 拆分移入，行内容原样）；不再被应用读写';

-- ------------------------------------------------------------
-- 4. data_sources 状态调整（表保留）
-- ------------------------------------------------------------
ALTER TABLE data_sources DROP CONSTRAINT chk_data_sources_status;
ALTER TABLE data_sources ADD CONSTRAINT chk_data_sources_status CHECK (status IN
    ('ACTIVE', 'READY', 'UNCONFIGURED', 'UNAVAILABLE', 'BLOCKED', 'FAILED', 'RETIRED'));

UPDATE data_sources
SET status = 'RETIRED',
    note = COALESCE(note || '；', '') || '[v6 2026-10-03] 玩家战绩数据链路退役：仅历史留档，不再同步',
    updated_at = CURRENT_TIMESTAMP
WHERE source_id IN ('src-kohcamp-official', 'src-official-helper');

UPDATE data_sources
SET note = COALESCE(note || '；', '') || '[v6 2026-10-03] 保持隔离：个人对局接口不得使用；如作阵容统计来源须先完成来源验证',
    updated_at = CURRENT_TIMESTAMP
WHERE source_id = 'src-datatft-platform';
