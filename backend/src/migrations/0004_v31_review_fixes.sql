-- ============================================================
-- 0004 · v3.1 复验整改（2026-09-30 独立复验四项 P1）
-- ============================================================
-- 1. lineup_snapshots 增加隔离状态列：旧生成脚本产出的快照可打标 QUARANTINED
--    （复验问题3：datatft 36 条旧快照与 hokace 真实快照公开混排；
--      公开查询口径 = record_status='ACTIVE' 且来源 READY/ACTIVE）
-- 2. raw_materials 增加 content 列：原始正文随台账同事务入库（复验问题4：
--    此前仅存哈希元信息，storage_uri/size_bytes 为空，无法离线复核；
--    content 在库 = pg_dump 即可完整复原抓取现场）

ALTER TABLE lineup_snapshots ADD COLUMN IF NOT EXISTS record_status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE lineup_snapshots ADD COLUMN IF NOT EXISTS quarantine_reason TEXT;

ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS content TEXT;

COMMENT ON COLUMN lineup_snapshots.record_status IS '快照状态：ACTIVE/QUARANTINED（旧生成脚本/未治理来源产出的快照打标隔离，保留可回滚）';
COMMENT ON COLUMN raw_materials.content IS '原始响应正文（离线复核用；与哈希/解析器版本同事务写入，pg 可完整复原抓取现场）';
