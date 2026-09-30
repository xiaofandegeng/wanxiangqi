-- ============================================================
-- 0005 · v4 W1：个人材料原件入库（evidence_blobs + 证据生命周期元信息）
-- ============================================================
-- 背景（v4 任务书 §3.1）：人工截图此前只保存客户端哈希，服务端从未取得原件；
-- 只持有一串哈希无法在页面丢失后复核比赛记录。
--
-- 1. evidence_blobs：内容寻址原件表（sha256 主键，同一原图跨多条逐局记录共享）。
--    content 为库内 bytea —— PG 唯一权威，pg_dump 即可完整复原原件。
-- 2. evidences 增补采集元信息：kind（材料类型）、provided_by（提供人内部标识）、
--    usage_scope（允许使用范围：仅内部验收 / 允许公开展示 —— 授权相关，禁止静默改写）。
-- 3. matches.evidence_locator：一条记录在原件中的定位（页码/图片区域/行），
--    多条记录可指向同一原件的不同位置。
-- 4. 存量只有哈希、无原件的 evidences 明确标记 ORIGINAL_MISSING（任务书 W1：
--    “旧只有哈希的材料明确标记原件缺失”）。

CREATE TABLE IF NOT EXISTS evidence_blobs (
    sha256     VARCHAR(64) PRIMARY KEY,
    content    BYTEA NOT NULL,
    mime_type  VARCHAR(128) NOT NULL,
    size_bytes BIGINT NOT NULL,
    storage_uri TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_evidence_blobs_size CHECK (size_bytes > 0 AND octet_length(content) = size_bytes)
);

CREATE INDEX IF NOT EXISTS idx_evidence_blobs_created ON evidence_blobs(created_at DESC);

ALTER TABLE evidences ADD COLUMN IF NOT EXISTS kind VARCHAR(32);
ALTER TABLE evidences ADD COLUMN IF NOT EXISTS provided_by VARCHAR(128);
ALTER TABLE evidences ADD COLUMN IF NOT EXISTS usage_scope VARCHAR(16);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_evidences_usage_scope') THEN
    ALTER TABLE evidences ADD CONSTRAINT ck_evidences_usage_scope
      CHECK (usage_scope IS NULL OR usage_scope IN ('INTERNAL_ONLY', 'PUBLIC'));
  END IF;
END $$;

ALTER TABLE matches ADD COLUMN IF NOT EXISTS evidence_locator VARCHAR(128);

-- 存量哈希-only 材料标记原件缺失（幂等：已含标记的不再重复追加）
UPDATE evidences
   SET note = CONCAT_WS(' ', NULLIF(note, ''), '[ORIGINAL_MISSING: pre-0005 hash-only 原件未入库]')
 WHERE NOT EXISTS (SELECT 1 FROM evidence_blobs b WHERE b.sha256 = evidences.sha256)
   AND note NOT LIKE '%ORIGINAL_MISSING%';

COMMENT ON TABLE evidence_blobs IS '材料原件内容寻址存储（v4 W1）：sha256 为主键去重，content 为原始字节；上传不等于核验（evidences.status 独立流转 PENDING→VERIFIED）';
COMMENT ON COLUMN evidence_blobs.storage_uri IS '存储位置标识（pg:evidence_blobs:sha-<hash16>，指向库内可恢复原件）';
COMMENT ON COLUMN evidences.kind IS '材料类型：PERSONAL_SCREENSHOT/SIX_SEAT_SHEET/DOCUMENT/OTHER（未知为 NULL，不猜测）';
COMMENT ON COLUMN evidences.provided_by IS '提供人内部标识（授权追溯用，不含账号敏感凭证）';
COMMENT ON COLUMN evidences.usage_scope IS '允许使用范围：INTERNAL_ONLY（仅内部验收）/PUBLIC（允许公开展示）；默认 INTERNAL_ONLY，冲突时不静默覆盖';
COMMENT ON COLUMN matches.evidence_locator IS '记录在原件中的定位（页码/图片区域/材料行），来自材料本身或录入注明；未知为 NULL';
