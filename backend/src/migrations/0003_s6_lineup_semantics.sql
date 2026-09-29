-- ============================================================
-- 0003 · S6/P2-B 阵容快照来源语义补全
-- ============================================================
-- 样本量缺失必须可存 NULL：第三方来源未公布样本量时不得补 0 冒充已知
-- （F09 同源规则；win_rate/top3_rate/avg_rank 的 NOT NULL 已在 0002 移除）

ALTER TABLE lineup_snapshots ALTER COLUMN sample_count DROP NOT NULL;
